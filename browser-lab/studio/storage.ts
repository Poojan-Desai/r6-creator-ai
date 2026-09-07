import { MAX_KEEP_BYTES, projectSchema, type Project } from "./model";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("r6-browser-studio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Download a project backup before leaving.",
        ),
      );
    request.onblocked = () =>
      reject(new Error("Close other Studio tabs and retry."));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", mode);
    const req = action(tx.objectStore("projects"));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Could not save to this browser. Download a project backup before leaving.",
        ),
      );
    };
  });
}
export async function listProjects() {
  const rows: unknown[] = await transaction("readonly", (store) =>
    store.getAll(),
  );
  const projects: Project[] = [];
  for (const row of rows) {
    const result = projectSchema.safeParse(row);
    if (!result.success)
      throw new Error(
        "A saved project could not be read. Existing browser data has been preserved.",
      );
    projects.push(result.data);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveProject(project: Project) {
  await transaction("readwrite", (store) =>
    store.put(projectSchema.parse(project)),
  );
}
export async function deleteProject(id: string) {
  await transaction("readwrite", (store) => store.delete(id));
  await removeSource(id);
}
async function directory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("r6-studio-sources", { create: true });
}
export async function keepSource(id: string, file: File) {
  if (file.size > MAX_KEEP_BYTES)
    throw new Error(
      "Projects are saved, but recordings over 1 GB must be reselected after reopening.",
    );
  const estimate = await navigator.storage.estimate();
  if (
    estimate.quota !== undefined &&
    estimate.quota - (estimate.usage ?? 0) < file.size * 1.2
  )
    throw new Error(
      "Not enough browser storage for this recording. Your edits are saved; reselect the file when reopening.",
    );
  const dir = await directory();
  const handle = await dir.getFileHandle(id, { create: true });
  try {
    const stream = await handle.createWritable();
    await file.stream().pipeTo(stream);
  } catch (error) {
    await removeSource(id);
    throw error;
  }
}
export async function loadSource(project: Project): Promise<File | null> {
  if (!project.sourceSaved) return null;
  try {
    const handle = await (await directory()).getFileHandle(project.id);
    const file = await handle.getFile();
    return new File([file], project.media.name, { type: file.type });
  } catch {
    return null;
  }
}
export async function removeSource(id: string) {
  try {
    await (await directory()).removeEntry(id);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
  }
}
