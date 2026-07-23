import { randomUUID } from "node:crypto";

import type {
  TranscriptEvidenceCategory,
  TranscriptRuleSource,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const TRANSCRIPT_RULE_PATTERN_SCHEMA = "r6-transcript-pattern/v1";
export const TRANSCRIPT_RULE_EXPORT_SCHEMA = "r6-transcript-rules/v1";

const transcriptCategories = [
  "SURPRISE",
  "EXCITEMENT",
  "LAUGHTER",
  "FRUSTRATION",
  "CELEBRATION",
  "TACTICAL_EXPLANATION",
  "KILL_RELATED_LANGUAGE",
  "DEATH_RELATED_LANGUAGE",
  "WIN_RELATED_LANGUAGE",
  "LOSS_RELATED_LANGUAGE",
  "CLUTCH_RELATED_LANGUAGE",
  "DEFUSER_RELATED_LANGUAGE",
  "MISTAKE_OR_FAIL_LANGUAGE",
  "STORY_SETUP",
  "STORY_PAYOFF",
  "DIRECT_AUDIENCE_ADDRESS",
  "QUESTION_OR_SUSPENSE_SETUP",
  "MAP_RELATED_LANGUAGE",
  "ROOM_OR_CALLOUT_LANGUAGE",
] as const satisfies readonly TranscriptEvidenceCategory[];

const categorySchema = z.enum(transcriptCategories);

function validateSafeRegex(pattern: string) {
  if (/\\[1-9]/.test(pattern) || /\(\?<([=!])/.test(pattern)) {
    throw new Error("Backreferences and lookbehind are not supported.");
  }
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) {
    throw new Error("Nested repetition is not supported.");
  }
  try {
    new RegExp(pattern, "iu");
  } catch {
    throw new Error("The regular expression is invalid.");
  }
  return pattern;
}

export const transcriptRulePatternSchema = z
  .object({
    schemaVersion: z.literal(TRANSCRIPT_RULE_PATTERN_SCHEMA),
    phrases: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    regexes: z
      .array(z.string().trim().min(1).max(200).transform(validateSafeRegex))
      .max(20)
      .default([]),
    negations: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .default(["not", "never", "didn't", "did not", "don't", "do not"]),
    ambiguousPhrases: z
      .array(z.string().trim().min(1).max(120))
      .max(30)
      .default([]),
    contextBeforeLines: z.number().int().min(0).max(3).default(1),
    contextAfterLines: z.number().int().min(0).max(3).default(1),
    repetitionBoost: z.boolean().default(true),
  })
  .strict()
  .superRefine((pattern, context) => {
    if (pattern.phrases.length === 0 && pattern.regexes.length === 0) {
      context.addIssue({
        code: "custom",
        message:
          "A transcript rule needs at least one phrase or regular expression.",
      });
    }
  });

export type TranscriptRulePattern = z.infer<typeof transcriptRulePatternSchema>;

type DefaultRule = {
  stableId: string;
  name: string;
  description: string;
  category: TranscriptEvidenceCategory;
  confidence: number;
  phrases: string[];
  regexes?: string[];
  ambiguousPhrases?: string[];
};

export const DEFAULT_TRANSCRIPT_RULES: DefaultRule[] = [
  {
    stableId: "default.surprise",
    name: "Surprise language",
    description:
      "Broad verbal surprise evidence; it does not prove an interesting event.",
    category: "SURPRISE",
    confidence: 0.62,
    phrases: ["no way", "wait what", "what just happened", "oh my god"],
    ambiguousPhrases: ["no way", "oh my god"],
  },
  {
    stableId: "default.excitement",
    name: "Excitement language",
    description:
      "Elevated positive language that needs audio or gameplay support.",
    category: "EXCITEMENT",
    confidence: 0.62,
    phrases: ["let's go", "yes", "that was insane", "come on"],
    ambiguousPhrases: ["yes", "come on"],
  },
  {
    stableId: "default.laughter",
    name: "Laughter words",
    description:
      "Textual laughter markers; transcription can mishear non-speech audio.",
    category: "LAUGHTER",
    confidence: 0.66,
    phrases: ["haha", "hahaha", "lol", "I'm laughing", "that's hilarious"],
    regexes: ["\\bha(?:ha){1,5}\\b"],
  },
  {
    stableId: "default.frustration",
    name: "Frustration language",
    description:
      "Possible frustration wording without psychological diagnosis.",
    category: "FRUSTRATION",
    confidence: 0.58,
    phrases: [
      "are you kidding",
      "this is ridiculous",
      "why would",
      "come on man",
    ],
    ambiguousPhrases: ["why would"],
  },
  {
    stableId: "default.celebration",
    name: "Celebration language",
    description:
      "Possible celebration wording that needs surrounding evidence.",
    category: "CELEBRATION",
    confidence: 0.64,
    phrases: ["we did it", "we won", "nice job", "good stuff", "let's go"],
  },
  {
    stableId: "default.tactical-explanation",
    name: "Tactical explanation",
    description:
      "Language that may explain a decision, angle, route, or utility use.",
    category: "TACTICAL_EXPLANATION",
    confidence: 0.56,
    phrases: [
      "the reason",
      "you want to",
      "what you do",
      "hold this angle",
      "watch the rotate",
    ],
  },
  {
    stableId: "default.kill-language",
    name: "Kill-related language",
    description:
      "Words that may support a kill candidate but never confirm one.",
    category: "KILL_RELATED_LANGUAGE",
    confidence: 0.55,
    phrases: ["I got him", "he's dead", "got one", "eliminated", "I killed"],
    ambiguousPhrases: ["he's dead", "got one"],
  },
  {
    stableId: "default.death-language",
    name: "Death-related language",
    description:
      "Words that may support a death candidate but do not prove timing or identity.",
    category: "DEATH_RELATED_LANGUAGE",
    confidence: 0.57,
    phrases: ["I'm dead", "I died", "he got me", "I'm down", "I'm out"],
    ambiguousPhrases: ["I'm out"],
  },
  {
    stableId: "default.win-language",
    name: "Win-related language",
    description:
      "Possible round or match win wording without result-screen confirmation.",
    category: "WIN_RELATED_LANGUAGE",
    confidence: 0.58,
    phrases: ["we won", "round won", "that's a win", "victory"],
  },
  {
    stableId: "default.loss-language",
    name: "Loss-related language",
    description:
      "Possible round or match loss wording without result-screen confirmation.",
    category: "LOSS_RELATED_LANGUAGE",
    confidence: 0.58,
    phrases: ["we lost", "lost the round", "that's a loss", "defeat"],
  },
  {
    stableId: "default.clutch-language",
    name: "Clutch-related language",
    description: "Clutch wording without player-count or round-state proof.",
    category: "CLUTCH_RELATED_LANGUAGE",
    confidence: 0.48,
    phrases: ["clutch", "one v one", "one versus", "I'm alone", "last alive"],
    ambiguousPhrases: ["clutch"],
  },
  {
    stableId: "default.defuser-language",
    name: "Defuser-related language",
    description:
      "Possible defuser context without confirming a plant or disable.",
    category: "DEFUSER_RELATED_LANGUAGE",
    confidence: 0.56,
    phrases: ["defuser", "planting", "disable", "get the plant", "on the bomb"],
  },
  {
    stableId: "default.mistake-language",
    name: "Mistake or fail language",
    description:
      "Self-described mistake evidence without confirming a gameplay fail.",
    category: "MISTAKE_OR_FAIL_LANGUAGE",
    confidence: 0.58,
    phrases: [
      "I threw",
      "my bad",
      "I messed up",
      "that was a mistake",
      "I whiffed",
    ],
  },
  {
    stableId: "default.story-setup",
    name: "Story setup",
    description: "Language that may introduce a story or forthcoming moment.",
    category: "STORY_SETUP",
    confidence: 0.54,
    phrases: [
      "watch this",
      "here's what happened",
      "it started when",
      "so basically",
    ],
    ambiguousPhrases: ["watch this"],
  },
  {
    stableId: "default.story-payoff",
    name: "Story payoff",
    description: "Language that may complete an earlier setup.",
    category: "STORY_PAYOFF",
    confidence: 0.52,
    phrases: [
      "and that's why",
      "it actually worked",
      "that's what happened",
      "in the end",
    ],
  },
  {
    stableId: "default.audience-address",
    name: "Direct audience address",
    description: "Possible direct address to viewers or listeners.",
    category: "DIRECT_AUDIENCE_ADDRESS",
    confidence: 0.54,
    phrases: [
      "you guys",
      "look at this",
      "let me show you",
      "if you're watching",
    ],
  },
  {
    stableId: "default.question-suspense",
    name: "Question or suspense setup",
    description: "Questions or language that may create a suspense setup.",
    category: "QUESTION_OR_SUSPENSE_SETUP",
    confidence: 0.5,
    phrases: ["what if", "can I", "do you think", "will this work"],
    regexes: ["[^?]{3,}[?]"],
    ambiguousPhrases: ["can I", "do you think"],
  },
  {
    stableId: "default.map-language",
    name: "Map-related language",
    description:
      "Possible map wording; it never overrides user-confirmed project map context.",
    category: "MAP_RELATED_LANGUAGE",
    confidence: 0.42,
    phrases: ["on this map", "this map", "map choice", "map ban"],
    ambiguousPhrases: ["this map"],
  },
  {
    stableId: "default.room-callout-language",
    name: "Room or callout language",
    description:
      "Possible room/callout wording; it does not locate the player.",
    category: "ROOM_OR_CALLOUT_LANGUAGE",
    confidence: 0.45,
    phrases: ["in freezer", "blue stairs", "top floor", "basement", "on site"],
    ambiguousPhrases: ["basement", "on site"],
  },
];

function defaultPattern(rule: DefaultRule): TranscriptRulePattern {
  return transcriptRulePatternSchema.parse({
    schemaVersion: TRANSCRIPT_RULE_PATTERN_SCHEMA,
    phrases: rule.phrases,
    regexes: rule.regexes ?? [],
    ambiguousPhrases: rule.ambiguousPhrases ?? [],
  });
}

export async function ensureDefaultTranscriptRules() {
  for (const rule of DEFAULT_TRANSCRIPT_RULES) {
    const existing = await db.transcriptRule.findUnique({
      where: { stableId: rule.stableId },
    });
    if (existing) continue;
    await db.transcriptRule.create({
      data: {
        stableId: rule.stableId,
        name: rule.name,
        description: rule.description,
        category: rule.category,
        enabled: true,
        isDefault: true,
        versions: {
          create: {
            version: 1,
            patternJson: JSON.stringify(defaultPattern(rule)),
            confidence: rule.confidence,
            source: "DEFAULT",
            changeNote: "Built-in Phase 3B.2 default",
          },
        },
      },
    });
  }
}

type RuleWithVersions = Awaited<
  ReturnType<
    typeof db.transcriptRule.findFirst<{
      include: { versions: true };
    }>
  >
>;

export type TranscriptRuleDto = {
  id: string;
  stableId: string;
  name: string;
  description: string;
  category: TranscriptEvidenceCategory;
  enabled: boolean;
  isDefault: boolean;
  currentVersion: number;
  confidence: number;
  source: TranscriptRuleSource;
  pattern: TranscriptRulePattern;
  versionCount: number;
  updatedAt: string;
};

function serializeRule(rule: NonNullable<RuleWithVersions>): TranscriptRuleDto {
  const current =
    rule.versions.find((version) => version.version === rule.currentVersion) ??
    rule.versions.at(-1);
  if (!current)
    throw new Error(`Transcript rule ${rule.stableId} has no version.`);
  return {
    id: rule.id,
    stableId: rule.stableId,
    name: rule.name,
    description: rule.description,
    category: rule.category,
    enabled: rule.enabled,
    isDefault: rule.isDefault,
    currentVersion: current.version,
    confidence: current.confidence,
    source: current.source,
    pattern: transcriptRulePatternSchema.parse(JSON.parse(current.patternJson)),
    versionCount: rule.versions.length,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export async function listTranscriptRules() {
  await ensureDefaultTranscriptRules();
  const rules = await db.transcriptRule.findMany({
    include: { versions: { orderBy: { version: "asc" } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rules.map(serializeRule);
}

export async function setTranscriptRuleEnabled(id: string, enabled: boolean) {
  const rule = await db.transcriptRule.findUnique({ where: { id } });
  if (!rule) {
    throw new AppError(
      "That transcript rule no longer exists.",
      404,
      "RULE_NOT_FOUND",
    );
  }
  await db.transcriptRule.update({ where: { id }, data: { enabled } });
  return (await listTranscriptRules()).find((item) => item.id === id)!;
}

const editableRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(5).max(500),
    category: categorySchema,
    confidence: z.number().finite().min(0).max(1),
    pattern: transcriptRulePatternSchema,
    changeNote: z.string().trim().max(300).optional(),
  })
  .strict();

export async function updateTranscriptRule(id: string, rawInput: unknown) {
  const input = editableRuleSchema.parse(rawInput);
  const rule = await db.transcriptRule.findUnique({ where: { id } });
  if (!rule) {
    throw new AppError(
      "That transcript rule no longer exists.",
      404,
      "RULE_NOT_FOUND",
    );
  }
  const nextVersion = rule.currentVersion + 1;
  await db.$transaction([
    db.transcriptRuleVersion.create({
      data: {
        ruleId: rule.id,
        version: nextVersion,
        patternJson: JSON.stringify(input.pattern),
        confidence: input.confidence,
        source: "USER",
        changeNote: input.changeNote || "Edited in advanced settings",
      },
    }),
    db.transcriptRule.update({
      where: { id: rule.id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        currentVersion: nextVersion,
      },
    }),
  ]);
  return (await listTranscriptRules()).find((item) => item.id === id)!;
}

export async function duplicateTranscriptRule(id: string) {
  const source = (await listTranscriptRules()).find((rule) => rule.id === id);
  if (!source) {
    throw new AppError(
      "That transcript rule no longer exists.",
      404,
      "RULE_NOT_FOUND",
    );
  }
  const stableId = `user.${source.stableId.replace(/[^a-z0-9.-]/g, "-")}.${randomUUID().slice(0, 8)}`;
  const created = await db.transcriptRule.create({
    data: {
      stableId,
      name: `${source.name} copy`,
      description: source.description,
      category: source.category,
      enabled: false,
      isDefault: false,
      versions: {
        create: {
          version: 1,
          patternJson: JSON.stringify(source.pattern),
          confidence: source.confidence,
          source: "USER",
          changeNote: `Duplicated from ${source.stableId}@${source.currentVersion}`,
        },
      },
    },
  });
  return (await listTranscriptRules()).find((item) => item.id === created.id)!;
}

export async function resetDefaultTranscriptRules() {
  await ensureDefaultTranscriptRules();
  for (const defaultRule of DEFAULT_TRANSCRIPT_RULES) {
    const rule = await db.transcriptRule.findUnique({
      where: { stableId: defaultRule.stableId },
    });
    if (!rule) continue;
    const nextVersion = rule.currentVersion + 1;
    await db.$transaction([
      db.transcriptRuleVersion.create({
        data: {
          ruleId: rule.id,
          version: nextVersion,
          patternJson: JSON.stringify(defaultPattern(defaultRule)),
          confidence: defaultRule.confidence,
          source: "DEFAULT",
          changeNote: "Reset to built-in defaults",
        },
      }),
      db.transcriptRule.update({
        where: { id: rule.id },
        data: {
          name: defaultRule.name,
          description: defaultRule.description,
          category: defaultRule.category,
          enabled: true,
          currentVersion: nextVersion,
        },
      }),
    ]);
  }
  return listTranscriptRules();
}

const importRuleSchema = editableRuleSchema.extend({
  stableId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/),
  enabled: z.boolean(),
});

const importDocumentSchema = z
  .object({
    schemaVersion: z.literal(TRANSCRIPT_RULE_EXPORT_SCHEMA),
    createdAt: z.string().datetime(),
    rules: z.array(importRuleSchema).min(1).max(200),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = document.rules.map((rule) => rule.stableId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Imported rule IDs must be unique.",
      });
    }
  });

export async function exportTranscriptRules() {
  const rules = await listTranscriptRules();
  return {
    schemaVersion: TRANSCRIPT_RULE_EXPORT_SCHEMA,
    createdAt: new Date().toISOString(),
    rules: rules.map((rule) => ({
      stableId: rule.stableId,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      confidence: rule.confidence,
      enabled: rule.enabled,
      pattern: rule.pattern,
    })),
  };
}

export async function importTranscriptRules(rawInput: unknown) {
  const document = importDocumentSchema.parse(rawInput);
  const importedIds: string[] = [];
  for (const imported of document.rules) {
    const existing = await db.transcriptRule.findUnique({
      where: { stableId: imported.stableId },
    });
    if (!existing) {
      const created = await db.transcriptRule.create({
        data: {
          stableId: imported.stableId,
          name: imported.name,
          description: imported.description,
          category: imported.category,
          enabled: imported.enabled,
          isDefault: false,
          versions: {
            create: {
              version: 1,
              patternJson: JSON.stringify(imported.pattern),
              confidence: imported.confidence,
              source: "IMPORTED",
              changeNote: "Imported rule",
            },
          },
        },
      });
      importedIds.push(created.id);
      continue;
    }
    const nextVersion = existing.currentVersion + 1;
    await db.$transaction([
      db.transcriptRuleVersion.create({
        data: {
          ruleId: existing.id,
          version: nextVersion,
          patternJson: JSON.stringify(imported.pattern),
          confidence: imported.confidence,
          source: "IMPORTED",
          changeNote: "Imported as a new historical version",
        },
      }),
      db.transcriptRule.update({
        where: { id: existing.id },
        data: {
          name: imported.name,
          description: imported.description,
          category: imported.category,
          enabled: imported.enabled,
          currentVersion: nextVersion,
        },
      }),
    ]);
    importedIds.push(existing.id);
  }
  return {
    importedCount: importedIds.length,
    rules: await listTranscriptRules(),
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TranscriptRuleMatch = {
  exactText: string;
  matchStart: number;
  matchEnd: number;
  negated: boolean;
  ambiguous: boolean;
  repeated: boolean;
  confidence: number;
  warnings: string[];
};

export function matchTranscriptRule(
  text: string,
  rule: Pick<TranscriptRuleDto, "pattern" | "confidence">,
) {
  const matches: TranscriptRuleMatch[] = [];
  const lower = text.toLocaleLowerCase("en-US");
  const ambiguous = new Set(
    rule.pattern.ambiguousPhrases.map((phrase) =>
      phrase.toLocaleLowerCase("en-US"),
    ),
  );
  const candidates: Array<{ exactText: string; start: number; end: number }> =
    [];
  for (const phrase of rule.pattern.phrases) {
    const expression = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])(${escapeRegex(phrase)})(?=$|[^\\p{L}\\p{N}])`,
      "giu",
    );
    for (const result of text.matchAll(expression)) {
      const exactText = result[1] ?? phrase;
      const full = result[0] ?? exactText;
      const relative = full.lastIndexOf(exactText);
      const start = (result.index ?? 0) + Math.max(0, relative);
      candidates.push({ exactText, start, end: start + exactText.length });
    }
  }
  for (const pattern of rule.pattern.regexes) {
    const expression = new RegExp(pattern, "giu");
    for (const result of text.matchAll(expression)) {
      const exactText = result[0];
      if (!exactText) continue;
      const start = result.index ?? 0;
      candidates.push({ exactText, start, end: start + exactText.length });
    }
  }
  const distinct = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    distinct.set(
      `${candidate.start}:${candidate.end}:${candidate.exactText}`,
      candidate,
    );
  }
  for (const candidate of distinct.values()) {
    const before = lower.slice(
      Math.max(0, candidate.start - 50),
      candidate.start,
    );
    const negated = rule.pattern.negations.some((negation) =>
      new RegExp(`(?:^|\\s)${escapeRegex(negation)}(?:\\s|$)`, "iu").test(
        before,
      ),
    );
    const ambiguousMatch = ambiguous.has(
      candidate.exactText.toLocaleLowerCase("en-US"),
    );
    const repeated =
      candidates.filter(
        (item) =>
          item.exactText.toLocaleLowerCase("en-US") ===
          candidate.exactText.toLocaleLowerCase("en-US"),
      ).length > 1;
    const warnings = [
      ...(negated
        ? ["Nearby negation may reverse or weaken this phrase."]
        : []),
      ...(ambiguousMatch
        ? ["This phrase is context-dependent and ambiguous."]
        : []),
    ];
    matches.push({
      exactText: candidate.exactText,
      matchStart: candidate.start,
      matchEnd: candidate.end,
      negated,
      ambiguous: ambiguousMatch,
      repeated,
      confidence: Math.max(
        0.1,
        Math.min(
          0.95,
          rule.confidence * (negated ? 0.45 : 1) * (ambiguousMatch ? 0.72 : 1) +
            (repeated && rule.pattern.repetitionBoost ? 0.05 : 0),
        ),
      ),
      warnings,
    });
  }
  return matches;
}
