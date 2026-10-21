# Gate of Gulyabani — CodeHub Workshop Reception Game

A small kiosk game for the reception of the [CodeHub](https://codehub.tr/) workshop.
Attendees fill out a short form and then try to **talk a monster into opening the prize gate**.
The monster's "brain" is a local LLM (`google/gemma-4-e2b`, running in LM Studio). Its instructions
tell it to keep the gate shut. Players who win its trust within the limits get a gift.

> Status: **playable v1**. M0–M4 are built; M5 (playtests, tuning, dress rehearsal) is next. See [ROADMAP.md](ROADMAP.md).

## Quick start

Prerequisites: Node ≥ 24 (26 recommended), Chromium, and LM Studio serving `google/gemma-4-e2b` on `:1234`.

```bash
npm install
npm run dev        # API on :8080 + Vite dev server on http://localhost:5173 (hot reload)
```

| Command | What it does |
|---|---|
| `npm run build` | Builds a self-contained `dist/` (client, server, production `node_modules`, kiosk launchers) to copy to the reception PC |
| `npm run build:exe` | Single executables with everything inside (kiosk mode and all its protections): `release/win-x64/gulyabani-kiosk.exe`, `release/linux-x64/gulyabani-kiosk` |
| `npm start` | Runs the server from `dist/` on http://localhost:8080 |
| `./kiosk.sh` / `kiosk.cmd` / `npm run kiosk` | **Event day**: builds `dist/` if needed, then starts the kiosk from it: checks LM Studio, starts the server, opens Chromium in kiosk mode |
| `npm test` | Unit tests (trust engine, filters) |
| `npm run typecheck` | TypeScript check for server + client |
| `npm run eval` | Prompt eval: category accuracy + scripted games against the real LLM (~3 min) |
| `npm run chat` | Chat with the monster in the terminal (shows the scoring) |
| `npm run art` | Regenerate the placeholder SVG art |
| `npm run purge -- --yes` | Delete all personal data after the event (the event DB in `dist/data/`) |
| `npm run reset-winners -- [--today] --yes` | Clear the winner list (keeps players) in `dist/data/` |

Admin dashboard: http://localhost:8080/admin (PIN from `.env`, default `4242`). Staff PIN on the win screen: `Ctrl+Shift+P`, default `1234`. Kiosk exit: the ⏻ button in the bottom-left corner, PIN default `1885`.
Copy `.env.example` to `.env` and **change the PINs** before the event.

## How a round works

1. **Attract screen**: the monster idles in front of the gate. "Press Enter to play."
2. **Registration form**: name, surname, email, phone, year of birth, 18+ confirmation and KVKK acknowledgement (both required), TR/EN.
3. **Play**: the player has up to 10 messages or 3 minutes, whichever runs out first. Every reply moves a **trust meter**.
4. **Gate opens** when trust reaches 100 → win screen, leaderboard entry, and a staff-confirmed prize (while today's stock lasts).
5. **Fail**: a funny farewell, then back to the attract screen.

## Docs

| File | What's inside |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Milestones, day-by-day plan, open questions |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Screens, rules, trust meter, anti-cheat, leaderboard, prize cap |
| [docs/MONSTER_PERSONA.md](docs/MONSTER_PERSONA.md) | Character bible and the system prompt draft |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, components, API, DB schema, LLM integration notes |
| [docs/DATA_PRIVACY_KVKK.md](docs/DATA_PRIVACY_KVKK.md) | Personal data handling, consent, retention, export |
| [docs/EVENT_OPS.md](docs/EVENT_OPS.md) | Reception PC setup, kiosk mode, event-day runbook, failure recovery |

## Stack

- **Client**: Vite + TypeScript + Phaser 3.90 for the scene; HTML/CSS overlay for the form and chat; WebAudio-synthesised SFX.
- **Server**: Node 26 (runs `.ts` natively) + Fastify, with the built-in `node:sqlite` module for storage.
- **LLM**: LM Studio OpenAI-compatible API at `http://localhost:1234/v1`, model `google/gemma-4-e2b`.
- **Hardware**: a single reception PC runs everything (LM Studio + server + Chromium in kiosk mode).
