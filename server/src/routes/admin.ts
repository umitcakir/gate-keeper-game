import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import * as store from '../db.ts';
import { askMonster, llmHealthy, modelLabel } from '../llm.ts';
import { buildMessages } from '../prompt.ts';
import type { GameSettings, Lang } from '../types.ts';

const SETTING_LIMITS: Record<keyof GameSettings, [number, number]> = {
  maxTurns: [3, 30],
  timeLimitS: [30, 900],
  minTurnsToWin: [1, 10],
  difficulty: [0.3, 2],
  prizesPerDay: [0, 1000],
  volume: [0, 1],
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formula injection from user-typed fields.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/admin')) return;
    if (req.headers['x-admin-pin'] !== config.adminPin) return reply.code(401).send({ error: 'admin PIN required' });
  });

  app.get('/api/admin/overview', async () => ({
    llmOk: await llmHealthy(true),
    model: modelLabel(),
    stats: store.statsToday(),
    settings: store.getSettings(),
    recent: store.recentAttempts(30),
  }));

  app.put<{ Body: Partial<GameSettings> }>('/api/admin/settings', async (req, reply) => {
    const patch: Partial<GameSettings> = {};
    for (const [key, [lo, hi]] of Object.entries(SETTING_LIMITS) as [keyof GameSettings, [number, number]][]) {
      const v = req.body?.[key];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
        return reply.code(400).send({ error: `${key} must be between ${lo} and ${hi}` });
      }
      patch[key] = key === 'difficulty' || key === 'volume' ? v : Math.round(v);
    }
    return store.updateSettings(patch);
  });

  app.get<{ Params: { id: string } }>('/api/admin/attempts/:id/messages', async (req) => store.getMessages(req.params.id));

  app.get('/api/admin/export.csv', async (_req, reply) => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return reply
      .type('text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="players-${stamp}.csv"`)
      .send(toCsv(store.exportRows()));
  });

  app.delete<{ Querystring: { email?: string } }>('/api/admin/players', async (req) => ({
    deleted: store.deletePlayerByEmail(String(req.query.email ?? '')),
  }));

  /** Try the real prompt without starting a game: shows the raw LLM verdict for one message. */
  app.post<{ Body: { text?: string; trust?: number; turn?: number; lang?: Lang } }>('/api/admin/test-chat', async (req) => {
    const s = store.getSettings();
    const messages = buildMessages(
      { turn: req.body?.turn ?? 3, maxTurns: s.maxTurns, trust: req.body?.trust ?? 40, lang: req.body?.lang === 'en' ? 'en' : 'tr' },
      [],
      String(req.body?.text ?? '').slice(0, config.maxMessageChars),
    );
    return askMonster(messages);
  });
}
