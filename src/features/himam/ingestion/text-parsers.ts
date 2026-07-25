import type { PageInput } from "./text-chunker";

// Result of trying to convert a Blob into text. `text_unavailable` covers
// scanned PDFs, empty documents, and unsupported file kinds. No image recognition is
// attempted anywhere in Package 1B.
export type ExtractionOutcome =
  | { kind: "text"; pages: PageInput[]; byteSize: number }
  | { kind: "text_unavailable"; reason: string };

export type DocumentKind = "txt" | "docx" | "pdf" | "unknown";

export interface DocumentTextExtractor {
  extract(blob: Blob, mimeType: string | null, fileName: string): Promise<ExtractionOutcome>;
}

export type PdfPageExtractor = (
  blob: Blob,
) => Promise<{ pageNumber: number; text: string }[]>;
export type DocxTextExtractor = (blob: Blob) => Promise<string>;

export function guessDocumentKind(mime: string | null, fileName: string): DocumentKind {
  const n = fileName.toLowerCase();
  if (n.endsWith(".txt") || mime === "text/plain") return "txt";
  if (
    n.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (n.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  return "unknown";
}

async function readTxt(blob: Blob): Promise<ExtractionOutcome> {
  const text = await blob.text();
  if (!text.trim()) return { kind: "text_unavailable", reason: "empty_text" };
  return {
    kind: "text",
    pages: [{ pageNumber: null, text }],
    byteSize: blob.size,
  };
}

// The default extractor accepts injected PDF/DOCX page extractors so tests
// never load the heavy mammoth/pdfjs bundles. In the browser the fallbacks
// dynamically import the real libraries only when needed.
export class DefaultDocumentTextExtractor implements DocumentTextExtractor {
  constructor(
    private readonly pdfExtractor: PdfPageExtractor = defaultPdfExtractor,
    private readonly docxExtractor: DocxTextExtractor = defaultDocxExtractor,
  ) {}

  async extract(blob: Blob, mime: string | null, name: string): Promise<ExtractionOutcome> {
    const kind = guessDocumentKind(mime, name);
    if (kind === "txt") return readTxt(blob);
    if (kind === "docx") {
      const text = await this.docxExtractor(blob);
      if (!text.trim()) return { kind: "text_unavailable", reason: "empty_docx" };
      return {
        kind: "text",
        pages: [{ pageNumber: null, text }],
        byteSize: blob.size,
      };
    }
    if (kind === "pdf") {
      const pages = await this.pdfExtractor(blob);
      const combined = pages.map((p) => p.text).join("").trim();
      if (!combined) {
        // No text layer at all — treat as a scanned PDF and stop; image recognition is
        // explicitly out of scope for Package 1B.
        return { kind: "text_unavailable", reason: "scanned_or_empty_pdf" };
      }
      return {
        kind: "text",
        pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
        byteSize: blob.size,
      };
    }
    return { kind: "text_unavailable", reason: "unsupported_kind" };
  }
}

async function defaultDocxExtractor(blob: Blob): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = await blob.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value;
}

async function defaultPdfExtractor(
  blob: Blob,
): Promise<{ pageNumber: number; text: string }[]> {
  // Dynamic import — pdfjs is a browser library and should never load in the
  // vitest node runtime.
  const pdfjs = (await import(
    /* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs"
  )) as typeof import("pdfjs-dist");
  const buf = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: { pageNumber: number; text: string }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    pages.push({ pageNumber: i, text });
  }
  return pages;
}