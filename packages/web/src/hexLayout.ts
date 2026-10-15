import type { Army, Square } from '@isachess/engine';

/** Cell edge length in layout units. */
export const CELL = 100;
/** Margin around the board, in layout units. */
const PAD = 30;

const ARMIES: Army[] = ['w', 'r', 'b'];

export interface HexCell {
  sq: Square;
  /** Corners in layout units, origin top-left of the board box (all coordinates positive). */
  polygon: [number, number][];
  cx: number;
  cy: number;
}

export interface HexLayout {
  cells: HexCell[];
  /** Size of the board box; polygons live in [0, width] x [0, height]. */
  width: number;
  height: number;
}

/** Screen direction (y down) for an angle in degrees using the maths convention (y up). */
function dir(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), -Math.sin(r)];
}

/**
 * Six 4x4 blocks in a pinwheel around the origin, 60 degrees between the rays that bound each block.
 * Section s has its bisector at 270 - 120*s degrees (rotated so the viewer's army is s = 0, pointing down
 * the screen); files 0-3 use the seam ray at bisector - 60, files 4-7 the one at bisector + 60.
 */
export function layoutHex(yourArmy: Army): HexLayout {
  const viewer = ARMIES.indexOf(yourArmy);
  const raw: { sq: Square; polygon: [number, number][] }[] = [];
  for (let sq = 0; sq < 96; sq++) {
    const s = sq >> 5;
    const rank = (sq >> 3) & 3;
    const file = sq & 7;
    const beta = 270 - 120 * ((s - viewer + 3) % 3);
    const left = file < 4;
    const eSeam = dir(left ? beta - 60 : beta + 60);
    const eBis = dir(beta);
    const a0 = left ? 3 - file : file - 4;
    const b0 = 3 - rank;
    const corners: [number, number][] = [[a0, b0], [a0 + 1, b0], [a0 + 1, b0 + 1], [a0, b0 + 1]];
    raw.push({
      sq,
      polygon: corners.map(([a, b]) => [(a * eSeam[0] + b * eBis[0]) * CELL, (a * eSeam[1] + b * eBis[1]) * CELL] as [number, number]),
    });
  }
  const xs = raw.flatMap((c) => c.polygon.map((p) => p[0]));
  const ys = raw.flatMap((c) => c.polygon.map((p) => p[1]));
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const cells = raw.map(({ sq, polygon }) => {
    const shifted = polygon.map(([x, y]) => [x - minX, y - minY] as [number, number]);
    return {
      sq,
      polygon: shifted,
      cx: shifted.reduce((t, p) => t + p[0], 0) / 4,
      cy: shifted.reduce((t, p) => t + p[1], 0) / 4,
    };
  });
  return { cells, width: Math.max(...xs) + PAD - minX, height: Math.max(...ys) + PAD - minY };
}
