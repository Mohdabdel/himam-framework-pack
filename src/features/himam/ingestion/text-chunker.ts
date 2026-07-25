import type { TextChunk } from "../cases/case-types";
import { sha256Hex } from "./hash";

export interface PageInput {
  pageNumber: number | null;
  text: string;
}

// Split a document's pages into paragraph-sized chunks with globally stable
// character offsets. Chunk ids are content-addressed (sha256 of sourceId +
// order + text) so re-running ingestion on the same bytes produces the same
// chunk ids — evidence bound to a chunk survives a re-ingest.
export async function buildChunks(
  sourceId: string,
  artifactId: string,
  pages: PageInput[],
): Promise<TextChunk[]> {
  const chunks: TextChunk[] = [];
  let order = 0;
  let globalOffset = 0;
  for (const page of pages) {
    const raw = page.text;
    const paragraphs = raw.split(/\n\s*\n/);
    let cursor = 0;
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) {
        cursor += p.length + 2;
        continue;
      }
      const localStart = raw.indexOf(trimmed, cursor);
      const localEnd = localStart + trimmed.length;
      const chunkId = (await sha256Hex(`${sourceId}:${order}:${trimmed}`)).slice(0, 16);
      chunks.push({
        chunkId,
        sourceId,
        artifactId,
        order,
        text: trimmed,
        charOffsetStart: globalOffset + localStart,
        charOffsetEnd: globalOffset + localEnd,
        pageNumber: page.pageNumber,
      });
      cursor = localEnd;
      order++;
    }
    globalOffset += raw.length + 2;
  }
  return chunks;
}