import { describe, expect, it } from "vitest";
import {
  cosine,
  createBrief,
  keywordSearch,
  parseNotes,
  rankNotes,
} from "./core";
import health from "../netlify/functions/health";
import demo from "../netlify/functions/demo";

describe("browser evidence search", () => {
  it("preserves exact text, timestamps, and source lines", () => {
    const notes = parseNotes(
      "\n[01:24] We   waited. Outcome unknown.\nAnother note.",
    );
    expect(notes[0]).toMatchObject({
      text: "We   waited. Outcome unknown.",
      seconds: 84,
      line: 2,
    });
    expect(notes[1]?.seconds).toBeNull();
    expect(parseNotes("[01:02:03] Action")[0]?.seconds).toBe(3723);
  });
  it("bounds token-dense and unicode text without corrupting it", () => {
    for (const text of ["x".repeat(4200), "🎮".repeat(700)]) {
      const notes = parseNotes(text);
      expect(notes.map((note) => note.text).join("")).toBe(text);
      expect(
        notes.every(
          (note) => new TextEncoder().encode(note.text).length <= 200,
        ),
      ).toBe(true);
    }
  });
  it.each(["", "  \n", "x".repeat(8001), "[00:80] bad", "[00:00:99] bad"])(
    "rejects invalid input",
    (input) => expect(() => parseNotes(input)).toThrow(),
  );
  it("returns exact source matches in deterministic relevance order", () => {
    const notes = parseNotes(
      "[00:01] checked a doorway\n[00:02] coordinated with a teammate",
    );
    const result = rankNotes(
      notes,
      [
        [0, 1],
        [1, 0],
      ],
      [1, 0],
    );
    expect(result[0]?.text).toBe(notes[1]?.text);
    expect(result[0]?.seconds).toBe(2);
    expect(cosine([0, 0], [0, 0])).toBe(0);
  });
  it("rejects malformed inference dimensions and values", () => {
    const notes = parseNotes("Evidence");
    expect(() => rankNotes(notes, [], [1])).toThrow();
    expect(() => rankNotes(notes, [[1, 2]], [1])).toThrow();
    expect(() => rankNotes(notes, [[NaN]], [1])).toThrow();
  });
  it("does not claim AI in keyword briefs or invent missing timestamps", () => {
    const found = keywordSearch(
      parseNotes("A player waited behind cover."),
      "cover",
    );
    const brief = createBrief(
      found[0]!,
      "cover",
      "Keyword search · no AI",
      false,
    );
    expect(brief).toContain("No timestamp");
    expect(brief).toContain("Keyword search matched");
    expect(brief).not.toContain("AI searched");
    expect(brief).toContain(found[0]!.text);
    expect(keywordSearch(parseNotes("cover"), "unrelated")).toHaveLength(0);
  });
});

describe("public backend boundaries", () => {
  it("serves health and explicitly synthetic public examples", async () => {
    expect(
      await (
        await health(new Request("https://example.com/api/health"))
      ).json(),
    ).toMatchObject({
      status: "ok",
      acceptsUploads: false,
      storesUserData: false,
    });
    expect(
      await (await demo(new Request("https://example.com/api/demo"))).json(),
    ).toMatchObject({ provenance: "illustrative-synthetic" });
  });
  it("rejects data submissions without reading a request body", async () => {
    for (const handler of [health, demo])
      expect(
        (
          await handler(
            new Request("https://example.com/api/demo", {
              method: "POST",
              body: "private data",
            }),
          )
        ).status,
      ).toBe(405);
  });
});
