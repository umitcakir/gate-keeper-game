import { api, ApiError, type AttemptResult } from '../api.ts';
import { formatMs, t } from '../i18n.ts';
import { trustColor } from '../scene/MonsterScene.ts';
import { sfx } from '../sfx.ts';
import { $, esc, isModalOpen, modal, type Screen } from '../ui.ts';

export interface WinData {
  attemptId: string;
  result: AttemptResult;
}

export const win: Screen<WinData> = (ctx, { attemptId, result }) => {
  const eligible = result.prize === 'eligible';
  const prizeHtml =
    result.prize === 'eligible'
      ? `<div class="prize eligible">🎁 ${esc(t('prizeEligible'))}</div>`
      : result.prize === 'out_of_stock'
        ? `<div class="prize">🏆 ${esc(t('noPrizes'))}</div>`
        : `<div class="prize">🏆 ${esc(t('prizeAlready'))}</div>`;
  ctx.panel.className = 'panel result win';
  ctx.panel.innerHTML = `
    <h1 class="big">${esc(t('winTitle'))}</h1>
    <p class="summary">${esc(t('winSummary', { turns: result.turns, time: formatMs(result.activeMs) }))}</p>
    ${result.rank ? `<p class="rank">${esc(t('winRank', { rank: result.rank }))}</p>` : ''}
    ${prizeHtml}`;

  const timeouts: number[] = [];
  let closeModal: (() => void) | null = null;
  let canReturn = !eligible;
  const returnToMenu = () => ctx.goHome();
  const showReturnButton = () => {
    if (document.getElementById('return-home')) return;
    ctx.panel.insertAdjacentHTML(
      'beforeend',
      `<button class="primary" id="return-home">${esc(t('nextPlayer'))}</button>`,
    );
    document.getElementById('return-home')!.addEventListener('click', returnToMenu);
  };
  if (canReturn) showReturnButton();

  const staff = () => {
    if (!eligible || canReturn || isModalOpen()) return;
    closeModal = modal(
      `<h3>${esc(t('staffTitle'))}</h3>
       <input id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="${esc(t('staffPin'))}" autocomplete="off" />
       <p class="err" id="pin-err"></p>
       <div class="actions">
         <button class="ghost" id="skip">${esc(t('staffSkip'))}</button>
         ${eligible ? `<button class="primary" id="give">${esc(t('staffGive'))} ⏎</button>` : ''}
       </div>`,
      (root, close) => {
        const pin = $<HTMLInputElement>(root, '#pin');
        const err = $(root, '#pin-err');
        const submit = async (give: boolean) => {
          try {
            const res = await api.claim(attemptId, pin.value, give);
            if (give && !res.claimed) {
              err.textContent = t('staffNotGiven');
              return;
            }
            if (give) sfx.coin();
            close();
            canReturn = true;
            showReturnButton();
          } catch (e) {
            err.textContent = e instanceof ApiError && e.status === 403 ? t('staffWrong') : t('errGeneric');
            pin.select();
          }
        };
        pin.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            void submit(eligible);
          }
        });
        root.querySelector('#give')?.addEventListener('click', () => void submit(true));
        $(root, '#skip').addEventListener('click', () => void submit(false));
        pin.focus();
      },
    );
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault();
      staff();
    } else if (canReturn && !isModalOpen() && e.key === 'Enter') {
      returnToMenu();
    }
  };
  window.addEventListener('keydown', onKey);
  // Non-eligible winners can return manually or wait for the screen to clear for the next player.
  if (!eligible) timeouts.push(window.setTimeout(() => ctx.goHome(), 20_000));

  return () => {
    window.removeEventListener('keydown', onKey);
    for (const id of timeouts) window.clearTimeout(id);
    closeModal?.();
  };
};

export interface LoseData {
  finale: string;
  trust: number;
}

export const lose: Screen<LoseData> = (ctx, { finale, trust }) => {
  const color = `#${trustColor(trust).toString(16).padStart(6, '0')}`;
  ctx.panel.className = 'panel result lose';
  ctx.panel.innerHTML = `
    <h1 class="big">${esc(t('loseTitle'))}</h1>
    ${finale ? `<blockquote>“${esc(finale)}”<cite>— Gulyabani</cite></blockquote>` : ''}
    <div class="trust-final">
      <span>${esc(t('loseTrust'))}</span>
      <div class="bar"><div class="fill" style="width:${trust}%;background:${color}"></div></div>
      <b>${trust}%</b>
    </div>
    <p class="again">${esc(t('loseAgain'))}</p>`;
  const shownAt = Date.now();
  const onKey = () => {
    if (Date.now() - shownAt > 3000) ctx.goHome();
  };
  window.addEventListener('keydown', onKey);
  const timer = window.setTimeout(() => ctx.goHome(), 10_000);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.clearTimeout(timer);
  };
};
