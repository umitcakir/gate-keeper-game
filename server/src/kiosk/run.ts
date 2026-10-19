// Starts the kiosk launcher from the build folder dist/ (dist/kiosk.sh, dist\kiosk.cmd). See launcher.ts.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runKiosk } from './launcher.ts';

const baseDir = resolve(import.meta.dirname, '..', '..', '..');
await runKiosk({
  baseDir,
  serverCommand: [process.execPath, join(baseDir, 'server', 'src', 'index.ts')],
  selfCommand: [process.execPath, import.meta.filename],
  windowsHelper: () => readFileSync(join(import.meta.dirname, 'windows-helper.ps1'), 'utf8'),
});
