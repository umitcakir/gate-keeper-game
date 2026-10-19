// `npm run kiosk`: runs the root launcher for this OS (kiosk.cmd on Windows, kiosk.sh elsewhere),
// which builds dist/ if needed and starts the kiosk from it.
import { spawnSync } from 'node:child_process';

const r = process.platform === 'win32'
  ? spawnSync('cmd', ['/c', 'kiosk.cmd'], { stdio: 'inherit' })
  : spawnSync('./kiosk.sh', { stdio: 'inherit' });
process.exit(r.status ?? 1);
