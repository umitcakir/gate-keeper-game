// Event-day kiosk launcher (Linux + Windows): checks LM Studio, starts the server, opens Chromium/Chrome/Edge in
// kiosk mode. Used by dist/kiosk.sh, dist\kiosk.cmd (via run.ts) and the single executable (main.ts).
//
// The only way to end the kiosk is the ⏻ button + KIOSK_EXIT_PIN (default 1885): the server then exits with code 0,
// and the launcher closes the browser and exits. Everything else is undone or blocked:
// - the browser is reopened whenever it closes (Alt+F4, Ctrl+W...), and a crashed server is restarted;
// - Ctrl+C, closing the terminal and plain `kill` are ignored once the kiosk is up; the server and the browser run
//   detached (own session on Linux, own hidden console on Windows), so terminal signals don't reach them;
// - desktop shortcuts (Alt+Tab, Alt+F4, Meta/Win...) are blocked: a KWin rule on KDE (kde.ts), a keyboard hook
//   on Windows (windows-helper.ps1, which also hides this console window and removes its close button);
// - it never gives up (that would be a way out): repeated failures right after a start only slow retries to 5 s.
// Logs: <baseDir>/data/kiosk.log (also shown in this window).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { isKde, setupKde } from './kde.ts';

export interface KioskOptions {
  /** Holds .env and data/ (the event DB and logs). */
  baseDir: string;
  /** How to start the game server: [file, ...args]. */
  serverCommand: string[];
  /** How to start this launcher again (Windows: to reopen it in a classic console window). */
  selfCommand: string[];
  /** Source of windows-helper.ps1. */
  windowsHelper: () => string;
}

const isWin = process.platform === 'win32';
/** X11 window class of the kiosk browser, matched by the KDE rule. */
const KIOSK_CLASS = 'GulyabaniKiosk';
const QUICK_MS = 10_000; // a stop sooner than this after a start counts as a failure
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loads <baseDir>/.env without overriding variables that are already set (like node --env-file). */
export function loadEnv(baseDir: string) {
  const file = join(baseDir, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
  process.env.NODE_ENV ??= 'production';
}

async function fail(message: string): Promise<never> {
  console.error(`\n  ⚠  ${message}\n`);
  if (isWin && process.stdin.isTTY) { // the window would close before anyone could read it
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((r) => rl.question('  Press Enter to close', r));
    rl.close();
  }
  process.exit(1);
}

async function reachable(url: string, timeoutMs: number) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).ok;
  } catch {
    return false;
  }
}

function findBrowser(): string | undefined {
  if (process.env.KIOSK_BROWSER) return process.env.KIOSK_BROWSER;
  if (isWin) {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    return [
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ].find((p) => existsSync(p));
  }
  for (const name of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'brave-browser']) {
    const found = (process.env.PATH ?? '').split(':').map((dir) => join(dir, name)).find((p) => existsSync(p));
    if (found) return found;
  }
  return undefined;
}

