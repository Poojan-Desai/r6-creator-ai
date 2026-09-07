import { createHash } from "node:crypto";

import type { CloudAiRequest } from "@prisma/client";

import { appConfig } from "@/lib/config";
import { cloudWritingPackageSchema } from "@/lib/content-writing/openai-provider";
import { zodTextFormat } from "openai/helpers/zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

const MICROS_PER_CENT = 10_000;
let reservationTail: Promise<void> = Promise.resolve();

async function withReservationLock<T>(task: () => Promise<T>) {
  const previous = reservationTail;
  let release: () => void = () => {};
  reservationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

export type CloudBudgetDecision =
  "ALLOWED" | "PROJECT_LIMIT" | "MONTHLY_BUDGET";

export function evaluateCloudBudget(input: {
  monthlyBudgetCents: number;
  projectRequestLimit: number;
  projectRequestCount: number;
  reservedOrSpentMicros: number;
  estimatedCostMicros: number;
}): CloudBudgetDecision {
  if (input.projectRequestCount >= input.projectRequestLimit) {
    return "PROJECT_LIMIT";
  }
  if (
    input.reservedOrSpentMicros + input.estimatedCostMicros >
    input.monthlyBudgetCents * MICROS_PER_CENT
  ) {
    return "MONTHLY_BUDGET";
  }
  return "ALLOWED";
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function estimateTokens(value: string) {
  // A byte bound is intentionally conservative for token-dense/Unicode text.
  return Math.max(1, Buffer.byteLength(value, "utf8"));
}

export function calculateCloudCostMicros(
  inputTokens: number,
  outputTokens: number,
) {
  return Math.ceil(
    inputTokens * appConfig.openaiInputUsdPerMillionTokens +
      outputTokens * appConfig.openaiOutputUsdPerMillionTokens,
  );
}

export function createCloudPreflight(prompt: string) {
  const format = zodTextFormat(
    cloudWritingPackageSchema,
    "r6_short_form_writing_package",
  );
  const estimatedInputTokens =
    estimateTokens(prompt + JSON.stringify(format)) + 1024;
  const estimatedCostMicros = calculateCloudCostMicros(
    estimatedInputTokens,
    appConfig.openaiMaxOutputTokens,
  );
  return {
    promptFingerprint: createHash("sha256").update(prompt).digest("hex"),
    estimatedInputTokens,
    maxOutputTokens: appConfig.openaiMaxOutputTokens,
    estimatedCostMicros,
    pricing: {
      currency: "USD",
      unit: "per_million_tokens",
      input: appConfig.openaiInputUsdPerMillionTokens,
      output: appConfig.openaiOutputUsdPerMillionTokens,
    },
  };
}

function chargeForBudget(
  request: Pick<CloudAiRequest, "actualCostMicros" | "estimatedCostMicros">,
) {
  return request.actualCostMicros ?? request.estimatedCostMicros;
}

async function reconcileInterruptedRequests(now = new Date()) {
  const staleBefore = new Date(
    now.getTime() - Math.max(120_000, appConfig.openaiTimeoutMs * 3),
  );
  await db.cloudAiRequest.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: staleBefore } },
    data: {
      status: "FAILED",
      errorCode: "INTERRUPTED_AFTER_RESTART",
      completedAt: now,
    },
  });
}

async function monthlyRequests(
  studioProjectId?: string,
  client: Pick<typeof db, "cloudAiRequest"> = db,
) {
  return client.cloudAiRequest.findMany({
    where: {
      createdAt: { gte: monthStart() },
      ...(studioProjectId ? { studioProjectId } : {}),
    },
    select: { actualCostMicros: true, estimatedCostMicros: true },
  });
}

export async function getCloudAiStatus(studioProjectId: string) {
  await reconcileInterruptedRequests();
  const [globalRequests, projectRequests] = await Promise.all([
    monthlyRequests(),
    monthlyRequests(studioProjectId),
  ]);
  const spentMicros = globalRequests.reduce(
    (total, request) => total + chargeForBudget(request),
    0,
  );
  const samplePreflight = createCloudPreflight("x".repeat(50_000));
  return {
    configured: Boolean(appConfig.openaiApiKey),
    enabled:
      Boolean(appConfig.openaiApiKey) && appConfig.openaiMonthlyBudgetCents > 0,
    model: appConfig.openaiModel,
    monthlyBudgetCents: appConfig.openaiMonthlyBudgetCents,
    monthlyReservedOrSpentCents: Math.ceil(spentMicros / MICROS_PER_CENT),
    projectMonthlyRequestLimit: appConfig.openaiProjectMonthlyRequestLimit,
    projectRequestsThisMonth: projectRequests.length,
    estimatedMaximumRequestCents: Math.max(
      1,
      Math.ceil(samplePreflight.estimatedCostMicros / MICROS_PER_CENT),
    ),
    sends: [
      "bounded detector/replay evidence summaries",
      "up to 1,500 transcript characters",
      "user-confirmed context and creator preferences",
    ],
    neverSends: [
      "source video or audio files",
      "reference video files",
      "local filenames or paths",
      "the API key",
    ],
  };
}

