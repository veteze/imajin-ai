import type { ThreadDocument } from './types';

export interface ThreadChunk {
  title: string;
  body: string;
  comments: string;
  searchText: string;
}

export function chunkThread(document: ThreadDocument): ThreadChunk {
  // Thread-aware chunking: the unit is the full thread. Only genuinely
  // content-bearing fields are indexed for full-text relevance — title,
  // body, and comments — per the spec. Structured metadata (source, type,
  // labels, author, resolution) is stored in dedicated columns and used for
  // filtering/boosting instead, so it doesn't pollute BM25 term matching.
  const comments = document.comments.map(comment => comment.body).join('\n\n');
  const searchText = [document.title, document.body, comments].filter(Boolean).join('\n\n');

  return {
    title: document.title,
    body: document.body,
    comments,
    searchText,
  };
}

export function collectEvidenceText(document: ThreadDocument): string {
  const chunk = chunkThread(document);
  return chunk.searchText;
}

export interface EmbeddingChunk {
  /** 0-based position of this chunk within the thread's embedding chunks. */
  chunkNo: number;
  text: string;
}

/** Default window size for `chunkForEmbedding` — comfortably inside bge-m3's context window. */
export const DEFAULT_EMBEDDING_CHUNK_CHARS = 3000;

/**
 * Splits a thread's searchable text (#1601/#1599) into fixed-size,
 * non-overlapping windows suitable for the PGX embedder, breaking on
 * paragraph boundaries where possible so a chunk doesn't split mid-sentence.
 * Returns an empty array for a thread with no indexable text at all — there
 * is nothing to embed.
 */
export function chunkForEmbedding(document: ThreadDocument, maxChunkChars = DEFAULT_EMBEDDING_CHUNK_CHARS): EmbeddingChunk[] {
  const text = collectEvidenceText(document).trim();
  if (!text) {
    return [];
  }

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChunkChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }

    // A single paragraph longer than the window on its own: hard-split it.
    while (current.length > maxChunkChars) {
      chunks.push(current.slice(0, maxChunkChars));
      current = current.slice(maxChunkChars);
    }
  }
  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunkText, chunkNo) => ({ chunkNo, text: chunkText }));
}
