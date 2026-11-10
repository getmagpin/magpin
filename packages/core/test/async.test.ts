import { describe, expect, it } from 'vitest';
import { mapOrdered } from '../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapOrdered', () => {
  it('yields results in input order despite out-of-order completion', async () => {
    const delays = [30, 5, 20, 1, 10];
    const out: number[] = [];
    for await (const value of mapOrdered(delays, 3, async (delay, index) => {
      await sleep(delay);
      return index;
    })) out.push(value);
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('never exceeds the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const inputs = Array.from({ length: 20 }, (_, i) => i);
    for await (const _ of mapOrdered(inputs, 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(2);
      running--;
    })) void _;
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();
    const out: number[] = [];
    for await (const value of mapOrdered([1, 2, 3, 4, 5], 1, async (v) => v, controller.signal)) {
      out.push(value);
      if (value === 2) controller.abort();
    }
    expect(out).toEqual([1, 2]);
  });
});
