// Exports players and their attempts (optionally the chat messages) to an Excel file.
// The file contains personal data: store it securely and delete it when no longer needed (docs/DATA_PRIVACY_KVKK.md).
// Usage: npm run export-xlsx -- [--out players.xlsx] [--messages]
//   in the repo: the dev DB (data/, what `npm run dev` writes); in dist/ (`npm --prefix dist run export-xlsx`): the event DB;
//   single executable: gulyabani-kiosk --export-xlsx ... (data/ next to the executable)
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../server/src/config.ts';
import { buildXlsx, type Cell, type Sheet } from '../server/src/xlsx.ts';

const { values } = parseArgs({ options: { out: { type: 'string' }, messages: { type: 'boolean', default: false } } });

const store = await import('../server/src/db.ts');

/** Rows from SQLite -> a sheet; `*_at` columns (ISO timestamps) become real Excel dates. */
function toSheet(name: string, rows: Record<string, unknown>[], columns: string[]): Sheet {
  return {
    name,
    columns,
    rows: rows.map((r) =>
      columns.map((c): Cell => {
        const v = r[c];
        if (v === null || v === undefined) return null;
        if (c.endsWith('_at') && typeof v === 'string') return new Date(v);
        return typeof v === 'number' || typeof v === 'bigint' ? Number(v) : String(v);
      }),
    ),
  };
}
const columnsOf = (rows: Record<string, unknown>[], fallback: string[]) => (rows.length ? Object.keys(rows[0]!) : fallback);

const players = store.exportRows();
const attempts = store.db
  .prepare(
    `SELECT a.id AS attempt_id, p.id AS player_id, p.first_name, p.last_name, p.email, a.started_at, a.ended_at, a.status, a.end_reason,
            a.trust, a.turns, round(a.active_ms / 1000.0, 1) AS active_s, a.prize_claimed_at, a.kvkk_consent_at, a.kvkk_notice_version,
            a.age_confirmed_at
     FROM attempts a JOIN players p ON p.id = a.player_id
     ORDER BY a.started_at`,
  )
  .all() as Record<string, unknown>[];

const sheets: Sheet[] = [
  toSheet('Players', players, columnsOf(players, ['id', 'first_name', 'last_name', 'email', 'phone'])),
  toSheet('Attempts', attempts, columnsOf(attempts, ['attempt_id', 'player_id', 'first_name', 'last_name', 'email', 'started_at', 'status'])),
];
let messageCount = 0;
if (values.messages) {
  const messages = store.db
    .prepare(
      `SELECT m.attempt_id, p.email, m.turn, m.created_at, m.player_text, m.monster_reply, m.category, m.quality, m.applied_delta,
              m.mood, m.flags, m.latency_ms
       FROM messages m JOIN attempts a ON a.id = m.attempt_id JOIN players p ON p.id = a.player_id
       ORDER BY a.started_at, m.turn`,
    )
    .all() as Record<string, unknown>[];
  messageCount = messages.length;
  sheets.push(toSheet('Messages', messages, columnsOf(messages, ['attempt_id', 'email', 'turn', 'created_at', 'player_text', 'monster_reply'])));
}
store.db.close();

// Default: next to the DB, which is already the place for personal data. Relative --out paths are
// resolved from where `npm run` was started (npm switches the working directory to the package).
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const out = values.out
  ? resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
  : resolve(dirname(config.dbPath), `players-${stamp}.xlsx`);
writeFileSync(out, buildXlsx(sheets));
console.log(
  `Read ${config.dbPath}\n`
  + `Exported ${players.length} players, ${attempts.length} attempts${values.messages ? `, ${messageCount} messages` : ''} to ${out}\n`
  + 'It contains personal data: store it securely and delete it when no longer needed.',
);
