import { describe, it, expect } from 'vitest';
import { shuffle, nextRandom } from '../src/index.js';

describe('rng', () => {
  it('shuffle is deterministic for a seed and is a permutation', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const [a, seedA] = shuffle(items, 123);
    const [b, seedB] = shuffle(items, 123);
    expect(a).toEqual(b);
    expect(seedA).toBe(seedB);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });

  it('nextRandom returns values in [0,1) and advances the seed', () => {
    const [v, s] = nextRandom(1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(s).not.toBe(1);
  });
});
