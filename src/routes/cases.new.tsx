import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
    setBusy(true);
    try {
      const svc = new CaseService();
      const c = svc.createCase({
        ageYears: ageNum,
        phaseId: (phaseId || null) as ReviewPhaseId | null,
        planType: planType || null,
        referenceCode: refCode || undefined,
      });
      if (planFile) {
        const v = validatePlanFile({
          name: planFile.name,
          size: planFile.size,
          type: planFile.type,
        });
        const src = svc.registerSource({
          reviewCaseId: c.id,
          type: "plan",
          fileName: planFile.name,
          mimeType: planFile.type || null,
          status: v.ok ? "registered" : v.status,
        });
        if (v.ok) {
          await svc.attachPlanFile(src.id, planFile);
        }
      }
      navigate({ to: "/cases/$caseId", params: { caseId: c.id } });
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
          ملف الخطة (PDF / DOCX / TXT)
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            سيُسجَّل الملف فقط. لا يوجد استخراج أو OCR أو AI في هذه الجولة.
          </span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={busy}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          إنشاء الحالة
        </button>
      </form>
    </div>
  );
}
