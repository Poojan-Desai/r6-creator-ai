import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("browser writing components", () => {
  it.each([
    "clip-station.tsx",
    "content-workbench.tsx",
    "short-form-planning-workspace.tsx",
  ])(
    "bundles %s without native tools or server writing providers",
    async (name) => {
      const result = await build({
        absWorkingDir: root,
        entryPoints: [path.join(root, "src/components", name)],
        bundle: true,
        platform: "browser",
        format: "esm",
        write: false,
        metafile: true,
        logLevel: "silent",
        external: ["react", "react/*", "lucide-react"],
      });

      const inputs = Object.keys(result.metafile.inputs).join("\n");
      expect(inputs).not.toMatch(
        /(?:src\/lib\/config\.ts|content-writing\/openai-provider|ffmpeg-static|ffprobe-static)/,
      );
    },
  );
});
