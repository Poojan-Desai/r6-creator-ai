import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { deleteSignalCurve, readSignalCurve } from "@/lib/signals/storage";

const MAX_EXPLORER_EVENTS = 10_000;

function parseObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const preferencesSchema = z
  .object({
    visibleTracks: z.array(z.string().trim().min(1).max(200)).max(200),
    hiddenDetectors: z.array(z.string().trim().min(1).max(200)).max(200),
    minimumConfidence: z.number().finite().min(0).max(1),
    zoomStartSeconds: z.number().finite().nonnegative().nullable(),
    zoomEndSeconds: z.number().finite().positive().nullable(),
  })
  .strict();

export function validateSignalExplorerPreferences(
  rawInput: unknown,
  durationSeconds: number,
) {
  const input = preferencesSchema.parse(rawInput);
  if (
    input.zoomStartSeconds !== null &&
    input.zoomEndSeconds !== null &&
    (input.zoomStartSeconds >= input.zoomEndSeconds ||
      input.zoomEndSeconds > durationSeconds)
  ) {
    throw new AppError(
      "The saved Signal Explorer zoom range is not valid for this video.",
      400,
      "SIGNAL_ZOOM_INVALID",
    );
  }
  return input;
}

export type SignalExplorerStateDto = Awaited<
  ReturnType<typeof getSignalExplorerState>
>;

export async function getSignalExplorerState(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  }
  const [completedRuns, preference, labels] = await Promise.all([
    db.detectorRun.findMany({
      where: { analysisJob: { projectId }, status: "COMPLETED" },
      include: {
        analysisJob: true,
        detectorDefinition: true,
        signalCurves: { orderBy: { displayName: "asc" } },
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.signalExplorerPreference.upsert({
      where: { projectId },
      update: {},
      create: { projectId },
    }),
    db.groundTruthLabel.findMany({
      where: { projectId },
      orderBy: { startSeconds: "asc" },
    }),
  ]);
  const latestByDetector = new Map<string, (typeof completedRuns)[number]>();
  for (const run of completedRuns) {
    if (!latestByDetector.has(run.detectorStableId)) {
      latestByDetector.set(run.detectorStableId, run);
    }
  }
  const resultRuns = [...latestByDetector.values()].sort((left, right) =>
    left.detectorStableId.localeCompare(right.detectorStableId),
  );
  const runIds = resultRuns.map((run) => run.id);
  const latestJob = completedRuns[0]?.analysisJob ?? null;
  const eventCount =
    runIds.length > 0
      ? await db.detectorEvent.count({
          where: { detectorRunId: { in: runIds } },
        })
      : 0;
  const events =
    runIds.length > 0
      ? await db.detectorEvent.findMany({
          where: { detectorRunId: { in: runIds } },
          include: {
            detectorRun: {
              select: {
                detectorStableId: true,
                detectorVersion: true,
              },
            },
            evidence: { orderBy: { createdAt: "asc" } },
          },
          orderBy: { startSeconds: "asc" },
          take: MAX_EXPLORER_EVENTS,
        })
      : [];
  return {
    projectId,
    durationSeconds: project.durationSeconds,
    job: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          analysisVersion: latestJob.analysisVersion,
          detectorSetVersion: latestJob.detectorSetVersion,
          createdAt: latestJob.createdAt.toISOString(),
          resultRunCount: resultRuns.length,
        }
      : null,
    curves: resultRuns.flatMap((run) =>
      run.signalCurves.map((curve) => ({
        id: curve.id,
        stableId: curve.stableId,
        kind: curve.kind,
        displayName: curve.displayName,
        unit: curve.unit,
        sourceSignal: curve.sourceSignal,
        sourceTrackRole: curve.sourceTrackRole,
        sourceStreamIndex: curve.sourceStreamIndex,
        sampleIntervalSeconds: curve.sampleIntervalSeconds,
        aggregation: curve.aggregation,
        configuration: parseObject(curve.configurationJson),
        statistics: parseObject(curve.statisticsJson),
        rawPointCount: curve.rawPointCount,
        storedPointCount: curve.storedPointCount,
        detectorStableId: run.detectorStableId,
        detectorVersion: run.detectorVersion,
        detectorName: run.detectorDefinition.name,
      })),
    ),
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      benchmarkCategory: event.category,
      startSeconds: event.startSeconds,
      peakSeconds: event.peakSeconds,
      endSeconds: event.endSeconds,
      confidence: event.confidence,
      sourceSignal: event.sourceSignal,
      supportingEvidence: parseArray(event.supportingEvidenceJson),
      conflictingEvidence: parseArray(event.conflictingEvidenceJson),
      rawMeasurements: parseObject(event.rawMeasurementsJson),
      thresholds: parseObject(event.thresholdsJson),
      warningMessages: parseArray(event.warningMessagesJson),
      detectorStableId: event.detectorRun.detectorStableId,
      detectorVersion: event.detectorRun.detectorVersion,
      evidence: event.evidence.map((item) => ({
        id: item.id,
        kind: item.kind,
        sourceSignal: item.sourceSignal,
        summary: item.summary,
        timestampSeconds: item.timestampSeconds,
        data: parseObject(item.dataJson),
      })),
    })),
    labels: labels.map((label) => ({
      id: label.id,
      category: label.category,
      startSeconds: label.startSeconds,
      peakSeconds: label.peakSeconds,
      endSeconds: label.endSeconds,
      approved: label.approved,
      description: label.description,
    })),
    truncatedEventCount: Math.max(0, eventCount - events.length),
    preferences: {
      visibleTracks: parseArray(preference.visibleTracksJson).filter(
        (item): item is string => typeof item === "string",
      ),
      hiddenDetectors: parseArray(preference.hiddenDetectorsJson).filter(
        (item): item is string => typeof item === "string",
      ),
      minimumConfidence: preference.minimumConfidence,
      zoomStartSeconds: preference.zoomStartSeconds,
      zoomEndSeconds: preference.zoomEndSeconds,
    },
  };
}

export async function updateSignalExplorerPreferences(
  projectId: string,
  rawInput: unknown,
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  }
  const input = validateSignalExplorerPreferences(
    rawInput,
    project.durationSeconds,
  );
  await db.signalExplorerPreference.upsert({
    where: { projectId },
    create: {
      projectId,
      visibleTracksJson: JSON.stringify(input.visibleTracks),
      hiddenDetectorsJson: JSON.stringify(input.hiddenDetectors),
      minimumConfidence: input.minimumConfidence,
      zoomStartSeconds: input.zoomStartSeconds,
      zoomEndSeconds: input.zoomEndSeconds,
    },
    update: {
      visibleTracksJson: JSON.stringify(input.visibleTracks),
      hiddenDetectorsJson: JSON.stringify(input.hiddenDetectors),
      minimumConfidence: input.minimumConfidence,
      zoomStartSeconds: input.zoomStartSeconds,
      zoomEndSeconds: input.zoomEndSeconds,
    },
  });
  return getSignalExplorerState(projectId);
}

export async function getSignalCurveData(
  curveId: string,
  query: { startSeconds?: number; endSeconds?: number; maxPoints?: number },
) {
  return readSignalCurve(curveId, query);
}

export async function removeSignalCurve(curveId: string) {
  await deleteSignalCurve(curveId);
  return { deleted: true };
}
