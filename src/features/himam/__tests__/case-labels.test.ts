import { describe, expect, it } from "vitest";
import { phaseOrAgeLabelAr } from "..";

describe("case labels", () => {
  it("shows the entered age when no phase was selected", () => {
    expect(phaseOrAgeLabelAr(null, 9)).toBe("العمر 9 سنوات");
  });

  it("prefers the explicit phase and never infers one from age", () => {
    expect(phaseOrAgeLabelAr("elementary", 19)).toBe("المرحلة الابتدائية");
  });
});
