import { build } from "esbuild";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";

const output = "public/ai-lab";
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/runtime`, { recursive: true });
await mkdir(`${output}/studio`, { recursive: true });
await build({
  entryPoints: {
    app: "browser-lab/app.tsx",
    worker: "browser-lab/worker.ts",
    studio: "browser-lab/studio/app.tsx",
    "export-worker": "browser-lab/studio/export-worker.ts",
  },
  bundle: true,
  outdir: output,
  format: "esm",
  platform: "browser",
  minify: true,
  sourcemap: false,
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "external",
});
for (const name of ["index.html", "favicon.svg"])
  await copyFile(`browser-lab/${name}`, `${output}/${name}`);
await copyFile("browser-lab/studio/index.html", `${output}/studio/index.html`);
for (const name of await readdir("node_modules/onnxruntime-web/dist")) {
  if (
    name === "ort-wasm-simd-threaded.asyncify.mjs" ||
    name === "ort-wasm-simd-threaded.asyncify.wasm"
  )
    await copyFile(
      `node_modules/onnxruntime-web/dist/${name}`,
      `${output}/runtime/${name}`,
    );
}
await writeFile(
  `${output}/LICENSES.txt`,
  [
    "Browser inference dependencies (model weights downloaded separately):",
    await readFile("node_modules/@huggingface/transformers/LICENSE", "utf8"),
    await readFile("browser-lab/onnxruntime-LICENSE.txt", "utf8"),
    await readFile("node_modules/mediabunny/LICENSE", "utf8"),
  ].join("\n\n"),
);
console.log(
  `Browser Studio built in ${output}. No private media or server files included.`,
);
