import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  DOMAIN_LABELS_AR,
  FINDING_SEVERITY_LABELS_AR,
  FINDING_STATUS_LABELS_AR,
  GovernedReportService,
  CaseService,
  INPUT_IMPACTS,
  describeInputAbsenceForReport,
  formatArabicDate,
  getDefaultRepository,
  phaseLabelAr,
  StageHeader,
  shortCaseId,
} from "@/features/himam";
import type { InputImpactKey } from "@/features/himam";
import type {
  GovernedReportVersion,
  ReportFindingItem,
  ReportGateResult,
  ReviewCase,
} from "@/features/himam";

export const Route = createFileRoute("/cases/$caseId/report")({
  head: () => ({
    meta: [
      { title: "التقرير المحكوم — HIMAM" },
      {
        name: "description",
        content: "توليد ومراجعة نسخ التقرير المحكوم للحالة داخل HIMAM.",
      },
      { property: "og:title", content: "التقرير المحكوم — HIMAM" },
      {
        property: "og:description",
        content: "توليد ومراجعة نسخ التقرير المحكوم للحالة داخل HIMAM.",
      },
    ],
  }),
  component: ReportScreen,
});

const GATE_LABELS_AR: Record<string, string> = {
  case_not_found: "الحالة غير موجودة",
  no_review_version: "لا توجد نسخة مراجعة",
  review_not_completed: "المراجعة لم تُختم بعد",
  review_stale: "نسخة المراجعة قديمة — أعد تشغيل المحرك",
  scope_needs_reconfirmation: "نطاق المراجعة يحتاج إعادة تأكيد",
  extraction_not_confirmed: "لم يُختم تأكيد الاستخراج",
  identity_conflict_unresolved: "يوجد تعارض هوية غير محلول",
  critical_findings_pending: "توجد ملاحظات حرجة بدون قرار",
  evidence_drift_detected: "تغيّرت الأدلة المؤكدة بعد تشغيل المحرك",
  case_closed_read_only: "الحالة مغلقة — للقراءة فقط",
};

function useServices() {
  return useMemo(() => {
    const repo = getDefaultRepository();
    return {
      repo,
      report: new GovernedReportService(repo),
      cases: new CaseService(repo),
    };
  }, []);
}

function ItemCard({ item }: { item: ReportFindingItem }) {
  return (
    <li className="rounded-md border border-border p-3 text-sm print:break-inside-avoid">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{item.criterionId}</span>
        <span>·</span>
        <span>{DOMAIN_LABELS_AR[item.domainId] ?? item.domainId}</span>
        <span>·</span>
        <span>{FINDING_STATUS_LABELS_AR[item.finalStatus]}</span>
        <span>·</span>
        <span>{FINDING_SEVERITY_LABELS_AR[item.finalSeverity]}</span>
      </div>
      <p className="mb-1">{item.finalRationale}</p>
      {item.finalRecommendation && (
        <p className="text-muted-foreground">
          <span className="font-medium">التوصية:</span> {item.finalRecommendation}
        </p>
      )}
      {item.limitations && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">القيود:</span> {item.limitations}
        </p>
      )}
      {item.sourceIds.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          مصادر: {item.sourceIds.length} · أدلة: {item.evidenceIds.length}
        </p>
      )}
    </li>
  );
}

