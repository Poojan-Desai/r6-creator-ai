import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
  type StreamTargetChunk,
} from "mediabunny";
import { MAX_EXPORT_BYTES, validateFile, validateRange } from "./model";
import {
  exportDirectory,
  removeExport,
  type ExportRequest,
  type ExportMessage,
} from "./media";

function send(message: ExportMessage) {
  self.postMessage(message);
}
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  let input: Input | undefined;
  let verify: Input | undefined;
  let conversion: Conversion | undefined;
  let stream: FileSystemWritableFileStream | undefined;
  let success = false;
  let failure = "";
  try {
    validateFile(request.file);
    if (!/^[0-9a-f-]{36}$/.test(request.id))
      throw new Error("Invalid export ID.");
    input = new Input({
      source: new BlobSource(request.file),
      formats: ALL_FORMATS,
    });
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("No readable video track.");
    const duration = await video.computeDuration();
    validateRange(request.start, request.end, duration);
    const audio = (await input.getAudioTracks()).find(
      (t) => t.number === request.audioTrack,
    );
    if (request.audioTrack !== null && !audio)
      throw new Error("Select an available audio track or silent export.");
    const sourceWidth = await video.getDisplayWidth(),
      sourceHeight = await video.getDisplayHeight();
    const scale = Math.min(
      1,
      (request.preview ? 640 : 1920) / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);
    let handle: FileSystemFileHandle | undefined;
    try {
      handle = await (
        await exportDirectory()
      ).getFileHandle(request.id, { create: true });
      stream = await handle.createWritable();
    } catch {
      handle = undefined;
    }
    // Source data is always read in bounded ranges. Output streams to disk when
    // OPFS is available; the fallback is bounded to 256 MiB, never source-sized.
    const target = stream
      ? new StreamTarget(
          new WritableStream<StreamTargetChunk>({
            async write(chunk) {
              if (chunk.position + chunk.data.byteLength > MAX_EXPORT_BYTES)
                throw new Error(
                  "This export exceeded 256 MB. Choose a shorter clip.",
                );
              await stream!.write(chunk);
            },
          }),
        )
      : new BufferTarget();
    target.on("write", ({ end }) => {
      if (end > MAX_EXPORT_BYTES)
        throw new Error("This export exceeded 256 MB. Choose a shorter clip.");
    });
    const output = new Output({
      format:
        request.format === "mp4"
          ? new Mp4OutputFormat({ fastStart: "fragmented" })
          : new WebMOutputFormat(),
      target,
    });
    conversion = await Conversion.init({
      input,
      output,
      trim: { start: request.start, end: request.end },
      tags: {},
      showWarnings: false,
      video: (track) =>
        track.id === video.id
          ? {
              codec: request.format === "mp4" ? "avc" : "vp9",
              width,
              height,
              fit: "contain",
              frameRate: 30,
              quality: new Quality({
                bitrate: request.preview ? 1000000 : 6000000,
              }),
              forceTranscode: true,
            }
          : { discard: true },
      audio: (track) =>
        track.number === request.audioTrack
          ? {
              codec: request.format === "mp4" ? "aac" : "opus",
              numberOfChannels: 2,
              sampleRate: 48000,
              quality: new Quality({ bitrate: 128000 }),
              forceTranscode: true,
            }
          : { discard: true },
    });
    if (
      !conversion.isValid ||
      !conversion.utilizedTracks.includes(video) ||
      (audio && !conversion.utilizedTracks.includes(audio))
    ) {
      throw new Error(
        `This browser cannot encode/decode the selected tracks as ${request.format.toUpperCase()}. Try ${request.format === "mp4" ? "WebM" : "MP4"}, select silent export, or use the local Studio. No track was silently dropped.`,
      );
    }
    conversion.onProgress = (progress) => send({ type: "progress", progress });
    await conversion.execute();
    if (stream) {
      await stream.close();
      stream = undefined;
    }
    const mime = request.format === "mp4" ? "video/mp4" : "video/webm";
    const blob = handle
      ? new File([await handle.getFile()], `export.${request.format}`, {
          type: mime,
        })
      : new Blob([(target as BufferTarget).buffer!], { type: mime });
    if (!blob.size || blob.size > MAX_EXPORT_BYTES)
      throw new Error("The browser produced an empty or oversized export.");
    verify = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const outputVideo = await verify.getPrimaryVideoTrack();
    const outputDuration = outputVideo
      ? await outputVideo.computeDuration()
      : 0;
    if (
      !outputVideo ||
      Math.abs(outputDuration - (request.end - request.start)) > 0.25 ||
      (await outputVideo.getDisplayWidth()) !== width ||
      (await outputVideo.getDisplayHeight()) !== height ||
      (audio && !(await verify.getPrimaryAudioTrack()))
    )
      throw new Error(
        "The export failed media validation. Try a shorter clip or the local Studio.",
      );
    send({
      type: "complete",
      blob,
      width,
      height,
      duration: outputDuration,
      audio: Boolean(audio),
    });
    success = true;
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Export failed. Try another format or the local Studio.";
  } finally {
    await conversion?.cancel().catch(() => {});
    input?.dispose();
    verify?.dispose();
    await stream?.abort().catch(() => {});
    if (!success) await removeExport(request.id);
  }
  if (failure) send({ type: "error", message: failure });
};
