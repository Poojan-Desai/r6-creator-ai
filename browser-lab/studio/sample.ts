import manifest from "./sample/manifest.json";
import {
  fingerprint,
  projectSchema,
  type MediaInfo,
  type Project,
} from "./model";

export const SAMPLE = Object.freeze(manifest);
const MAX_SAMPLE_BYTES = 2 * 1024 ** 2;

export function isSampleMedia(
  media: Pick<MediaInfo, "name" | "size" | "fingerprint">,
) {
  return (
    media.name === SAMPLE.name &&
    media.size === SAMPLE.size &&
    media.fingerprint === SAMPLE.fingerprint
  );
}

/** Fetches only the bundled original sample after an explicit user action. */
export async function loadSample({
  signal,
  fetcher = fetch,
}: { signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<File> {
  signal?.throwIfAborted();
  if (SAMPLE.size <= 0 || SAMPLE.size > MAX_SAMPLE_BYTES)
    throw new Error("The bundled sample is outside its size limit.");
  const response = await fetcher(SAMPLE.path, {
    signal,
    cache: "no-cache",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error(
      "The sample could not be loaded. Try again or choose your own recording.",
    );
  const length = response.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) !== SAMPLE.size)
  ) {
    await response.body.cancel().catch(() => {});
    throw new Error(
      "The sample size did not match. Reload the page and try again.",
    );
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(SAMPLE.size);
  let received = 0;
  let completed = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (received + value.byteLength > SAMPLE.size)
        throw new Error(
          "The sample exceeded its expected size. Reload the page and try again.",
        );
      bytes.set(value, received);
      received += value.byteLength;
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  signal?.throwIfAborted();
  if (received !== SAMPLE.size)
    throw new Error("The sample download was incomplete. Try again.");
  const file = new File([bytes], SAMPLE.name, {
    type: "video/mp4",
    lastModified: 0,
  });
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  if (
    sha256 !== SAMPLE.sha256 ||
    (await fingerprint(file)) !== SAMPLE.fingerprint
  )
    throw new Error(
      "The sample did not pass its integrity check. Reload the page and try again.",
    );
  signal?.throwIfAborted();
  return file;
}

/** Uses actual media inspection; metadata and saved clips keep the normal schema. */
export function createSampleProject(media: MediaInfo): Project {
  if (!isSampleMedia(media))
    throw new Error(
      "This recording does not match the bundled synthetic sample.",
    );
  return projectSchema.parse({
    schema: "r6-browser-project/v1",
    id: crypto.randomUUID(),
    title: "Synthetic motion study · sample",
    updatedAt: new Date().toISOString(),
    ownershipConfirmed: true,
    sourceSaved: false,
    media,
    notes: [
      "Original synthetic sample: geometric animation and a quiet synthesized tone, released under CC0. This is not gameplay, speech, an R6 match or gameplay-analysis evidence.",
      "[00:01] The teal circle and orange square move in opposite directions. Review the first saved range.",
      "[00:06] The background changes at six seconds while the original shapes continue moving. Review the second saved range.",
      "Both saved clips start with audio set to Silent. Select the synthetic quiet-tone track explicitly if you want to include it in an export.",
      "Trim a selection, seek the timeline, then choose Save clip to keep your changes. These notes describe this original sample only.",
    ].join("\n\n"),
    clips: [
      {
        id: crypto.randomUUID(),
        name: "Synthetic sample · first pass",
        start: 1.25,
        end: 5.75,
        audioTrack: null,
      },
      {
        id: crypto.randomUUID(),
        name: "Synthetic sample · second pass",
        start: 6.25,
        end: 10.75,
        audioTrack: null,
      },
    ],
  });
}
