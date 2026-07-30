// Package 1C.3 — Governed Report Service.
// Deterministic, no network, no AI, no scores.
// A report is a self-contained immutable snapshot of the current review
// version's human-reconciled findings. Once finalized, the sections and
// coverage are frozen — new information forces a new report version.

import { newAuditEvent } from "../audit/audit-service";
import type { HimamStore, ReviewCaseRepository } from "../cases/case-repository";
import {
  EVIDENCE_TYPE_LABELS_AR,
  SOURCE_TYPE_LABELS_AR,
  locatorLabelAr,
} from "../cases/case-labels";
import type { CriterionRecord } from "../knowledge/knowledge-types";
import { computeEvidenceDigest } from "./deterministic-review-engine";
import { getKnowledgeRegistry } from "./knowledge-registry";
import { ReviewVersionService } from "./review-version-service";
import {
  ENGINE_VERSION,
  GOVERNED_REPORT_ENGINE_VERSION,
  type ExcludedFindingRecord,
  type FindingSeverity,
  type FindingStatus,
  type GovernedReportCoverage,
  type GovernedReportMetadata,
  type GovernedReportScopeSummary,
  type GovernedReportSections,
  type GovernedReportVersion,
  type HumanDecision,
  type ReportEvidenceRef,
  type ReportExecutiveSummary,
  type ReportFindingItem,
  type ReportGateReason,
  type ReportGateResult,
  type ReportVersionDiff,
  type ReviewFinding,
} from "./review-types";

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "rep-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const GOVERNANCE_STATEMENT_AR =
  "أُنتج هذا التقرير بواسطة محرك مراجعة حتمي يعتمد على النطاق المؤكد " +
  "والأدلة البشرية المؤكدة وقواعد المعرفة المهيكلة. جميع الأحكام في " +
  "هذا التقرير خاضعة لقرار المراجع البشري: العناصر المرفوضة أو المؤجلة " +
  "لا تظهر في أقسام الأحكام. لا يُستخدم أي ذكاء اصطناعي في إصدار الحكم، " +
  "ولا تُنتج درجات جودة أو نسب نجاح.";

function pickFinal(f: ReviewFinding): {
  status: FindingStatus;
  severity: FindingSeverity;
  rationale: string;
  recommendation: string;
  decision: HumanDecision;
} | null {
  if (f.humanReviewStatus !== "decided" || f.humanDecision === null) return null;
  if (f.humanDecision === "reject" || f.humanDecision === "defer") return null;
  const status = f.humanStatus ?? f.automatedStatus;
  const severity = f.humanSeverity ?? f.automatedSeverity;
  return {
    status,
    severity,
    rationale: f.humanRationale ?? f.rationale,
    recommendation: f.humanRecommendation ?? f.recommendation,
    decision: f.humanDecision,
  };
}

// Resolve stored evidence ids into human-readable provenance rows
// (source type + name + locator + literal quote). Nothing is invented: an
// evidence id that no longer resolves is simply dropped, which in turn can
// make a finding provenance-less and therefore excluded from the report.
function buildProvenance(store: HimamStore, f: ReviewFinding): ReportEvidenceRef[] {
  const out: ReportEvidenceRef[] = [];
  for (const evId of f.evidenceIds) {
    const ev = store.extractedEvidence.find((e) => e.id === evId);
    if (!ev) continue;
    if (ev.status !== "confirmed" && ev.status !== "edited") continue;
    const src = store.sources.find((s) => s.id === ev.sourceId);
    out.push({
      evidenceId: ev.id,
      sourceId: ev.sourceId,
      sourceTypeLabelAr: src ? SOURCE_TYPE_LABELS_AR[src.type] : "مصدر غير معروف",
      sourceNameAr: src ? (src.manualTextArtifactId ? "نص مُدخَل يدويًا" : src.fileName) : "—",
      locatorLabelAr: locatorLabelAr(ev.locator),
      evidenceTypeLabelAr: EVIDENCE_TYPE_LABELS_AR[ev.evidenceType],
      quote: ev.exactQuote,
    });
  }
  return out;
}

