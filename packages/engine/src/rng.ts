/** mulberry32: returns a value in [0,1) and the next seed. */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Fisher–Yates shuffle; returns a new array and the next seed. */
export function shuffle<T>(items: readonly T[], seed: number): [T[], number] {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const [v, next] = nextRandom(s);
    s = next;
    const j = Math.floor(v * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, s];
}
