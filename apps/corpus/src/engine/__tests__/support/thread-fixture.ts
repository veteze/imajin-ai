import type { ThreadDocument } from '../../types';

/** Builds a minimal, valid `ThreadDocument` for tests, with sensible overridable defaults. */
export function thread(overrides: Partial<ThreadDocument> = {}): ThreadDocument {
  return {
    source: overrides.source ?? 'github:ima-jin/imajin-ai',
    sourceType: overrides.sourceType ?? 'github',
    id: overrides.id ?? '1',
    type: overrides.type ?? 'issue',
    title: overrides.title ?? 'Default title',
    state: overrides.state ?? 'open',
    labels: overrides.labels ?? [],
    author: overrides.author ?? 'octocat',
    created: overrides.created ?? '2026-08-09T15:00:00.000Z',
    updated: overrides.updated ?? '2026-08-09T16:00:00.000Z',
    linkedRefs: overrides.linkedRefs ?? [],
    body: overrides.body ?? 'Default body',
    comments: overrides.comments ?? [],
    resolution: overrides.resolution,
    url: overrides.url,
  };
}
