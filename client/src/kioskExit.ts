import { api, ApiError } from './api.ts';
import { t } from './i18n.ts';
import { $, esc, isModalOpen, modal } from './ui.ts';

// Staff exit button (kiosk mode only): the only way to end the kiosk. The launcher reopens the browser when it is closed any other way
// (Alt+F4, Ctrl+W...); the right PIN shuts the server down and the launcher then closes the browser for good.
export function addKioskExit() {
  const btn = document.createElement('button');
  btn.id = 'kiosk-exit';
  btn.type = 'button';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
  btn.title = t('kioskExit');
  btn.setAttribute('aria-label', t('kioskExit'));
  btn.tabIndex = -1; // out of the players' Tab order
  btn.addEventListener('click', openExitModal);
  document.body.appendChild(btn);
}

function openExitModal() {
  if (isModalOpen()) return;
  modal(
    `<h3>${esc(t('kioskExit'))}</h3>
     <p>${esc(t('kioskExitHint'))}</p>
     <input id="kiosk-pin" type="password" inputmode="numeric" maxlength="8" placeholder="${esc(t('staffPin'))}" autocomplete="off" />
     <p class="err" id="kiosk-pin-err"></p>
     <div class="actions">
       <button class="ghost" id="kiosk-cancel">${esc(t('cancel'))}</button>
       <button class="primary" id="kiosk-ok">${esc(t('kioskExit'))} ⏎</button>
     </div>`,
    (root, close) => {
      const pin = $<HTMLInputElement>(root, '#kiosk-pin');
      const err = $(root, '#kiosk-pin-err');
      let busy = false;
      const submit = async () => {
        if (busy) return;
        busy = true;
        try {
          await api.kioskExit(pin.value);
          err.textContent = t('kioskClosing'); // the launcher closes the browser in a moment
        } catch (e) {
          busy = false;
          const status = e instanceof ApiError ? e.status : 0;
          err.textContent = status === 403 ? t('staffWrong') : status === 429 ? t('kioskLocked') : t('errGeneric');
          pin.select();
        }
      };
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          void submit();
        }
      });
      $(root, '#kiosk-ok').addEventListener('click', () => void submit());
      $(root, '#kiosk-cancel').addEventListener('click', close);
      pin.focus();
    },
  );
}
