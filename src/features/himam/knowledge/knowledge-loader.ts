// Reads the read-only knowledge assets shipped in
// /himam-preprogramming-package-v1.0/ via Vite ?raw imports.
// Package 1A DOES NOT execute any criterion; it only exposes the index
// so the state machine and scope service can reason about domains.
import criteriaCsvRaw from "../../../../himam-preprogramming-package-v1.0/03_HIMAM_CRITERIA_MATRIX.csv?raw";
import inputActivationCsvRaw from "../../../../himam-preprogramming-package-v1.0/05_HIMAM_INPUT_ACTIVATION_MATRIX.csv?raw";
import manifestRaw from "../../../../himam-preprogramming-package-v1.0/MANIFEST.md?raw";
import readinessRaw from "../../../../himam-preprogramming-package-v1.0/18_HIMAM_PREPROGRAMMING_READINESS_REPORT.md?raw";

import { expandCriterionTokens, parseCsv } from "./csv-parser";
import type {
  CriteriaIndex,
  CriterionRecord,
  DomainId,
  InputActivationMatrix,
  InputActivationRow,
  KnowledgeBundle,
  KnowledgeManifest,
  ReadinessVerdict,
} from "./knowledge-types";

const DOMAIN_IDS: ReadonlySet<string> = new Set([
  "D0",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
]);

function toRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h.trim()] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

export function loadCriteriaIndex(): CriteriaIndex {
  const records = toRecords(parseCsv(criteriaCsvRaw));
  const criteria: CriterionRecord[] = [];
  const byId = new Map<string, CriterionRecord>();
  const byDomain = new Map<DomainId, CriterionRecord[]>();
  for (const r of records) {
    const id = r["criterion_id"];
    const domain = r["domain_id"];
    if (!id) continue;
    if (!DOMAIN_IDS.has(domain)) {
      throw new Error(
        `HIMAM knowledge: criterion ${id} references unknown domain "${domain}".`,
      );
    }
    if (byId.has(id)) {
      throw new Error(`HIMAM knowledge: duplicate criterion id "${id}".`);
    }
    const rec: CriterionRecord = {
      criterionId: id,
      domainId: domain as DomainId,
      nameAr: r["criterion_name_ar"] ?? "",
      reviewLevel: r["review_level"] ?? "",
      criterionType: r["criterion_type"] ?? "",
      requiredInputs: (r["required_inputs"] ?? "")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      sourceIds: (r["source_ids"] ?? "")
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    criteria.push(rec);
    byId.set(id, rec);
    const list = byDomain.get(rec.domainId) ?? [];
    list.push(rec);
    byDomain.set(rec.domainId, list);
  }
  return { criteria, byId, byDomain };
}

export function loadInputActivationMatrix(
  criteriaIndex?: CriteriaIndex,
): InputActivationMatrix {
  const idx = criteriaIndex ?? loadCriteriaIndex();
  const records = toRecords(parseCsv(inputActivationCsvRaw));
  const rows: InputActivationRow[] = [];
  const byInputId = new Map<string, InputActivationRow>();
  for (const r of records) {
    const inputId = r["input_id"];
    if (!inputId) continue;
    const expanded = expandCriterionTokens(r["activates_criteria"] ?? "");
    // Keep only ids that actually exist in the criteria matrix so
    // the scope service never invents criteria.
    const filtered = expanded.filter((c) => idx.byId.has(c));
    const row: InputActivationRow = {
      inputId,
      inputNameAr: r["input_name_ar"] ?? "",
      isRequired: (r["is_required"] ?? "").toLowerCase() === "yes",
      activatesCriteria: filtered,
      blockedVerdictsWhenAbsent: r["blocked_verdicts_when_absent"] ?? "",
      dataMinimizationRule: r["data_minimization_rule"] ?? "",
    };
    rows.push(row);
    byInputId.set(inputId, row);
  }
  return { rows, byInputId };
}

function parseVerdict(text: string): ReadinessVerdict {
  const t = text.toUpperCase();
  if (/CONDITIONAL[\s_-]*GO/.test(t)) return "CONDITIONAL_GO";
  if (/\bNO[\s_-]*GO\b/.test(t)) return "NO_GO";
  if (/\bGO\b/.test(t)) return "GO";
  return "CONDITIONAL_GO";
}

function extractManifestVersion(md: string): string {
  const m = md.match(/version:\s*([^\s\n]+)/i);
  return m ? m[1] : "1.0";
}

function extractManifestName(md: string): string {
  const m = md.match(/package_name:\s*([^\n]+)/i);
  return m ? m[1].trim() : "HIMAM_PreProgramming_Package";
}

function extractOpenIssues(md: string): string[] {
  // Very conservative: pull "OPEN-*" tokens if any appear in the readiness
  // report. This is descriptive only; Package 1A never blocks on them.
  const out = new Set<string>();
  const re = /OPEN-[A-Z0-9-]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.add(m[0]);
  return [...out];
}

export function loadKnowledgeManifest(): KnowledgeManifest {
  return {
    packageName: extractManifestName(manifestRaw),
    version: extractManifestVersion(manifestRaw),
    readiness: parseVerdict(readinessRaw),
    openIssues: extractOpenIssues(readinessRaw),
  };
}

let cached: KnowledgeBundle | null = null;
export function loadKnowledgeBundle(): KnowledgeBundle {
  if (cached) return cached;
  const criteria = loadCriteriaIndex();
  const inputActivation = loadInputActivationMatrix(criteria);
  const manifest = loadKnowledgeManifest();
  cached = { manifest, criteria, inputActivation };
  return cached;
}