import { api, type Leaderboard } from '../api.ts';
import { both, formatMs, setLang } from '../i18n.ts';
import { setVolume, unlockAudio } from '../sfx.ts';
import { esc, isModalOpen, type Screen } from '../ui.ts';
import { register } from './register.ts';

const bi = (key: Parameters<typeof both>[0]) => {
  const s = both(key);
  return `<span class="tr">${esc(s.tr)}</span><span class="en">${esc(s.en)}</span>`;
};

function leaderboardHtml(lb: Leaderboard): string {
  const winners = lb.winners.slice(0, 5);
  const rows = winners.length
    ? winners
        .map(
          (w, i) => `<li><span class="rank">${['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span><span class="name">${esc(w.name)}</span>
            <span class="meta">${w.turns} ${both('msgs').tr} · ${formatMs(w.activeMs)}</span></li>`,
        )
        .join('')
    : `<li class="empty">${bi('leaderEmpty')}</li>`;
  const close = lb.closest.slice(0, 3);
  const closeHtml = close.length
    ? `<div class="close-strip"><span class="label">${bi('closeTitle')}</span>${close
        .map((c) => `<span class="chip">${esc(c.name)} <b>${c.trust}%</b></span>`)
        .join('')}</div>`
    : '';
  return `<h3>${bi('leaderTitle')}</h3><ol class="leaders">${rows}</ol>${closeHtml}`;
}

const QUIPS = [
  'Kapı kapalı, evlat!',
  'The gate is closed, kid!',
  '300 yıldır nöbetteyim, bir çay getiren yok...',
  'Think you can convince me? Come and try!',
  'Bu kapı padişaha bile açılmadı!',
  'Nobody pays the aidat around here...',
  'Beni ikna edebileceğini mi sanıyorsun? Gel de görelim!',
];

export const attract: Screen = (ctx) => {
  setLang('tr');
  ctx.attemptId = null;
  ctx.hud.hidden = true;
  ctx.scene.resetGate();
  ctx.scene.setAttract(true);
  ctx.panel.className = 'panel attract';
  ctx.panel.innerHTML = `
    <div class="brand">
      <h1>${bi('title')}</h1>
      <p class="tagline">${bi('tagline')}</p>
    </div>
    <button class="cta" id="start">⏎ ${bi('pressEnter')}</button>
    <section class="board" id="board"></section>
    <footer class="status" id="status"></footer>`;

  let llmOk = true;
  const refresh = async () => {
    try {
      const [lb, st] = await Promise.all([api.leaderboard(), api.status()]);
      llmOk = st.llmOk;
      setVolume(st.volume);
      document.getElementById('board')!.innerHTML = leaderboardHtml(lb);
      document.getElementById('status')!.innerHTML = !st.llmOk
        ? `<span class="warn">⚠ ${bi('llmDown')}</span>`
        : st.prizesRemaining === 0
          ? `🎁 ${bi('noPrizes')}`
          : '';
    } catch {
      llmOk = false;
      document.getElementById('status')!.innerHTML = `<span class="warn">⚠ ${bi('llmDown')}</span>`;
    }
  };
  void refresh();
  const poll = window.setInterval(refresh, 15_000);
  let quip = Math.floor(Math.random() * QUIPS.length);
  const sayQuip = () => ctx.speech.say(QUIPS[quip++ % QUIPS.length]!, 4200);
  const quipTimer = window.setInterval(sayQuip, 7000);
  const firstQuip = window.setTimeout(sayQuip, 1200);

  const begin = () => {
    unlockAudio();
    if (!llmOk) return void refresh();
    ctx.go(register, undefined);
  };
  const onKey = (e: KeyboardEvent) => {
    if (isModalOpen() || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      begin();
    }
  };
  window.addEventListener('keydown', onKey);
  document.getElementById('start')!.addEventListener('click', begin);

  return () => {
    window.clearInterval(poll);
    window.clearInterval(quipTimer);
    window.clearTimeout(firstQuip);
    window.removeEventListener('keydown', onKey);
    ctx.scene.setAttract(false);
  };
};
