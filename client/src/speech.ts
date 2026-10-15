// Comic speech bubble over the monster's head (DOM, so it uses the UI font and wraps nicely).
// Big enough to be read by people waiting in the queue.
import type { MonsterScene } from './scene/MonsterScene.ts';

export class Speech {
  private readonly el: HTMLElement;
  private readonly scene: MonsterScene;
  private typing = 0;
  private hideTimer = 0;

  constructor(el: HTMLElement, scene: MonsterScene) {
    this.el = el;
    this.scene = scene;
    window.addEventListener('resize', () => this.place());
  }

  /** Types the text out; hides itself after `holdMs` if given. */
  say(text: string, holdMs?: number) {
    this.stop();
    const chars = [...text];
    let i = 0;
    this.el.textContent = '';
    this.el.hidden = false;
    this.el.classList.remove('pop');
    void this.el.offsetWidth; // restart the pop animation
    this.el.classList.add('pop');
    this.typing = window.setInterval(() => {
      i = Math.min(chars.length, i + 2);
      this.el.textContent = chars.slice(0, i).join('');
      this.place();
      if (i >= chars.length) {
        window.clearInterval(this.typing);
        if (holdMs) this.hideTimer = window.setTimeout(() => this.hide(), holdMs);
      }
    }, 30);
    this.place();
  }

  hide() {
    this.stop();
    this.el.hidden = true;
  }

  private stop() {
    window.clearInterval(this.typing);
    window.clearTimeout(this.hideTimer);
  }

  private place() {
    if (this.el.hidden) return;
    const a = this.scene.headAnchor();
    const r = this.el.getBoundingClientRect();
    const left = Math.min(Math.max(16, a.x - r.width * 0.55), a.sceneW - r.width - 16);
    const top = Math.max(window.innerHeight * 0.1, a.y - r.height - 26);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.setProperty('--tail-x', `${Math.min(Math.max(24, a.x - left), r.width - 24)}px`);
  }
}
