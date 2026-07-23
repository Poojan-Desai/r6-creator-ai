"use client";

import {
  AlertTriangle,
  Copy,
  Download,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { TranscriptRuleDto } from "@/lib/transcript-rules";

function humanize(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The rule action failed.";
}

function readError(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return "The transcript rule action failed.";
}

export function TranscriptRuleSettings({
  initialRules,
}: {
  initialRules: TranscriptRuleDto[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [selectedId, setSelectedId] = useState(initialRules[0]?.id ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(
    () => rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null,
    [rules, selectedId],
  );

  function replaceRule(rule: TranscriptRuleDto) {
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? rule : item)),
    );
  }

  async function patchRule(
    ruleId: string,
    body: Record<string, unknown>,
    operation: string,
  ) {
    setBusy(operation);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/transcript-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as {
        rule?: TranscriptRuleDto;
      } | null;
      if (!response.ok || !payload?.rule) throw new Error(readError(payload));
      if (body.action === "duplicate") {
        setRules((current) => [...current, payload.rule!]);
        setSelectedId(payload.rule.id);
        setMessage("Rule duplicated and left disabled for review.");
      } else {
        replaceRule(payload.rule);
        setMessage(
          body.action === "enable"
            ? "Rule availability updated for future detector runs."
            : `Saved rule version ${payload.rule.currentVersion}. Historical detector results were not changed.`,
        );
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function resetDefaults() {
    if (
      !window.confirm(
        "Create new versions that restore every built-in rule to its default settings?",
      )
    ) {
      return;
    }
    setBusy("reset");
    setError(null);
    try {
      const response = await fetch("/api/transcript-rules/reset", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        rules?: TranscriptRuleDto[];
      } | null;
      if (!response.ok || !payload?.rules) throw new Error(readError(payload));
      setRules(payload.rules);
      setMessage(
        "Default rules were restored as new versions. Historical detector results remain unchanged.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function importRules(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Transcript rule imports must be smaller than 1 MB.");
      return;
    }
    setBusy("import");
    setError(null);
    try {
      const document = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/transcript-rules/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(document),
      });
      const payload = (await response.json().catch(() => null)) as {
        importedCount?: number;
        rules?: TranscriptRuleDto[];
      } | null;
      if (!response.ok || !payload?.rules) throw new Error(readError(payload));
      setRules(payload.rules);
      setMessage(
        `Imported ${payload.importedCount ?? 0} rule${payload.importedCount === 1 ? "" : "s"} as versioned local settings.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = "";
    }
  }

  return (
    <div className="mt-9 grid gap-6 xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]">
      <aside className="panel h-fit p-5">
        <div className="rounded-xl border border-amber-300/15 bg-amber-400/6 p-4 text-sm leading-6 text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <p>
              Changes affect future transcript detector runs only. Saved
              historical results keep their original rule ID and version.
            </p>
          </div>
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/8 p-3 text-xs leading-5 text-slate-300">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[#b8ff2c]"
            checked={unlocked}
            onChange={(event) => setUnlocked(event.target.checked)}
          />
          I understand these are advanced local evidence settings, not gameplay
          facts.
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/api/transcript-rules/export"
            className="secondary-button"
          >
            <Download size={14} /> Export JSON
          </Link>
          <button
            type="button"
            className="secondary-button"
            disabled={!unlocked || busy !== null}
            onClick={() => importRef.current?.click()}
          >
            <Upload size={14} /> Import JSON
          </button>
          <input
            ref={importRef}
            type="file"
            className="hidden"
            accept="application/json,.json"
            onChange={(event) => void importRules(event.target.files?.[0])}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={!unlocked || busy !== null}
            onClick={() => void resetDefaults()}
          >
            <RotateCcw size={14} /> Reset defaults
          </button>
        </div>
        <div className="mt-5 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              className={`w-full rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8ff2c] ${
                selected?.id === rule.id
                  ? "border-[#b8ff2c]/25 bg-[#b8ff2c]/7"
                  : "border-white/8 bg-black/20"
              }`}
              onClick={() => setSelectedId(rule.id)}
            >
              <span className="block text-sm font-semibold text-white">
                {rule.name}
              </span>
              <span className="mt-1 block text-[10px] font-bold tracking-wide text-slate-600 uppercase">
                {humanize(rule.category)} · v{rule.currentVersion} ·{" "}
                {rule.enabled ? "enabled" : "disabled"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel p-5 sm:p-6">
        {selected ? (
          <RuleEditor
            key={`${selected.id}:${selected.currentVersion}`}
            rule={selected}
            unlocked={unlocked}
            busy={busy}
            onEnable={(enabled) =>
              void patchRule(
                selected.id,
                { action: "enable", enabled },
                `enable-${selected.id}`,
              )
            }
            onDuplicate={() =>
              void patchRule(
                selected.id,
                { action: "duplicate" },
                `duplicate-${selected.id}`,
              )
            }
            onSave={(rule) =>
              void patchRule(
                selected.id,
                { action: "update", rule },
                `save-${selected.id}`,
              )
            }
          />
        ) : (
          <p className="text-sm text-slate-500">No transcript rules exist.</p>
        )}
        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-red-400/20 bg-red-500/8 text-red-200"
                : "border-[#b8ff2c]/20 bg-[#b8ff2c]/8 text-[#d8ff8a]"
            }`}
          >
            {error ?? message}
          </div>
        )}
        <div className="mt-6 border-t border-white/8 pt-5">
          <Link href="/" className="secondary-button">
            Open a project to rerun detectors
          </Link>
        </div>
      </section>
    </div>
  );
}

