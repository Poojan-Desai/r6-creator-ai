import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  assertLocalReferencePermission,
  localReferenceFieldsSchema,
} from "@/lib/reference-library";

const validFields = {
  title: "My permitted reference",
  creatorName: "My Channel",
  game: "Rainbow Six Siege",
  platform: "YouTube Shorts",
  sourceType: "OWN_CREATION",
  sourceUrl: "",
  contentCategory: "High energy",
  notes: "",
  thumbnailText: "",
  permissionConfirmed: "true",
};

describe("reference upload permission", () => {
  it("accepts and preserves an explicit ownership confirmation", () => {
    expect(
      assertLocalReferencePermission(validFields).permissionConfirmed,
    ).toBe("true");
  });

  it.each([undefined, "", "false", "yes"])(
    "rejects a missing or non-explicit value: %s",
    (permissionConfirmed) => {
      try {
        localReferenceFieldsSchema.parse({
          ...validFields,
          permissionConfirmed,
        });
        throw new Error("Expected permission validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    },
  );

  it("returns a plain application error when the confirmation is absent", () => {
    expect(() =>
      assertLocalReferencePermission({
        ...validFields,
        permissionConfirmed: "false",
      }),
    ).toThrow();
    expect(AppError).toBeDefined();
  });
});