/** Windows 11 opens console programs in Windows Terminal, whose window can't be hidden or locked; reopen in conhost. */
function relaunchInConhost(selfCommand: string[]): boolean {
  const conhost = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\conhost.exe`;
  if (!isWin || process.env.GK_CONHOST || !existsSync(conhost)) return false;
  const line = [conhost, ...selfCommand].map((a) => `"${a}"`).join(' ');
  spawn('cmd.exe', ['/d', '/s', '/c', `"start "Gate of Gulyabani" ${line}"`], {
    env: { ...process.env, GK_CONHOST: '1' }, detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
  }).unref();
  return true;
}

function killTree(child: ChildProcess | null, force: boolean) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); // detached → its own process group
  } catch {}
}

const running = (child: ChildProcess | null) => !!child && child.exitCode === null && child.signalCode === null;

export async function runKiosk(opts: KioskOptions) {
  if (relaunchInConhost(opts.selfCommand)) return;
  loadEnv(opts.baseDir);
  const port = process.env.PORT ?? '8080';
  const llm = process.env.LLM_BASE_URL ?? 'http://localhost:1234/v1';

  if (!(await reachable(`${llm}/models`, 3000))) {
    await fail(`LM Studio is NOT reachable at ${llm}\n     Start LM Studio, load google/gemma-4-e2b and enable the server, then run this again.`);
  }
  const browserPath = findBrowser();
  if (!browserPath) await fail(`No Chromium-based browser found. Install ${isWin ? 'Chrome' : 'chromium'} or set KIOSK_BROWSER.`);

  // Logs go to data/kiosk.log and to this window. Output errors are ignored: the terminal may be closed.
  mkdirSync(join(opts.baseDir, 'data'), { recursive: true });
  const logFile = createWriteStream(join(opts.baseDir, 'data', 'kiosk.log'));
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
  const out = (chunk: Buffer | string) => {
    logFile.write(chunk);
    try { process.stdout.write(chunk); } catch {}
  };
  const log = (line: string) => out(`  ${line}\n`);

  // From here on, Ctrl+C, closing the terminal and plain `kill` don't stop the kiosk.
  const ignored: NodeJS.Signals[] = isWin ? ['SIGINT', 'SIGBREAK', 'SIGHUP'] : ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGTSTP'];
  for (const sig of ignored) {
    process.on(sig, () => {});
  }
  process.on('uncaughtException', (err) => log(`⚠  ${err.stack ?? err}`)); // keep running: exiting = escaping

  const profiles = mkdtempSync(join(tmpdir(), 'gulyabani-kiosk-profiles-'));
  let server: ChildProcess | null = null;
  let browser: ChildProcess | null = null;
  let stopping = false;
  process.on('exit', () => { killTree(browser, true); killTree(server, true); });

  // Counts stops that came right after a start; after 5 in a row, waits 5 s between tries.
  const fails = { server: 0, browser: 0 };
  const retryDelay = (what: keyof typeof fails, startedAt: number) => {
    fails[what] = Date.now() - startedAt < QUICK_MS ? fails[what] + 1 : 0;
    if (fails[what] < 5) return 500;
    log(`⚠  The ${what} keeps stopping right after it starts (see data/kiosk.log). Retrying every 5 s.`);
    return 5000;
  };

  let serverStartedAt = 0;
  const startServer = () => {
    serverStartedAt = Date.now();
    const [cmd, ...args] = opts.serverCommand;
    const child = spawn(cmd!, args, {
      cwd: opts.baseDir, env: { ...process.env, KIOSK: '1', PORT: port },
      detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', out);
    child.stderr?.on('data', out);
    child.on('error', (err) => log(`⚠  Server: ${err.message}`));
    child.on('exit', (code, signal) => {
      if (stopping) return;
      if (code === 0) return void shutdown('Kiosk closed by staff.'); // staff exit PIN
      log(`⚠  The server stopped (${signal ?? `exit code ${code}`}). Restarting it.`);
      setTimeout(startServer, retryDelay('server', serverStartedAt));
    });
    server = child;
  };

  // ?kiosk=1 also makes the client request fullscreen on the first key press, as a fallback, and shows the exit button.
  // --disable-background-networking/--disable-sync/--disable-component-update: no Google services on an offline kiosk.
  // Each launch gets a fresh profile dir, so a reopened browser never hands off to one that is still shutting down.
  // Linux: X11 (XWayland) on purpose: on KDE Wayland, native-Wayland Chromium reports "fullscreen" but KWin gives it
  // a smaller window. --class gives it its own window class for the KDE rule.
  let launches = 0;
  let browserStartedAt = 0;
  const launchBrowser = () => {
    launches++;
    browserStartedAt = Date.now();
    const args = [
      '--kiosk', '--start-fullscreen', '--incognito', '--noerrdialogs', '--no-first-run', '--no-default-browser-check',
      '--disable-translate', '--disable-features=TranslateUI', '--disable-pinch', '--overscroll-history-navigation=0',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-networking', '--disable-sync',
      '--disable-component-update', '--log-level=3',
      ...(isWin ? ['--edge-kiosk-type=fullscreen', '--inprivate'] : ['--ozone-platform=x11', `--class=${KIOSK_CLASS}`]),
      `--user-data-dir=${join(profiles, String(launches))}`, `http://localhost:${port}/?kiosk=1`,
    ];
    const child = spawn(browserPath!, args, { detached: true, stdio: isWin ? 'ignore' : ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', out);
    child.stderr?.on('data', out);
    let handled = false;
    const reopen = () => {
      if (handled || stopping) return;
      handled = true;
      setTimeout(launchBrowser, retryDelay('browser', browserStartedAt));
    };
    child.on('error', (err) => { log(`⚠  Browser: ${err.message}`); reopen(); });
    child.on('exit', reopen);
    browser = child;
  };

  // Windows: keyboard hook, Sticky Keys and console lock (see windows-helper.ps1). Attached to this console.
  const startHelper = () => {
    const script = join(profiles, 'windows-helper.ps1');
    writeFileSync(script, opts.windowsHelper());
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentPid', String(process.pid)], {
      stdio: 'inherit',
    });
    child.on('error', (err) => log(`⚠  Windows helper: ${err.message}`));
    child.on('exit', () => { if (!stopping) setTimeout(startHelper, 1000); });
  };

  async function shutdown(message: string) {
    if (stopping) return;
    stopping = true;
    killTree(browser, false);
    killTree(server, false);
    for (let i = 0; i < 10 && (running(browser) || running(server)); i++) await sleep(500);
    killTree(browser, true);
    killTree(server, true);
    rmSync(profiles, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    log(message);
    logFile.end(() => process.exit(0)); // the Windows helper notices this and restores Sticky Keys
  }

  startServer();
  for (let tries = 0; !(await reachable(`http://localhost:${port}/api/status`, 1000)); tries++) {
    if (tries > 60) {
      stopping = true;
      killTree(server, true);
      await fail(`The server did not start on port ${port} (already in use?). See ${join(opts.baseDir, 'data', 'kiosk.log')}.`);
    }
    await sleep(500);
  }

  if (isKde()) {
    if (!setupKde(KIOSK_CLASS)) log('⚠  KDE config tools not found: Alt+Tab / Alt+F4 are not blocked.');
  } else if (!isWin) {
    log("⚠  Not KDE Plasma: Alt+Tab / Alt+F4 can't be blocked here. Closing the browser still just reopens it.");
  }
  launchBrowser();
  if (isWin) startHelper();
}
