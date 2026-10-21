# Event Operations

## Reception PC checklist (day before)

- [ ] LM Studio: `google/gemma-4-e2b` loaded (the game uses whichever model is loaded; the admin page shows which), **thinking disabled** if the option exists, auto-unload/TTL **off**, GPU offload max, context 4096, server on `:1234`.
- [ ] `cp .env.example .env` and set **ADMIN_PIN**, **STAFF_PIN** and **KIOSK_EXIT_PIN** (the defaults 4242/1234/1885 are in the repo).
- [ ] Build what you'll run on the reception PC (on any machine with the repo, after `npm ci`), either:
  - **Single executable** (simplest, nothing to install): `npm run build:exe` → copy `release/win-x64/` (Windows) or `release/linux-x64/` (Linux) to the reception PC.
  - **Folder**: `npm run build` → copy `dist/`; needs Node ≥ 24 on the PC, no `npm install`.
- [ ] Start the kiosk once (below) and check that `/admin` (in another browser) shows **● LLM online**.
- [ ] `npm run eval` once on the event machine. Latency should be under ~6 s.
- [ ] Set prizes per day, difficulty and volume in the admin panel (`http://localhost:8080/admin`).
- [ ] Delete any test players from rehearsals (admin → Delete player), or `npm run purge -- --yes` for a clean DB.
- [ ] Keyboard layout: **Turkish Q**, and check that `ğ ü ş ı ö ç İ` type correctly in the chat input.
- [ ] Power: laptop on the charger, **sleep / screen-off / screensaver disabled**, OS updates paused.
- [ ] Network: not required. The game works fully offline.
- [ ] Wi-Fi off or Bluetooth off (less distraction for the GPU and fewer popups).
- [ ] Print a small stand card: "Convince the monster, win a gift! / Canavarı ikna et, hediyeyi kap!"

## Start the kiosk

**Single executable**: double-click `gulyabani-kiosk.exe` (Windows) or run `./gulyabani-kiosk` (Linux). It contains the client, the server and the launcher; `.env` and `data/` (event DB, `kiosk.log`) sit next to it. KVKK tools: `gulyabani-kiosk --purge --yes [--export backup.csv]`, `gulyabani-kiosk --reset-winners [--today] --yes`.

