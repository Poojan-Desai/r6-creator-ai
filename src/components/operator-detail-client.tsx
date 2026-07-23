"use client";

import { useState } from "react";
import {
  BookOpen,
  Download,
  GitFork,
  MapPinned,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import type {
  OperatorDetailDto,
  OperatorEditorOptionsDto,
} from "@/lib/operator-knowledge/service";

export function OperatorDetailClient({
  initialOperator,
  options,
}: {
  initialOperator: OperatorDetailDto;
  options: OperatorEditorOptionsDto;
}) {
  const [operator, setOperator] = useState(initialOperator);
  const [message, setMessage] = useState<string | null>(null);
  const current =
    operator.versions.find((version) => version.isCurrent) ??
    operator.versions[0];

  async function mutate(
    path: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
  ) {
    setMessage(null);
    try {
      const response = await fetch(`/api/operators/${operator.slug}/${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        operator?: OperatorDetailDto;
        error?: { message?: string };
      };
      if (!response.ok || !data.operator)
        throw new Error(
          data.error?.message ?? "The operator knowledge could not be saved.",
        );
      setOperator(data.operator);
      setMessage(
        "Saved locally. Official and user-created facts remain separately labeled.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The operator knowledge could not be saved.",
      );
    }
  }

  async function deleteItem(
    kind: "alias" | "role" | "interaction" | "map-link",
    id: string,
  ) {
    setMessage(null);
    try {
      const response = await fetch(
        `/api/operator-knowledge-items/${kind}/${id}`,
        {
          method: "DELETE",
        },
      );
      const data = (await response.json()) as {
        deleted?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !data.deleted)
        throw new Error(
          data.error?.message ??
            "The user-created operator fact could not be deleted.",
        );
      const refreshed = await fetch(`/api/operators/${operator.slug}`);
      const refreshedBody = (await refreshed.json()) as {
        operator?: OperatorDetailDto;
        error?: { message?: string };
      };
      if (!refreshed.ok || !refreshedBody.operator)
        throw new Error(
          refreshedBody.error?.message ??
            "The operator could not be refreshed.",
        );
      setOperator(refreshedBody.operator);
      setMessage(
        "The user-created fact was deleted. Official facts were not changed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The user-created operator fact could not be deleted.",
      );
    }
  }

  if (!current)
    return (
      <div className="panel mt-8 p-6 text-slate-400">
        No operator version is available.
      </div>
    );
  return (
    <div className="mt-8 space-y-5">
      <section className="panel overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.45fr_1fr]">
          <div>
            <p
              className={`text-xs font-bold tracking-wide uppercase ${operator.side === "ATTACKER" ? "text-sky-300" : "text-orange-300"}`}
            >
              {operator.side}
            </p>
            <h2 className="mt-2 text-4xl font-extrabold text-white">
              {operator.displayName}
            </h2>
            <dl className="mt-5 space-y-2 text-sm">
              <Row label="Squad" value={operator.squad ?? "Not verified"} />
              <Row label="Version" value={current.versionName} />
              <Row
                label="Status"
                value={current.knowledgeStatus.replaceAll("_", " ")}
              />
              <Row
                label="Verified"
                value={new Date(current.lastVerifiedAt).toLocaleDateString()}
              />
            </dl>
            <a
              href={`/api/operators/${operator.slug}/export`}
              className="secondary-button mt-5"
            >
              <Download aria-hidden="true" size={15} /> Export JSON
            </a>
          </div>
          <div>
            <p className="section-kicker">Official Ubisoft fact</p>
            <h3 className="mt-2 text-2xl font-bold text-white">
              {current.officialAbilityName ??
                "Ability detail needs verification"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {current.officialAbilitySummary ??
                "The operator is listed in the official directory, but this ability and loadout have not yet been transcribed into the local structured record."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {current.officialSpecialties.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[#b8ff2c]/20 px-3 py-1.5 text-xs font-bold text-[#d8ff8a] uppercase"
                >
                  {item.replaceAll("-", " ")}
                </span>
              ))}
            </div>
            <a
              href={current.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-300 hover:text-sky-200"
            >
              <BookOpen aria-hidden="true" size={15} /> {current.sourceTitle}
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <KnowledgeCard
          title="Aliases and content ideas"
          subtitle="Personal additions remain separate from official operator names"
        >
          <div className="mt-3 space-y-2">
            {operator.aliases.map((alias) => (
              <EditableKnowledgeRow
                key={alias.id}
                title={alias.displayName}
                label={alias.sourceType.replaceAll("_", " ")}
                deletable={alias.sourceType === "USER_ENTERED"}
                onDelete={() => void deleteItem("alias", alias.id)}
              />
            ))}
            {current.contentUses.map((contentUse) => (
              <div
                key={contentUse}
                className="rounded-lg border border-purple-300/10 p-3"
              >
                <p className="text-xs font-bold text-purple-300 uppercase">
                  Personal content idea
                </p>
                <p className="mt-1 text-sm text-slate-300">{contentUse}</p>
              </div>
            ))}
            {!operator.aliases.length && !current.contentUses.length ? (
              <p className="text-sm text-slate-600">
                No personal aliases or content ideas entered yet.
              </p>
            ) : null}
          </div>
        </KnowledgeCard>
        <KnowledgeCard
          title="Current loadout"
          subtitle="Stored by operator version"
        >
          {(
            ["PRIMARY_WEAPON", "SECONDARY_WEAPON", "SECONDARY_GADGET"] as const
          ).map((slot) => (
            <div key={slot} className="mt-3">
              <p className="text-[10px] font-bold text-slate-600 uppercase">
                {slot.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {current.loadout
                  .filter((item) => item.slot === slot)
                  .map((item) => item.displayName)
                  .join(" · ") || "Not yet verified"}
              </p>
            </div>
          ))}
        </KnowledgeCard>
        <KnowledgeCard
          title="Roles"
          subtitle="Official specialties remain separate from community and personal labels"
        >
          <div className="mt-3 space-y-2">
            {current.roles.map((role) => (
              <EditableKnowledgeRow
                key={role.id}
                title={role.displayName}
                label={`${role.roleSource.replaceAll("_", " ")} · ${role.sourceType.replaceAll("_", " ")}`}
                deletable={role.roleSource === "USER_ASSIGNED"}
                onDelete={() => void deleteItem("role", role.id)}
              />
            ))}
          </div>
        </KnowledgeCard>
        <KnowledgeCard
          title="Conditional interactions"
          subtitle="Conditions matter; these are not simple universal counters"
        >
          <div className="mt-3 space-y-2">
            {current.interactions.length ? (
              current.interactions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/8 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold text-purple-300 uppercase">
                      {item.category.replaceAll("_", " ")}
                    </p>
                    {item.sourceType === "USER_ENTERED" ? (
                      <DeleteButton
                        label="Delete user-created interaction"
                        onClick={() => void deleteItem("interaction", item.id)}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-white">
                    {item.targetOperator ??
                      item.targetAbility ??
                      item.targetGadget ??
                      "Context target"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    <strong>When:</strong> {item.conditions}
                    <br />
                    <strong>Result:</strong> {item.outcome}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                No conditional interactions entered yet.
              </p>
            )}
          </div>
        </KnowledgeCard>
        <KnowledgeCard
          title="Map relationships"
          subtitle="Only manually linked, version-compatible tactical context"
        >
          <div className="mt-3 space-y-2">
            {current.mapLinks.length ? (
              current.mapLinks.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/8 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-white">
                      {item.mapName} · {item.mapVersion}
                    </p>
                    {item.sourceType === "USER_ENTERED" ? (
                      <DeleteButton
                        label="Delete user-created map link"
                        onClick={() => void deleteItem("map-link", item.id)}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {[item.floor, item.room, item.bombSite]
                      .filter(Boolean)
                      .join(" · ") || "Whole map"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {item.tacticalPurpose}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                No user-confirmed map links entered yet.
              </p>
            )}
          </div>
        </KnowledgeCard>
      </div>

      <section className="panel p-5 sm:p-6">
        <p className="section-kicker">Personal knowledge editor</p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          Add inspectable context
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          These additions are labeled user-entered and never promoted to
          official facts automatically.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <SimpleForm
            title="Alias"
            icon={Plus}
            fields={[
              { name: "displayName", label: "Alternate name", required: true },
            ]}
            onSubmit={(body) => mutate("aliases", "POST", body)}
          />
          <SimpleForm
            title="Personal role"
            icon={Plus}
            fields={[
              { name: "displayName", label: "Role label", required: true },
              { name: "notes", label: "Why this role applies" },
            ]}
            onSubmit={(body) => mutate("roles", "POST", body)}
          />
          <SimpleForm
            title="Content-use idea"
            icon={Plus}
            fields={[
              {
                name: "contentUse",
                label: "Original content angle",
                required: true,
              },
            ]}
            onSubmit={(body) => mutate("content-uses", "POST", body)}
          />
          <InteractionForm
            operators={options.operators.filter(
              (item) => item.slug !== operator.slug,
            )}
            categories={options.interactionCategories}
            onSubmit={(body) => mutate("interactions", "POST", body)}
          />
          <MapLinkForm
            maps={options.maps}
            onSubmit={(body) => mutate("map-links", "POST", body)}
          />
        </div>
        <form
          className="mt-5 border-t border-white/8 pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void mutate("notes", "PATCH", {
              tacticalNotes: String(data.get("tacticalNotes") ?? "") || null,
            });
          }}
        >
          <label className="block text-xs font-bold text-slate-400 uppercase">
            Preferred operator notes
            <textarea
              name="tacticalNotes"
              defaultValue={current.tacticalNotes ?? ""}
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white"
            />
          </label>
          <button className="secondary-button mt-3" type="submit">
            <Save aria-hidden="true" size={15} /> Save notes
          </button>
        </form>
        {message ? (
          <p role="status" className="mt-4 text-sm text-slate-300">
            {message}
          </p>
        ) : null}
      </section>

      <section className="panel p-5 text-sm leading-6 text-slate-400 sm:p-6">
        <p className="font-bold text-amber-200">
          Operator detection unsupported
        </p>
        <p className="mt-2">
          This page documents what an operator can do. It does not establish
          that this operator, weapon, gadget, or ability appeared in a
          recording.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-semibold text-slate-300">{value}</dd>
    </div>
  );
}
function KnowledgeCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">{subtitle}</p>
      {children}
    </section>
  );
}

function EditableKnowledgeRow({
  title,
  label,
  deletable,
  onDelete,
}: {
  title: string;
  label: string;
  deletable: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/8 p-3">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-[10px] font-bold text-slate-600 uppercase">
          {label}
        </p>
      </div>
      {deletable ? (
        <DeleteButton label={`Delete ${title}`} onClick={onDelete} />
      ) : null}
    </div>
  );
}

function DeleteButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md border border-rose-300/15 p-1.5 text-rose-300 hover:bg-rose-300/10"
    >
      <Trash2 aria-hidden="true" size={14} />
    </button>
  );
}

type FormField = { name: string; label: string; required?: boolean };
function SimpleForm({
  title,
  icon: Icon,
  fields,
  onSubmit,
}: {
  title: string;
  icon: typeof Plus;
  fields: FormField[];
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="rounded-xl border border-white/8 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit(
          Object.fromEntries(
            fields.map((field) => [
              field.name,
              String(data.get(field.name) ?? "") || null,
            ]),
          ),
        );
        event.currentTarget.reset();
      }}
    >
      <h3 className="flex items-center gap-2 font-bold text-white">
        <Icon aria-hidden="true" size={15} /> {title}
      </h3>
      {fields.map((field) => (
        <label
          key={field.name}
          className="mt-3 block text-xs font-bold text-slate-500 uppercase"
        >
          {field.label}
          <input
            name={field.name}
            required={field.required}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
      ))}
      <button type="submit" className="secondary-button mt-3">
        Add
      </button>
    </form>
  );
}

function InteractionForm({
  operators,
  categories,
  onSubmit,
}: {
  operators: OperatorEditorOptionsDto["operators"];
  categories: OperatorEditorOptionsDto["interactionCategories"];
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="rounded-xl border border-white/8 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          targetOperatorSlug: data.get("target"),
          category: data.get("category"),
          conditions: data.get("conditions"),
          outcome: data.get("outcome"),
          limitations: null,
        });
        event.currentTarget.reset();
      }}
    >
      <h3 className="flex items-center gap-2 font-bold text-white">
        <GitFork aria-hidden="true" size={15} /> Conditional interaction
      </h3>
      <SelectField
        name="target"
        label="Target operator"
        options={operators.map((item) => ({
          value: item.slug,
          label: item.displayName,
        }))}
      />
      <SelectField
        name="category"
        label="Relationship"
        options={categories.map((item) => ({
          value: item,
          label: item.replaceAll("_", " "),
        }))}
      />
      <TextField name="conditions" label="Conditions required" />
      <TextField name="outcome" label="Outcome" />
      <button type="submit" className="secondary-button mt-3">
        Add interaction
      </button>
    </form>
  );
}

function MapLinkForm({
  maps,
  onSubmit,
}: {
  maps: OperatorEditorOptionsDto["maps"];
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const versions = maps.flatMap((map) =>
    map.versions.map((version) => ({ ...version, mapName: map.name })),
  );
  const [versionId, setVersionId] = useState(versions[0]?.id ?? "");
  const selected = versions.find((version) => version.id === versionId);
  return (
    <form
      className="rounded-xl border border-white/8 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          mapVersionId: versionId,
          floorId: String(data.get("floorId") ?? "") || null,
          roomId: String(data.get("roomId") ?? "") || null,
          bombSiteId: String(data.get("bombSiteId") ?? "") || null,
          tacticalPurpose: data.get("tacticalPurpose"),
          requiredConditions:
            String(data.get("requiredConditions") ?? "") || null,
          notes: null,
        });
        event.currentTarget.reset();
      }}
    >
      <h3 className="flex items-center gap-2 font-bold text-white">
        <MapPinned aria-hidden="true" size={15} /> Map-version link
      </h3>
      <label className="mt-3 block text-xs font-bold text-slate-500 uppercase">
        Map version
        <select
          value={versionId}
          onChange={(event) => setVersionId(event.target.value)}
          required
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#10151a] px-3 py-2 text-sm text-white"
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.mapName} · {version.name}
            </option>
          ))}
        </select>
      </label>
      <SelectField
        name="floorId"
        label="Floor (optional)"
        options={[
          { value: "", label: "Whole map / unknown" },
          ...(selected?.floors.map((item) => ({
            value: item.id,
            label: item.name,
          })) ?? []),
        ]}
      />
      <SelectField
        name="roomId"
        label="Room (optional)"
        options={[
          { value: "", label: "Unknown" },
          ...(selected?.rooms.map((item) => ({
            value: item.id,
            label: item.name,
          })) ?? []),
        ]}
      />
      <SelectField
        name="bombSiteId"
        label="Bomb site (optional)"
        options={[
          { value: "", label: "Unknown" },
          ...(selected?.bombSites.map((item) => ({
            value: item.id,
            label: item.name,
          })) ?? []),
        ]}
      />
      <TextField name="tacticalPurpose" label="Tactical purpose" />
      <TextField
        name="requiredConditions"
        label="Required conditions"
        required={false}
      />
      <button type="submit" className="secondary-button mt-3">
        Add map link
      </button>
    </form>
  );
}
function SelectField({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="mt-3 block text-xs font-bold text-slate-500 uppercase">
      {label}
      <select
        name={name}
        required
        className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#10151a] px-3 py-2 text-sm text-white"
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function TextField({
  name,
  label,
  required = true,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="mt-3 block text-xs font-bold text-slate-500 uppercase">
      {label}
      <input
        name={name}
        required={required}
        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
      />
    </label>
  );
}
