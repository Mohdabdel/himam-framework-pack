import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AppShell, CaseService, REVIEW_PHASES, StageHeader, validatePlanFile } from "@/features/himam";
import type { ReviewPhaseId } from "@/features/himam";

export const Route = createFileRoute("/cases/new")({
  head: () => ({
    meta: [
      { title: "إنشاء حالة مراجعة — HIMAM" },
      {
        name: "description",
        content: "إنشاء حالة مراجعة جديدة برموز غير كاشفة للهوية.",
      },
      { property: "og:title", content: "إنشاء حالة مراجعة — HIMAM" },
      {
        property: "og:description",
        content: "إنشاء حالة مراجعة جديدة برموز غير كاشفة للهوية.",
      },
    ],
  }),
  component: NewCase,
});

const PHASE_LABELS: Record<ReviewPhaseId, string> = {
  early_intervention: "تدخل مبكر",
  preschool: "ما قبل المدرسة",
  elementary: "الابتدائية",
  middle: "المتوسطة",
  high_school: "الثانوية",
  adult_transition: "الانتقال للراشدين",
  postsecondary_employment: "ما بعد الثانوية/التوظيف",
};

function NewCase() {
  const navigate = useNavigate();
  const [age, setAge] = useState<string>("");
  const [phaseId, setPhaseId] = useState<ReviewPhaseId | "">("");
  const [planType, setPlanType] = useState("IEP");
  const [refCode, setRefCode] = useState("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fileValidation = useMemo(() => {
    if (!planFile) return null;
    return validatePlanFile({
      name: planFile.name,
      size: planFile.size,
      type: planFile.type,
    });
  }, [planFile]);
  const fileReady = fileValidation !== null && fileValidation.ok === true;

  const formatBytes = (n: number): string => {
    if (n < 1024) return `${n} بايت`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
    return `${(n / (1024 * 1024)).toFixed(2)} ميغابايت`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ageNum = age === "" ? null : Number(age);
    if (ageNum !== null && (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 100)) {
      setError("العمر يجب أن يكون بين 0 و100.");
      return;
    }
    if (ageNum === null && phaseId === "") {
      setError("أدخل العمر أو المرحلة (أحدهما إلزامي).");
      return;
    }
    const trimmedRef = refCode.trim();
    if (trimmedRef && trimmedRef.length < 3) {
      setError("المعرف المرجعي الاختياري يجب ألا يقل عن 3 محارف.");
      return;
    }
    if (!planFile) {
      setError("أرفق ملف الخطة الحالية لإكمال إنشاء الحالة.");
      return;
    }
    if (!fileValidation || fileValidation.ok !== true) {
      setError(
        fileValidation && !fileValidation.ok
          ? fileValidation.reason
          : "ملف الخطة غير صالح.",
      );
      return;
    }
    setBusy(true);
    try {
      const svc = new CaseService();
      const c = await svc.createCaseWithPlan({
        ageYears: ageNum,
        phaseId: (phaseId || null) as ReviewPhaseId | null,
        planType: planType || null,
        referenceCode: trimmedRef || undefined,
        file: planFile,
      });
      navigate({ to: "/cases/$caseId/sources", params: { caseId: c.id } });
    } catch (e) {
      setError((e as Error).message || "تعذّر إنشاء الحالة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell width="narrow">
      <StageHeader
        titleAr="إنشاء حالة مراجعة"
        stepIndicatorAr="الخطوة 1 من 8 — البيانات الأساسية"
        descriptionAr="لا يلزم إدخال اسم المتعلم؛ استخدم معرفًا داخليًا غير كاشف للهوية عند الحاجة."
        requiredNowAr="المطلوب الآن: ملف الخطة الحالية + العمر أو المرحلة (يكفي أحدهما)."
      />
      <form onSubmit={submit} className="mt-4 space-y-4" data-testid="new-case-form">
        <div
          role="note"
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          data-testid="privacy-line"
        >
          تُحفظ ملفاتك محليًا داخل المتصفح ولا تُرسل لأي خدمة خارجية.
        </div>
        <p className="text-[11px] text-muted-foreground" data-testid="diagnosis-note">
          لا يُشترط إدخال التشخيص لمراجعة الخطة، ولا يستخدمه النظام لاستنتاج القدرة.
        </p>

        <fieldset
          className="rounded-md border border-border p-3"
          data-testid="basics-fieldset"
        >
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            العمر أو المرحلة — يكفي إدخال أحدهما
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              العمر (سنوات)
            <input
              type="number"
              min={0}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              inputMode="numeric"
            />
            </label>
            <label className="block text-sm">
              المرحلة التعليمية
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value as ReviewPhaseId | "")}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— اختر —</option>
              {REVIEW_PHASES.map((p) => (
                <option key={p} value={p}>
                  {PHASE_LABELS[p]}
                </option>
              ))}
            </select>
            </label>
          </div>
        </fieldset>

        <fieldset
          className="rounded-md border border-border p-3"
          data-testid="optional-basics-fieldset"
        >
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            حقول اختيارية
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm" data-testid="field-plan-type-label">
              نوع الخطة
              <input
                type="text"
                data-testid="field-plan-type"
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm" data-testid="field-ref-code-label">
              معرف مرجعي داخلي (اختياري، غير كاشف للهوية)
              <input
                type="text"
                data-testid="field-ref-code"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="مثال: ST-2026-014"
              />
            </label>
          </div>
        </fieldset>

        <section
          className="rounded-md border-2 border-primary/30 bg-primary/5 p-4"
          data-testid="plan-upload-card"
        >
          <div className="mb-1 text-sm font-semibold">ملف الخطة الحالية</div>
          <div className="mb-3 text-xs text-muted-foreground">
            الصيغ المقبولة: PDF أو DOCX أو TXT. يُحفظ الملف محليًا داخل المتصفح.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            data-testid="plan-file-input"
            aria-hidden="true"
            tabIndex={-1}
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
          />
          {!planFile ? (
            <button
              type="button"
              data-testid="plan-file-picker"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              اختيار ملف الخطة
            </button>
          ) : (
            <div
              data-testid="plan-file-preview"
              className={`rounded-md border px-3 py-2 text-xs ${
                fileReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{planFile.name}</div>
                  <div className="mt-0.5 text-[11px]">
                    {planFile.type || "نوع غير محدد"} · {formatBytes(planFile.size)} ·{" "}
                    {fileReady
                      ? "جاهز للحفظ"
                      : fileValidation && !fileValidation.ok
                        ? fileValidation.reason
                        : "الملف غير صالح."}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="plan-file-clear"
                  onClick={() => {
                    setPlanFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-md border border-input px-2 py-1 text-[11px] hover:bg-accent"
                >
                  إزالة الاختيار
                </button>
              </div>
            </div>
          )}
          {planFile && fileReady && (
            <p
              className="mt-2 text-[11px] text-muted-foreground"
              data-testid="next-step-hint"
            >
              ستتمكن في الخطوة التالية من إضافة التقييم وأولويات الأسرة والمعلومات الأخرى عند
              توفرها.
            </p>
          )}
        </section>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={busy || !fileReady}
          data-testid="submit-create-case"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          إنشاء الحالة وحفظ الخطة
        </button>
      </form>
    </AppShell>
  );
}