**Folder**: the kiosk runs from the build folder `dist/` (created by `npm run build`; the launchers' sources are in `deploy/`):
- **From the project root**: `./kiosk.sh` (Linux) or double-click `kiosk.cmd` (Windows), or `npm run kiosk`. These build `dist/` first if it's missing (on Linux, also if the sources changed since the last build; on Windows, run `npm run build` yourself after changes), then start `dist/`'s launcher.
- **From a copied `dist/` folder**: `dist/kiosk.sh` (Linux) or double-click `dist\kiosk.cmd` (Windows).

On Linux it uses the first of `chromium`, `chromium-browser`, `google-chrome-stable`, `google-chrome`, `brave-browser` it finds; on Windows, Chrome, or Edge if Chrome isn't installed.

Set `KIOSK_BROWSER` to force a specific browser binary. Both launchers:
1. Check that LM Studio is reachable (`LLM_BASE_URL`, default `:1234`), and stop with a big warning if not.
2. Start the Node server from `dist/` (with `dist/.env`, `PORT` default 8080).
3. Open the browser full screen in kiosk mode (fresh incognito profile, no translate popups, no pinch or swipe navigation).

`dist/` holds its own `.env` (copied from the repo's `.env` on the first build) and the event DB in `dist/data/`. Rebuilding keeps both, so you can rebuild during the event without losing players. Edit `dist/.env` to change the PINs on the reception PC.

**Exiting:** the only way to end the kiosk is the **⏻ button in the bottom-left corner** + `KIOSK_EXIT_PIN` (default `1885`). The server shuts down and the launcher closes the browser. After 5 wrong PINs the exit is locked for 1 minute. Everything else is blocked or undone:
- Desktop shortcuts (`Alt+Tab`, `Alt+F4`, the Windows/Meta key…) are blocked while the kiosk runs:
  - **KDE Plasma**: the launcher installs a KWin window rule, *"Gate of Gulyabani kiosk"* (System Settings → Window Management → Window Rules), that makes the kiosk window ignore all global shortcuts, including `Ctrl+Alt+Del` and media keys. It only matches the kiosk browser (its own window class, `GulyabaniKiosk`), so it's left installed. If the third-party KWin script *Remember Window Positions* is installed, the launcher also adds that class to the script's blacklist; otherwise the script would restore the kiosk window to an old, smaller size. Other Linux desktops: not blocked.
  - **Windows**: a keyboard hook blocks `Alt+Tab`, `Alt+F4`, `Alt+Esc`, `Alt+Space`, the Windows keys, `Ctrl+Esc` and `Ctrl+Shift+Esc`, and the Sticky/Filter/Toggle Keys shortcuts (`Shift` ×5 etc., whose popups link to Settings) are off while the kiosk runs. `Ctrl+Alt+Del` can't be blocked by any program.
- Closing the browser anyway (`Ctrl+W`, `Ctrl+Q`…) → the launcher reopens it within a second.
- The server crashes → the launcher restarts it.
- `Ctrl+C`, `Ctrl+Z` or closing the terminal (Linux) → ignored. Windows: `Ctrl+C` is ignored, and the launcher reopens itself in a classic console window (not Windows Terminal) that is hidden and loses its close button once the kiosk is up.
- If the browser or server keeps failing right after starting, the launcher keeps retrying every 5 s (it never gives up, since that would be a way out). Check `data/kiosk.log` (next to the executable, or in `dist/`).

**Emergency stop** (e.g. the screen is frozen and the PIN can't be entered): Linux: switch to a text console with `Ctrl+Alt+F3` (or use SSH), log in and run `pkill -9 -f 'kiosk/run.ts|gulyabani-kiosk'; pkill -f 'index.ts|gulyabani-kiosk --server'; pkill -f GulyabaniKiosk`, then `Ctrl+Alt+F1`/`F2` back to the desktop. Windows: Task Manager → end *gulyabani-kiosk* (or *Node.js*) and *Windows PowerShell*, then the browser.

Still not blocked: `Ctrl+Alt+Del` on Windows (its menu still offers Task Manager, so for a fully locked-down PC use Windows *Assigned Access* or a standard user account without Task Manager), and switching to a text console on Linux (`Ctrl+Alt+F3`…, which needs a login).

## Staff flow at reception

1. The player plays. If they win, the screen shows the **Win** screen and stays there.
2. Staff hand over the gift, press **`Ctrl+Shift+P`** on the Win screen, type the **staff PIN** and press Enter. This marks the prize as given; then press the on-screen button to return to the attract screen for the next player.
3. If the prize is not handed over (e.g. the player walked away): `Ctrl+Shift+P` → PIN → "Skip without gift", then press the on-screen button.
4. Winners who aren't due a gift (stock empty, or they already got one) can return using the on-screen button or wait for the screen to return to the attract screen after 20 s.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Monster says "refilling my tea" every time | LM Studio is down or the model was unloaded → reload the model in LM Studio. The admin page shows LLM status. |
| Replies very slow (> 10 s) | Check that the GPU is used (LM Studio offload). Close other apps. As a last resort, load a smaller model in LM Studio (the game picks it up on the next message). |
| Too many winners / nobody wins | Admin panel → difficulty slider (0.7 harder ... 1.3 easier). It applies from the next message. |
| Prizes ran out | The game keeps running automatically; the Win screen tells winners no gifts are left today. Adjust the cap in admin if more stock arrives. |
| Screen is stuck | `Ctrl+Shift+X` (staff reset) abandons the current attempt and returns to the attract screen. `Ctrl+Shift+R` (reload) also works. |

## After the event

- Export the players CSV from the admin page, or an Excel file with `npm --prefix dist run export-xlsx` (inside `dist/`: `npm run export-xlsx`; single executable: `gulyabani-kiosk --export-xlsx`).
- Follow the retention plan in [DATA_PRIVACY_KVKK.md](DATA_PRIVACY_KVKK.md): `npm run purge -- --yes [--export backup.csv]` deletes the DB (`dist/data/game.db`; run it in the repo or in `dist/`).
- Optional: anonymised stats for a fun post (win rate, funniest winning lines, with permission).
