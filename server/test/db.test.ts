import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// Point the DB at a throwaway file before db.ts is loaded.
const dir = mkdtempSync(join(tmpdir(), 'gulyabani-test-'));
process.env.DB_PATH = join(dir, 'test.db');
const store = await import('../src/db.ts');
after(() => {
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});

const player = (email: string) => store.upsertPlayer({ firstName: 'Ayşe', lastName: 'Kaya', email, phone: '+905321234567', birthYear: 1990, lang: 'tr' });

test('an email that lost can play again; one that won cannot', () => {
  const p = player('ayse@example.com');
  const lost = store.createAttempt(p.id);
  store.endAttempt(lost.id, 'lost', 'messages', 1000);
  assert.equal(store.emailHasWon('ayse@example.com'), false);

  const won = store.createAttempt(p.id);
  store.endAttempt(won.id, 'won', 'trust', 2000);
  assert.equal(store.emailHasWon('ayse@example.com'), true);
  assert.equal(store.emailHasWon('AYSE@Example.com'), true, 'case-insensitive');
  assert.equal(store.emailHasWon('someone@example.com'), false);
});

test('each attempt keeps its own KVKK acknowledgement and 18+ confirmation timestamps', async () => {
  const first = store.createAttempt(player('mehmet@example.com').id);
  assert.match(first.kvkk_consent_at ?? '', /^\d{4}-\d\d-\d\dT/);
  assert.equal(first.age_confirmed_at, first.kvkk_consent_at);
  assert.ok(first.kvkk_notice_version);

  await new Promise((r) => setTimeout(r, 5));
  const p = player('mehmet@example.com');
  const second = store.createAttempt(p.id);
  assert.equal(second.kvkk_consent_at, p.kvkk_consent_at, 'snapshot of the latest acknowledgement');
  assert.ok(second.kvkk_consent_at! > first.kvkk_consent_at!);
  assert.equal(store.getAttempt(first.id)!.kvkk_consent_at, first.kvkk_consent_at, 'replay does not overwrite the earlier one');
});
