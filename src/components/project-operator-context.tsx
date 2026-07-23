"use client";

import { useMemo, useState } from "react";
import { Crosshair, Save } from "lucide-react";

import type { ProjectOperatorContextDto } from "@/lib/operator-knowledge/service";

const empty = {
  playerOperatorId: null,
  operatorVersionId: null,
  teamOperatorIds: [] as string[],
  enemyOperatorIds: [] as string[],
  side: "UNKNOWN" as const,
  uniqueAbilityUsed: null,
  secondaryGadgetUsed: null,
  abilityUseTimestamp: null,
  abilityResult: null,
  target: null,
  abilitySucceeded: null,
  tacticalPurpose: null,
  userNotes: null,
  userConfirmed: false,
};

export function ProjectOperatorContext({
  projectId,
  initialState,
}: {
  projectId: string;
  initialState: ProjectOperatorContextDto;
}) {
  const initial = initialState.context ?? empty;
  const [state, setState] = useState(initialState);
  const [operatorId, setOperatorId] = useState(initial.playerOperatorId ?? "");
  const [side, setSide] = useState(initial.side);
  const [ability, setAbility] = useState(initial.uniqueAbilityUsed ?? "");
  const [gadget, setGadget] = useState(initial.secondaryGadgetUsed ?? "");
  const [timestamp, setTimestamp] = useState(
    initial.abilityUseTimestamp?.toString() ?? "",
  );
  const [result, setResult] = useState(initial.abilityResult ?? "");
  const [target, setTarget] = useState(initial.target ?? "");
  const [success, setSuccess] = useState(
    initial.abilitySucceeded === null
      ? "UNKNOWN"
      : initial.abilitySucceeded
        ? "YES"
        : "NO",
  );
  const [purpose, setPurpose] = useState(initial.tacticalPurpose ?? "");
  const [notes, setNotes] = useState(initial.userNotes ?? "");
  const [teamOperatorIds, setTeamOperatorIds] = useState(
    initial.teamOperatorIds,
  );
  const [enemyOperatorIds, setEnemyOperatorIds] = useState(
    initial.enemyOperatorIds,
  );
  const [confirmed, setConfirmed] = useState(initial.userConfirmed);
  const [message, setMessage] = useState<string | null>(null);
  const selected = useMemo(
    () => state.operators.find((operator) => operator.id === operatorId),
    [operatorId, state.operators],
  );

  async function save() {
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/operator-context`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerOperatorId: operatorId || null,
            operatorVersionId: selected?.versionId ?? null,
            teamOperatorIds,
            enemyOperatorIds,
            side,
            uniqueAbilityUsed: ability.trim() || null,
            secondaryGadgetUsed: gadget.trim() || null,
            abilityUseTimestamp: timestamp.trim() ? Number(timestamp) : null,
            abilityResult: result.trim() || null,
            target: target.trim() || null,
            abilitySucceeded: success === "UNKNOWN" ? null : success === "YES",
            tacticalPurpose: purpose.trim() || null,
            userNotes: notes.trim() || null,
            userConfirmed: confirmed,
          }),
        },
      );
      const body = (await response.json()) as {
        operatorContext?: ProjectOperatorContextDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.operatorContext)
        throw new Error(
          body.error?.message ?? "Operator context could not be saved.",
        );
      setState(body.operatorContext);
      setMessage("User-confirmed operator context saved locally.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Operator context could not be saved.",
      );
    }
  }

  return (
    <section
      className="panel mt-8 overflow-hidden"
      aria-labelledby="project-operator-context-title"
    >
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <p className="section-kicker">Manual context · optional</p>
        <h2
          id="project-operator-context-title"
          className="font-display mt-1 flex items-center gap-2 text-2xl font-bold text-white uppercase"
        >
          <Crosshair aria-hidden="true" className="text-[#b8ff2c]" size={20} />{" "}
          Operator context
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Choose only facts you know. The app does not infer an operator from a
          weapon or from this recording.
        </p>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <Select
          label="Player operator"
          value={operatorId}
          onChange={(value) => {
            setOperatorId(value);
            const item = state.operators.find(
              (operator) => operator.id === value,
            );
            setAbility(item?.abilityName ?? "");
          }}
          options={[
            { value: "", label: "Unknown" },
            ...state.operators.map((operator) => ({
              value: operator.id,
              label: `${operator.displayName} · ${operator.side}`,
            })),
          ]}
        />
        <Select
          label="Side"
          value={side}
          onChange={(value) => setSide(value as typeof side)}
          options={[
            { value: "UNKNOWN", label: "Unknown" },
            { value: "ATTACK", label: "Attack" },
            { value: "DEFENSE", label: "Defense" },
          ]}
        />
        <Field
          label="Ability used"
          value={ability}
          onChange={setAbility}
          placeholder="Unknown"
        />
        <Field
          label="Secondary gadget used"
          value={gadget}
          onChange={setGadget}
          placeholder="Unknown"
        />
        <Field
          label="Ability timestamp (seconds)"
          value={timestamp}
          onChange={setTimestamp}
          type="number"
          placeholder="Unknown"
        />
        <Select
          label="Did it succeed?"
          value={success}
          onChange={setSuccess}
          options={[
            { value: "UNKNOWN", label: "Unknown" },
            { value: "YES", label: "Yes — user confirmed" },
            { value: "NO", label: "No — user confirmed" },
          ]}
        />
        <MultiSelect
          label="Known teammate operators (optional)"
          values={teamOperatorIds}
          onChange={(values) => setTeamOperatorIds(values.slice(0, 4))}
          options={state.operators
            .filter((operator) => operator.id !== operatorId)
            .map((operator) => ({
              value: operator.id,
              label: operator.displayName,
            }))}
        />
        <MultiSelect
          label="Known enemy operators (optional)"
          values={enemyOperatorIds}
          onChange={(values) => setEnemyOperatorIds(values.slice(0, 5))}
          options={state.operators.map((operator) => ({
            value: operator.id,
            label: operator.displayName,
          }))}
        />
        <Field
          label="Target gadget or operator"
          value={target}
          onChange={setTarget}
          placeholder="Unknown"
        />
        <Field
          label="Ability result"
          value={result}
          onChange={setResult}
          placeholder="What you observed"
        />
        <Field
          label="Tactical purpose"
          value={purpose}
          onChange={setPurpose}
          placeholder="What you intended"
        />
        <label className="text-xs font-bold text-slate-500 uppercase sm:col-span-2 lg:col-span-3">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white normal-case"
          />
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm text-slate-300 sm:col-span-2 lg:col-span-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4 accent-[#b8ff2c]"
          />
          <span>
            <strong className="text-amber-200">
              I confirm this operator context.
            </strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              Only confirmed fields may be passed to future content writing.
              Unknown fields stay unknown.
            </span>
          </span>
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button type="button" onClick={save} className="primary-button">
            <Save aria-hidden="true" size={15} /> Save operator context
          </button>
          {message ? (
            <p role="status" className="mt-3 text-sm text-slate-300">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="text-xs font-bold text-slate-500 uppercase">
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 0.01 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white normal-case"
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs font-bold text-slate-500 uppercase">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#10151a] px-3 py-2.5 text-sm text-white normal-case"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiSelect({
  label,
  values,
  onChange,
  options,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs font-bold text-slate-500 uppercase">
      {label}
      <select
        multiple
        value={values}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions, (option) => option.value),
          )
        }
        className="mt-1.5 h-28 w-full rounded-xl border border-white/10 bg-[#10151a] px-3 py-2.5 text-sm text-white normal-case"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[10px] font-normal text-slate-700 normal-case">
        Hold Command to select more than one.
      </span>
    </label>
  );
}