function toItem(
  f: ReviewFinding,
  criterion: CriterionRecord | null,
  provenance: ReportEvidenceRef[],
): ReportFindingItem {
  const final = pickFinal(f)!;
  return {
    findingId: f.findingId,
    criterionId: f.criterionId,
    domainId: f.domainId,
    reviewLevel: f.reviewLevel,
    targetType: f.targetType,
    targetId: f.targetId,
    finalStatus: final.status,
    finalSeverity: final.severity,
    finalRationale: final.rationale,
    finalRecommendation: final.recommendation,
    limitations: criterion?.limitations ?? f.limitations,
    evidenceIds: [...f.evidenceIds],
    sourceIds: [...f.sourceIds],
    provenance,
    activationReason: f.activationReason,
    humanDecision: final.decision,
    uncertainty: f.uncertainty,
  };
}

// Deterministic executive summary built ONLY from already-approved items.
function buildExecutiveSummary(sections: GovernedReportSections): ReportExecutiveSummary {
  const head = (items: ReportFindingItem[]) =>
    items.slice(0, 5).map((i) => `${i.criterionId} — ${i.finalRationale}`);
  return {
    actionRequiredCount: sections.actionRequired.length,
    majorGapCount: sections.majorPlanGaps.length,
    qualityOpportunityCount: sections.qualityImprovements.length,
    needsClarificationCount: sections.needsClarificationItems.length,
    notReviewableCount: sections.notReviewableItems.length,
    actionRequiredHeadlinesAr: head(sections.actionRequired),
    majorGapHeadlinesAr: head(sections.majorPlanGaps),
    qualityOpportunityHeadlinesAr: head(sections.qualityImprovements),
    limitsAr: [...sections.limitations].slice(0, 8),
  };
}

export class GovernedReportService {
  private readonly versions: ReviewVersionService;

  constructor(private readonly repo: ReviewCaseRepository) {
    this.versions = new ReviewVersionService(repo);
  }

  // ---- Gates -----------------------------------------------------------

