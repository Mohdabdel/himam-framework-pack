import type { TextChunk, TextLocator } from "../cases/case-types";
import { sha256Hex } from "./hash";

export interface PageInput {
  pageNumber: number | null;
  text: string;
  // Optional explicit locator hint from a source-specific parser. When
  // absent, one is derived from pageNumber (pdf_page) or the line range
  // (text_lines).
  locatorKind?: "pdf_page" | "docx_paragraph" | "text_lines" | "manual_text";
  manualSectionId?: string;
}

export interface BuildChunksOptions {
  sourceHash?: string;
}

// Chunk ids are content-addressed (sha256 of sourceId + sourceHash + locator +
// text) so re-running ingestion on the same bytes produces the same chunk
// ids — evidence bound to a chunk survives a re-ingest.
export async function buildChunks(
  sourceId: string,
  artifactId: string,
  pages: PageInput[],
  options: BuildChunksOptions = {},
): Promise<TextChunk[]> {
  const chunks: TextChunk[] = [];
  let order = 0;
  let globalOffset = 0;
  let globalLine = 0;
  const sourceHash = options.sourceHash ?? "";
  for (const page of pages) {
    const raw = page.text;
    const paragraphs = raw.split(/\n\s*\n/);
    let cursor = 0;
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) {
        cursor += p.length + 2;
        globalLine += (p.match(/\n/g)?.length ?? 0) + 1;
        continue;
      }
      const localStart = raw.indexOf(trimmed, cursor);
      const localEnd = localStart + trimmed.length;
      const preceding = raw.slice(0, localStart);
      const lineStart = globalLine + (preceding.match(/\n/g)?.length ?? 0);
      const lineEnd = lineStart + (trimmed.match(/\n/g)?.length ?? 0);
      let locator: TextLocator;
      const kind = page.locatorKind;
      if (kind === "docx_paragraph") {
        locator = { kind: "docx_paragraph", paragraphIndex: order };
      } else if (kind === "manual_text") {
        locator = {
          kind: "manual_text",
          sectionId: page.manualSectionId ?? "manual",
        };
      } else if (page.pageNumber !== null && kind !== "text_lines") {
        locator = { kind: "pdf_page", pageNumber: page.pageNumber };
      } else {
        locator = { kind: "text_lines", lineStart, lineEnd };
      }
      const textHash = (await sha256Hex(trimmed)).slice(0, 16);
      const chunkId = (
        await sha256Hex(`${sourceId}:${sourceHash}:${order}:${JSON.stringify(locator)}:${trimmed}`)
      ).slice(0, 16);
      chunks.push({
        chunkId,
        sourceId,
        artifactId,
        order,
        text: trimmed,
        charOffsetStart: globalOffset + localStart,
        charOffsetEnd: globalOffset + localEnd,
        pageNumber: page.pageNumber,
        locator,
        textHash,
      });
      cursor = localEnd;
      order++;
    }
    globalOffset += raw.length + 2;
    globalLine += (raw.match(/\n/g)?.length ?? 0) + 1;
  }
  return chunks;
}
