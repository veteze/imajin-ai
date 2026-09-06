import { describe, it, expect } from 'vitest';
import { toMatrixProps } from '../matrix';
import type { MatrixStatus } from '../matrix';

describe('toMatrixProps', () => {
  it('carries percent-only cells through unchanged (status stays undefined)', () => {
    const data: MatrixStatus = {
      cells: {
        'Actor×Attestation': { percent: 80 },
        'Actor×Communication': { percent: 40 },
      },
    };

    const { cells, overall } = toMatrixProps(data);

    expect(cells['Actor×Attestation']).toEqual({ percent: 80, status: undefined });
    expect(cells['Actor×Communication']).toEqual({ percent: 40, status: undefined });
    expect(overall).toBe(60);
  });

  it("preserves a 'named' status (#2027, Revocation) alongside its percent", () => {
    const data: MatrixStatus = {
      cells: {
        'Actor×Revocation': { percent: 0, status: 'named' },
      },
    };

    const { cells } = toMatrixProps(data);

    expect(cells['Actor×Revocation']).toEqual({ percent: 0, status: 'named' });
  });

  it("includes 'named' cells in the overall completion average like any other cell", () => {
    const data: MatrixStatus = {
      cells: {
        'Actor×Attestation': { percent: 100 },
        'Actor×Revocation': { percent: 0, status: 'named' },
      },
    };

    const { overall } = toMatrixProps(data);

    expect(overall).toBe(50);
  });
});
