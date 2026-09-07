import { pipeline, env } from "@huggingface/transformers";
import { MODEL_ID, rankNotes, type SourceNote } from "./core";

env.allowLocalModels = false;
if (!env.backends.onnx.wasm) throw new Error("WASM runtime unavailable");
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = new URL(
  "./runtime/",
  self.location.href,
).href;

let extractor: ReturnType<typeof pipeline<"feature-extraction">> | undefined;
self.onmessage = async (
  event: MessageEvent<{ notes: SourceNote[]; query: string }>,
) => {
  try {
    const { notes, query } = event.data;
    if (!query.trim() || query.length > 200 || notes.length > 32)
      throw new Error("Use a short search and up to 32 notes.");
    extractor ??= pipeline("feature-extraction", MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      revision: "751bff37182d3f1213fa05d7196b954e230abad9",
      progress_callback: (progress) => {
        if (progress.status === "progress")
          self.postMessage({
            type: "progress",
            message: `Downloading AI model · ${Math.round(progress.progress)}% of ${progress.file}`,
          });
      },
    });
    self.postMessage({
      type: "progress",
      message: "Preparing the on-device model…",
    });
    const model = await extractor;
    self.postMessage({
      type: "progress",
      message: "Finding related observations on your device…",
    });
    const output = await model([query, ...notes.map((note) => note.text)], {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist() as number[][];
    const queryVector = vectors.shift();
    if (!queryVector) throw new Error("The AI model returned no result.");
    self.postMessage({
      type: "result",
      results: rankNotes(notes, vectors, queryVector),
    });
  } catch {
    extractor = undefined;
    self.postMessage({
      type: "error",
      message:
        "AI could not load or run on this device. Check your connection and retry, or use keyword search. Your notes were not uploaded.",
    });
  }
};
