# Event Operations

## Reception PC checklist (day before)

- [ ] LM Studio: `google/gemma-4-e2b` loaded, **thinking disabled** if the option exists, auto-unload/TTL **off**, GPU offload max, context 4096, server on `:1234`.
- [ ] `cp .env.example .env` and set **ADMIN_PIN** and **STAFF_PIN** (the defaults 4242/1234 are in the repo).
- [ ] `npm ci && npm run build`, then `npm run kiosk` once and check that `/admin` (in another browser) shows **● LLM online**.
- [ ] `npm run eval` once on the event machine. Latency should be under ~6 s.
- [ ] Set prizes per day, difficulty and volume in the admin panel (`http://localhost:8080/admin`).
- [ ] Delete any test players from rehearsals (admin → Delete player), or `npm run purge -- --yes` for a clean DB.
- [ ] Keyboard layout: **Turkish Q**, and check that `ğ ü ş ı ö ç İ` type correctly in the chat input.
- [ ] Power: laptop on the charger, **sleep / screen-off / screensaver disabled**, OS updates paused.
- [ ] Network: not required. The game works fully offline.
- [ ] Wi-Fi off or Bluetooth off (less distraction for the GPU and fewer popups).
- [ ] Print a small stand card: "Convince the monster, win a gift! / Canavarı ikna et, hediyeyi kap!"

## Start the kiosk

`npm run kiosk` (= `scripts/kiosk.sh`):
1. Checks that LM Studio is reachable at `:1234`, and stops with a big warning if not.
2. Builds the client if `client/dist` is missing, then starts the Node server (with `.env`).
3. Opens Chromium full screen in kiosk mode (fresh incognito profile, no translate popups, no pinch or swipe navigation).

Exit the kiosk with `Alt+F4` (staff only). This also stops the server.

## Staff flow at reception

1. The player plays. If they win, the screen shows the **Win** screen and stays there.
2. Staff hand over the gift, press **`Ctrl+Shift+P`** on the Win screen, type the **staff PIN** and press Enter. This marks the prize as given; then press the on-screen button to return to the attract screen for the next player.
3. If the prize is not handed over (e.g. the player walked away): `Ctrl+Shift+P` → PIN → "Skip without gift", then press the on-screen button.
4. Winners who aren't due a gift (stock empty, or they already got one) can return using the on-screen button or wait for the screen to return to the attract screen after 20 s.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Monster says "refilling my tea" every time | LM Studio is down or the model was unloaded → reload the model in LM Studio. The admin page shows LLM status. |
| Replies very slow (> 10 s) | Check that the GPU is used (LM Studio offload). Close other apps. As a last resort, switch to a smaller model with `LLM_MODEL` env. |
| Too many winners / nobody wins | Admin panel → difficulty slider (0.7 harder ... 1.3 easier). It applies from the next message. |
| Prizes ran out | The game keeps running automatically; the Win screen tells winners no gifts are left today. Adjust the cap in admin if more stock arrives. |
| Screen is stuck | `Ctrl+Shift+X` (staff reset) abandons the current attempt and returns to the attract screen. `Ctrl+Shift+R` (reload) also works. |

## After the event

- Export the players CSV from the admin page.
- Follow the retention plan in [DATA_PRIVACY_KVKK.md](DATA_PRIVACY_KVKK.md): `npm run purge -- --yes [--export backup.csv]` deletes the DB.
- Optional: anonymised stats for a fun post (win rate, funniest winning lines, with permission).
