// Entry point of the single executable (`npm run build:exe`). Without arguments it is the kiosk launcher
// (launcher.ts); the other modes are:
//   --server                                  the game server (started by the launcher)
//   --purge [--yes] [--export backup.csv]     delete all personal data (KVKK), like `npm run purge`
//   --reset-winners [--today] [--yes]         clear the winner list, like `npm run reset-winners`
// .env and data/ (event DB, logs) live next to the executable. The client, the KVKK texts and the Windows helper
// are embedded, and extracted once per build to a temp folder.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getAsset, getAssetKeys } from 'node:sea';
import { loadEnv, runKiosk } from './launcher.ts';

function extractAssets(): string {
  const id = getAsset('build-id', 'utf8').trim();
  const dir = join(tmpdir(), `gulyabani-kiosk-${id}`);
  if (existsSync(join(dir, '.complete'))) return dir;
  rmSync(dir, { recursive: true, force: true }); // left over from an interrupted extraction
  const tmp = `${dir}.${process.pid}.tmp`;
  for (const key of getAssetKeys()) {
    if (key === 'build-id') continue;
    const file = join(tmp, key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, new Uint8Array(getAsset(key)));
  }
  writeFileSync(join(tmp, '.complete'), id);
  try {
    renameSync(tmp, dir);
  } catch { // another instance (e.g. the server child) extracted it at the same time
    rmSync(tmp, { recursive: true, force: true });
  }
  return dir;
}

const exeDir = dirname(process.execPath);
process.env.GK_ROOT = exeDir; // config.ts: data/ next to the executable
process.env.GK_CLI = basename(process.execPath); // for the usage hints of --purge / --reset-winners
loadEnv(exeDir);
const files = extractAssets();
process.env.CLIENT_DIST = join(files, 'public');
process.env.CONTENT_DIR = join(files, 'content');

// In a single executable, process.argv is [exe, exe, ...args].
const mode = process.argv[2];
if (mode === '--server') {
  await import('../index.ts');
} else if (mode === '--purge' || mode === '--reset-winners') {
  process.argv.splice(2, 1); // the scripts parse the rest of the arguments
  await (mode === '--purge' ? import('../../../scripts/purge.ts') : import('../../../scripts/reset-winners.ts'));
} else {
  await runKiosk({
    baseDir: exeDir,
    serverCommand: [process.execPath, '--server'],
    selfCommand: [process.execPath],
    windowsHelper: () => getAsset('kiosk/windows-helper.ps1', 'utf8'),
  });
}
