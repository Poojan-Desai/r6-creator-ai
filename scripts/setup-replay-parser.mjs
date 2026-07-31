import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const projectRoot = process.cwd();
const provider = {
  id: "redraskal.r6-dissect",
  repository: "https://github.com/redraskal/r6-dissect.git",
  commit: "e6c2ca80f7f895e320ca0f8ded0f30136888ffac",
  version: "source-e6c2ca80+compat-1-2026-07-31",
  license: "MIT",
};
const compatibilityPatch = {
  id: "r6-dissect-y11s2-solid-snake",
  path: path.join(
    projectRoot,
    "scripts",
    "replay-parser-patches",
    "r6-dissect-y11s2-solid-snake.patch",
  ),
};
const fallbackGo = {
  version: "1.26.5",
  url: "https://go.dev/dl/go1.26.5.darwin-arm64.tar.gz",
  sha256: "efb87ff28af9a188d0536ef5d42e63dd52ba8263cd7344a993cc48dd11dedb6a",
};

const dataRoot = path.resolve(
  projectRoot,
  process.env.R6_DATA_DIR?.trim() || "data",
);
const toolDirectory = path.join(dataRoot, "tools", "replay-parsers");
const workDirectory = path.join(toolDirectory, ".setup-working");
const sourceDirectory = path.join(workDirectory, "source");
const binaryPath = path.join(toolDirectory, "r6-dissect");
const nextBinaryPath = path.join(toolDirectory, "r6-dissect.new");
const manifestPath = path.join(toolDirectory, "r6-dissect.manifest.json");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8").trim();
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0) {
        resolve({ stdout: output, stderr: errorOutput });
      } else {
        reject(
          new Error(
            `${command} stopped with exit code ${code}.${errorOutput ? `\n${errorOutput}` : ""}`,
          ),
        );
      }
    });
  });
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function commandExists(command) {
  try {
    await run(command, ["version"]);
    return true;
  } catch {
    return false;
  }
}

function parseGoVersion(output) {
  const match = /go version go(\d+)\.(\d+)/.exec(output);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

async function locateGo() {
  if (await commandExists("go")) {
    const result = await run("go", ["version"]);
    const version = parseGoVersion(result.stdout);
    if (version && (version.major > 1 || version.minor >= 23)) {
      return { executable: "go", source: result.stdout };
    }
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error(
      "No compatible Go 1.23+ installation was found. Automatic project-local setup currently supports Apple Silicon Macs.",
    );
  }
  const archivePath = path.join(
    workDirectory,
    `go${fallbackGo.version}.darwin-arm64.tar.gz`,
  );
  const goRoot = path.join(toolDirectory, `.go-${fallbackGo.version}`);
  const goExecutable = path.join(goRoot, "go", "bin", "go");
  try {
    await access(goExecutable);
  } catch {
    console.log(
      `Downloading project-local Go ${fallbackGo.version} from go.dev…`,
    );
    const response = await fetch(fallbackGo.url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(
        `The official Go download returned HTTP ${response.status}.`,
      );
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(archivePath, { flags: "wx" }),
    );
    const actualSha = await sha256(archivePath);
    if (actualSha !== fallbackGo.sha256) {
      throw new Error(
        "The downloaded Go archive did not match the pinned official SHA-256.",
      );
    }
    await mkdir(goRoot, { recursive: true });
    await run("tar", ["-xzf", archivePath, "-C", goRoot]);
    await rm(archivePath, { force: true });
  }
  return {
    executable: goExecutable,
    source: `project-local go${fallbackGo.version} (${fallbackGo.sha256})`,
  };
}

async function removeSetupWorkingDirectory() {
  await run("chmod", ["-R", "u+w", workDirectory]).catch(() => undefined);
  await rm(workDirectory, { recursive: true, force: true });
}

async function main() {
  await mkdir(toolDirectory, { recursive: true });
  await removeSetupWorkingDirectory();
  await rm(nextBinaryPath, { force: true });
  await mkdir(workDirectory, { recursive: true });
  try {
    const go = await locateGo();
    console.log("Checking out the reviewed MIT parser source…");
    await run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      provider.repository,
      sourceDirectory,
    ]);
    await run("git", ["checkout", "--detach", provider.commit], {
      cwd: sourceDirectory,
    });
    const resolvedCommit = (
      await run("git", ["rev-parse", "HEAD"], { cwd: sourceDirectory })
    ).stdout;
    if (resolvedCommit !== provider.commit) {
      throw new Error("The parser checkout did not match the pinned commit.");
    }
    const license = await readFile(
      path.join(sourceDirectory, "LICENSE"),
      "utf8",
    );
    if (!/MIT License/i.test(license)) {
      throw new Error(
        "The reviewed source no longer contains its MIT license.",
      );
    }
    const patchSha256 = await sha256(compatibilityPatch.path);
    console.log("Applying the reviewed current-replay compatibility patch…");
    await run(
      "git",
      ["apply", "--unidiff-zero", "--check", compatibilityPatch.path],
      {
        cwd: sourceDirectory,
      },
    );
    await run("git", ["apply", "--unidiff-zero", compatibilityPatch.path], {
      cwd: sourceDirectory,
    });
    console.log("Building the parser inside the project data folder…");
    await mkdir(path.join(workDirectory, "go-cache"), { recursive: true });
    await mkdir(path.join(workDirectory, "go-mod-cache"), { recursive: true });
    await run(
      go.executable,
      ["build", "-trimpath", "-o", nextBinaryPath, "."],
      {
        cwd: sourceDirectory,
        env: {
          ...process.env,
          CGO_ENABLED: "0",
          GOCACHE: path.join(workDirectory, "go-cache"),
          GOMODCACHE: path.join(workDirectory, "go-mod-cache"),
        },
      },
    );
    await chmod(nextBinaryPath, 0o755);
    const binarySha256 = await sha256(nextBinaryPath);
    await rename(nextBinaryPath, binaryPath);
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: "r6-creator-replay-parser-manifest/v1",
          provider,
          compatibilityPatch: {
            id: compatibilityPatch.id,
            sha256: patchSha256,
          },
          binarySha256,
          platform: process.platform,
          architecture: process.arch,
          goSource: go.source,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`Replay parser ready: ${binaryPath}`);
    console.log(`Binary SHA-256: ${binarySha256}`);
  } finally {
    await removeSetupWorkingDirectory();
    await rm(nextBinaryPath, { force: true });
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Replay parser setup failed.",
  );
  process.exitCode = 1;
});
