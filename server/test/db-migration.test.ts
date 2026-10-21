import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

// An event DB created before the 18+ confirmation and per-attempt acknowledgements existed.
const dir = mkdtempSync(join(tmpdir(), 'gulyabani-migration-'));
process.env.DB_PATH = join(dir, 'old.db');
const old = new DatabaseSync(process.env.DB_PATH);
old.exec(`
CREATE TABLE players (id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT NOT NULL, lang TEXT NOT NULL, kvkk_consent_at TEXT NOT NULL, kvkk_notice_version TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX players_email ON players(lower(email));
CREATE TABLE attempts (id TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, end_reason TEXT, trust INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, prize_claimed_at TEXT);
INSERT INTO players VALUES (1, 'Eski', 'Oyuncu', 'eski@example.com', '+905321234567', 'tr', '2026-10-01T10:00:00.000Z', 'v1', '2026-10-01T10:00:00.000Z');
INSERT INTO attempts (id, player_id, started_at, status) VALUES ('old-attempt', 1, '2026-10-01T10:00:01.000Z', 'lost');
`);
old.close();
const store = await import('../src/db.ts');
after(() => {
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('an existing event DB gains the new columns and keeps its data', () => {
  assert.equal(store.getPlayer(1)!.age_confirmed_at, null);
  assert.equal(store.getPlayer(1)!.birth_year, null);
  assert.equal(store.getAttempt('old-attempt')!.kvkk_consent_at, null);

  const p = store.upsertPlayer({ firstName: 'Eski', lastName: 'Oyuncu', email: 'eski@example.com', phone: '+905321234567', birthYear: 1990, lang: 'tr' });
  assert.equal(p.id, 1);
  assert.ok(p.age_confirmed_at);
  assert.equal(p.birth_year, 1990);
  assert.equal(store.createAttempt(p.id).age_confirmed_at, p.age_confirmed_at);
});
