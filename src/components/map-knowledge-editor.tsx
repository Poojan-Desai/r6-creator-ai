"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Download,
  ExternalLink,
  FileArchive,
  Link2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "@/lib/map-knowledge/editor-history";
import type { MapDetail } from "@/lib/map-knowledge/service";
import {
  MAP_CONNECTION_TYPES,
  MAP_ELEMENT_TYPES,
  type MapEditorDocument,
} from "@/lib/map-knowledge/types";

type ElementInput = MapEditorDocument["elements"][number];
type ConnectionInput = MapEditorDocument["connections"][number];
type BombSiteInput = MapEditorDocument["bombSites"][number];
type CitationInput = MapEditorDocument["citations"][number];
type GeometryPoint = ElementInput["geometry"][number];

const CALLOUT_KINDS = [
  "OFFICIAL",
  "COMMUNITY",
  "PERSONAL",
  "IMPORTED",
  "UNVERIFIED",
] as const;
const BOMB_ROLES = [
  "OBJECTIVE_ROOM",
  "ADJACENT_ROOM",
  "DEFAULT_PLANT",
  "COMMON_BREACH_WALL",
  "COMMON_HATCH",
  "ATTACKER_ENTRY",
  "DEFENDER_POSITION",
  "RETAKE_ROUTE",
  "VERTICAL_CONTROL_ROOM",
] as const;

