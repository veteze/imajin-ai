'use client';

import type { MatrixCell } from './matrix';

const SCOPES = ['Actor', 'Family', 'Community', 'Business'];
const PRIMITIVES = ['Attestation', 'Communication', 'Attribution', 'Settlement', 'Discovery', 'Revocation'];
const SCOPE_ICONS = ['◆', '◇', '○', '□'];

// Diagonal hatch, distinct from the amber completion gradient below — a
// 'named' cell (#2027, Revocation) is not an ordinary 0%, unstarted-backlog
// cell: the primitive's canonical seat is ruled and stable, the build just
// waits on the forcing use case.
const NAMED_CELL_BG =
  'repeating-linear-gradient(45deg, rgba(148,163,184,0.16) 0, rgba(148,163,184,0.16) 3px, transparent 3px, transparent 7px)';
const NAMED_STATUS_LABEL = 'named — canonical seat, build awaits the forcing use case';

function barBg(pct: number): string {
  if (pct === 0) return 'transparent';
  if (pct < 20) return 'rgba(245,158,11,0.3)';
  if (pct < 50) return 'rgba(245,158,11,0.5)';
  if (pct < 75) return 'rgba(245,158,11,0.7)';
  return 'rgba(245,158,11,0.9)';
}

function glowClass(pct: number): string {
  if (pct >= 75) return 'shadow-[0_0_8px_rgba(245,158,11,0.3)]';
  if (pct >= 50) return 'shadow-[0_0_4px_rgba(245,158,11,0.15)]';
  return '';
}

function cellBackground(cell: MatrixCell | undefined): string {
  if (cell?.status === 'named') return NAMED_CELL_BG;
  const pct = cell?.percent ?? 0;
  return pct > 0
    ? `linear-gradient(to right, ${barBg(pct)} ${pct}%, rgba(255,255,255,0.03) ${pct}%)`
    : 'rgba(255,255,255,0.03)';
}

function cellTitle(scope: string, primitive: string, cell: MatrixCell | undefined): string {
  if (cell?.status === 'named') return `${scope} × ${primitive}: ${NAMED_STATUS_LABEL}`;
  return `${scope} × ${primitive}: ${cell?.percent ?? 0}%`;
}

interface PrimitiveMatrixProps {
  cells: Record<string, MatrixCell>;
  overall: number;
}

export function PrimitiveMatrix({ cells, overall }: Readonly<PrimitiveMatrixProps>) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Column headers — vertical text */}
      <div
        className="grid gap-1 mb-2"
        style={{ gridTemplateColumns: `100px repeat(${PRIMITIVES.length}, 1fr)` }}
      >
        <div /> {/* empty corner */}
        {PRIMITIVES.map((col) => (
          <div key={col} className="flex justify-center h-20 text-white/50">
            <span
              className="text-[10px] uppercase tracking-wider font-medium whitespace-nowrap origin-center"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              {col}
            </span>
          </div>
        ))}
      </div>

      {/* Rows */}
      {SCOPES.map((scope, ri) => (
        <div
          key={scope}
          className="grid gap-1 mb-1"
          style={{ gridTemplateColumns: `100px repeat(${PRIMITIVES.length}, 1fr)` }}
        >
          {/* Row label */}
          <div className="flex items-center gap-1.5 pr-2 text-white/60">
            <span className="text-xs opacity-40">{SCOPE_ICONS[ri]}</span>
            <span className="text-xs font-medium">{scope}</span>
          </div>

          {/* Cells — horizontal fill left to right */}
          {PRIMITIVES.map((primitive) => {
            const key = `${scope}×${primitive}`;
            const cell = cells[key];
            const isNamed = cell?.status === 'named';
            return (
              <div
                key={`${scope}-${primitive}`}
                className={`h-10 rounded-sm border ${isNamed ? 'border-dashed border-white/25' : 'border-white/10'} ${isNamed ? '' : glowClass(cell?.percent ?? 0)}`}
                title={cellTitle(scope, primitive, cell)}
                style={{ background: cellBackground(cell) }}
              />
            );
          })}
        </div>
      ))}

      {/* Legend — bottom right, small */}
      <div className="flex justify-end mt-3">
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" />
          <span>{overall}% complete</span>
        </div>
      </div>
    </div>
  );
}
