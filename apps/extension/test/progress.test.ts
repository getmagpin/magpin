import { describe, expect, it } from 'vitest';
import { scanEnding, scanProgress } from '../src/progress';

describe('scanProgress', () => {
  it('is count over total when the total is known', () => {
    expect(scanProgress(25, 100, 0)).toBe(0.25);
    expect(scanProgress(120, 100, 0)).toBe(1);
  });

  it('without a total, starts at zero and only moves forward', () => {
    expect(scanProgress(0, null, 0)).toBe(0);
    let previous = 0;
    for (let t = 0; t <= 120_000; t += 500) {
      const value = scanProgress(Math.floor(t / 100), null, t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('without a total, never reaches the end on its own', () => {
    expect(scanProgress(5000, null, 600_000)).toBeLessThan(0.95);
    // A small board read in a few seconds is visibly under way, not finished.
    const small = scanProgress(11, null, 3000);
    expect(small).toBeGreaterThan(0.2);
    expect(small).toBeLessThan(0.5);
  });
});

describe('scanEnding', () => {
  it('says how a reading ended', () => {
    expect(scanEnding({ found: 40, scanned: 41, expected: 41, stopped: false })).toBe('success');
    expect(scanEnding({ found: 12, scanned: 12, expected: null, stopped: false })).toBe('success');
    expect(scanEnding({ found: 12, scanned: 12, expected: 41, stopped: true })).toBe('stopped');
    // Stopped by hand at zero is still a stop, not an empty board.
    expect(scanEnding({ found: 0, scanned: 0, expected: 41, stopped: true })).toBe('stopped');
    expect(scanEnding({ found: 0, scanned: 3, expected: null, stopped: false })).toBe('empty');
  });

  it('reads clearly short of the page count as partial, with a little slack', () => {
    expect(scanEnding({ found: 290, scanned: 300, expected: 1000, stopped: false })).toBe('partial');
    expect(scanEnding({ found: 985, scanned: 985, expected: 1000, stopped: false })).toBe('success');
    expect(scanEnding({ found: 40, scanned: 40, expected: 41, stopped: false })).toBe('success');
    expect(scanEnding({ found: 39, scanned: 39, expected: 41, stopped: false })).toBe('partial');
  });
});
