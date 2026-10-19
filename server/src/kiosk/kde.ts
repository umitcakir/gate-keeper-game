// KDE Plasma setup for the kiosk window (see launcher.ts). Alt+Tab, Alt+F4, Meta, Ctrl+Alt+Del... are KWin global
// shortcuts, which a web page can't block, so:
// 1. A KWin window rule ("Ignore global shortcuts", forced) turns them all off while the kiosk window is focused.
//    It matches only the kiosk browser's own window class, so it is safe to leave installed:
//    System Settings → Window Management → Window Rules → "Gate of Gulyabani kiosk".
// 2. The third-party KWin script "Remember Window Positions" (if installed) restores every window to its last size
//    by class, which shrinks the fullscreen kiosk window to whatever size it once had. The class goes on its
//    blacklist (keeping the existing entries) and the script is reloaded. Done once; the entry then stays.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const RULE_ID = 'gulyabani-kiosk';

const onPath = (name: string) =>
  (process.env.PATH ?? '').split(delimiter).map((dir) => join(dir, name)).find((p) => existsSync(p));

export const isKde = () => process.platform === 'linux' && (process.env.XDG_CURRENT_DESKTOP ?? '').includes('KDE');

/** Returns false when the KDE config tools are missing (shortcuts can't be blocked). */
export function setupKde(windowClass: string): boolean {
  const writeTool = onPath('kwriteconfig6') ?? onPath('kwriteconfig5');
  const readTool = onPath('kreadconfig6') ?? onPath('kreadconfig5');
  if (!writeTool || !readTool) return false;
  const write = (file: string, group: string, key: string, value: string, type?: string) =>
    spawnSync(writeTool, ['--file', file, '--group', group, '--key', key, ...(type ? ['--type', type] : []), value]);
  const read = (file: string, group: string, key: string) =>
    (spawnSync(readTool, ['--file', file, '--group', group, '--key', key], { encoding: 'utf8' }).stdout ?? '').replace(/\n$/, '');

  write('kwinrulesrc', RULE_ID, 'Description', 'Gate of Gulyabani kiosk');
  write('kwinrulesrc', RULE_ID, 'wmclass', windowClass);
  write('kwinrulesrc', RULE_ID, 'wmclassmatch', '1');
  write('kwinrulesrc', RULE_ID, 'disableglobalshortcuts', 'true', 'bool');
  write('kwinrulesrc', RULE_ID, 'disableglobalshortcutsrule', '2');
  const rules = read('kwinrulesrc', 'General', 'rules').split(',').filter(Boolean);
  if (!rules.includes(RULE_ID)) {
    rules.push(RULE_ID);
    write('kwinrulesrc', 'General', 'rules', rules.join(','));
    write('kwinrulesrc', 'General', 'count', String(rules.length));
  }
  spawnSync('dbus-send', ['--session', '--type=method_call', '--dest=org.kde.KWin', '/KWin', 'org.kde.KWin.reconfigure']);

  const scriptXml = [join(homedir(), '.local/share/kwin/scripts'), '/usr/share/kwin/scripts']
    .map((dir) => join(dir, 'rememberwindowpositions/contents/config/main.xml'))
    .find((p) => existsSync(p));
  if (scriptXml) {
    let list = read('kwinrc', 'Script-rememberwindowpositions', 'blacklist');
    if (!list) { // not customised yet: start from the script's own default list
      list = /<entry name="blacklist"[^>]*>\s*<default>([\s\S]*?)<\/default>/.exec(readFileSync(scriptXml, 'utf8'))?.[1] ?? '';
    }
    if (!list.split(/\r?\n/).map((s) => s.trim()).includes(windowClass)) {
      write('kwinrc', 'Script-rememberwindowpositions', 'blacklist', `${list.trimEnd()}\n${windowClass}`);
      const qdbus = onPath('qdbus6') ?? onPath('qdbus');
      if (qdbus) {
        spawnSync(qdbus, ['org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.unloadScript', 'rememberwindowpositions']);
        spawnSync(qdbus, ['org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting.start']);
      }
    }
  }
  return true;
}
