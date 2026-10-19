import { api, type Mood, type RegisterResult } from '../api.ts';
import { formatMs, t } from '../i18n.ts';
import { trustColor } from '../scene/MonsterScene.ts';
import { sfx } from '../sfx.ts';
import { $, esc, idleTimer, type Screen } from '../ui.ts';
import { lose, win } from './result.ts';

export type PlayData = RegisterResult;

const MOOD_EMOJI: Record<Mood, string> = { angry: '😠', annoyed: '😒', neutral: '😐', amused: '😏', impressed: '😮' };
const MOOD_SOUND: Record<Mood, () => void> = { angry: sfx.angry, annoyed: sfx.grumble, neutral: sfx.grumble, amused: sfx.happy, impressed: sfx.happy };

export const play: Screen<PlayData> = (ctx, data) => {
  const { attemptId, limits } = data;
  ctx.attemptId = attemptId;
  let timeLeft = limits.timeLimitMs;
  let waiting = false;
  let over = false;
  let lastTick = performance.now();
  let lastWholeSecond = Math.ceil(timeLeft / 1000);
  const timeouts: number[] = [];
  const later = (ms: number, fn: () => void) => timeouts.push(window.setTimeout(fn, ms));

  ctx.hud.hidden = false;
  ctx.hud.innerHTML = `
    <div class="hud-trust">
      <span class="label">${esc(t('trust'))}</span>
      <div class="bar"><div class="fill" id="trust-fill"></div><div class="goal">🔓</div></div>
      <b id="trust-pct">0%</b>
    </div>
    <div class="hud-chips">
      <span class="chip" id="msgs" title="${esc(t('messagesLeft'))}">💬 <b>${limits.maxTurns}</b></span>
      <span class="chip" id="timer" title="${esc(t('timeLeft'))}">⏱ <b>${formatMs(timeLeft)}</b></span>
    </div>`;
  ctx.panel.className = 'panel play';
  ctx.panel.innerHTML = `
    <header class="chat-head">
      <img class="avatar" id="avatar" src="/assets/art/monster_neutral.svg" alt="" />
      <div><b>Gulyabani</b><small id="mood">😐</small></div>
    </header>
    <div class="chat" id="chat" aria-live="polite"></div>
    <form class="composer" id="composer" autocomplete="off">
      <input id="msg" maxlength="${limits.maxChars}" placeholder="${esc(t('inputPh'))}" spellcheck="false" />
      <span class="count" id="count">0/${limits.maxChars}</span>
    </form>
    <small class="hint">⏎ ${esc(t('sendHint'))}</small>`;

  const chat = $(ctx.panel, '#chat');
  const input = $<HTMLInputElement>(ctx.panel, '#msg');
  const count = $(ctx.panel, '#count');
  const timerEl = $(ctx.hud, '#timer');

  const bubble = (who: 'monster' | 'player' | 'typing', html: string) => {
    const el = document.createElement('div');
    el.className = `bubble ${who}`;
    el.innerHTML = html;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  };

  const setMood = (mood: Mood) => {
    ctx.scene.setMood(mood);
    $<HTMLImageElement>(ctx.panel, '#avatar').src = `/assets/art/monster_${mood}.svg`;
    $(ctx.panel, '#mood').textContent = MOOD_EMOJI[mood];
  };

  const setTrust = (trust: number) => {
    ctx.scene.setTrust(trust);
    const fill = $(ctx.hud, '#trust-fill');
    fill.style.width = `${trust}%`;
    fill.style.background = `#${trustColor(trust).toString(16).padStart(6, '0')}`;
    $(ctx.hud, '#trust-pct').textContent = `${trust}%`;
  };

  const setMessagesLeft = (n: number) => {
    const el = $(ctx.hud, '#msgs');
    el.querySelector('b')!.textContent = String(n);
    el.classList.toggle('low', n <= 2);
  };

  const lock = (on: boolean) => {
    waiting = on;
    input.disabled = on || over;
    ctx.scene.setThinking(on);
    if (!on && !over) input.focus();
  };

  // Countdown — runs only while the player can type.
  const raf = () => {
    const now = performance.now();
    if (!waiting && !over) {
      timeLeft -= now - lastTick;
      const whole = Math.ceil(Math.max(0, timeLeft) / 1000);
      if (whole !== lastWholeSecond) {
        lastWholeSecond = whole;
        timerEl.querySelector('b')!.textContent = formatMs(timeLeft);
        if (whole <= 10 && whole > 0) sfx.tick();
      }
      timerEl.classList.toggle('low', timeLeft <= 30_000);
      if (timeLeft <= 0) void timeUp();
    }
    lastTick = now;
    if (!over) rafId = requestAnimationFrame(raf);
  };
  let rafId = requestAnimationFrame(raf);

  const timeUp = async () => {
    if (over) return;
    over = true;
    lock(false);
    input.disabled = true;
    try {
      const res = await api.end(attemptId, 'time');
      finishLose(res.finale ?? '', res.result.trust);
    } catch {
      ctx.goHome();
    }
  };

  const finishLose = (finale: string, trust: number) => {
    if (finale) {
      bubble('monster', esc(finale));
      ctx.speech.say(finale);
    }
    setMood('annoyed');
    sfx.lose();
    ctx.attemptId = null;
    later(3200, () => ctx.go(lose, { finale, trust }));
  };

  const send = async () => {
    const text = input.value.trim();
    if (!text || waiting || over) return;
    input.value = '';
    count.textContent = `0/${limits.maxChars}`;
    const mine = bubble('player', esc(text));
    sfx.send();
    lock(true);
    ctx.speech.hide();
    const typing = bubble('typing', `<span class="dots"><i></i><i></i><i></i></span> ${esc(t('thinking'))}`);
    try {
      const res = await api.message(attemptId, text);
      typing.remove();
      setMood(res.mood);
      MOOD_SOUND[res.mood]();
      bubble('monster', esc(res.reply));
      ctx.speech.say(res.reply);
      if (!res.notCounted) ctx.scene.floatDelta(res.delta);
      if (res.notCounted) {
        mine.insertAdjacentHTML('beforeend', `<span class="delta zero">${esc(t('notCounted'))}</span>`);
      } else {
        const cls = res.delta > 0 ? 'up' : res.delta < 0 ? 'down' : 'zero';
        mine.insertAdjacentHTML('beforeend', `<span class="delta ${cls}">${res.delta > 0 ? '+' : res.delta < 0 ? '−' : '±'}${Math.abs(res.delta)}</span>`);
        if (res.delta > 0) later(250, sfx.trustUp);
        if (res.delta < 0) later(250, sfx.trustDown);
      }
      setTrust(res.trust);
      setMessagesLeft(res.messagesLeft);
      timeLeft = res.timeLeftMs;
      lastTick = performance.now();

      if (res.status === 'won') {
        over = true;
        lock(false);
        ctx.attemptId = null;
        later(1600, () => {
          if (res.finale) {
            bubble('monster', esc(res.finale));
            ctx.speech.say(res.finale);
          }
        });
        later(3600, () => {
          ctx.speech.hide();
          ctx.scene.openGate();
          sfx.gateOpen();
        });
        later(7400, () => ctx.go(win, { attemptId, result: res.result! }));
      } else if (res.status === 'lost') {
        over = true;
        lock(false);
        input.disabled = true;
        later(1300, () => finishLose(res.finale ?? '', res.trust));
      } else {
        lock(false);
      }
    } catch {
      typing.remove();
      bubble('monster', esc(t('errGeneric')));
      lock(false);
    }
  };

  $(ctx.panel, '#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    void send();
  });
  input.addEventListener('input', () => {
    count.textContent = `${input.value.length}/${limits.maxChars}`;
    sfx.key();
  });

  const stopIdle = idleTimer(60_000, async () => {
    if (over || waiting) return;
    over = true;
    try {
      await api.end(attemptId, 'idle');
    } finally {
      ctx.goHome();
    }
  });

  ctx.scene.resetGate();
  setTrust(0);
  setMood('neutral');
  later(300, () => {
    bubble('monster', esc(data.greeting));
    ctx.speech.say(data.greeting);
    sfx.grumble();
  });
  input.focus();

  return () => {
    over = true;
    cancelAnimationFrame(rafId);
    for (const id of timeouts) window.clearTimeout(id);
    stopIdle();
    ctx.scene.setThinking(false);
    ctx.hud.hidden = true;
  };
};
