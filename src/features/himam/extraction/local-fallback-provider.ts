// Deterministic, offline, judgment-free fallback extractor.
//
// Governance: this provider NEVER invents text and NEVER issues a judgment.
// It only surfaces literal lines that already exist inside a stored chunk,
// tagged with a conservative EvidenceType guess. Every candidate is created
// as `pending` with low/medium confidence and must be confirmed by a human
// reviewer before it can influence anything downstream.

import type { EvidenceType, InputSourceType } from "../cases/case-types";
import { ALLOWED_EVIDENCE_TYPES } from "../evidence/evidence-service";
import type {
  EvidenceExtractionCandidate,
  EvidenceExtractionProvider,
  EvidenceExtractionProviderInput,
  ExtractionProviderAvailability,
  ExtractionProviderResult,
} from "./extraction-types";

export const LOCAL_FALLBACK_MODEL_NAME = "local_fallback_v1";
export const LOCAL_FALLBACK_LABEL_AR = "استخراج أولي محلي — يحتاج تأكيد المراجع";

// Ordered rules — the first matching rule wins for a given line. Order is
// deliberate: the more specific plan vocabulary comes before generic words.
interface FallbackRule {
  evidenceType: EvidenceType;
  // Arabic markers that commonly head a plan line.
  markers: string[];
  confidence: "low" | "medium";
  labelAr: string;
}

export const LOCAL_FALLBACK_RULES: FallbackRule[] = [
  {
    evidenceType: "baseline_statement",
    markers: ["مستوى الأداء الحالي", "الأداء الحالي", "خط الأساس", "الوضع الراهن"],
    confidence: "medium",
    labelAr: "مستوى أداء حالي / خط أساس",
  },
  {
    evidenceType: "need_statement",
    markers: ["الاحتياج", "احتياجات", "الاحتياجات", "الحاجة", "حاجات", "يحتاج"],
    confidence: "medium",
    labelAr: "احتياج",
  },
  {
    evidenceType: "progress_measure",
    markers: [
      "معيار الإتقان",
      "معيار القياس",
      "المعيار",
      "معيار",
      "طريقة القياس",
      "أسلوب القياس",
      "أساليب القياس",
      "أداة القياس",
    ],
    confidence: "medium",
    labelAr: "معيار أو أسلوب قياس",
  },
  {
    evidenceType: "plan_goal",
    markers: ["الهدف السنوي", "هدف سنوي", "الهدف قصير المدى", "الهدف:", "الأهداف", "هدف"],
    confidence: "medium",
    labelAr: "هدف في الخطة",
  },
  {
    evidenceType: "decision_rule",
    markers: ["المدة", "الإطار الزمني", "مدة التنفيذ", "تاريخ المراجعة", "بحلول"],
    confidence: "low",
    labelAr: "مدة أو إطار زمني",
  },
  {
    evidenceType: "accommodation",
    markers: ["التسهيلات", "تسهيلات", "التكييفات"],
    confidence: "low",
    labelAr: "تسهيلات",
  },
  {
    evidenceType: "support",
    markers: [
      "الدعم",
      "خدمات الدعم",
      "الخدمات المساندة",
      "الخدمة الداعمة",
      "الخدمات الداعمة",
      "جلسة",
      "جلسات",
    ],
    confidence: "low",
    labelAr: "دعم",
  },
  {
    evidenceType: "family_priority",
    markers: ["أولويات الأسرة", "أولوية الأسرة", "الأسرة ترغب", "تطلع الأسرة"],
    confidence: "medium",
    labelAr: "أولوية أسرة",
  },
  {
    evidenceType: "student_preference",
    markers: ["تفضيلات المتعلم", "تفضيل المتعلم", "يفضل المتعلم", "صوت المتعلم"],
    confidence: "medium",
    labelAr: "تفضيل المتعلم",
  },
  {
    evidenceType: "assessment_finding",
    markers: ["نتيجة التقييم", "نتائج التقييم", "التقييم"],
    confidence: "low",
    labelAr: "نتيجة تقييم",
  },
  {
    evidenceType: "professional_observation",
    markers: ["ملاحظة المختص", "ملاحظات المختص", "تقرير المختص"],
    confidence: "low",
    labelAr: "ملاحظة مهنية",
  },
  {
    evidenceType: "prior_goal",
    markers: ["الخطة السابقة", "الهدف السابق"],
    confidence: "low",
    labelAr: "هدف سابق",
  },
  {
    evidenceType: "prior_progress",
    markers: ["التقدم المحرز", "تقرير التقدم"],
    confidence: "low",
    labelAr: "تقدم سابق",
  },
];

