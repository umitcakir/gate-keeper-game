// `npm run build`: builds a self-contained dist/ (client, server, production node_modules, kiosk launchers).
// Copy dist/ to the reception PC and start it with dist/kiosk.sh or dist\kiosk.cmd; no npm install needed there.
// dist/data (the event DB) and dist/.env are kept across rebuilds.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const keep = new Set(['data', '.env']);

mkdirSync(dist, { recursive: true });
for (const f of readdirSync(dist)) if (!keep.has(f)) rmSync(resolve(dist, f), { recursive: true, force: true });

await build({ configFile: resolve(root, 'vite.config.ts') }); // → dist/public

const copy = (from: string, to = from) => cpSync(resolve(root, from), resolve(dist, to), { recursive: true });
for (const p of ['server/src', 'server/content', 'scripts/purge.ts', 'scripts/reset-winners.ts', 'package-lock.json', '.env.example']) copy(p);
for (const f of readdirSync(resolve(root, 'deploy'))) copy(`deploy/${f}`, f);
if (!existsSync(resolve(dist, '.env')) && existsSync(resolve(root, '.env'))) copy('.env');
writeFileSync(resolve(dist, 'production.env'), 'NODE_ENV=production\n');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const node = 'node --env-file=production.env --env-file-if-exists=.env';
const distPkg = {
  name: pkg.name, version: pkg.version, private: true, type: 'module', engines: pkg.engines,
  scripts: {
    start: `${node} server/src/index.ts`,
    purge: `${node} scripts/purge.ts`,
    'reset-winners': `${node} scripts/reset-winners.ts`,
  },
  // devDependencies stay listed so package-lock.json matches; `npm ci --omit=dev` skips them.
  dependencies: pkg.dependencies, devDependencies: pkg.devDependencies,
};
writeFileSync(resolve(dist, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n');

const npm = spawnSync('npm', ['ci', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund'],
  { cwd: dist, stdio: 'inherit', shell: process.platform === 'win32' });
if (npm.status !== 0) process.exit(npm.status ?? 1);

console.log('\n  dist/ is ready. Start it with dist/kiosk.sh (Linux) or dist\\kiosk.cmd (Windows).\n');