export async function reserveCloudAiRequest(
  studioProjectId: string,
  prompt: string,
) {
  if (!appConfig.openaiApiKey) {
    throw new AppError(
      "Cloud AI is not configured. Local generation remains available.",
      503,
      "CLOUD_AI_NOT_CONFIGURED",
    );
  }
  if (appConfig.openaiMonthlyBudgetCents <= 0) {
    throw new AppError(
      "Cloud AI is disabled until a positive monthly budget is configured.",
      409,
      "CLOUD_AI_BUDGET_DISABLED",
    );
  }
  return withReservationLock(async () => {
    await reconcileInterruptedRequests();
    return db.$transaction(
      async (transaction) => {
        // The first write takes SQLite's database write lock across processes.
        await transaction.cloudAiBudgetLock.update({
          where: { id: "global" },
          data: { generation: { increment: 1 } },
        });
        const preflight = createCloudPreflight(prompt);
        const [globalRequests, projectRequests] = await Promise.all([
          monthlyRequests(undefined, transaction),
          monthlyRequests(studioProjectId, transaction),
        ]);
        const reservedOrSpent = globalRequests.reduce(
          (total, request) => total + chargeForBudget(request),
          0,
        );
        const decision = evaluateCloudBudget({
          monthlyBudgetCents: appConfig.openaiMonthlyBudgetCents,
          projectRequestLimit: appConfig.openaiProjectMonthlyRequestLimit,
          projectRequestCount: projectRequests.length,
          reservedOrSpentMicros: reservedOrSpent,
          estimatedCostMicros: preflight.estimatedCostMicros,
        });
        if (decision === "PROJECT_LIMIT") {
          throw new AppError(
            "This project reached its monthly cloud AI request limit. Use local generation or raise the configured limit.",
            429,
            "CLOUD_AI_PROJECT_LIMIT",
          );
        }
        if (decision === "MONTHLY_BUDGET") {
          throw new AppError(
            "The configured monthly cloud AI budget cannot cover this request. Local generation remains available.",
            429,
            "CLOUD_AI_MONTHLY_BUDGET",
          );
        }
        return transaction.cloudAiRequest.create({
          data: {
            studioProjectId,
            model: appConfig.openaiModel,
            consentedAt: new Date(),
            promptFingerprint: preflight.promptFingerprint,
            estimatedInputTokens: preflight.estimatedInputTokens,
            maxOutputTokens: preflight.maxOutputTokens,
            estimatedCostMicros: preflight.estimatedCostMicros,
            pricingJson: JSON.stringify(preflight.pricing),
          },
        });
      },
      { maxWait: 10000, timeout: 10000 },
    );
  });
}

export async function completeCloudAiRequest(
  requestId: string,
  usage: {
    responseId: string;
    inputTokens: number | null;
    outputTokens: number | null;
  },
) {
  return db.cloudAiRequest.update({
    where: { id: requestId },
    data: {
      status: "COMPLETED",
      responseId: usage.responseId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      actualCostMicros:
        usage.inputTokens !== null &&
        usage.outputTokens !== null &&
        Number.isSafeInteger(usage.inputTokens) &&
        Number.isSafeInteger(usage.outputTokens) &&
        usage.inputTokens > 0 &&
        usage.outputTokens >= 0
          ? calculateCloudCostMicros(usage.inputTokens, usage.outputTokens)
          : null,
      completedAt: new Date(),
    },
  });
}

export async function markCloudAiFallback(
  requestId: string,
  errorCode: string,
  fallbackProviderId: string,
) {
  return db.cloudAiRequest.update({
    where: { id: requestId },
    data: {
      status: "FALLBACK",
      errorCode,
      fallbackProviderId,
      completedAt: new Date(),
    },
  });
}

export async function markCloudAiCancelled(requestId: string) {
  return db.cloudAiRequest.update({
    where: { id: requestId },
    data: {
      status: "CANCELLED",
      errorCode: "CANCELLED",
      completedAt: new Date(),
    },
  });
}