const MIN_LINE_CHARS = 8;
const MAX_LINE_CHARS = 400;
export const LOCAL_FALLBACK_MAX_CANDIDATES = 40;

// Split a chunk into candidate lines. Every returned line is guaranteed to
// be a verbatim substring of `text` (we only trim whitespace at the edges,
// and a trimmed substring of a substring is still a substring).
export function splitCandidateLines(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.؟!])\s+/u)
    .map((l) => l.trim())
    .filter((l) => l.length >= MIN_LINE_CHARS && l.length <= MAX_LINE_CHARS);
}

export function classifyLine(
  line: string,
  sourceType: InputSourceType,
): { evidenceType: EvidenceType; confidence: "low" | "medium" } | null {
  const allowed = ALLOWED_EVIDENCE_TYPES[sourceType];
  for (const rule of LOCAL_FALLBACK_RULES) {
    if (!allowed.includes(rule.evidenceType)) continue;
    if (rule.markers.some((m) => line.includes(m))) {
      return { evidenceType: rule.evidenceType, confidence: rule.confidence };
    }
  }
  return null;
}

export function buildLocalFallbackCandidates(
  input: EvidenceExtractionProviderInput,
): EvidenceExtractionCandidate[] {
  const out: EvidenceExtractionCandidate[] = [];
  const seen = new Set<string>();
  for (const chunk of input.chunks) {
    for (const line of splitCandidateLines(chunk.text)) {
      if (out.length >= LOCAL_FALLBACK_MAX_CANDIDATES) return out;
      const cls = classifyLine(line, input.sourceType);
      if (!cls) continue;
      // Hard guarantee: never emit a quote that is not literally present.
      if (!chunk.text.includes(line)) continue;
      const key = `${chunk.sourceChunkId}::${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        sourceChunkId: chunk.sourceChunkId,
        evidenceType: cls.evidenceType,
        exactQuote: line,
        // normalizedText is a copy of the quote — no paraphrase, no inference.
        normalizedText: line,
        confidence: cls.confidence,
      });
    }
  }
  return out;
}

export class LocalFallbackExtractionProvider implements EvidenceExtractionProvider {
  readonly providerId = "local_fallback";
  availability(): Promise<ExtractionProviderAvailability> {
    return Promise.resolve("configured");
  }
  extract(input: EvidenceExtractionProviderInput): Promise<ExtractionProviderResult> {
    const candidates = buildLocalFallbackCandidates(input);
    return Promise.resolve({
      ok: true,
      candidates,
      modelName: LOCAL_FALLBACK_MODEL_NAME,
      errorCode: null,
      errorMessage: null,
    });
  }
}

// Chooses the server provider when it is actually configured, otherwise the
// deterministic local fallback. Never leaves the journey blocked.
export async function resolveExtractionProvider(
  server: EvidenceExtractionProvider,
): Promise<{ provider: EvidenceExtractionProvider; usedFallback: boolean }> {
  let availability: ExtractionProviderAvailability = "not_configured";
  try {
    availability = await server.availability();
  } catch {
    availability = "unavailable";
  }
  if (availability === "configured") return { provider: server, usedFallback: false };
  return { provider: new LocalFallbackExtractionProvider(), usedFallback: true };
}
