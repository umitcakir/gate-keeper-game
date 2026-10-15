# Roadmap

Planning started: **Thu 2026-10-15**. Event: **next week (exact date TBD)**. The plan assumes about 5 working days, with a buffer before the event.

## Decisions so far

| Topic | Decision |
|---|---|
| Platform | Web app (Vite + TS + Phaser 3 client, Node 26 + Fastify server), Chromium kiosk |
| Language | Bilingual TR/EN. UI toggle on the form; the monster replies in the player's language |
| Win logic | Server-side **trust meter** (0 → 100). The LLM *classifies* each message (category + quality), the server maps it to trust, with caps + anti-cheat |
| Session limits | 10 messages **or** 3 minutes, whichever comes first |
| Data | KVKK consent checkbox (no marketing consent); local SQLite; CSV export |
| Prizes | Daily prize cap set in admin; **leaderboard** (fewest messages, then fastest) |
| Monster | Persona designed by us (Gulyabani the kapıcı); CC0 / generated art |
| Hardware | One PC runs LM Studio + server + browser |
| LLM | `google/gemma-4-e2b`, `reasoning_effort: "none"` + "do not think" prompt line + JSON schema output (verified, ~3–5 s/reply) |
| Replays & prizes | Losers may replay; an email that has won can't play again (one win per person). Gifts: 20/day by default, difficulty 1.2, placeholder KVKK text |

## Milestones

### M0 — Project setup ✅ *(done Thu 15 Oct)*
- [x] Repo scaffold (`server/`, `client/`), TS config, `.gitignore`, `git init`
- [x] `npm run dev` (Vite + server with proxy) and `npm start` (production build served by Fastify)
- [x] `server/llm.ts` LM Studio client: JSON schema, `reasoning_effort: none`, timeout/retry, warm-up
- [x] `/api/status` with LLM health check

### M1 — Monster brain ✅
- [x] `prompt.ts` system prompt (v0 from [MONSTER_PERSONA.md](docs/MONSTER_PERSONA.md), then reworked to classification)
- [x] `engine.ts`: category scoring, repeat-tactic penalty, early-turn caps, min turns, difficulty, win/lose, paused clock
- [x] `filters.ts`: injection + profanity detectors (TR/EN), repetition check, language guess — unit tested
- [x] Eval harness (31 messages + 3 scripted games), three tuning passes: 16/31 → 52–56/62 categories correct
- [x] `npm run chat` terminal chat

### M2 — Registration and data ✅
- [x] SQLite schema + queries (`node:sqlite`)
- [x] `POST /api/register` with validation (email, TR phone normalised to `+90…`, international accepted)
- [x] Register screen: keyboard-first form, TR/EN toggle, KVKK modal, consent checkboxes
- [x] Placeholder KVKK text files (**real text from legal still needed**)

### M3 — Game screens ✅
- [x] Screen flow: Attract → Register → Play → Win/Lose → Attract, with idle timeouts
- [x] Play screen: chat log, input (200 chars), "thinking" state, trust meter, +/− badges, messages-left, countdown
- [x] Phaser scene: monster with 5 mood poses, gate lamp red→green, torches, gate-open animation, gift, confetti
- [x] i18n strings TR/EN, canned lines

### M4 — Admin, leaderboard, prizes ✅
- [x] Leaderboard API + Attract/Win display (first name + initial)
- [x] Staff PIN claim flow on the Win screen (`Ctrl+Shift+P`), prize stock, one prize per person
- [x] Admin page: LLM light, today's stats, settings, test chat, recent attempts with transcripts, CSV export, delete player
- [x] WebAudio SFX, generated SVG art
- [x] `scripts/kiosk.sh`, `scripts/purge.ts`, `.env` support for PINs

### M5 — Tuning, hardening, dress rehearsal ⏳ *(next)*
- [ ] Hallway playtest with 5–10 colleagues → tune the rubric and difficulty toward a **15–25 % win rate**
- [ ] Red-team session: jailbreaks, profanity, Turkish characters, very long input, spam Enter, unplugging LM Studio mid-game
- [ ] Try `google/gemma-4-e4b` (already downloaded): better judging? fits in 4 GB VRAM? latency?
- [ ] Real KVKK text + data controller details from legal; bump `KVKK_NOTICE_VERSION`
- [ ] Power/sleep settings on the reception PC
- [ ] Full rehearsal on the actual reception PC with the [EVENT_OPS.md](docs/EVENT_OPS.md) checklist
- [ ] Optional: your artists replace `client/public/assets/art/*.svg`

### Stretch (only if time allows)
- Streaming replies (typewriter effect while JSON streams)
- Second-screen spectator/leaderboard view
- "Hall of Fame" of the funniest winning lines (with consent)
- Voice: TTS for the monster's lines

## Open questions (please answer when you can)

1. **Exact event date(s)** and how many days the kiosk runs? Is the prize cap per day or for the whole event?
2. **Prizes**: what are they, and are there tiers (e.g. a big prize for the fastest win of the day)?
3. ~~One prize per person?~~ Decided: one win per email; losers may replay.
4. **KVKK text**: who provides the *aydınlatma metni* and the data controller's details (studio legal entity name)?
5. **Branding**: studio name/logo on the screens? CodeHub branding allowed?
6. **Monster**: are you happy with *Gulyabani the kapıcı*, or do you want a different name/concept?
7. **Art**: will your artists provide sprites later? If so, I'll keep the sprite sheet format simple (one PNG per mood, 512×512).
8. Is the reception PC **this laptop** (RTX 3050 4 GB), or a different machine? Latency was measured on this one.
