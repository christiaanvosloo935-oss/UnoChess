// Generates the coloured piece sets (public/pieces/<colour>/<type>.svg) from the white Cburnett set
// by swapping the white body fill for the colour. Black and white use the original sets.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pieces');
const COLOURS = {
  red: '#e5484d', orange: '#f5923e', yellow: '#f2c94c', green: '#3fae6a',
  blue: '#3b82e6', indigo: '#4b4fc4', violet: '#9b5de5',
};

for (const [name, hex] of Object.entries(COLOURS)) {
  mkdirSync(join(root, name), { recursive: true });
  for (const t of 'BKNPQR') {
    const svg = readFileSync(join(root, `w${t}.svg`), 'utf8').replaceAll('fill="#fff"', `fill="${hex}"`);
    writeFileSync(join(root, name, `${t}.svg`), svg);
  }
}
