import type { Piece } from '@unochess/engine';
import type { BoardDiff } from './animation';

const SLIDE_MS = 260;
const FADE_MS = 200;
const POP_MS = 300;

const sqEl = (root: HTMLElement, sq: number) => root.querySelector<HTMLElement>(`[data-testid="sq-${sq}"]`);
const pieceEl = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`img[data-piece-id="${CSS.escape(id)}"]`);

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function run(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (typeof el.animate !== 'function') return null;
  return el.animate(keyframes, options);
}

/** Plays the transition for one board update. Called after the DOM already shows the new position. */
export function playTransition(
  root: HTMLElement,
  diff: BoardDiff,
  effects: { frozen: string[]; shielded: string[] },
): void {
  const moved = new Set<string>();
  for (const m of diff.moves) {
    const el = pieceEl(root, m.id);
    const from = sqEl(root, m.from)?.getBoundingClientRect();
    const to = sqEl(root, m.to)?.getBoundingClientRect();
    if (!el || !from || !to) continue;
    moved.add(m.id);
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    el.style.position = 'relative';
    el.style.zIndex = '30';
    const frames: Keyframe[] = m.hop
      ? [
          { transform: `translate(${dx}px, ${dy}px) scale(1)` },
          { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.3)`, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1)' },
        ]
      : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
    const anim = run(el, frames, { duration: SLIDE_MS, easing: 'ease-in-out' });
    const reset = () => {
      el.style.zIndex = '';
      el.style.position = '';
    };
    if (anim) {
      anim.onfinish = reset;
      anim.oncancel = reset;
    } else {
      reset();
    }
  }

  for (const { piece, square } of diff.captured) addGhost(root, piece, square);

  for (const { id } of diff.appeared) {
    const el = pieceEl(root, id);
    if (el) run(el, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }

  for (const { id } of diff.promoted) {
    const el = pieceEl(root, id);
    if (el) {
      run(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
        duration: POP_MS,
        delay: moved.has(id) ? SLIDE_MS : 0,
        easing: 'ease-in-out',
      });
    }
  }

  const pulse = (ids: string[], colour: string) => {
    for (const id of ids) {
      const el = pieceEl(root, id);
      if (!el) continue;
      run(
        el,
        [
          { filter: `drop-shadow(0 0 0 ${colour}) brightness(1)` },
          { filter: `drop-shadow(0 0 10px ${colour}) brightness(1.8)` },
          { filter: `drop-shadow(0 0 0 ${colour}) brightness(1)` },
        ],
        { duration: 700, easing: 'ease-in-out' },
      );
    }
  };
  pulse(effects.frozen, '#8fd8ff');
  pulse(effects.shielded, '#3da9fc');
}

/** A captured piece lingers on its square, then fades as the capturer arrives. */
function addGhost(root: HTMLElement, piece: Piece, square: number): void {
  const host = sqEl(root, square);
  if (!host) return;
  const ghost = document.createElement('img');
  ghost.className = 'piece-img ghost';
  ghost.src = `/pieces/${piece.army}${piece.type.toUpperCase()}.svg`;
  ghost.alt = '';
  ghost.setAttribute('aria-hidden', 'true');
  host.appendChild(ghost);
  const anim = run(ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.4)' }], {
    duration: FADE_MS,
    delay: SLIDE_MS * 0.6,
    easing: 'ease-in',
    fill: 'both',
  });
  if (anim) anim.onfinish = () => ghost.remove();
  else ghost.remove();
}
