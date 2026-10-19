// `npm run build:exe [-- linux-x64 win-x64]`: single executables for the reception PC, with the client, server and
// kiosk launcher (all the kiosk rules) inside. Uses Node's single executable applications (node --build-sea):
//   release/linux-x64/gulyabani-kiosk      release/win-x64/gulyabani-kiosk.exe
// Each folder also gets .env.example, README.txt and (on the first build) a copy of your .env. data/ (event DB,
// logs) is created next to the executable on first start and kept across rebuilds. LM Studio is still needed.
// A target that isn't this machine's OS/CPU is built from the official Node.js binary of the same version,
// downloaded once to .cache/node/ and checked against nodejs.org's SHASUMS256.txt.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const work = resolve(root, 'build', 'exe');
const version = process.version;
const TARGETS: Record<string, { node: string; archive: string; exe: string }> = {
  'linux-x64': { node: `node-${version}-linux-x64/bin/node`, archive: `node-${version}-linux-x64.tar.xz`, exe: 'gulyabani-kiosk' },
  'win-x64': { node: `node-${version}-win-x64/node.exe`, archive: `node-${version}-win-x64.zip`, exe: 'gulyabani-kiosk.exe' },
};
const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
for (const t of targets) if (!TARGETS[t]) throw new Error(`Unknown target ${t}. Known: ${Object.keys(TARGETS).join(', ')}`);

const run = (cmd: string, args: string[], cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// 1. Client (→ dist/public) and the bundled launcher + server (→ build/exe/main.mjs).
await build({ configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn' });
rmSync(work, { recursive: true, force: true });
await build({
  configFile: false, root, logLevel: 'warn',
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: resolve(root, 'server/src/kiosk/main.ts'), outDir: work, target: 'node24', minify: false,
    rolldownOptions: { output: { format: 'esm', codeSplitting: false, entryFileNames: 'main.mjs' } },
  },
});

// 2. Embedded files: the client, the KVKK texts, the Windows helper, and a build id (the extraction folder name).
const assets: Record<string, string> = {};
for (const f of walk(resolve(root, 'dist/public'))) assets[`public/${relative(resolve(root, 'dist/public'), f).replaceAll('\\', '/')}`] = f;
for (const f of walk(resolve(root, 'server/content'))) assets[`content/${relative(resolve(root, 'server/content'), f).replaceAll('\\', '/')}`] = f;
assets['kiosk/windows-helper.ps1'] = resolve(root, 'server/src/kiosk/windows-helper.ps1');
const hash = createHash('sha256').update(readFileSync(join(work, 'main.mjs')));
for (const [key, file] of Object.entries(assets).sort()) hash.update(key).update(readFileSync(file));
writeFileSync(join(work, 'build-id'), hash.digest('hex').slice(0, 16));
assets['build-id'] = join(work, 'build-id');

// 3. One executable per target.
async function nodeBinary(target: string): Promise<string> {
  const host = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
  if (target === host) return process.execPath;
  const { node, archive } = TARGETS[target]!;
  const cache = resolve(root, '.cache', 'node', version);
  const binary = join(cache, node);
  if (existsSync(binary)) return binary;
  mkdirSync(cache, { recursive: true });
  const base = `https://nodejs.org/dist/${version}`;
  console.log(`  Downloading ${base}/${archive} ...`);
  const data = Buffer.from(await (await fetch(`${base}/${archive}`)).arrayBuffer());
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split('\n').find((l) => l.endsWith(`  ${archive}`))?.split(' ')[0];
  if (!expected || createHash('sha256').update(data).digest('hex') !== expected) throw new Error(`Checksum mismatch for ${archive}`);
  writeFileSync(join(cache, archive), data);
  if (!archive.endsWith('.zip')) run('tar', ['-xJf', archive, node], cache);
  else if (spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0) run('unzip', ['-q', '-o', archive, node], cache);
  else run('tar', ['-xf', archive, node], cache); // bsdtar (Windows 10+, macOS) reads zip too
  return binary;
}

for (const target of targets) {
  const out = resolve(root, 'release', target);
  mkdirSync(out, { recursive: true }); // keeps data/ and .env from earlier builds
  const exe = join(out, TARGETS[target]!.exe);
  const seaConfig = join(work, `sea-${target}.json`);
  writeFileSync(seaConfig, JSON.stringify({
    main: join(work, 'main.mjs'), mainFormat: 'module', executable: await nodeBinary(target), output: exe,
    assets, disableExperimentalSEAWarning: true,
  }, null, 2));
  run(process.execPath, ['--build-sea', seaConfig]);
  if (!target.startsWith('win')) chmodSync(exe, 0o755);
  copyFileSync(resolve(root, '.env.example'), join(out, '.env.example'));
  if (!existsSync(join(out, '.env')) && existsSync(resolve(root, '.env'))) copyFileSync(resolve(root, '.env'), join(out, '.env'));
  writeFileSync(join(out, 'README.txt'), readme(TARGETS[target]!.exe, target.startsWith('win')).replaceAll('\n', target.startsWith('win') ? '\r\n' : '\n'));
  console.log(`  ✓ ${relative(root, exe)}`);
}

function readme(exe: string, win: boolean) {
  const cmd = win ? exe : `./${exe}`;
  return `Gate of Gulyabani - kiosk
=========================

Start: ${win ? `double-click ${exe}` : `run ${cmd}`}. LM Studio must be running with google/gemma-4-e2b loaded.

Exit:  only with the power button in the bottom-left corner + KIOSK_EXIT_PIN (default 1885).
       Closing the browser just reopens it; Alt+Tab / Alt+F4 / the ${win ? 'Windows' : 'Meta'} key are blocked.

Files next to ${exe}:
  .env        PINs and settings (copy .env.example to .env and change the PINs before the event)
  data/       game.db, the event database (contains personal data), and kiosk.log (created on first start)

After the event (KVKK):
  ${cmd} --purge --yes [--export backup.csv]     delete all personal data
  ${cmd} --reset-winners [--today] --yes         clear the winner list
`;
}
