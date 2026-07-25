import type {
  EvidenceExtractionProvider,
  EvidenceExtractionProviderInput,
  ExtractionProviderAvailability,
  ExtractionProviderResult,
} from "./extraction-types";

// Test-only in-process provider. The real one lives behind the server route.
export class MockEvidenceExtractionProvider implements EvidenceExtractionProvider {
  readonly providerId = "mock";
  constructor(
    private readonly impl: (
      input: EvidenceExtractionProviderInput,
    ) => Promise<ExtractionProviderResult>,
    private readonly _availability: ExtractionProviderAvailability = "configured",
  ) {}
  availability(): Promise<ExtractionProviderAvailability> {
    return Promise.resolve(this._availability);
  }
  extract(input: EvidenceExtractionProviderInput): Promise<ExtractionProviderResult> {
    return this.impl(input);
  }
}

// Server-backed provider. Secrets live on the server; the browser POSTs the
// minimal payload to /api/himam/extract-evidence.
export class ServerEvidenceExtractionProvider implements EvidenceExtractionProvider {
  readonly providerId = "server";
  constructor(private readonly endpoint = "/api/himam/extract-evidence") {}
  async availability(): Promise<ExtractionProviderAvailability> {
    if (typeof fetch === "undefined") return "unavailable";
    try {
      const res = await fetch(`${this.endpoint}?probe=1`, { method: "GET" });
      if (!res.ok) return "unavailable";
      const data = (await res.json()) as { availability?: ExtractionProviderAvailability };
      return data.availability ?? "not_configured";
    } catch {
      return "unavailable";
    }
  }
  async extract(input: EvidenceExtractionProviderInput): Promise<ExtractionProviderResult> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return {
        ok: false,
        candidates: [],
        modelName: null,
        errorCode: `http_${res.status}`,
        errorMessage: null,
      };
    }
    return (await res.json()) as ExtractionProviderResult;
  }
}
