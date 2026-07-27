import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CaseService, REVIEW_PHASES, validatePlanFile } from "@/features/himam";
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
      navigate({ to: "/cases/$caseId", params: { caseId: c.id } });
    } catch (e) {
      setError((e as Error).message || "تعذّر إنشاء الحالة.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-6 py-10 font-sans">
      <h1 className="text-2xl font-bold">إنشاء حالة مراجعة</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        لا يلزم إدخال اسم المتعلم. استخدم معرفًا داخليًا غير كاشف للهوية عند الحاجة.
      </p>
      <div
        role="note"
        className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      >
        الحد الأدنى الإلزامي لبدء الحالة: ملف الخطة الحالية + (العمر أو المرحلة).
        يكفي إدخال أحدهما. باقي المصادر اختيارية ويمكن إضافتها لاحقًا.
      </div>
      <div
        role="note"
        className="mt-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        لا يُشترط إدخال التشخيص لمراجعة الخطة. وإذا ورد ضمن أحد المصادر يُستخدم كسياق وصفي فقط،
        ولا يستخدمه النظام لاستنتاج القدرة أو إصدار قرار أهلية.
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            العمر (سنوات)
            <input
              type="number"
              min={0}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            المرحلة
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
        <label className="block text-sm">
          نوع الخطة
          <input
            type="text"
            value={planType}
            onChange={(e) => setPlanType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          معرف مرجعي داخلي (اختياري، غير كاشف للهوية)
          <input
            type="text"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          ملف الخطة الحالية (PDF / DOCX / TXT) — إلزامي
          <input
            type="file"
            required
            data-testid="plan-file-input"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            سيُحفظ الملف محليًا بصورة خاصة داخل المتصفح، ثم يُستخدم لاحقًا في تجهيز النصوص.
          </span>
          {planFile && (
            <div
              data-testid="plan-file-preview"
              className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                fileReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="font-medium">{planFile.name}</div>
              <div>{formatBytes(planFile.size)}</div>
              <div className="mt-1">
                {fileReady
                  ? "جاهز للرفع"
                  : fileValidation && !fileValidation.ok
                    ? fileValidation.reason
                    : "الملف غير صالح."}
              </div>
            </div>
          )}
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={busy || !fileReady}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          إنشاء الحالة
        </button>
      </form>
    </div>
  );
}
