import type { ReviewPhaseId } from "../cases/case-types";

// Phase ordering is derived from the knowledge package (File 06 age-phase outcomes).
// The service does NOT hard-code age numeric thresholds — only the ordinal position
// of the phases named inside the criteria matrix rule columns.
export const PHASE_ORDER: ReviewPhaseId[] = [
  "early_intervention",
  "preschool",
  "elementary",
  "middle",
  "high_school",
  "adult_transition",
  "postsecondary_employment",
];

// Named boundaries as they appear inside `activation_rule` / `not_applicable_rule`
// columns of 03_HIMAM_CRITERIA_MATRIX.csv. `adolescent` is used in the CSV as a
// synonym for the middle-school boundary.
const NAMED_LEVELS: Record<string, number> = {
  early_intervention: 0,
  preschool: 1,
  elementary: 2,
  middle: 3,
  adolescent: 3,
  high_school: 4,
  adult_transition: 5,
  postsecondary_employment: 6,
};

function level(p: ReviewPhaseId): number {
  return PHASE_ORDER.indexOf(p);
}

// Evaluate a single boolean clause about age/phase.
// Returns:
//   true / false — the clause resolves for the given phase
//   null         — the clause is not an age gate (e.g. `goal_text!=null`) or
//                  it references null when we cannot decide.
export function evaluateAgeClause(clause: string, phase: ReviewPhaseId | null): boolean | null {
  const m = clause.trim().match(/^age\s*(<=|>=|<|>|!=|=)\s*([a-z_]+|null)$/i);
  if (!m) return null;
  const op = m[1];
  const rhs = m[2].toLowerCase();
  if (rhs === "null") {
    if (op === "=") return phase === null;
    if (op === "!=") return phase !== null;
    return null;
  }
  if (phase === null) return null;
  const rhsLvl = NAMED_LEVELS[rhs];
  if (rhsLvl === undefined) return null;
  const lvl = level(phase);
  switch (op) {
    case ">=":
      return lvl >= rhsLvl;
    case ">":
      return lvl > rhsLvl;
    case "<=":
      return lvl <= rhsLvl;
    case "<":
      return lvl < rhsLvl;
    case "=":
      return lvl === rhsLvl;
    case "!=":
      return lvl !== rhsLvl;
  }
  return null;
}

function splitClauses(rule: string): string[] {
  return rule
    .split(/&&|\|\|/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Returns false if any age-clause inside the rule resolves to false for the
// current phase; non-age clauses (e.g. `goal_text!=null`) are ignored.
export function evaluatePhaseGate(rule: string, phase: ReviewPhaseId | null): boolean {
  if (!rule) return true;
  for (const c of splitClauses(rule)) {
    const r = evaluateAgeClause(c, phase);
    if (r === false) return false;
  }
  return true;
}

// A not-applicable rule triggers only when every clause is an age clause AND
// each age clause resolves to true for the current phase. This guarantees that
// content-only NA rules like `assessment=null` are ignored (they are handled
// by activation-through-inputs instead).
export function ruleMatchesPhase(rule: string, phase: ReviewPhaseId): boolean {
  const clauses = splitClauses(rule);
  if (clauses.length === 0) return false;
  for (const c of clauses) {
    const r = evaluateAgeClause(c, phase);
    if (r !== true) return false;
  }
  return true;
}
