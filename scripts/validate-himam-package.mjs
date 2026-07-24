#!/usr/bin/env node
// Validates the HIMAM Pre-Programming Package v1.0 on disk.
// Exits 1 on any failure.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DIR = "himam-preprogramming-package-v1.0";
const REQUIRED = [
  "00_README.md",
  "01_HIMAM_PRODUCT_IDENTITY_AND_SCOPE.md",
  "02_HIMAM_KNOWLEDGE_FRAMEWORK.md",
  "03_HIMAM_CRITERIA_MATRIX.csv",
  "04_HIMAM_SOURCE_REGISTER.csv",
  "05_HIMAM_INPUT_ACTIVATION_MATRIX.csv",
  "06_HIMAM_AGE_PHASE_OUTCOMES.csv",
  "07_HIMAM_GOAL_RELATIONSHIP_FRAMEWORK.md",
  "08_HIMAM_REVIEW_PROCESSES.md",
  "09_HIMAM_DECISION_LOGIC.md",
  "10_HIMAM_REPORT_CONTRACT.md",
  "11_HIMAM_AI_GOVERNANCE.md",
  "12_HIMAM_REFERENCE_TEST_CASES.csv",
  "13_HIMAM_ACCEPTANCE_CRITERIA.md",
  "14_HIMAM_OUT_OF_SCOPE_REGISTER.md",
  "15_HIMAM_PROGRAMMING_HANDOFF.md",
  "16_HIMAM_SAFETY_GATE_CHECKLIST.md",
  "17_HIMAM_TRACEABILITY_MATRIX.csv",
  "18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md",
  "MANIFEST.md",
];

const errors = [];
const warnings = [];
function err(m) { errors.push(m); }
function warn(m) { warnings.push(m); }

function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ""; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur); return out;
}

function readCsv(name) {
  const raw = readFileSync(resolve(DIR, name), "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows, raw };
}

// 1. All required files exist and non-empty
for (const f of REQUIRED) {
  const p = resolve(DIR, f);
  if (!existsSync(p)) { err(`Missing file: ${f}`); continue; }
  const s = readFileSync(p, "utf8");
  if (s.replace(/^\uFEFF/, "").trim().length === 0) err(`Empty file: ${f}`);
  if (f.endsWith(".csv") && !s.startsWith("\uFEFF")) err(`CSV missing UTF-8 BOM: ${f}`);
}

if (errors.length) { report(); process.exit(1); }

// 2. Criteria matrix
const crit = readCsv("03_HIMAM_CRITERIA_MATRIX.csv");
const expectedCritCols = 20;
for (const [i, r] of crit.rows.entries()) {
  if (r.length !== expectedCritCols) err(`Criteria row ${i+2} has ${r.length} cols, expected ${expectedCritCols}`);
}
const seen = new Set();
const validDomains = new Set(["D0","D1","D2","D3","D4","D5","D6","D7","D8"]);
const criteria = crit.rows.map(r => ({ id: r[0], domain: r[1], level: r[3], sources: r[15], activation: r[6] }));
for (const c of criteria) {
  if (seen.has(c.id)) err(`Duplicate criterion_id: ${c.id}`);
  seen.add(c.id);
  if (!validDomains.has(c.domain)) err(`Invalid domain_id ${c.domain} on ${c.id}`);
}

// 3. Source register
const src = readCsv("04_HIMAM_SOURCE_REGISTER.csv");
const registered = new Set(src.rows.map(r => r[0]));
for (const c of criteria) {
  const used = (c.sources || "").split("|").filter(Boolean);
  for (const s of used) if (!registered.has(s)) err(`criterion ${c.id} references unregistered source ${s}`);
  if (used.length === 0) err(`criterion ${c.id} has no source_id`);
  else if (!registered.has(c.sources)) err(`criterion ${c.id} references unregistered source ${c.sources}`);
}

// 4. Input activation matrix: absent input must NOT produce fail
const inputs = readCsv("05_HIMAM_INPUT_ACTIVATION_MATRIX.csv");
for (const r of inputs.rows) {
  const blocked = r[3] || ""; // blocked_verdicts_when_absent
  if (/=\s*fail|fail\s*=/i.test(blocked) || /غير متحقق/.test(blocked)) {
    err(`input '${r[0]}': absence maps to failure/غير متحقق; must be 'غير قابل للمراجعة'`);
  }
}

// 5. Test cases coverage
const tc = readCsv("12_HIMAM_REFERENCE_TEST_CASES.csv");
const expectedTcCols = 9;
for (const [i, r] of tc.rows.entries()) {
  if (r.length !== expectedTcCols) err(`Test case row ${i+2} has ${r.length} cols, expected ${expectedTcCols}`);
}
if (tc.rows.length < 30) err(`Test cases count ${tc.rows.length} < 30`);

const tcBlob = tc.raw;
const critBasic = criteria.filter(c => c.level === "أساسي");
for (const c of critBasic) {
  if (!new RegExp(`\\b${c.id}\\b`).test(tcBlob)) err(`Basic/critical criterion ${c.id} has no test case`);
}
// domain coverage in tests via criteria they reference
const domainsHit = new Set();
for (const c of criteria) if (new RegExp(`\\b${c.id}\\b`).test(tcBlob)) domainsHit.add(c.domain);
for (const d of validDomains) if (!domainsHit.has(d)) err(`No test case references any criterion in ${d}`);

// 6. Traceability matrix: one row per criterion
const tr = readCsv("17_HIMAM_TRACEABILITY_MATRIX.csv");
const expectedTrCols = 8;
for (const [i, r] of tr.rows.entries()) {
  if (r.length !== expectedTrCols) err(`Traceability row ${i+2} has ${r.length} cols, expected ${expectedTrCols}`);
}
const traceIds = new Set(tr.rows.map(r => r[0]));
for (const c of criteria) if (!traceIds.has(c.id)) err(`Traceability missing row for ${c.id}`);
for (const id of traceIds) if (!seen.has(id)) err(`Traceability references unknown criterion ${id}`);

// 7. Handoff must not include Student Master Record as implementation entity
const handoff = readFileSync(resolve(DIR, "15_HIMAM_PROGRAMMING_HANDOFF.md"), "utf8");
// It may be mentioned only in negation. Look for it appearing in a data model bullet.
const dataModelSection = handoff.split("نموذج البيانات")[1] || "";
if (/Student Master Record/i.test(dataModelSection.split("## ")[0] || "")) {
  err("Handoff data model includes Student Master Record (out of scope)");
}

// 8. Absolute cancellation phrasing must be gone
const critRaw = readFileSync(resolve(DIR, "03_HIMAM_CRITERIA_MATRIX.csv"), "utf8");
if (/ألغِ الهدف|إلغاء الهدف|ألغ الهدف/.test(critRaw)) err("Criteria matrix still contains absolute 'cancel goal' phrasing");

// -------- Report --------
function report() {
  console.log(`Files checked: ${REQUIRED.length}`);
  console.log(`Criteria: ${criteria?.length ?? "?"}, Test cases: ${tc?.rows?.length ?? "?"}, Traceability rows: ${tr?.rows?.length ?? "?"}`);
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log("  ⚠ " + w);
  }
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log("  ✗ " + e);
    console.log(`\n❌ FAILED (${errors.length} errors)`);
  } else {
    console.log("\n✅ PASSED — HIMAM pre-programming package is internally consistent.");
  }
}

report();
process.exit(errors.length ? 1 : 0);