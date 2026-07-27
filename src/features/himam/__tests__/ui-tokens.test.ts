import { describe, it, expect } from "vitest";
import {
  STATUS_VARIANT_CLASSES,
  JOURNEY_STATE_VARIANT,
  CASE_STATUS_VARIANT,
  NEXT_ACTION_VARIANT,
  variantClasses,
} from "@/features/himam/ui/status-variants";
import { JOURNEY_STATE_LABELS_AR } from "@/features/himam";

describe("UI status variants — Commit 2 tokens", () => {
  it("UI-T01: exposes every semantic variant with class strings", () => {
    for (const v of ["neutral", "info", "success", "warning", "attention", "locked"] as const) {
      expect(STATUS_VARIANT_CLASSES[v]).toBeTruthy();
      expect(variantClasses(v)).toBe(STATUS_VARIANT_CLASSES[v]);
    }
  });

  it("UI-T02: every journey state has both an Arabic label and a variant", () => {
    for (const state of Object.keys(JOURNEY_STATE_LABELS_AR) as (keyof typeof JOURNEY_STATE_LABELS_AR)[]) {
      expect(JOURNEY_STATE_LABELS_AR[state]).toMatch(/[\u0600-\u06FF]/);
      expect(JOURNEY_STATE_VARIANT[state]).toBeTruthy();
    }
  });

  it("UI-T03: every case status maps to a variant", () => {
    for (const s of ["draft", "minimum_inputs_complete", "scope_confirmed", "closed"] as const) {
      expect(CASE_STATUS_VARIANT[s]).toBeTruthy();
    }
    expect(CASE_STATUS_VARIANT.closed).toBe("locked");
    expect(CASE_STATUS_VARIANT.scope_confirmed).toBe("success");
  });

  it("UI-T04: every next-action kind maps to a variant, and terminal kinds are locked", () => {
    const kinds = [
      "open_basics",
      "attach_plan",
      "prepare_text",
      "confirm_evidence",
      "confirm_scope",
      "run_review",
      "complete_human_decisions",
      "generate_report",
      "finalize_report",
      "close_case",
      "case_closed",
      "case_not_found",
    ] as const;
    for (const k of kinds) {
      expect(NEXT_ACTION_VARIANT[k]).toBeTruthy();
    }
    expect(NEXT_ACTION_VARIANT.case_closed).toBe("locked");
    expect(NEXT_ACTION_VARIANT.case_not_found).toBe("locked");
    expect(NEXT_ACTION_VARIANT.close_case).toBe("success");
  });

  it("UI-T05: variant class strings never hard-code failure colors", () => {
    for (const cls of Object.values(STATUS_VARIANT_CLASSES)) {
      expect(cls).not.toMatch(/#|rgb\(|red-|destructive/);
    }
  });
});