// UX round — shared journey state for every /cases/$caseId/* screen.
// Presentation-only: reads the existing repository and reuses the existing
// journey/next-action resolvers. Adds no new business rules.
import { useCallback, useEffect, useState } from "react";
import { CaseService } from "../cases/case-service";
import { getDefaultRepository } from "../cases/case-repository";
import { resolveCaseNextAction, type CaseNextAction } from "../cases/case-next-action";
import {
  computeJourneyStatuses,
  JOURNEY_STEPS,
  type JourneyStepId,
  type JourneyStepStatus,
} from "../scope/input-impact";
import type { ReviewCase } from "../cases/case-types";

export interface CaseJourneyState {
  loading: boolean;
  reviewCase: ReviewCase | null;
  statuses: JourneyStepStatus[];
  nextAction: CaseNextAction | null;
  refresh: () => void;
}

export const JOURNEY_STEP_HREF: Record<JourneyStepId, string | null> = {
  basics: null,
  sources: "/cases/$caseId/sources",
  text: "/cases/$caseId/ingestion",
  evidence: "/cases/$caseId/extraction",
  scope: "/cases/$caseId/scope",
  review: "/cases/$caseId/review",
  report: "/cases/$caseId/report",
  closure: "/cases/$caseId/report",
};

export function journeyStepIndex(step: JourneyStepId): number {
  return JOURNEY_STEPS.findIndex((s) => s.id === step);
}

export function useCaseJourney(caseId: string): CaseJourneyState {
  const [loading, setLoading] = useState(true);
  const [reviewCase, setReviewCase] = useState<ReviewCase | null>(null);
  const [statuses, setStatuses] = useState<JourneyStepStatus[]>([]);
  const [nextAction, setNextAction] = useState<CaseNextAction | null>(null);

  const read = useCallback(() => {
    const repo = getDefaultRepository();
    const svc = new CaseService(repo);
    const c = svc.get(caseId);
    const store = repo.load();
    const sources = store.sources.filter((s) => s.reviewCaseId === caseId);
    const evidence = store.extractedEvidence.filter((e) => e.reviewCaseId === caseId);
    const versions = store.reviewVersions.filter((v) => v.caseId === caseId);
    const live = versions
      .filter((v) => !v.isStale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const reports = store.reportVersions.filter((r) => r.caseId === caseId);
    const finalReport = reports.find((r) => r.status === "finalized") ?? null;
    setReviewCase(c);
    setStatuses(
      computeJourneyStatuses({
        reviewCase: c,
        hasReadyPlan: sources.some(
          (s) => s.type === "plan" && s.status === "ready_for_future_ingestion",
        ),
        sourcesCount: sources.length,
        textReadyCount: sources.filter((s) => s.extractionStage === "text_extracted").length,
        pendingEvidenceCount: evidence.filter((e) => e.status === "pending").length,
        confirmedEvidenceCount: evidence.filter(
          (e) => e.status === "confirmed" || e.status === "edited",
        ).length,
        reviewFinalized: !!live?.completedAt,
        reviewStale: versions.length > 0 && !live,
        reportFinalized: !!finalReport,
        reportStale: reports.some((r) => r.status === "stale") && !finalReport,
      }),
    );
    setNextAction(resolveCaseNextAction(caseId, repo));
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    read();
  }, [read]);

  return { loading, reviewCase, statuses, nextAction, refresh: read };
}
