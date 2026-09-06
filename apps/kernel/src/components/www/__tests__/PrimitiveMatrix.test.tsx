// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PrimitiveMatrix } from '../PrimitiveMatrix';
import type { MatrixCell } from '../matrix';

afterEach(() => {
  cleanup();
});

const NAMED_CELL: MatrixCell = { percent: 0, status: 'named' };

describe('PrimitiveMatrix', () => {
  it('renders all six primitive columns, including Revocation, in one header row', () => {
    render(<PrimitiveMatrix cells={{}} overall={0} />);

    for (const primitive of ['Attestation', 'Communication', 'Attribution', 'Settlement', 'Discovery', 'Revocation']) {
      expect(screen.getByText(primitive)).toBeDefined();
    }
  });

  it('renders a percent-complete tooltip for an ordinary cell', () => {
    render(<PrimitiveMatrix cells={{ 'Actor×Attestation': { percent: 80 } }} overall={80} />);

    expect(screen.getByTitle('Actor × Attestation: 80%')).toBeDefined();
  });

  it('marks a missing cell as 0%, not as named', () => {
    render(<PrimitiveMatrix cells={{}} overall={0} />);

    expect(screen.getByTitle('Actor × Attestation: 0%')).toBeDefined();
  });

  it("renders the distinct 'named' tooltip for a Revocation cell instead of a percentage", () => {
    render(
      <PrimitiveMatrix
        cells={{ 'Actor×Revocation': NAMED_CELL }}
        overall={0}
      />,
    );

    expect(
      screen.getByTitle('Actor × Revocation: named — canonical seat, build awaits the forcing use case'),
    ).toBeDefined();
    expect(screen.queryByTitle('Actor × Revocation: 0%')).toBeNull();
  });

  it('gives every scope a named Revocation cell distinct from its other primitives', () => {
    render(
      <PrimitiveMatrix
        cells={{
          'Family×Revocation': NAMED_CELL,
          'Community×Revocation': NAMED_CELL,
          'Business×Revocation': NAMED_CELL,
        }}
        overall={0}
      />,
    );

    for (const scope of ['Family', 'Community', 'Business']) {
      expect(
        screen.getByTitle(`${scope} × Revocation: named — canonical seat, build awaits the forcing use case`),
      ).toBeDefined();
    }
  });
});
