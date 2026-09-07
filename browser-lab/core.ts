export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DEMO_NOTES = `[00:12] I used a drone to check the doorway before entering. The camera showed an empty corridor; rooms beyond it were still unknown.
[00:28] I told my teammate where I was holding. We waited until both players were ready before moving through the doorway together.
[00:47] I reloaded behind cover while my teammate watched the angle. I called when I was ready to move.
[01:06] I pushed alone without checking the next corner. The recording cuts before the result, so the outcome is unknown.
[01:24] We discussed the defuser location and agreed which player would watch the flank. We moved together after the call.
[01:51] The round-end screen appears. The score and winner are not readable in my notes, so I need to check the recording.`;

export type SourceNote = {
  id: number;
  text: string;
  seconds: number | null;
  line: number;
  sourceText: string;
};
export type RankedNote = SourceNote & { score: number };

export function parseNotes(input: string): SourceNote[] {
  if (input.length > 8000)
    throw new Error("Keep notes under 8,000 characters.");
  const result: SourceNote[] = [];
  input.split(/\n/).forEach((raw, line) => {
    const match = raw.trim().match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*/);
    let seconds: number | null = null;
    if (match) {
      if (Number(match[2]) >= 60 || (match[3] && Number(match[3]) >= 60))
        throw new Error(
          `Check the timestamp on line ${line + 1}. Use [mm:ss] or [hh:mm:ss].`,
        );
      seconds = match[3]
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : Number(match[1]) * 60 + Number(match[2]);
    }
    const text = raw
      .trim()
      .slice(match?.[0].length ?? 0)
      .trim();
    if (!text) return;
    // Exact source substrings, bounded to 200 UTF-8 bytes (including long words).
    // This stays below the model's 256-wordpiece limit even for token-dense text.
    let remaining = text;
    while (remaining) {
      let length = 0,
        bytes = 0;
      for (const character of remaining) {
        const size = new TextEncoder().encode(character).length;
        if (bytes + size > 200) break;
        bytes += size;
        length += character.length;
      }
      if (length < remaining.length) {
        const boundary = remaining.slice(0, length).search(/\s+\S*$/);
        if (boundary > length / 2) length = boundary;
      }
      result.push({
        id: result.length + 1,
        text: remaining.slice(0, length).trim(),
        seconds,
        line: line + 1,
        sourceText: text,
      });
      remaining = remaining.slice(length).trimStart();
    }
  });
  if (!result.length)
    throw new Error("Add at least one observation or transcript line.");
  if (result.length > 32)
    throw new Error("Use up to 32 short notes for one search.");
  return result;
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0,
      y = b[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}

export function rankNotes(
  notes: SourceNote[],
  vectors: number[][],
  query: number[],
): RankedNote[] {
  if (
    !query.length ||
    query.some((value) => !Number.isFinite(value)) ||
    vectors.some(
      (vector) =>
        vector.length !== query.length ||
        vector.some((value) => !Number.isFinite(value)),
    ) ||
    notes.length !== vectors.length
  )
    throw new Error("The model returned incomplete results. Please retry.");
  return notes
    .map((note, index) => ({
      ...note,
      score: cosine(vectors[index] ?? [], query),
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, 3);
}

export function keywordSearch(
  notes: SourceNote[],
  query: string,
): RankedNote[] {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  return notes
    .map((note) => ({
      ...note,
      score: words.length
        ? words.filter((word) => note.text.toLowerCase().includes(word))
            .length / words.length
        : 0,
    }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, 3);
}

export function clockTime(seconds: number | null) {
  if (seconds === null) return "No timestamp";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

export function createBrief(
  note: RankedNote,
  query: string,
  mode: string,
  sample: boolean,
) {
  return `# R6 review brief\n\nFocus: ${query}\nSource: ${sample ? "Illustrative sample; not a real match" : "User-supplied notes; not independently verified"}\nRetrieval: ${mode}\n\n## Selected source\n\n[${clockTime(note.seconds)}] Line ${note.line}: ${note.text}\n\n## Complete source line\n\n${note.sourceText}\n\n## Editing outline (rule-based)\n\n1. Review the original recording${note.seconds === null ? " and confirm this note's timestamp" : ` around ${clockTime(note.seconds)}`}.\n2. Keep enough setup to explain the observed action.\n3. End after the visible result; leave unreadable or missing outcomes unknown.\n4. Caption only confirmed spoken words.\n\n## Coaching review\n\nWhat information was available before the decision? What would you check next time? This is a review prompt, not an AI verdict on skill.\n\n## Boundaries\n\nSearch relevance is not event confidence or proof of improvement. ${mode.startsWith("On-device") ? "AI searched" : "Keyword search matched"} the supplied text only. No video recognition, match reconstruction, or automatic gameplay judgment was performed.\n`;
}
