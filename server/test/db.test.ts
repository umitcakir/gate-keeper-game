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

const player = (email: string) => store.upsertPlayer({ firstName: 'Ayşe', lastName: 'Kaya', email, phone: '+905321234567', lang: 'tr' });

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
