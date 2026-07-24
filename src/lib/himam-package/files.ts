// HIMAM Pre-Programming Package v1.0 — content is loaded from the physical
// package directory /himam-preprogramming-package-v1.0/ so the download UI
// serves the exact same bytes validated by scripts/validate-himam-package.mjs.
import f00 from "../../../himam-preprogramming-package-v1.0/00_README.md?raw";
import f01 from "../../../himam-preprogramming-package-v1.0/01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md?raw";
import f02 from "../../../himam-preprogramming-package-v1.0/02_HIMAM_KNOWLEDGE_FRAMEWORK.md?raw";
import f03 from "../../../himam-preprogramming-package-v1.0/03_HIMAM_CRITERIA_MATRIX.csv?raw";
import f04 from "../../../himam-preprogramming-package-v1.0/04_HIMAM_SOURCE_REGISTER.csv?raw";
import f05 from "../../../himam-preprogramming-package-v1.0/05_HIMAM_INPUT_ACTIVATION_MATRIX.csv?raw";
import f06 from "../../../himam-preprogramming-package-v1.0/06_HIMAM_AGE_PHASE_OUTCOMES.csv?raw";
import f07 from "../../../himam-preprogramming-package-v1.0/07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md?raw";
import f08 from "../../../himam-preprogramming-package-v1.0/08_HIMAM_REVIEW_PROCESSES.md?raw";
import f09 from "../../../himam-preprogramming-package-v1.0/09_HIMAM_DECISION_LOGIC.md?raw";
import f10 from "../../../himam-preprogramming-package-v1.0/10_HIMAM_REPORT_CONTRACT.md?raw";
import f11 from "../../../himam-preprogramming-package-v1.0/11_HIMAM_AI_GOVERNANCE.md?raw";
import f12 from "../../../himam-preprogramming-package-v1.0/12_HIMAM_REFERENCE_TEST_CASES.csv?raw";
import f13 from "../../../himam-preprogramming-package-v1.0/13_HIMAM_ACCEPTANCE_CRITERIA.md?raw";
import f14 from "../../../himam-preprogramming-package-v1.0/14_HIMAM_OUT_OF_SCOPE_REGISTER.md?raw";
import f15 from "../../../himam-preprogramming-package-v1.0/15_HIMAM_PROGRAMMING_HANDOFF.md?raw";
import f16 from "../../../himam-preprogramming-package-v1.0/16_HIMAM_SAFETY_GATE_CHECKLIST.md?raw";
import f17 from "../../../himam-preprogramming-package-v1.0/17_HIMAM_TRACEABILITY_MATRIX.csv?raw";
import f18 from "../../../himam-preprogramming-package-v1.0/18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md?raw";
import f19 from "../../../himam-preprogramming-package-v1.0/19_HIMAM_PROGRAMMING_PACKAGE_01_FOUNDATION_AR.md?raw";
import fManifest from "../../../himam-preprogramming-package-v1.0/MANIFEST.md?raw";

export interface PackageFile {
  name: string;
  content: string;
  mime: string;
  isCsv: boolean;
}

const stripBom = (s: string) => s.replace(/^\uFEFF/, "");
const md = (name: string, content: string): PackageFile => ({
  name,
  content,
  mime: "text/markdown",
  isCsv: false,
});
const csv = (name: string, content: string): PackageFile => ({
  name,
  content: stripBom(content),
  mime: "text/csv",
  isCsv: true,
});

export const PACKAGE_FILES: PackageFile[] = [
  md("00_README.md", f00),
  md("01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md", f01),
  md("02_HIMAM_KNOWLEDGE_FRAMEWORK.md", f02),
  csv("03_HIMAM_CRITERIA_MATRIX.csv", f03),
  csv("04_HIMAM_SOURCE_REGISTER.csv", f04),
  csv("05_HIMAM_INPUT_ACTIVATION_MATRIX.csv", f05),
  csv("06_HIMAM_AGE_PHASE_OUTCOMES.csv", f06),
  md("07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md", f07),
  md("08_HIMAM_REVIEW_PROCESSES.md", f08),
  md("09_HIMAM_DECISION_LOGIC.md", f09),
  md("10_HIMAM_REPORT_CONTRACT.md", f10),
  md("11_HIMAM_AI_GOVERNANCE.md", f11),
  csv("12_HIMAM_REFERENCE_TEST_CASES.csv", f12),
  md("13_HIMAM_ACCEPTANCE_CRITERIA.md", f13),
  md("14_HIMAM_OUT_OF_SCOPE_REGISTER.md", f14),
  md("15_HIMAM_PROGRAMMING_HANDOFF.md", f15),
  md("16_HIMAM_SAFETY_GATE_CHECKLIST.md", f16),
  csv("17_HIMAM_TRACEABILITY_MATRIX.csv", f17),
  md("18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md", f18),
  md("19_HIMAM_PROGRAMMING_PACKAGE_01_FOUNDATION_AR.md", f19),
  md("MANIFEST.md", fManifest),
];

export const PACKAGE_FOLDER = "HIMAM_PreProgramming_Package_v1.0";
export const BOM = "\uFEFF";
