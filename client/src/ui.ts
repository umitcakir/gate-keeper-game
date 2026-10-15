// Small DOM helpers shared by the screens.
import type { Lang } from './api.ts';
import type { MonsterScene } from './scene/MonsterScene.ts';
import type { Speech } from './speech.ts';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function $<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
}

/** A screen renders into the panel and returns a cleanup function. */
export type Screen<D = void> = (ctx: Ctx, data: D) => () => void;

export interface Ctx {
  scene: MonsterScene;
  speech: Speech;
  panel: HTMLElement;
  hud: HTMLElement;
  /** Attempt currently being played (for staff reset). */
  attemptId: string | null;
  go<D>(screen: Screen<D>, data: D): void;
  goHome(): void;
}

export interface Player {
  firstName: string;
  lang: Lang;
}

/** Calls `onIdle` after `ms` without keyboard/mouse activity. Returns a stop function. */
export function idleTimer(ms: number, onIdle: () => void): () => void {
  let timer = window.setTimeout(onIdle, ms);
  const reset = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onIdle, ms);
  };
  const events = ['keydown', 'pointerdown', 'pointermove'] as const;
  for (const e of events) window.addEventListener(e, reset, { passive: true });
  return () => {
    window.clearTimeout(timer);
    for (const e of events) window.removeEventListener(e, reset);
  };
}

/** Opens a modal; resolves when closed. Esc closes it. */
export function modal(html: string, setup?: (root: HTMLElement, close: () => void) => void): () => void {
  const root = document.getElementById('modal-root')!;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(wrap);
  const prevFocus = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
    prevFocus?.focus();
  };
  window.addEventListener('keydown', onKey, true);
  setup?.(wrap.querySelector('.modal')!, close);
  return close;
}

export const isModalOpen = () => !!document.querySelector('#modal-root .modal-backdrop');
