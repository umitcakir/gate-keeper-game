import { api, ApiError, type Lang } from '../api.ts';
import { getLang, setLang, t, type StringKey } from '../i18n.ts';
import { sfx } from '../sfx.ts';
import { $, esc, idleTimer, modal, type Screen } from '../ui.ts';
import { play } from './play.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  kvkkConsent: boolean;
}

export const register: Screen = (ctx) => {
  ctx.hud.hidden = true;
  ctx.scene.setMood('neutral');
  ctx.speech.say(getLang() === 'tr' ? 'Önce bir tanışalım bakalım, evlat...' : "First, let's get acquainted, kid...");
  let values: FormValues = { firstName: '', lastName: '', email: '', phone: '', kvkkConsent: false };
  let busy = false;

  const render = (focus: string = 'firstName') => {
    const lang = getLang();
    ctx.panel.className = 'panel register';
    ctx.panel.innerHTML = `
      <div class="lang-toggle" role="group">
        <button type="button" data-lang="tr" class="${lang === 'tr' ? 'on' : ''}">🇹🇷 Türkçe</button>
        <button type="button" data-lang="en" class="${lang === 'en' ? 'on' : ''}">🇬🇧 English</button>
      </div>
      <h2>${esc(t('formTitle'))}</h2>
      <p class="intro">${esc(t('formIntro'))}</p>
      <form id="form" novalidate autocomplete="off">
        <div class="row">
          ${field('firstName', 'text', 'given-name')}
          ${field('lastName', 'text', 'family-name')}
        </div>
        ${field('email', 'email', 'off')}
        ${field('phone', 'tel', 'off', t('phonePh'))}
        <label class="check">
          <input type="checkbox" name="kvkkConsent" ${values.kvkkConsent ? 'checked' : ''} />
          <span>${esc(t('kvkkLabel')).replace('{link}', `<button type="button" class="link" id="kvkk">${esc(t('kvkkLink'))}</button>`)} *</span>
        </label>
        <small class="err" data-err="kvkkConsent"></small>
        <p class="note">👀 ${esc(t('publicNote'))}</p>
        <p class="err form-err" id="form-err"></p>
        <div class="actions">
          <button type="button" class="ghost" id="cancel">Esc · ${esc(t('cancel'))}</button>
          <button type="submit" class="primary">${esc(t('start'))} ⏎</button>
        </div>
      </form>`;

    const form = $<HTMLFormElement>(ctx.panel, '#form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void submit(form);
    });
    // Clear a field's error as soon as the player edits it.
    form.addEventListener('input', (e) => {
      const name = (e.target as HTMLInputElement).name;
      const err = ctx.panel.querySelector<HTMLElement>(`[data-err="${name}"]`);
      if (err) err.textContent = '';
      err?.closest('.field')?.classList.remove('invalid');
    });
    // Enter on a checkbox submits too (checkbox Enter does nothing by default).
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).matches('input[type=checkbox]')) {
        e.preventDefault();
        void submit(form);
      }
    });
    for (const b of ctx.panel.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
      b.addEventListener('click', () => {
        values = read(form);
        setLang(b.dataset.lang as Lang);
        render();
        $<HTMLButtonElement>(ctx.panel, `[data-lang="${b.dataset.lang}"]`).focus();
      });
    }
    $(ctx.panel, '#kvkk').addEventListener('click', () => void showKvkk());
    $(ctx.panel, '#cancel').addEventListener('click', () => ctx.goHome());
    ctx.panel.querySelector<HTMLInputElement>(`[name="${focus}"]`)?.focus();
  };

  const field = (name: keyof FormValues, type: string, autocomplete: string, placeholder = '') => `
    <label class="field">
      <span>${esc(t(name as StringKey))} *</span>
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" placeholder="${esc(placeholder)}"
        value="${esc(String(values[name]))}" maxlength="${name === 'email' ? 120 : name === 'phone' ? 20 : 60}" spellcheck="false" />
      <small class="err" data-err="${name}"></small>
    </label>`;

  const read = (form: HTMLFormElement): FormValues => {
    const fd = new FormData(form);
    return {
      firstName: String(fd.get('firstName') ?? '').trim(),
      lastName: String(fd.get('lastName') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      kvkkConsent: fd.get('kvkkConsent') === 'on',
    };
  };

  const showErrors = (errors: Partial<Record<keyof FormValues, StringKey>>) => {
    for (const el of ctx.panel.querySelectorAll<HTMLElement>('[data-err]')) {
      const key = errors[el.dataset.err as keyof FormValues];
      el.textContent = key ? t(key) : '';
      el.closest('.field')?.classList.toggle('invalid', !!key);
    }
    const first = Object.keys(errors)[0];
    if (first) ctx.panel.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  };

  const submit = async (form: HTMLFormElement) => {
    if (busy) return;
    values = read(form);
    const errors: Partial<Record<keyof FormValues, StringKey>> = {};
    if (values.firstName.length < 2) errors.firstName = 'errRequired';
    if (values.lastName.length < 2) errors.lastName = 'errRequired';
    if (!EMAIL_RE.test(values.email)) errors.email = 'errEmail';
    if (!PHONE_RE.test(values.phone)) errors.phone = 'errPhone';
    if (!values.kvkkConsent) errors.kvkkConsent = 'errConsent';
    showErrors(errors);
    if (Object.keys(errors).length) {
      sfx.trustDown();
      return;
    }
    busy = true;
    try {
      const res = await api.register({ ...values, lang: getLang() });
      sfx.send();
      ctx.go(play, { ...res, firstName: values.firstName });
    } catch (err) {
      busy = false;
      if (err instanceof ApiError && err.body.errors) {
        const map: Record<string, StringKey> = { firstName: 'errRequired', lastName: 'errRequired', email: 'errEmail', phone: 'errPhone', kvkkConsent: 'errConsent' };
        const errors = err.body.errors as Record<string, string>;
        showErrors(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v === 'already_won' ? 'errAlreadyWon' : (map[k] ?? 'errGeneric')])));
      } else {
        $(ctx.panel, '#form-err').textContent = t('errGeneric');
      }
    }
  };

  const showKvkk = async () => {
    let text = '';
    try {
      text = await api.kvkk(getLang());
    } catch {
      text = t('errGeneric');
    }
    modal(
      `<div class="kvkk-text">${esc(text).replace(/\n/g, '<br>')}</div>
       <div class="actions"><button class="primary" id="kvkk-close">${esc(t('close'))} ⏎</button></div>`,
      (root, close) => {
        const btn = $<HTMLButtonElement>(root, '#kvkk-close');
        btn.addEventListener('click', close);
        btn.focus();
      },
    );
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) ctx.goHome();
  };
  window.addEventListener('keydown', onKey);
  const stopIdle = idleTimer(60_000, () => ctx.goHome());
  render();

  return () => {
    window.removeEventListener('keydown', onKey);
    stopIdle();
  };
};
