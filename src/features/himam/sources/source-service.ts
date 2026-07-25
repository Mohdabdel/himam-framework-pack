import type { InputSource, InputSourceStatus, InputSourceType } from "../cases/case-types";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export function validatePlanFile(file: {
  name: string;
  size: number;
  type: string;
}): { ok: true } | { ok: false; status: InputSourceStatus; reason: string } {
  if (!file.name) {
    return { ok: false, status: "file_missing", reason: "لم يتم اختيار ملف." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      status: "unreadable",
      reason: "حجم الملف يتجاوز الحد المسموح.",
    };
  }
  const name = file.name.toLowerCase();
  const okExt = name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".txt");
  const okMime = ALLOWED_MIME.has(file.type) || file.type === "" || okExt;
  if (!okExt && !okMime) {
    return {
      ok: false,
      status: "unreadable",
      reason: "صيغة الملف غير مدعومة (PDF/DOCX/TXT).",
    };
  }
  return { ok: true };
}

export function makeInputSourceStub(
  reviewCaseId: string,
  type: InputSourceType,
  file: { name: string; type: string },
  id: string,
): InputSource {
  return {
    id,
    reviewCaseId,
    type,
    fileName: file.name,
    mimeType: file.type || null,
    storagePath: null,
    sourceDate: null,
    status: "ready_for_future_ingestion",
    createdAt: new Date().toISOString(),
    extractionStage: "not_started",
    sourceHash: null,
    languageHint: null,
    unavailableResolution: null,
    manualTextArtifactId: null,
  };
}
