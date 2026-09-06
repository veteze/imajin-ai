/**
 * Derives `PrimitiveMatrix` props from the raw `docs/matrix-status.json` shape.
 *
 * Shared by the homepage (`app/page.tsx`) and the project pitch page
 * (`app/project/page.tsx`) so the cells/overall computation lives in exactly
 * one place (dedup — SonarCloud "duplication on new code").
 */

/**
 * A cell's status when it is something other than an ordinary percent-complete
 * backlog item. `named` (#2027, Revocation): the primitive's canonical seat is
 * ruled and stable, but no build work exists yet because no forcing use case
 * has arrived — not `planned`, not missing, just named ahead of the lived
 * experience. See `docs/matrix-status.json`'s `statusLegend` for the full text.
 */
export type CellStatus = 'named';

interface MatrixStatusCell {
  percent: number;
  status?: CellStatus;
}

export interface MatrixStatus {
  cells: Record<string, MatrixStatusCell>;
}

export interface MatrixCell {
  percent: number;
  status?: CellStatus;
}

export interface MatrixProps {
  cells: Record<string, MatrixCell>;
  overall: number;
}

export function toMatrixProps(data: MatrixStatus): MatrixProps {
  const entries = Object.entries(data.cells);
  const cells = Object.fromEntries(
    entries.map(([key, value]) => [key, { percent: value.percent, status: value.status }]),
  );
  const overall = Math.round(
    entries.reduce((sum, [, value]) => sum + value.percent, 0) / entries.length,
  );
  return { cells, overall };
}
