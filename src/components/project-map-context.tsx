"use client";

import { useState } from "react";
import { Check, MapPinned, Save } from "lucide-react";

import type { ProjectMapContextState } from "@/lib/map-knowledge/service";

type ContextForm = NonNullable<ProjectMapContextState["context"]>;

const EMPTY_CONTEXT: ContextForm = {
  mapId: null,
  mapVersionId: null,
  bombSiteId: null,
  side: "UNKNOWN",
  startingRoomId: null,
  importantRoomIds: [],
  operator: "",
  roundResult: "",
  userConfirmed: false,
  notes: "",
};

export function ProjectMapContext({
  projectId,
  initialState,
}: {
  projectId: string;
  initialState: ProjectMapContextState;
}) {
  const [form, setForm] = useState<ContextForm>(
    initialState.context ?? EMPTY_CONTEXT,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const map = initialState.maps.find((item) => item.id === form.mapId);
  const version = map?.versions.find((item) => item.id === form.mapVersionId);
  const rooms = version?.rooms ?? [];

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/map-context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Map context could not be saved.",
        );
      setMessage(
        "Confirmed map context saved. Writing tools may use only these selected facts.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Map context could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel mt-8 p-5 sm:p-6"
      aria-labelledby="map-context-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">User-confirmed facts only</p>
          <h2
            id="map-context-title"
            className="font-display mt-1 text-3xl font-bold text-white uppercase"
          >
            Manual map context
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Choose facts you know about this recording. The app does not infer
            your exact map, room, operator, or round result from footage yet.
          </p>
        </div>
        <MapPinned className="text-[#b8ff2c]" size={23} aria-hidden="true" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="form-label">Map</span>
          <select
            className="field mt-2"
            value={form.mapId ?? ""}
            onChange={(event) => {
              const selected = initialState.maps.find(
                (item) => item.id === event.target.value,
              );
              setForm((current) => ({
                ...current,
                mapId: selected?.id ?? null,
                mapVersionId: selected?.versions[0]?.id ?? null,
                bombSiteId: null,
                startingRoomId: null,
                importantRoomIds: [],
                userConfirmed: false,
              }));
            }}
          >
            <option value="">Choose a map</option>
            {initialState.maps.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Map version</span>
          <select
            className="field mt-2"
            disabled={!map}
            value={form.mapVersionId ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                mapVersionId: event.target.value || null,
                bombSiteId: null,
                startingRoomId: null,
                importantRoomIds: [],
                userConfirmed: false,
              }))
            }
          >
            <option value="">Choose a version</option>
            {map?.versions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Bomb-site pair</span>
          <select
            className="field mt-2"
            disabled={!version}
            value={form.bombSiteId ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                bombSiteId: event.target.value || null,
                userConfirmed: false,
              }))
            }
          >
            <option value="">Unknown / not entered</option>
            {version?.bombSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Attack or defense</span>
          <select
            className="field mt-2"
            value={form.side}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                side: event.target.value as ContextForm["side"],
                userConfirmed: false,
              }))
            }
          >
            <option value="UNKNOWN">Unknown</option>
            <option value="ATTACK">Attack</option>
            <option value="DEFENSE">Defense</option>
          </select>
        </label>
        <label>
          <span className="form-label">Starting room</span>
          <select
            className="field mt-2"
            value={form.startingRoomId ?? ""}
            disabled={!version}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                startingRoomId: event.target.value || null,
                userConfirmed: false,
              }))
            }
          >
            <option value="">Unknown / not entered</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Operator</span>
          <input
            className="field mt-2"
            value={form.operator}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                operator: event.target.value,
                userConfirmed: false,
              }))
            }
            placeholder="Only if you know it"
          />
        </label>
        <label>
          <span className="form-label">Round result</span>
          <input
            className="field mt-2"
            value={form.roundResult}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                roundResult: event.target.value,
                userConfirmed: false,
              }))
            }
            placeholder="Win, loss, unknown…"
          />
        </label>
        <label>
          <span className="form-label">Important rooms</span>
          <select
            className="field mt-2 min-h-28"
            multiple
            disabled={!version}
            value={form.importantRoomIds}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                importantRoomIds: Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
                userConfirmed: false,
              }))
            }
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block">
        <span className="form-label">Context notes</span>
        <textarea
          className="field mt-2 min-h-20 resize-y"
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              notes: event.target.value,
              userConfirmed: false,
            }))
          }
          placeholder="Facts you want future clip writing to use"
        />
      </label>
      <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#b8ff2c]/15 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-300">
        <input
          className="mt-1 size-4 accent-[#b8ff2c]"
          type="checkbox"
          checked={form.userConfirmed}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              userConfirmed: event.target.checked,
            }))
          }
        />
        <span>
          <Check
            className="mr-1 inline text-[#b8ff2c]"
            size={15}
            aria-hidden="true"
          />
          I confirm these map details. Content writing may use them as facts.
        </span>
      </label>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          className="primary-button"
          type="button"
          disabled={
            busy || !form.userConfirmed || !form.mapId || !form.mapVersionId
          }
          onClick={() => void save()}
        >
          <Save size={15} aria-hidden="true" /> Save confirmed context
        </button>
        {message && (
          <p className="text-sm text-slate-400" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