  canGenerateGovernedReport(caseId: string): ReportGateResult {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) return { ok: false, reason: "case_not_found" };
    if (c.status === "closed") return { ok: false, reason: "case_closed_read_only" };
    if (c.scopeNeedsReconfirmation)
      return { ok: false, reason: "scope_needs_reconfirmation" };
    if (c.extractionStage !== "extraction_confirmed")
      return { ok: false, reason: "extraction_not_confirmed" };
    const identity = store.identityChecks.find((i) => i.reviewCaseId === caseId);
    if (identity?.status === "conflicting")
      return { ok: false, reason: "identity_conflict_unresolved" };
    const current = store.reviewVersions
      .filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!current) return { ok: false, reason: "no_review_version" };
    if (!current.completedAt) return { ok: false, reason: "review_not_completed" };
    if (current.isStale) return { ok: false, reason: "review_stale" };
    const findings = store.reviewFindings.filter(
      (f) => f.reviewVersionId === current.versionId && !f.isStale,
    );
    const criticalPending = findings.find(
      (f) =>
        f.humanReviewStatus === "pending" &&
        f.automatedSeverity === "action_required_before_goal_approval",
    );
    if (criticalPending) return { ok: false, reason: "critical_findings_pending" };
    // Drift check against evidence.
    const evidence = store.extractedEvidence.filter(
      (e) => e.reviewCaseId === caseId && (e.status === "confirmed" || e.status === "edited"),
    );
    if (computeEvidenceDigest(evidence) !== current.evidenceDigest)
      return { ok: false, reason: "evidence_drift_detected" };
    return { ok: true };
  }

  // ---- Generate --------------------------------------------------------

  generateDraft(caseId: string, actorId: string | null = null): GovernedReportVersion {
    const gate = this.canGenerateGovernedReport(caseId);
    // Audit gate check regardless of outcome.
    {
      const s = this.repo.load();
      s.auditEvents.push(
        newAuditEvent(caseId, "report_gate_checked", {
          ok: gate.ok,
          reason: gate.ok ? null : gate.reason,
        }),
      );
      this.repo.save(s);
    }
    if (!gate.ok) throw new Error(`Report gate blocked: ${gate.reason}`);

    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId)!;
    const current = store.reviewVersions
      .filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const findings = store.reviewFindings.filter(
      (f) => f.reviewVersionId === current.versionId && !f.isStale,
    );
    const registry = getKnowledgeRegistry();

    // Supersede previous draft versions for this case+review (not finalized).
    for (const rv of store.reportVersions.filter(
      (r) => r.caseId === caseId && r.status === "draft",
    )) {
      rv.status = "superseded";
      rv.supersededAt = new Date().toISOString();
    }

    const sections: GovernedReportSections = {
      executiveSummary: {
        actionRequiredCount: 0,
        majorGapCount: 0,
        qualityOpportunityCount: 0,
        needsClarificationCount: 0,
        notReviewableCount: 0,
        actionRequiredHeadlinesAr: [],
        majorGapHeadlinesAr: [],
        qualityOpportunityHeadlinesAr: [],
        limitsAr: [],
      },
      actionRequired: [],
      majorPlanGaps: [],
      qualityImprovements: [],
      guidanceNotes: [],
      needsClarificationItems: [],
      notReviewableItems: [],
      excludedFindings: [],
      governanceStatement: GOVERNANCE_STATEMENT_AR,
      limitations: [],
    };

    for (const f of findings) {
      const crit = registry.criterion(f.criterionId);
      if (crit?.limitations && !sections.limitations.includes(crit.limitations)) {
        sections.limitations.push(crit.limitations);
      }
      if (f.humanReviewStatus !== "decided") {
        // Skip pending findings; the gate ensures no critical pending, and
        // non-critical pending are simply excluded from this draft.
        continue;
      }
      if (f.humanDecision === "reject") {
        sections.excludedFindings.push({
          findingId: f.findingId,
          criterionId: f.criterionId,
          reason: "rejected_by_reviewer",
        });
        continue;
      }
      if (f.humanDecision === "defer") {
        sections.excludedFindings.push({
          findingId: f.findingId,
          criterionId: f.criterionId,
          reason: "deferred",
        });
        continue;
      }
      if (f.humanDecision === "request_more_information") {
        if (f.humanIncludeInReport === false) continue;
        sections.needsClarificationItems.push(toItem(f, crit, buildProvenance(store, f)));
        continue;
      }
      // accept or modify
      const item = toItem(f, crit, buildProvenance(store, f));
      if (item.finalStatus === "not_applicable") {
        sections.excludedFindings.push({
          findingId: f.findingId,
          criterionId: f.criterionId,
          reason: "not_applicable",
        });
        continue;
      }
      if (item.finalStatus === "not_reviewable") {
        sections.notReviewableItems.push(item);
        continue;
      }
      if (item.finalStatus === "needs_clarification") {
        sections.needsClarificationItems.push(item);
        continue;
      }
      // Report contract §4 — a judgment with no traceable provenance is
      // never printed. It is logged in the governance record instead.
      if (item.provenance.length === 0) {
        sections.excludedFindings.push({
          findingId: f.findingId,
          criterionId: f.criterionId,
          reason: "no_provenance",
        });
        continue;
      }
      // Judgment sections by severity.
      switch (item.finalSeverity) {
        case "action_required_before_goal_approval":
          sections.actionRequired.push(item);
          break;
        case "major_plan_gap":
          sections.majorPlanGaps.push(item);
          break;
        case "quality_improvement":
          sections.qualityImprovements.push(item);
          break;
        case "guidance_note":
        case "no_judgment":
        default:
          sections.guidanceNotes.push(item);
          break;
      }
    }

    sections.executiveSummary = buildExecutiveSummary(sections);

    // Coverage snapshot.
    const decided = findings.filter((f) => f.humanReviewStatus === "decided");
    const coverage: GovernedReportCoverage = {
      activeCriteriaCount: findings.length,
      reviewedCriteriaCount: decided.length,
      pendingHumanDecisionCount: findings.length - decided.length,
      acceptedCount: decided.filter((f) => f.humanDecision === "accept").length,
      modifiedCount: decided.filter((f) => f.humanDecision === "modify").length,
      rejectedCount: decided.filter((f) => f.humanDecision === "reject").length,
      deferredCount: decided.filter((f) => f.humanDecision === "defer").length,
      requestedInfoCount: decided.filter((f) => f.humanDecision === "request_more_information")
        .length,
      notReviewableCount: findings.filter((f) => f.automatedStatus === "not_reviewable").length,
      notApplicableCount: findings.filter((f) => f.automatedStatus === "not_applicable").length,
    };

    // Scope summary from latest confirmed snapshot.
    const snap = store.scopeSnapshots
      .filter((s) => s.reviewCaseId === caseId && s.confirmedAt !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const scopeSummary: GovernedReportScopeSummary = {
      availableDomains: snap ? [...snap.availableDomains] : [],
      notReviewableDomains: snap ? [...snap.notReviewableDomains] : [],
      notApplicableDomains: snap ? [...snap.notApplicableDomains] : [],
      inputTypes: snap ? [...snap.inputTypes] : [],
    };

    const priorFinalized = store.reportVersions.filter(
      (r) => r.caseId === caseId && r.status !== "draft",
    );
    const versionNumber = priorFinalized.length + 1;
    const now = new Date().toISOString();

    const metadata: GovernedReportMetadata = {
      caseReferenceCode: c.referenceCode,
      caseIdShort: c.id.slice(0, 8),
      phaseId: c.phaseId,
      planType: c.planType,
      generatedAt: now,
      generatedBy: actorId,
      finalizedAt: null,
      finalizedBy: null,
      reviewVersionId: current.versionId,
      scopeSnapshotId: snap?.id ?? current.scopeSnapshotId,
      engineVersion: ENGINE_VERSION,
      reportEngineVersion: GOVERNED_REPORT_ENGINE_VERSION,
      knowledgePackageVersion: registry.packageVersion(),
    };

    const version: GovernedReportVersion = {
      reportVersionId: randomId(),
      caseId,
      reviewVersionId: current.versionId,
      versionNumber,
      status: "draft",
      createdAt: now,
      finalizedAt: null,
      finalizedBy: null,
      supersededAt: null,
      staleReason: null,
      metadata,
      scopeSummary,
      coverage,
      sections,
    };
    store.reportVersions.push(version);
    store.auditEvents.push(
      newAuditEvent(caseId, "report_draft_generated", {
        reportVersionId: version.reportVersionId,
        versionNumber,
      }),
    );
    this.repo.save(store);
    return version;
  }

  finalize(reportVersionId: string, actorId: string | null = null): GovernedReportVersion {
    const store = this.repo.load();
    const rv = store.reportVersions.find((r) => r.reportVersionId === reportVersionId);
    if (!rv) throw new Error("Report version not found");
    if (rv.status !== "draft") throw new Error(`Cannot finalize report in status ${rv.status}`);
    // Re-check the gate before finalizing (fresh check).
    const gate = this.canGenerateGovernedReport(rv.caseId);
    if (!gate.ok) throw new Error(`Report gate blocked at finalize: ${gate.reason}`);
    const now = new Date().toISOString();
    rv.status = "finalized";
    rv.finalizedAt = now;
    rv.finalizedBy = actorId;
    rv.metadata.finalizedAt = now;
    rv.metadata.finalizedBy = actorId;
    // Mark any older finalized reports as superseded.
    for (const other of store.reportVersions) {
      if (
        other.caseId === rv.caseId &&
        other.reportVersionId !== rv.reportVersionId &&
        other.status === "finalized"
      ) {
        other.status = "superseded";
        other.supersededAt = now;
      }
    }
    store.auditEvents.push(
      newAuditEvent(rv.caseId, "report_finalized", {
        reportVersionId: rv.reportVersionId,
        versionNumber: rv.versionNumber,
      }),
    );
    this.repo.save(store);
    return rv;
  }

  // Called when review re-runs or scope changes — flags any live draft as
  // stale so the reviewer must regenerate. Finalized reports stay in the
  // historical record but are also flagged stale for display.
  markReportsStale(caseId: string, reason: string): void {
    const store = this.repo.load();
    let touched = false;
    for (const rv of store.reportVersions) {
      if (rv.caseId !== caseId) continue;
      if (rv.status === "draft") {
        rv.status = "stale";
        rv.staleReason = reason;
        touched = true;
      } else if (rv.status === "finalized" && !rv.staleReason) {
        rv.staleReason = reason; // historical record retained
        touched = true;
      }
    }
    if (touched) {
      store.auditEvents.push(
        newAuditEvent(caseId, "report_marked_stale", { reason }),
      );
      this.repo.save(store);
    }
  }

  listForCase(caseId: string): GovernedReportVersion[] {
    return this.repo
      .load()
      .reportVersions.filter((r) => r.caseId === caseId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  latestFinalized(caseId: string): GovernedReportVersion | null {
    const list = this.listForCase(caseId).filter((r) => r.status === "finalized");
    return list[0] ?? null;
  }

  activeDraft(caseId: string): GovernedReportVersion | null {
    return this.listForCase(caseId).find((r) => r.status === "draft") ?? null;
  }

  getById(reportVersionId: string): GovernedReportVersion | null {
    return (
      this.repo.load().reportVersions.find((r) => r.reportVersionId === reportVersionId) ?? null
    );
  }

  compareVersions(caseId: string, aId: string, bId: string): ReportVersionDiff {
    const store = this.repo.load();
    const a = store.reportVersions.find((r) => r.reportVersionId === aId);
    const b = store.reportVersions.find((r) => r.reportVersionId === bId);
    if (!a || !b) throw new Error("Report version(s) not found");
    if (a.caseId !== caseId || b.caseId !== caseId)
      throw new Error("Report versions belong to a different case");
    const flatten = (rv: GovernedReportVersion): ReportFindingItem[] => [
      ...rv.sections.actionRequired,
      ...rv.sections.majorPlanGaps,
      ...rv.sections.qualityImprovements,
      ...rv.sections.guidanceNotes,
      ...rv.sections.needsClarificationItems,
      ...rv.sections.notReviewableItems,
    ];
    const aList = flatten(a);
    const bList = flatten(b);
    const aMap = new Map(aList.map((x) => [x.findingId, x]));
    const bMap = new Map(bList.map((x) => [x.findingId, x]));
    const added: string[] = [];
    const removed: string[] = [];
    const changed: { findingId: string; changes: string[] }[] = [];
    for (const [id, bi] of bMap) {
      const ai = aMap.get(id);
      if (!ai) added.push(id);
      else {
        const ch: string[] = [];
        if (ai.finalStatus !== bi.finalStatus) ch.push("status");
        if (ai.finalSeverity !== bi.finalSeverity) ch.push("severity");
        if (ai.humanDecision !== bi.humanDecision) ch.push("decision");
        if (ai.finalRationale !== bi.finalRationale) ch.push("rationale");
        if (ai.finalRecommendation !== bi.finalRecommendation) ch.push("recommendation");
        if (ch.length > 0) changed.push({ findingId: id, changes: ch });
      }
    }
    for (const [id] of aMap) if (!bMap.has(id)) removed.push(id);
    const scopeChanges: string[] = [];
    const setEq = (x: string[], y: string[]) =>
      x.length === y.length && x.every((v, i) => v === [...y].sort()[i]);
    const sa = [...a.scopeSummary.availableDomains].sort();
    const sb = [...b.scopeSummary.availableDomains].sort();
    if (!setEq(sa, sb)) scopeChanges.push("availableDomains");
    const coverageDelta: ReportVersionDiff["coverageDelta"] = {};
    (Object.keys(b.coverage) as (keyof GovernedReportCoverage)[]).forEach((k) => {
      const d = b.coverage[k] - a.coverage[k];
      if (d !== 0) coverageDelta[k] = d;
    });
    const s = this.repo.load();
    s.auditEvents.push(
      newAuditEvent(caseId, "report_version_compared", { a: aId, b: bId }),
    );
    this.repo.save(s);
    return { addedFindings: added, removedFindings: removed, changedFindings: changed, scopeChanges, coverageDelta };
  }

  canCloseCaseAfterReport(caseId: string): ReportGateResult {
    const store = this.repo.load();
    const c = store.cases.find((x) => x.id === caseId);
    if (!c) return { ok: false, reason: "case_not_found" };
    if (c.status === "closed") return { ok: false, reason: "case_closed_read_only" };
    const latest = this.latestFinalized(caseId);
    if (!latest) return { ok: false, reason: "no_review_version" };
    // Reject closing if any newer draft or the review has since drifted.
    if (latest.staleReason)
      return { ok: false, reason: "review_stale" };
    // Fresh drift check
    const current = store.reviewVersions
      .filter((v) => v.caseId === caseId && !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (current && current.versionId !== latest.reviewVersionId)
      return { ok: false, reason: "review_stale" };
    return { ok: true };
  }
}