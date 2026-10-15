// Deletes ALL personal data (the SQLite DB). Run after the event, per docs/DATA_PRIVACY_KVKK.md.
// Usage: npm run purge -- --yes [--export backup.csv]
import { rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { config } from '../server/src/config.ts';

const { values } = parseArgs({ options: { yes: { type: 'boolean', default: false }, export: { type: 'string' } } });
if (!values.yes) {
  console.log(`This permanently deletes ${config.dbPath}.\nRe-run with: npm run purge -- --yes [--export backup.csv]`);
  process.exit(1);
}

const store = await import('../server/src/db.ts');
if (values.export) {
  const rows = store.exportRows();
  const cols = rows.length ? Object.keys(rows[0]!) : [];
  const esc = (v: unknown) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replaceAll('"', '""')}"` : String(v ?? ''));
  writeFileSync(values.export, '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
  console.log(`Exported ${rows.length} players to ${values.export} — store it securely and delete it when no longer needed.`);
}
store.db.close();
for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
console.log(`Deleted ${config.dbPath}`);
