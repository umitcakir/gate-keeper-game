// Clears the winner list: deletes winning attempts (and their messages), which also frees their prize claims
// and lets those emails win again. Players and non-winning attempts are kept. Safe to run while the server is up.
// Usage: npm run reset-winners -- [--today] --yes   (single executable: gulyabani-kiosk --reset-winners ...)
import { parseArgs } from 'node:util';
import { config } from '../server/src/config.ts';

const { values } = parseArgs({ options: { yes: { type: 'boolean', default: false }, today: { type: 'boolean', default: false } } });

const store = await import('../server/src/db.ts');
const since = values.today ? store.startOfToday() : '';
const scope = values.today ? "today's" : 'all';
const { n } = store.db.prepare("SELECT count(*) AS n FROM attempts WHERE status = 'won' AND started_at >= ?").get(since) as { n: number };

if (!values.yes) {
  console.log(`This deletes ${scope} winning attempts (${n}) from ${config.dbPath}.\nRe-run with: ${process.env.GK_CLI ? `${process.env.GK_CLI} --reset-winners` : 'npm run reset-winners --'} ${values.today ? '--today ' : ''}--yes`);
  process.exit(1);
}

const { changes } = store.db.prepare("DELETE FROM attempts WHERE status = 'won' AND started_at >= ?").run(since);
store.db.close();
console.log(`Deleted ${changes} winning attempts (${scope}).`);
