import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const MODEL_SHA1 = "137c40403d78fd54d454da0f9bd998f78703390c";
const dataRoot = path.resolve(
  process.cwd(),
  process.env.R6_DATA_DIR?.trim() || "data",
);
const modelPath = path.resolve(
  process.env.WHISPER_MODEL_PATH?.trim() ||
    path.join(dataRoot, "models", "whisper", "ggml-base.en.bin"),
);

function findWhisperCli() {
  const candidates = [
    process.env.WHISPER_CLI_PATH?.trim(),
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function installWhisperCli() {
  if (process.platform !== "darwin") {
    throw new Error(
      "Automatic whisper.cpp installation currently supports macOS only. Set WHISPER_CLI_PATH to your local whisper-cli executable.",
    );
  }
  const brew = existsSync("/opt/homebrew/bin/brew")
    ? "/opt/homebrew/bin/brew"
    : "/usr/local/bin/brew";
  if (!existsSync(brew)) {
    throw new Error(
      "Homebrew is required for automatic local speech setup. Install Homebrew, then run this command again.",
    );
  }

  console.log("Installing the free whisper.cpp speech engine with Homebrew…");
  const result = spawnSync(brew, ["install", "whisper-cpp"], {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1" },
  });
  if (result.status !== 0) {
    throw new Error("Homebrew could not install whisper.cpp.");
  }
}

function sha1(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha1");
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error("The model download redirected too many times."));
      return;
    }
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          download(nextUrl, destination, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(`The model server returned HTTP ${response.statusCode}.`),
          );
          return;
        }

        const expectedBytes = Number(response.headers["content-length"] || 0);
        let receivedBytes = 0;
        let lastPercent = -1;
        const output = createWriteStream(destination, { flags: "wx" });
        response.on("data", (chunk) => {
          receivedBytes += chunk.length;
          if (expectedBytes > 0) {
            const percent = Math.floor((receivedBytes / expectedBytes) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              process.stdout.write(`\rDownloading speech model… ${percent}%`);
            }
          }
        });
        response.on("error", reject);
        output.on("error", reject);
        output.on("finish", () => {
          process.stdout.write("\n");
          resolve();
        });
        response.pipe(output);
      })
      .on("error", reject);
  });
}

async function main() {
  if (!findWhisperCli()) installWhisperCli();
  const whisperCli = findWhisperCli();
  if (!whisperCli) {
    throw new Error("whisper-cli is still unavailable after installation.");
  }

  await mkdir(path.dirname(modelPath), { recursive: true });
  if (existsSync(modelPath)) {
    const digest = await sha1(modelPath);
    if (digest !== MODEL_SHA1) {
      throw new Error(
        `The existing model failed its safety check. Remove ${modelPath} and run setup again.`,
      );
    }
    const info = await stat(modelPath);
    console.log(
      `Local speech is ready (${whisperCli}, ${(info.size / 1024 / 1024).toFixed(1)} MB model).`,
    );
    return;
  }

  const temporaryPath = `${modelPath}.${process.pid}.download`;
  await rm(temporaryPath, { force: true });
  try {
    await download(MODEL_URL, temporaryPath);
    const digest = await sha1(temporaryPath);
    if (digest !== MODEL_SHA1) {
      throw new Error("The downloaded speech model failed its safety check.");
    }
    await rename(temporaryPath, modelPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  console.log(`Local speech is ready (${whisperCli}, model saved locally).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
