import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './style.css';
import { api } from './api.ts';
import { addKioskExit } from './kioskExit.ts';
import { createGame } from './scene/MonsterScene.ts';
import { attract } from './screens/attract.ts';
import { Speech } from './speech.ts';
import type { Ctx, Screen } from './ui.ts';

// Phaser draws text with the canvas, so the font must be loaded first.
await document.fonts.load('600 48px Fredoka').catch(() => {});
const scene = await createGame('game');
let cleanup: (() => void) | null = null;

const ctx: Ctx = {
  scene,
  speech: new Speech(document.getElementById('speech')!, scene),
  panel: document.getElementById('panel')!,
  hud: document.getElementById('hud')!,
  attemptId: null,
  go<D>(screen: Screen<D>, data: D) {
    cleanup?.();
    ctx.speech.hide();
    document.getElementById('modal-root')!.innerHTML = '';
    cleanup = screen(ctx, data);
  },
  goHome() {
    ctx.go(attract, undefined);
  },
};

// Staff reset: Ctrl+Shift+X abandons the current attempt and returns to the attract screen.
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') {
    e.preventDefault();
    if (ctx.attemptId) void api.end(ctx.attemptId, 'abandon').catch(() => {});
    ctx.goHome();
  }
});
// Kiosk hygiene: no context menu, no accidental navigation.
window.addEventListener('contextmenu', (e) => e.preventDefault());
// Kiosk fullscreen fallback: the browser only allows it after a user gesture, so try on each input until it sticks.
if (new URLSearchParams(location.search).has('kiosk')) {
  const goFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
  };
  window.addEventListener('keydown', goFullscreen);
  window.addEventListener('pointerdown', goFullscreen);
  addKioskExit();
}

ctx.goHome();
