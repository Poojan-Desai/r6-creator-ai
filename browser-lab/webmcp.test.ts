import { expect, it } from "vitest";
import { registerBriefTool, type ModelContext } from "./webmcp";
it("registers a read-only, validated brief export and cleans it up", () => {
  let tool: Parameters<ModelContext["registerTool"]>[0] | undefined;
  let signal: AbortSignal | undefined;
  const cleanup = registerBriefTool(
    {
      registerTool(value, options) {
        tool = value;
        signal = options.signal;
      },
    },
    () => ({ markdown: "# Selected source" }),
  );
  expect(tool?.name).toBe("get_selected_review_brief");
  expect(tool?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  });
  expect(tool?.execute({})).toEqual({ markdown: "# Selected source" });
  expect(() => tool?.execute({ unexpected: true })).toThrow();
  cleanup();
  expect(signal?.aborted).toBe(true);
  expect(() => registerBriefTool(undefined, () => null)()).not.toThrow();
});
