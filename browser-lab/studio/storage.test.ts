import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteProject,
  listProjects,
  loadSource,
  saveProject,
} from "./storage";
import { type Project } from "./model";

function project(): Project {
  return {
    schema: "r6-browser-project/v1",
    id: crypto.randomUUID(),
    title: "Persistence test",
    updatedAt: new Date().toISOString(),
    ownershipConfirmed: true,
    sourceSaved: false,
    notes: "[00:02] Checked doorway",
    media: {
      name: "test.mp4",
      size: 1000,
      fingerprint: "a".repeat(64),
      duration: 600,
      width: 1920,
      height: 1080,
      codec: "avc",
      audio: [],
    },
    clips: [
      {
        id: crypto.randomUUID(),
        name: "Review",
        start: 1.25,
        end: 5.8,
        audioTrack: null,
      },
    ],
  };
}
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
describe("browser project transactions", () => {
  it("reopens saved notes and exact clip ranges through new database connections", async () => {
    const item = project();
    await saveProject(item);
    expect(await listProjects()).toEqual([item]);
    await saveProject({ ...item, notes: "Edited" });
    expect((await listProjects())[0]?.notes).toBe("Edited");
  });
  it("deletes only the selected project", async () => {
    const one = project(),
      two = project();
    await saveProject(one);
    await saveProject(two);
    await deleteProject(one.id);
    expect(await listProjects()).toEqual([two]);
  });
  it("requires relinking when no source copy exists", async () =>
    expect(await loadSource(project())).toBeNull());
  it("does not commit invalid project data", async () => {
    await expect(saveProject({ ...project(), title: "" })).rejects.toThrow();
    expect(await listProjects()).toEqual([]);
  });
});