function Section({
  title,
  items,
  emptyLabel,
  testId,
}: {
  title: string;
  items: ReportFindingItem[];
  emptyLabel: string;
  testId: string;
}) {
  return (
    <section className="mb-6" data-testid={testId}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <ItemCard key={it.findingId} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportScreen() {
  const { caseId } = Route.useParams();
  const services = useServices();
  const [c, setC] = useState<ReviewCase | null>(null);
  const [gate, setGate] = useState<ReportGateResult | null>(null);
  const [versions, setVersions] = useState<GovernedReportVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const svc = services.cases;
    setC(svc.get(caseId));
    setGate(services.report.canGenerateGovernedReport(caseId));
    const list = services.report.listForCase(caseId);
    setVersions(list);
    setActiveId((prev) => prev ?? list[0]?.reportVersionId ?? null);
  }, [caseId, services]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = versions.find((v) => v.reportVersionId === activeId) ?? versions[0] ?? null;

  const onGenerate = () => {
    setError(null);
    try {
      const v = services.report.generateDraft(caseId);
      setActiveId(v.reportVersionId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onFinalize = () => {
    if (!active) return;
    setError(null);
    try {
      services.report.finalize(active.reportVersionId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onClose = () => {
    setError(null);
    try {
      services.cases.closeCaseAfterFinalReport(caseId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onPrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  if (!c) {
    return (
      <AppShell width="regular">
        <p className="text-sm text-muted-foreground">الحالة غير موجودة.</p>
      </AppShell>
    );
  }

  return (
    <AppShell width="regular" className="himam-report">
      <div className="no-print">
        <StageHeader
          caseCodeAr={c.referenceCode}
          titleAr="التقرير المحكوم"
          stepIndicatorAr="الخطوة 7 من 8"
          descriptionAr="توليد ومراجعة نسخ التقرير المحكوم قبل الإغلاق النهائي."
          requiredNowAr="ولّد مسودة جديدة، ثم اعتمدها لإغلاق الحالة."
          trailing={
            <Link to="/cases/$caseId" params={{ caseId }} className="text-sm underline">
              العودة للحالة
            </Link>
          }
        />
      </div>

      <div
        className="no-print mb-6 flex flex-wrap items-center gap-2"
        data-testid="report-actions"
      >
        <button
          type="button"
          onClick={onGenerate}
          disabled={!gate?.ok}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          data-testid="generate-report-btn"
        >
          توليد مسودة جديدة
        </button>
        <button
          type="button"
          onClick={onFinalize}
          disabled={!active || active.status !== "draft"}
          className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
          data-testid="finalize-report-btn"
        >
          اعتماد التقرير
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="rounded-md border border-input px-3 py-1.5 text-sm"
          data-testid="print-report-btn"
        >
          طباعة / حفظ PDF
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={c.status === "closed"}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
          data-testid="close-case-btn"
        >
          إغلاق الحالة بعد التقرير
        </button>
      </div>

      {gate && !gate.ok && (
        <div
          className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="report-gate-blocker"
        >
          لا يمكن توليد التقرير حاليًا: {GATE_LABELS_AR[gate.reason] ?? gate.reason}
        </div>
      )}
      {error && (
        <p className="no-print mb-4 text-sm text-destructive" data-testid="report-error">
          {error}
        </p>
      )}

      {versions.length > 1 && (
        <div className="no-print mb-4" data-testid="report-versions-list">
          <label className="text-xs text-muted-foreground">اختيار النسخة: </label>
          <select
            value={active?.reportVersionId ?? ""}
            onChange={(e) => setActiveId(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {versions.map((v) => (
              <option key={v.reportVersionId} value={v.reportVersionId}>
                نسخة {v.versionNumber} — {v.status} — {formatArabicDate(v.createdAt)}
              </option>
            ))}
          </select>
        </div>
      )}

      {!active ? (
        <p className="text-sm text-muted-foreground">لم تُولَّد أي نسخة تقرير بعد.</p>
      ) : (
        <>
          <section className="mb-6 rounded-md border border-border p-4" data-testid="report-metadata">
            <h2 className="mb-2 text-lg font-semibold">هوية التقرير</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">رقم الحالة</dt>
                <dd>{active.metadata.caseReferenceCode}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">المعرّف المختصر</dt>
                <dd>{shortCaseId(c)}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">المرحلة</dt>
                <dd>{phaseLabelAr(c.phaseId)}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">نوع الخطة</dt>
                <dd>{c.planType ?? "غير محدد"}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">رقم نسخة التقرير</dt>
                <dd>{active.versionNumber}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">حالة النسخة</dt>
                <dd>{active.status}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">تاريخ التوليد</dt>
                <dd>{formatArabicDate(active.createdAt)}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">تاريخ الاعتماد</dt>
                <dd>{active.finalizedAt ? formatArabicDate(active.finalizedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">إصدار المعرفة</dt>
                <dd>{active.metadata.knowledgePackageVersion}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <dt className="text-muted-foreground">إصدار المحرك</dt>
                <dd>{active.metadata.engineVersion}</dd>
              </div>
            </dl>
            {active.staleReason && (
              <p className="mt-2 text-xs text-amber-800">
                هذه النسخة قديمة: {active.staleReason}
              </p>
            )}
          </section>

          <section className="mb-6 rounded-md border border-border p-4" data-testid="report-scope">
            <h2 className="mb-2 text-lg font-semibold">نطاق المراجعة</h2>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="font-medium">المدخلات المتاحة</div>
                <div className="text-muted-foreground">
                  {active.scopeSummary.inputTypes.join("، ") || "—"}
                </div>
              </div>
              <div>
                <div className="font-medium">المجالات المتاحة</div>
                <div className="text-muted-foreground">
                  {active.scopeSummary.availableDomains.join("، ") || "—"}
                </div>
              </div>
              <div>
                <div className="font-medium">مجالات غير قابلة للمراجعة</div>
                <div className="text-muted-foreground">
                  {active.scopeSummary.notReviewableDomains.join("، ") || "—"}
                </div>
              </div>
              <div>
                <div className="font-medium">مجالات غير منطبقة</div>
                <div className="text-muted-foreground">
                  {active.scopeSummary.notApplicableDomains.join("، ") || "—"}
                </div>
              </div>
            </div>
          </section>

          <section
            className="mb-6 rounded-md border border-border p-4"
            data-testid="report-inputs-impact"
          >
            <h2 className="mb-2 text-lg font-semibold">
              المدخلات المتاحة وغير المتاحة وأثرها على المراجعة
            </h2>
            <ul className="space-y-2 text-sm">
              {(
                [
                  "assessment",
                  "family_priorities",
                  "student_preferences",
                  "supports",
                  "professional_notes",
                  "prior_plan",
                  "prior_progress",
                ] as InputImpactKey[]
              ).map((key) => {
                const impact = INPUT_IMPACTS[key];
                const present = active.scopeSummary.inputTypes.includes(key);
                return (
                  <li
                    key={key}
                    className="rounded-md border border-border/60 p-2 print:break-inside-avoid"
                    data-input-impact={key}
                  >
                    <div className="mb-0.5 flex items-center gap-2 text-xs">
                      <span className="font-medium">{impact.titleAr}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 ${
                          present
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {present ? "متاح" : "غير متاح"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {present ? impact.whenPresentAr : describeInputAbsenceForReport(key)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mb-6 rounded-md border border-border p-4" data-testid="report-coverage">
            <h2 className="mb-2 text-lg font-semibold">تغطية المراجعة</h2>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>معايير مُفعَّلة: {active.coverage.activeCriteriaCount}</div>
              <div>تمت مراجعتها: {active.coverage.reviewedCriteriaCount}</div>
              <div>بانتظار قرار: {active.coverage.pendingHumanDecisionCount}</div>
              <div>مقبولة: {active.coverage.acceptedCount}</div>
              <div>مُعدَّلة: {active.coverage.modifiedCount}</div>
              <div>مرفوضة: {active.coverage.rejectedCount}</div>
              <div>مؤجَّلة: {active.coverage.deferredCount}</div>
              <div>تحتاج توضيحًا: {active.coverage.requestedInfoCount}</div>
              <div>غير قابلة للمراجعة: {active.coverage.notReviewableCount}</div>
              <div>غير منطبقة: {active.coverage.notApplicableCount}</div>
            </div>
          </section>

          <Section
            title="نقاط تتطلب معالجة قبل اعتماد أهداف محددة"
            items={active.sections.actionRequired}
            emptyLabel="لا توجد ملاحظات حرجة."
            testId="section-action-required"
          />
          <Section
            title="الفجوات الجوهرية على مستوى الخطة"
            items={active.sections.majorPlanGaps}
            emptyLabel="لا فجوات جوهرية."
            testId="section-major-gaps"
          />
          <Section
            title="فرص تحسين الجودة"
            items={active.sections.qualityImprovements}
            emptyLabel="لا توجد فرص تحسين مسجَّلة."
            testId="section-quality"
          />
          <Section
            title="ملاحظات إرشادية"
            items={active.sections.guidanceNotes}
            emptyLabel="لا توجد ملاحظات إرشادية."
            testId="section-guidance"
          />
          <Section
            title="عناصر تحتاج توضيحًا"
            items={active.sections.needsClarificationItems}
            emptyLabel="لا توجد عناصر بحاجة إلى توضيح."
            testId="section-needs-clarification"
          />
          <Section
            title="عناصر غير قابلة للمراجعة"
            items={active.sections.notReviewableItems}
            emptyLabel="لا شيء."
            testId="section-not-reviewable"
          />

          <section className="mb-6 rounded-md border border-border p-4" data-testid="section-governance">
            <h2 className="mb-2 text-lg font-semibold">حوكمة التقرير</h2>
            <p className="text-sm text-muted-foreground">{active.sections.governanceStatement}</p>
            {active.sections.limitations.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium">القيود:</div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {active.sections.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {active.sections.excludedFindings.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium">ملاحظات مستبعدة (سجلّ حوكمة):</div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {active.sections.excludedFindings.map((x) => (
                    <li key={x.findingId}>
                      {x.criterionId} — {x.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}