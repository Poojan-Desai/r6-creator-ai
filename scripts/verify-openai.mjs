import { existsSync } from "node:fs";
import process from "node:process";

import OpenAI from "openai";

for (const filename of [".env.local", ".env"]) {
  if (existsSync(filename)) process.loadEnvFile(filename);
}

const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
const budgetCents = Number.parseInt(
  process.env.OPENAI_MONTHLY_BUDGET_CENTS || "0",
  10,
);

if (!apiKey) {
  console.error(
    "OpenAI smoke check skipped: add OPENAI_API_KEY only to .env.local.",
  );
  process.exitCode = 2;
} else if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
  console.error(
    "OpenAI smoke check skipped: set a positive OPENAI_MONTHLY_BUDGET_CENTS in .env.local.",
  );
  process.exitCode = 2;
} else {
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: 30_000,
  });
  const response = await client.responses.create({
    model,
    input: "Return status ok using the required schema.",
    max_output_tokens: 256,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "r6_openai_live_check",
        strict: true,
        schema: {
          type: "object",
          properties: { status: { type: "string", enum: ["ok"] } },
          required: ["status"],
          additionalProperties: false,
        },
      },
    },
  });
  const payload = JSON.parse(response.output_text);
  if (payload.status !== "ok") throw new Error("Unexpected structured output.");
  console.log(
    `OpenAI live check succeeded with ${model}; input tokens=${response.usage?.input_tokens ?? 0}, output tokens=${response.usage?.output_tokens ?? 0}, store=false.`,
  );
}
