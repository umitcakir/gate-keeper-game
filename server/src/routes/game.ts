import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import * as store from '../db.ts';
import * as game from '../game.ts';
import { llmHealthy } from '../llm.ts';
import type { Lang } from '../types.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accepts TR mobiles in common spellings (0532..., +90 532..., 532...) and other international numbers. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(digits)) return null;
  const d = digits.replace(/^\+/, '');
  if (/^5\d{9}$/.test(d)) return `+90${d}`;
  if (/^05\d{9}$/.test(d)) return `+9${d}`;
  if (/^905\d{9}$/.test(d)) return `+${d}`;
  return digits.startsWith('+') ? digits : `+${d}`;
}

export const MIN_AGE = 18;

/** Year-only check: someone born in `year - 18` may still be 17, which the 18+ checkbox covers. */
export function checkBirthYear(raw: unknown, year = new Date().getFullYear()): number | 'invalid' | 'under_age' {
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{4}$/.test(s)) return 'invalid';
  const y = Number(s);
  if (y < 1900 || y > year) return 'invalid';
  return year - y < MIN_AGE ? 'under_age' : y;
}

interface RegisterBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthYear?: string | number;
  lang?: string;
  kvkkConsent?: boolean;
  ageConfirmed?: boolean;
}

const clean = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function gameRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>('/api/register', async (req, reply) => {
    const b = req.body ?? {};
    const lang: Lang = b.lang === 'en' ? 'en' : 'tr';
    const firstName = clean(b.firstName);
    const lastName = clean(b.lastName);
    const email = clean(b.email, 120).toLowerCase();
    const phone = normalizePhone(clean(b.phone, 30));
    const birthYear = checkBirthYear(b.birthYear);

    const errors: Record<string, string> = {};
    if (firstName.length < 2) errors.firstName = 'required';
    if (lastName.length < 2) errors.lastName = 'required';
    if (!EMAIL_RE.test(email)) errors.email = 'invalid';
    if (!phone) errors.phone = 'invalid';
    if (typeof birthYear !== 'number') errors.birthYear = birthYear;
    if (b.kvkkConsent !== true) errors.kvkkConsent = 'required';
    if (b.ageConfirmed !== true) errors.ageConfirmed = 'required';
    if (Object.keys(errors).length) return reply.code(400).send({ errors });
    if (store.emailHasWon(email)) return reply.code(409).send({ errors: { email: 'already_won' } });

    return game.startAttempt({ firstName, lastName, email, phone: phone!, birthYear: birthYear as number, lang });
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>('/api/attempt/:id/message', async (req) => {
    return game.sendMessage(req.params.id, typeof req.body?.text === 'string' ? req.body.text : '');
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/attempt/:id/end', async (req) => {
    const r = req.body?.reason;
    return game.endByClient(req.params.id, r === 'time' || r === 'idle' ? r : 'abandon');
  });

  app.post<{ Params: { id: string }; Body: { pin?: string; give?: boolean } }>('/api/attempt/:id/claim', async (req) => {
    return game.claim(req.params.id, String(req.body?.pin ?? ''), req.body?.give !== false);
  });

  app.get('/api/leaderboard', async () => ({
    winners: store.winnersToday(10).map(({ attemptId, ...e }) => ({ id: attemptId, ...e })),
    closest: store.closestToday(5).map(({ attemptId, ...e }) => ({ id: attemptId, ...e })),
  }));

  app.get('/api/status', async () => {
    const s = store.getSettings();
    return { llmOk: await llmHealthy(), prizesRemaining: store.prizesRemainingToday(), volume: s.volume };
  });

  app.get<{ Params: { lang: string } }>('/api/kvkk/:lang', async (req, reply) => {
    const lang = req.params.lang === 'en' ? 'en' : 'tr';
    const text = await readFile(resolve(config.contentDir, `kvkk_${lang}.md`), 'utf8');
    return reply.type('text/plain; charset=utf-8').send(text);
  });
}