export function MapKnowledgeEditor({ initialMap }: { initialMap: MapDetail }) {
  const firstVersion = initialMap.versions[0];
  const [activeVersionId, setActiveVersionId] = useState(
    firstVersion?.id ?? "",
  );
  const activeVersion =
    initialMap.versions.find((version) => version.id === activeVersionId) ??
    firstVersion;
  const [history, setHistory] = useState(() =>
    createEditorHistory(
      firstVersion?.document ?? emptyDocument(`${initialMap.stableId}:missing`),
    ),
  );
  const document = history.present;
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  const [activeFloorId, setActiveFloorId] = useState(
    firstVersion?.document.floors[0]?.stableId ?? "",
  );
  const [selectedElementId, setSelectedElementId] = useState("");
  const [drawPoints, setDrawPoints] = useState<GeometryPoint[]>([]);
  const [drawType, setDrawType] =
    useState<(typeof MAP_ELEMENT_TYPES)[number]>("ROOM");
  const [drawName, setDrawName] = useState("New room");
  const [drawing, setDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [connectionFrom, setConnectionFrom] = useState("");
  const [connectionTo, setConnectionTo] = useState("");
  const [connectionType, setConnectionType] =
    useState<(typeof MAP_CONNECTION_TYPES)[number]>("DOOR");
  const [bombName, setBombName] = useState("");
  const [bombA, setBombA] = useState("");
  const [bombB, setBombB] = useState("");
  const [selectedBombId, setSelectedBombId] = useState("");
  const [bombLinkElement, setBombLinkElement] = useState("");
  const [bombLinkRole, setBombLinkRole] =
    useState<(typeof BOMB_ROLES)[number]>("OBJECTIVE_ROOM");
  const [citationTitle, setCitationTitle] = useState("");
  const [citationUrl, setCitationUrl] = useState("");
  const [graphResult, setGraphResult] = useState<{
    element: string;
    connections: Array<{
      name: string;
      connectionType: string;
      floor: string | null;
    }>;
  } | null>(null);

  const currentFloor = document.floors.find(
    (floor) => floor.stableId === activeFloorId,
  );
  const selectedElement = document.elements.find(
    (element) => element.stableId === selectedElementId,
  );
  const selectedBomb = document.bombSites.find(
    (site) => site.stableId === selectedBombId,
  );
  const floorElements = document.elements.filter(
    (element) => element.floorStableId === activeFloorId,
  );
  const floorRecord = activeVersion?.floorRecords.find(
    (floor) => floor.stableId === activeFloorId,
  );
  const previews =
    activeVersion?.blueprintAssets.filter(
      (asset) =>
        asset.assetKind === "PREVIEW_IMAGE" &&
        (!asset.floorId || asset.floorId === floorRecord?.id),
    ) ?? [];
  const preview = previews[0] ?? null;
  const canvasAspect =
    preview?.width && preview?.height
      ? `${preview.width} / ${preview.height}`
      : "16 / 10";

  function mutate(update: (current: MapEditorDocument) => MapEditorDocument) {
    setHistory((current) =>
      pushEditorHistory(current, update(structuredClone(current.present))),
    );
    revision.current += 1;
    setDirty(true);
    setSaveState("saving");
  }

  async function persist(
    snapshot = document,
    savedRevision = revision.current,
  ) {
    if (!activeVersion) return;
    setSaveState("saving");
    try {
      const response = await fetch(
        `/api/map-versions/${activeVersion.id}/editor`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        },
      );
      const body = (await response.json()) as {
        document?: MapEditorDocument;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Map knowledge could not be saved.",
        );
      if (revision.current === savedRevision) {
        setDirty(false);
        setSaveState("saved");
      }
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Map knowledge could not be saved.",
      );
    }
  }

  useEffect(() => {
    if (!dirty || !activeVersion) return;
    const snapshot = structuredClone(document);
    const savedRevision = revision.current;
    const timer = window.setTimeout(() => {
      void persist(snapshot, savedRevision);
    }, 1_200);
    return () => window.clearTimeout(timer);
    // `persist` intentionally uses the captured document and revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersion?.id, dirty, document]);

  function changeVersion(id: string) {
    const version = initialMap.versions.find((item) => item.id === id);
    if (!version) return;
    setActiveVersionId(id);
    setHistory(createEditorHistory(version.document));
    setActiveFloorId(version.document.floors[0]?.stableId ?? "");
    setSelectedElementId("");
    setDirty(false);
    setSaveState("saved");
    revision.current += 1;
  }

  function undo() {
    setHistory((current) => undoEditorHistory(current));
    revision.current += 1;
    setDirty(true);
  }

  function redo() {
    setHistory((current) => redoEditorHistory(current));
    revision.current += 1;
    setDirty(true);
  }

  function addFloor() {
    const index = document.floors.length + 1;
    const stableId = stable(`${document.versionStableId}:floor-${index}`);
    mutate((current) => ({
      ...current,
      floors: [
        ...current.floors,
        {
          stableId,
          displayName: `Floor ${index}`,
          shortName: `F${index}`,
          sortOrder: index,
          elevation: index - 1,
          confidence: 1,
          notes: "",
        },
      ],
    }));
    setActiveFloorId(stableId);
  }

  function updateFloor(
    key: "displayName" | "shortName" | "notes",
    value: string,
  ) {
    mutate((current) => ({
      ...current,
      floors: current.floors.map((floor) =>
        floor.stableId === activeFloorId ? { ...floor, [key]: value } : floor,
      ),
    }));
  }

  function deleteFloor() {
    if (
      !currentFloor ||
      !window.confirm(`Delete ${currentFloor.displayName} and its annotations?`)
    )
      return;
    const removedElements = new Set(
      document.elements
        .filter((element) => element.floorStableId === activeFloorId)
        .map((element) => element.stableId),
    );
    mutate((current) => ({
      ...current,
      floors: current.floors.filter(
        (floor) => floor.stableId !== activeFloorId,
      ),
      elements: current.elements.filter(
        (element) => element.floorStableId !== activeFloorId,
      ),
      connections: current.connections.filter(
        (connection) =>
          !removedElements.has(connection.fromElementStableId) &&
          !removedElements.has(connection.toElementStableId),
      ),
      bombSites: current.bombSites.filter(
        (site) => site.floorStableId !== activeFloorId,
      ),
      citations: current.citations.filter(
        (citation) => citation.floorStableId !== activeFloorId,
      ),
    }));
    setActiveFloorId(
      document.floors.find((floor) => floor.stableId !== activeFloorId)
        ?.stableId ?? "",
    );
  }

  function onCanvasClick(event: MouseEvent<SVGSVGElement>) {
    if (!drawing || !activeFloorId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
    setDrawPoints((current) => [...current, point]);
  }

  function finishDrawing() {
    const geometryType = geometryFor(drawType);
    const needed =
      geometryType === "POINT"
        ? 1
        : geometryType === "LINE"
          ? 2
          : geometryType === "POLYGON"
            ? 3
            : 2;
    if (drawPoints.length < needed) {
      setMessage(
        `Add at least ${needed} point${needed === 1 ? "" : "s"} for this shape.`,
      );
      return;
    }
    const stableId = stable(
      `${document.versionStableId}:${drawType.toLowerCase()}-${crypto.randomUUID()}`,
    );
    const next: ElementInput = {
      stableId,
      floorStableId: activeFloorId,
      elementType: drawType,
      displayName:
        drawName.trim() || drawType.replaceAll("_", " ").toLowerCase(),
      canonicalCallout: drawName.trim(),
      calloutKind: "PERSONAL",
      geometryType,
      geometry: drawPoints,
      confidence: 1,
      notes: "",
      commonAttackerApproach: "",
      commonDefenderHold: "",
      commonFlankRisk: "",
      captionName: "",
      voiceoverName: "",
      aliases: [],
    };
    mutate((current) => ({
      ...current,
      elements: [...current.elements, next],
    }));
    setSelectedElementId(stableId);
    setDrawPoints([]);
    setDrawing(false);
  }

  function updateElement(patch: Partial<ElementInput>) {
    if (!selectedElementId) return;
    mutate((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.stableId === selectedElementId
          ? { ...element, ...patch }
          : element,
      ),
    }));
  }

  function deleteElement() {
    if (!selectedElement) return;
    mutate((current) => ({
      ...current,
      elements: current.elements.filter(
        (element) => element.stableId !== selectedElement.stableId,
      ),
      connections: current.connections.filter(
        (connection) =>
          connection.fromElementStableId !== selectedElement.stableId &&
          connection.toElementStableId !== selectedElement.stableId,
      ),
      bombSites: current.bombSites.map((site) => ({
        ...site,
        elementLinks: site.elementLinks.filter(
          (link) => link.elementStableId !== selectedElement.stableId,
        ),
      })),
      citations: current.citations.filter(
        (citation) => citation.elementStableId !== selectedElement.stableId,
      ),
    }));
    setSelectedElementId("");
  }

  function addConnection() {
    if (!connectionFrom || !connectionTo || connectionFrom === connectionTo) {
      setMessage("Choose two different map elements to connect.");
      return;
    }
    const next: ConnectionInput = {
      stableId: stable(
        `${document.versionStableId}:connection-${crypto.randomUUID()}`,
      ),
      fromElementStableId: connectionFrom,
      toElementStableId: connectionTo,
      connectionType,
      isBidirectional: true,
      traversable: true,
      destructible: connectionType === "BREACHABLE_WALL",
      floorChange: [
        "STAIRCASE",
        "LADDER",
        "HATCH",
        "VERTICAL_DESTRUCTION",
      ].includes(connectionType),
      requiredAction: "",
      notes: "",
      confidence: 1,
    };
    mutate((current) => ({
      ...current,
      connections: [...current.connections, next],
    }));
  }

  function addBombSite() {
    if (!bombName.trim() || !bombA.trim() || !bombB.trim()) {
      setMessage("Enter a pair name and both objective-room names.");
      return;
    }
    const next: BombSiteInput = {
      stableId: stable(
        `${document.versionStableId}:bomb-${crypto.randomUUID()}`,
      ),
      floorStableId: activeFloorId || null,
      displayName: bombName.trim(),
      siteAName: bombA.trim(),
      siteBName: bombB.trim(),
      tacticalNotes: "",
      confidence: 1,
      elementLinks: [],
    };
    mutate((current) => ({
      ...current,
      bombSites: [...current.bombSites, next],
    }));
    setSelectedBombId(next.stableId);
    setBombName("");
    setBombA("");
    setBombB("");
  }

  function addBombLink() {
    if (!selectedBomb || !bombLinkElement) return;
    mutate((current) => ({
      ...current,
      bombSites: current.bombSites.map((site) =>
        site.stableId === selectedBomb.stableId
          ? {
              ...site,
              elementLinks: [
                ...site.elementLinks.filter(
                  (link) =>
                    link.elementStableId !== bombLinkElement ||
                    link.role !== bombLinkRole,
                ),
                {
                  elementStableId: bombLinkElement,
                  role: bombLinkRole,
                  notes: "",
                },
              ],
            }
          : site,
      ),
    }));
  }

  function addCitation() {
    if (!citationTitle.trim() || !citationUrl.trim()) {
      setMessage("Enter a source title and URL.");
      return;
    }
    const citation: CitationInput = {
      stableId: stable(
        `${document.versionStableId}:citation-${crypto.randomUUID()}`,
      ),
      floorStableId: activeFloorId || null,
      elementStableId: selectedElementId || null,
      bombSiteStableId: selectedBombId || null,
      title: citationTitle.trim(),
      url: citationUrl.trim(),
      notes: "",
      lastVerifiedAt: new Date().toISOString(),
    };
    mutate((current) => ({
      ...current,
      citations: [...current.citations, citation],
    }));
    setCitationTitle("");
    setCitationUrl("");
  }

  async function inspectConnections() {
    if (!selectedElement || !activeVersion) return;
    const record = activeVersion.elementRecords.find(
      (item) => item.stableId === selectedElement.stableId,
    );
    if (!record) {
      setMessage(
        "Save the new element before inspecting its stored graph connections.",
      );
      return;
    }
    const response = await fetch(`/api/map-elements/${record.id}/graph`);
    const body = (await response.json()) as {
      graph?: typeof graphResult;
      error?: { message?: string };
    };
    if (!response.ok)
      setMessage(body.error?.message ?? "Connections could not be inspected.");
    else setGraphResult(body.graph ?? null);
  }

  async function duplicateVersion() {
    if (!activeVersion) return;
    const versionName = window.prompt(
      "Name the new map version:",
      `${activeVersion.versionName} copy`,
    );
    if (!versionName) return;
    const suggested = `local-${new Date().toISOString().slice(0, 10)}`;
    const versionKey = window.prompt("Enter a short version key:", suggested);
    if (!versionKey) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/maps/${initialMap.slug}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceVersionId: activeVersion.id,
          versionName,
          versionKey,
          notes: `User-created copy of ${activeVersion.versionName}.`,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Version could not be duplicated.",
        );
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Version could not be duplicated.",
      );
      setBusy(false);
    }
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const body = JSON.parse(await file.text()) as unknown;
      const response = await fetch(`/api/maps/${initialMap.slug}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "Map file could not be imported.",
        );
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Map file could not be imported.",
      );
      setBusy(false);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="panel p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="form-label">Map version</span>
              <select
                className="field mt-2"
                value={activeVersionId}
                onChange={(event) => changeVersion(event.target.value)}
              >
                {initialMap.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.versionName} ·{" "}
                    {version.knowledgeStatus.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label">Preferred callout terminology</span>
              <select
                className="field mt-2"
                value={document.preferredCalloutKind}
                onChange={(event) =>
                  mutate((current) => ({
                    ...current,
                    preferredCalloutKind: event.target
                      .value as MapEditorDocument["preferredCalloutKind"],
                  }))
                }
              >
                {CALLOUT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              type="button"
              disabled={!history.past.length}
              onClick={undo}
            >
              <Undo2 size={14} aria-hidden="true" /> Undo
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!history.future.length}
              onClick={redo}
            >
              <Redo2 size={14} aria-hidden="true" /> Redo
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void duplicateVersion()}
            >
              <FileArchive size={14} aria-hidden="true" /> Duplicate version
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!dirty || saveState === "saving"}
              onClick={() => void persist()}
            >
              <Save size={15} aria-hidden="true" /> Save now
            </button>
          </div>
        </div>
        <p
          className={`mt-4 text-xs ${saveState === "error" ? "text-rose-300" : "text-slate-500"}`}
          role="status"
        >
          {saveState === "saving"
            ? "Autosaving local map knowledge…"
            : saveState === "error"
              ? "Autosave needs attention."
              : "All changes are saved locally."}
        </p>
        {message && (
          <div className="error-box mt-4" role="alert">
            {message}
          </div>
        )}
      </section>

      <section className="grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(21rem,0.6fr)]">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/8 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="section-kicker">Normalized annotation canvas</p>
                <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                  Blueprint and geometry
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <IconControl
                  label="Zoom out"
                  icon={ZoomOut}
                  onClick={() =>
                    setZoom((value) => Math.max(0.5, value - 0.25))
                  }
                />
                <IconControl
                  label="Zoom in"
                  icon={ZoomIn}
                  onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
                />
                <IconControl
                  label="Pan left"
                  icon={ArrowLeft}
                  onClick={() =>
                    setPan((value) => ({ ...value, x: value.x - 30 }))
                  }
                />
                <IconControl
                  label="Pan up"
                  icon={ArrowUp}
                  onClick={() =>
                    setPan((value) => ({ ...value, y: value.y - 30 }))
                  }
                />
                <IconControl
                  label="Pan down"
                  icon={ArrowDown}
                  onClick={() =>
                    setPan((value) => ({ ...value, y: value.y + 30 }))
                  }
                />
                <IconControl
                  label="Pan right"
                  icon={ArrowRight}
                  onClick={() =>
                    setPan((value) => ({ ...value, x: value.x + 30 }))
                  }
                />
                <IconControl
                  label="Reset view"
                  icon={RotateCcw}
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                className="field"
                value={activeFloorId}
                onChange={(event) => setActiveFloorId(event.target.value)}
                aria-label="Active map floor"
              >
                <option value="">Choose a floor</option>
                {document.floors.map((floor) => (
                  <option key={floor.stableId} value={floor.stableId}>
                    {floor.displayName}
                  </option>
                ))}
              </select>
              <button
                className="secondary-button"
                type="button"
                onClick={addFloor}
              >
                <Plus size={14} aria-hidden="true" /> Add floor
              </button>
            </div>
          </div>

          <div className="overflow-hidden bg-[#050708] p-4 sm:p-6">
            <div
              className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-[#0d1115]"
              style={{ aspectRatio: canvasAspect }}
            >
              <div
                className="relative size-full origin-center transition-transform"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {preview ? (
                  // Imported local asset; the server streams it from the app data directory.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/blueprints/${preview.id}`}
                    alt={`${initialMap.name} ${currentFloor?.displayName ?? "floor"} imported blueprint`}
                    className="absolute inset-0 size-full"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:32px_32px] text-center text-sm text-slate-600">
                    <span>
                      No blueprint assigned to this floor.
                      <br />
                      You can still add normalized annotations.
                    </span>
                  </div>
                )}
                <svg
                  className={`absolute inset-0 size-full ${drawing ? "cursor-crosshair" : "cursor-default"}`}
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  onClick={onCanvasClick}
                  aria-label="Map annotation canvas"
                >
                  {floorElements.map((element) => (
                    <Geometry
                      key={element.stableId}
                      element={element}
                      selected={element.stableId === selectedElementId}
                      onSelect={() => setSelectedElementId(element.stableId)}
                    />
                  ))}
                  {drawPoints.length > 0 && (
                    <polyline
                      points={drawPoints
                        .map((point) => `${point.x * 1000},${point.y * 1000}`)
                        .join(" ")}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="6"
                      strokeDasharray="12 8"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              </div>
            </div>
          </div>

          <div className="border-t border-white/8 p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <label>
                <span className="form-label">Element type</span>
                <select
                  className="field mt-2"
                  value={drawType}
                  onChange={(event) =>
                    setDrawType(event.target.value as typeof drawType)
                  }
                >
                  {MAP_ELEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="form-label">Name or callout</span>
                <input
                  className="field mt-2"
                  value={drawName}
                  onChange={(event) => setDrawName(event.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={!activeFloorId}
                onClick={() => {
                  setDrawing(true);
                  setDrawPoints([]);
                }}
              >
                <Plus size={14} aria-hidden="true" /> Begin shape
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!drawing}
                onClick={finishDrawing}
              >
                <Check size={14} aria-hidden="true" /> Finish
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Rooms use polygons; walls, doors, and windows use lines; hatches,
              cameras, plants, stairs, and entries use points. Coordinates stay
              between 0 and 1 so they remain aligned at different display sizes.
            </p>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <p className="section-kicker">Floor</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
              Floor details
            </h2>
            {currentFloor ? (
              <div className="mt-4 space-y-3">
                <Field
                  label="Display name"
                  value={currentFloor.displayName}
                  onChange={(value) => updateFloor("displayName", value)}
                />
                <Field
                  label="Short name"
                  value={currentFloor.shortName}
                  onChange={(value) => updateFloor("shortName", value)}
                />
                <TextField
                  label="Floor notes"
                  value={currentFloor.notes}
                  onChange={(value) => updateFloor("notes", value)}
                />
                <button
                  className="danger-button"
                  type="button"
                  onClick={deleteFloor}
                >
                  <Trash2 size={14} aria-hidden="true" /> Delete floor
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Add or select a floor to begin.
              </p>
            )}
          </section>

          <section className="panel p-5">
            <p className="section-kicker">Selected annotation</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
              Room, route, or element
            </h2>
            <select
              className="field mt-4"
              value={selectedElementId}
              onChange={(event) => setSelectedElementId(event.target.value)}
            >
              <option value="">Choose an annotation</option>
              {document.elements.map((element) => (
                <option key={element.stableId} value={element.stableId}>
                  {element.displayName} ·{" "}
                  {element.elementType.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {selectedElement && (
              <div className="mt-4 space-y-3">
                <Field
                  label="Display name"
                  value={selectedElement.displayName}
                  onChange={(value) => updateElement({ displayName: value })}
                />
                <Field
                  label="Canonical callout"
                  value={selectedElement.canonicalCallout}
                  onChange={(value) =>
                    updateElement({ canonicalCallout: value })
                  }
                />
                <label>
                  <span className="form-label">Callout source</span>
                  <select
                    className="field mt-2"
                    value={selectedElement.calloutKind}
                    onChange={(event) =>
                      updateElement({
                        calloutKind: event.target
                          .value as ElementInput["calloutKind"],
                      })
                    }
                  >
                    {CALLOUT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Alternate callouts (comma separated)"
                  value={selectedElement.aliases
                    .map((alias) => alias.displayName)
                    .join(", ")}
                  onChange={(value) =>
                    updateElement({
                      aliases: value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((displayName) => ({
                          displayName,
                          calloutKind: "PERSONAL",
                          confidence: 1,
                          notes: "",
                        })),
                    })
                  }
                />
                <Field
                  label="Short caption name"
                  value={selectedElement.captionName}
                  onChange={(value) => updateElement({ captionName: value })}
                />
                <Field
                  label="Voiceover-friendly name"
                  value={selectedElement.voiceoverName}
                  onChange={(value) => updateElement({ voiceoverName: value })}
                />
                <TextField
                  label="Tactical notes"
                  value={selectedElement.notes}
                  onChange={(value) => updateElement({ notes: value })}
                />
                <TextField
                  label="Common attacker approach"
                  value={selectedElement.commonAttackerApproach}
                  onChange={(value) =>
                    updateElement({ commonAttackerApproach: value })
                  }
                />
                <TextField
                  label="Common defender hold"
                  value={selectedElement.commonDefenderHold}
                  onChange={(value) =>
                    updateElement({ commonDefenderHold: value })
                  }
                />
                <TextField
                  label="Common flank risk"
                  value={selectedElement.commonFlankRisk}
                  onChange={(value) =>
                    updateElement({ commonFlankRisk: value })
                  }
                />
                <label>
                  <span className="form-label">
                    Confidence · {Math.round(selectedElement.confidence * 100)}%
                  </span>
                  <input
                    className="mt-2 w-full accent-[#b8ff2c]"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedElement.confidence}
                    onChange={(event) =>
                      updateElement({ confidence: Number(event.target.value) })
                    }
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void inspectConnections()}
                  >
                    <Link2 size={14} aria-hidden="true" /> Inspect connections
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={deleteElement}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Delete
                  </button>
                </div>
              </div>
            )}
            {graphResult && (
              <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-xs text-slate-400">
                <p className="font-semibold text-white">
                  Connections from {graphResult.element}
                </p>
                {graphResult.connections.length ? (
                  <ul className="mt-2 space-y-1">
                    {graphResult.connections.map((connection, index) => (
                      <li key={`${connection.name}-${index}`}>
                        {connection.name} ·{" "}
                        {connection.connectionType.replaceAll("_", " ")}
                        {connection.floor ? ` · ${connection.floor}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2">No stored connections yet.</p>
                )}
              </div>
            )}
          </section>
        </aside>
      </section>

      <BlueprintPanel
        map={initialMap}
        version={activeVersion}
        floors={document.floors}
        floorRecords={activeVersion?.floorRecords ?? []}
      />

      <section className="grid gap-7 lg:grid-cols-3">
        <section className="panel p-5 sm:p-6">
          <p className="section-kicker">Connectivity graph</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
            Connect rooms and routes
          </h2>
          <div className="mt-4 space-y-3">
            <ElementSelect
              label="From"
              value={connectionFrom}
              onChange={setConnectionFrom}
              elements={document.elements}
            />
            <ElementSelect
              label="To"
              value={connectionTo}
              onChange={setConnectionTo}
              elements={document.elements}
            />
            <label>
              <span className="form-label">Connection type</span>
              <select
                className="field mt-2"
                value={connectionType}
                onChange={(event) =>
                  setConnectionType(event.target.value as typeof connectionType)
                }
              >
                {MAP_CONNECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={addConnection}
            >
              <Link2 size={14} aria-hidden="true" /> Add connection
            </button>
            <ul className="space-y-2 text-xs text-slate-500">
              {document.connections.map((connection) => (
                <li
                  className="rounded-lg border border-white/8 p-2"
                  key={connection.stableId}
                >
                  {nameFor(document, connection.fromElementStableId)} →{" "}
                  {nameFor(document, connection.toElementStableId)} ·{" "}
                  {connection.connectionType.replaceAll("_", " ")}{" "}
                  <button
                    className="ml-2 text-rose-300"
                    type="button"
                    onClick={() =>
                      mutate((current) => ({
                        ...current,
                        connections: current.connections.filter(
                          (item) => item.stableId !== connection.stableId,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <p className="section-kicker">Bomb-site knowledge</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
            Objective pairs
          </h2>
          <div className="mt-4 space-y-3">
            <Field label="Pair name" value={bombName} onChange={setBombName} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Site A" value={bombA} onChange={setBombA} />
              <Field label="Site B" value={bombB} onChange={setBombB} />
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={addBombSite}
            >
              <Plus size={14} aria-hidden="true" /> Add pair
            </button>
            <select
              className="field"
              value={selectedBombId}
              onChange={(event) => setSelectedBombId(event.target.value)}
            >
              <option value="">Choose a saved pair</option>
              {document.bombSites.map((site) => (
                <option key={site.stableId} value={site.stableId}>
                  {site.displayName}
                </option>
              ))}
            </select>
            {selectedBomb && (
              <>
                <TextField
                  label="Tactical notes"
                  value={selectedBomb.tacticalNotes}
                  onChange={(value) =>
                    mutate((current) => ({
                      ...current,
                      bombSites: current.bombSites.map((site) =>
                        site.stableId === selectedBomb.stableId
                          ? { ...site, tacticalNotes: value }
                          : site,
                      ),
                    }))
                  }
                />
                <ElementSelect
                  label="Related room or annotation"
                  value={bombLinkElement}
                  onChange={setBombLinkElement}
                  elements={document.elements}
                />
                <label>
                  <span className="form-label">Relationship</span>
                  <select
                    className="field mt-2"
                    value={bombLinkRole}
                    onChange={(event) =>
                      setBombLinkRole(event.target.value as typeof bombLinkRole)
                    }
                  >
                    {BOMB_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={addBombLink}
                >
                  Add site relationship
                </button>
                <ul className="space-y-1 text-xs text-slate-500">
                  {selectedBomb.elementLinks.map((link, index) => (
                    <li key={`${link.elementStableId}-${link.role}-${index}`}>
                      {nameFor(document, link.elementStableId)} ·{" "}
                      {link.role.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <p className="section-kicker">Evidence</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
            Source citations
          </h2>
          <div className="mt-4 space-y-3">
            <Field
              label="Source title"
              value={citationTitle}
              onChange={setCitationTitle}
            />
            <Field
              label="Source URL"
              value={citationUrl}
              onChange={setCitationUrl}
            />
            <button
              className="primary-button"
              type="button"
              onClick={addCitation}
            >
              <Plus size={14} aria-hidden="true" /> Add citation
            </button>
            <ul className="space-y-2">
              {document.citations.map((citation) => (
                <li
                  className="rounded-lg border border-white/8 p-3 text-xs"
                  key={citation.stableId}
                >
                  <a
                    className="font-semibold text-[#b8ff2c]"
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {citation.title}{" "}
                    <ExternalLink className="inline" size={11} />
                  </a>
                  <button
                    className="mt-2 block text-rose-300"
                    type="button"
                    onClick={() =>
                      mutate((current) => ({
                        ...current,
                        citations: current.citations.filter(
                          (item) => item.stableId !== citation.stableId,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </section>

      {activeVersion && (
        <section className="panel p-5 sm:p-6">
          <p className="section-kicker">Portable local knowledge</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
            Versioned JSON
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            Exports contain normalized coordinates, stable references, sources,
            and confidence. They never contain an absolute Mac path. Imports
            reject unsupported versions, unsafe coordinates, duplicate stable
            IDs, and broken references.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              className="secondary-button"
              href={`/api/map-versions/${activeVersion.id}/export?scope=COMPLETE_MAP`}
            >
              <Download size={14} aria-hidden="true" /> Export complete map
            </a>
            <label className="secondary-button cursor-pointer">
              <Upload size={14} aria-hidden="true" /> Import matching JSON
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void importJson(event)}
              />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}

function BlueprintPanel({
  map,
  version,
  floors,
  floorRecords,
}: {
  map: MapDetail;
  version: MapDetail["versions"][number] | undefined;
  floors: MapEditorDocument["floors"];
  floorRecords: Array<{ id: string; stableId: string; displayName: string }>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!version) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/map-versions/${version.id}/blueprints`,
        { method: "POST", body: new FormData(event.currentTarget) },
      );
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Blueprint could not be imported.",
        );
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Blueprint could not be imported.",
      );
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this imported blueprint and its local derivatives?",
      )
    )
      return;
    const response = await fetch(`/api/blueprints/${id}`, { method: "DELETE" });
    if (response.ok) window.location.reload();
    else setMessage("Blueprint could not be deleted.");
  }
  const originals =
    version?.blueprintAssets.filter((asset) =>
      ["ORIGINAL_ZIP", "ORIGINAL_IMAGE"].includes(asset.assetKind),
    ) ?? [];
  return (
    <section className="panel p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="section-kicker">Manual import only</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Blueprint assets
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Use a Ubisoft blueprint ZIP or an image you may use. The app never
            scrapes or downloads it automatically, and does not assume the image
            contains machine-readable room boundaries.
          </p>
          {map.blueprintAvailable && (
            <a
              className="secondary-button mt-4"
              href={map.blueprintPageUrl ?? map.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open official blueprint page <ExternalLink size={13} />
            </a>
          )}
        </div>
        <form className="space-y-3" onSubmit={(event) => void upload(event)}>
          <label>
            <span className="form-label">Blueprint ZIP or image</span>
            <input
              className="field mt-2"
              type="file"
              name="file"
              required
              accept=".zip,.png,.jpg,.jpeg,.webp,application/zip,image/png,image/jpeg,image/webp"
            />
          </label>
          <label>
            <span className="form-label">Assign to floor (optional)</span>
            <select className="field mt-2" name="floorId">
              <option value="">Unassigned</option>
              {floors.map((floor) => {
                const record = floorRecords.find(
                  (item) => item.stableId === floor.stableId,
                );
                return record ? (
                  <option key={record.id} value={record.id}>
                    {floor.displayName}
                  </option>
                ) : null;
              })}
            </select>
          </label>
          <input
            type="hidden"
            name="sourceUrl"
            value={map.blueprintPageUrl ?? map.sourceUrl}
          />
          <input
            type="hidden"
            name="sourceTitle"
            value={`${map.name} blueprint import`}
          />
          <label>
            <span className="form-label">Import notes</span>
            <input
              className="field mt-2"
              name="notes"
              placeholder="Official package, personal tracing notes…"
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            <Upload size={14} /> {busy ? "Importing…" : "Import locally"}
          </button>
          {message && (
            <p className="text-sm text-rose-300" role="alert">
              {message}
            </p>
          )}
        </form>
      </div>
      {originals.length > 0 && (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {originals.map((asset) => (
            <li
              className="rounded-xl border border-white/8 bg-black/20 p-4"
              key={asset.id}
            >
              <p className="truncate text-sm font-semibold text-white">
                {asset.originalFileName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {asset.assetKind.replaceAll("_", " ")} · imported{" "}
                {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                  new Date(asset.importedAt),
                )}
              </p>
              <div className="mt-3 flex gap-2">
                <a
                  className="secondary-button"
                  href={`/api/media/blueprints/${asset.id}?download=1`}
                >
                  <Download size={13} /> Download
                </a>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void remove(asset.id)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Geometry({
  element,
  selected,
  onSelect,
}: {
  element: ElementInput;
  selected: boolean;
  onSelect: () => void;
}) {
  const points = element.geometry
    .map((point) => `${point.x * 1000},${point.y * 1000}`)
    .join(" ");
  const common = {
    stroke: selected ? "#ffffff" : "#b8ff2c",
    strokeWidth: selected ? 8 : 5,
    vectorEffect: "non-scaling-stroke" as const,
    onClick: (event: MouseEvent<SVGElement>) => {
      event.stopPropagation();
      onSelect();
    },
  };
  if (element.geometryType === "POINT") {
    const point = element.geometry[0];
    return point ? (
      <circle
        cx={point.x * 1000}
        cy={point.y * 1000}
        r="14"
        fill="#b8ff2c"
        {...common}
      >
        <title>{element.displayName}</title>
      </circle>
    ) : null;
  }
  if (element.geometryType === "POLYGON")
    return (
      <polygon
        points={points}
        fill={selected ? "rgba(184,255,44,.26)" : "rgba(184,255,44,.12)"}
        {...common}
      >
        <title>{element.displayName}</title>
      </polygon>
    );
  return (
    <polyline points={points} fill="none" {...common}>
      <title>{element.displayName}</title>
    </polyline>
  );
}

function IconControl({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof ZoomIn;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <input
        className="field mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <textarea
        className="field mt-2 min-h-20 resize-y"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function ElementSelect({
  label,
  value,
  onChange,
  elements,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  elements: ElementInput[];
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <select
        className="field mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose an element</option>
        {elements.map((element) => (
          <option key={element.stableId} value={element.stableId}>
            {element.displayName} · {element.elementType.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
function geometryFor(
  type: ElementInput["elementType"],
): ElementInput["geometryType"] {
  if (
    [
      "ROOM",
      "HALLWAY",
      "OBJECTIVE_ROOM",
      "EXTERIOR_AREA",
      "SOFT_FLOOR",
      "SOFT_CEILING",
    ].includes(type)
  )
    return "POLYGON";
  if (
    [
      "DOOR",
      "WINDOW",
      "SOFT_WALL",
      "REINFORCEABLE_WALL",
      "INDESTRUCTIBLE_WALL",
      "OPEN_PASSAGE",
    ].includes(type)
  )
    return "LINE";
  if (
    [
      "DRONE_ROUTE",
      "COMMON_PLAYER_ROUTE",
      "COMMON_ATTACKER_ENTRY_ROUTE",
      "COMMON_FLANK_ROUTE",
      "COMMON_ROTATION",
      "VERTICAL_SIGHTLINE",
    ].includes(type)
  )
    return "PATH";
  return "POINT";
}
function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function stable(value: string) {
  return value.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 120);
}
function nameFor(document: MapEditorDocument, stableId: string) {
  return (
    document.elements.find((element) => element.stableId === stableId)
      ?.displayName ?? stableId
  );
}
function emptyDocument(versionStableId: string): MapEditorDocument {
  return {
    schemaVersion: "r6-map-knowledge-editor/v1",
    versionStableId,
    preferredCalloutKind: "OFFICIAL",
    preferredCalloutNotes: "",
    floors: [],
    elements: [],
    connections: [],
    bombSites: [],
    citations: [],
    saveReason: "",
  };
}