function RuleEditor({
  rule,
  unlocked,
  busy,
  onEnable,
  onDuplicate,
  onSave,
}: {
  rule: TranscriptRuleDto;
  unlocked: boolean;
  busy: string | null;
  onEnable: (enabled: boolean) => void;
  onDuplicate: () => void;
  onSave: (value: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(rule.name);
  const [description, setDescription] = useState(rule.description);
  const [category, setCategory] = useState(rule.category);
  const [confidence, setConfidence] = useState(rule.confidence);
  const [phrases, setPhrases] = useState(rule.pattern.phrases.join("\n"));
  const [regexes, setRegexes] = useState(rule.pattern.regexes.join("\n"));
  const [negations, setNegations] = useState(rule.pattern.negations.join("\n"));
  const [ambiguous, setAmbiguous] = useState(
    rule.pattern.ambiguousPhrases.join("\n"),
  );
  const categories = [
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
  ] as const;
  const lines = (value: string) =>
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">{rule.stableId}</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            {rule.name}
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            Current version {rule.currentVersion} · {rule.versionCount} saved
            version{rule.versionCount === 1 ? "" : "s"} ·{" "}
            {rule.source.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="secondary-button cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[#b8ff2c]"
              checked={rule.enabled}
              disabled={!unlocked || busy !== null}
              onChange={(event) => onEnable(event.target.checked)}
            />
            Enabled
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!unlocked || busy !== null}
            onClick={onDuplicate}
          >
            <Copy size={14} /> Duplicate
          </button>
        </div>
      </div>

      <fieldset
        disabled={!unlocked || busy !== null}
        className="mt-6 grid gap-4"
      >
        <label>
          <span className="form-label">Rule name</span>
          <input
            className="field mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span className="form-label">Description and limitation</span>
          <textarea
            className="field mt-2 min-h-24"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="form-label">Evidence category</span>
            <select
              className="field mt-2"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as typeof category)
              }
            >
              {categories.map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">
              Base confidence · {confidence.toFixed(2)}
            </span>
            <input
              className="mt-4 w-full accent-[#b8ff2c]"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RuleLines
            label="Exact phrases · one per line"
            value={phrases}
            onChange={setPhrases}
          />
          <RuleLines
            label="Regular expressions · one per line"
            value={regexes}
            onChange={setRegexes}
          />
          <RuleLines
            label="Negation phrases · one per line"
            value={negations}
            onChange={setNegations}
          />
          <RuleLines
            label="Ambiguous phrases · one per line"
            value={ambiguous}
            onChange={setAmbiguous}
          />
        </div>
        <button
          type="button"
          className="primary-button w-fit"
          onClick={() =>
            onSave({
              name,
              description,
              category,
              confidence,
              pattern: {
                ...rule.pattern,
                phrases: lines(phrases),
                regexes: lines(regexes),
                negations: lines(negations),
                ambiguousPhrases: lines(ambiguous),
              },
              changeNote: "Edited in advanced transcript-rule settings",
            })
          }
        >
          <Save size={15} /> Save as new version
        </button>
      </fieldset>
    </>
  );
}

function RuleLines({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <textarea
        className="field mt-2 min-h-36 font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
