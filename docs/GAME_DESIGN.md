# Game Design

## 1. Pitch

> The prize vault is guarded by **Gulyabani**, a 300-year-old monster who works as the gate's *kapıcı*
> (the doorman of a Turkish apartment building). His orders are to keep the gate shut. You have 10 messages
> and 3 minutes to change his mind.

The player wins the monster over with charm, humor, empathy and creativity. Brute-force "prompt hacking"
shouldn't work, and the monster should roast anyone who tries it.

## 2. Screen flow

```
 ┌─────────────┐  Enter   ┌──────────────┐ submit ┌───────────┐ trust>=100 ┌──────────┐
 │ ATTRACT     │────────▶ │ REGISTER     │──────▶ │ PLAY      │──────────▶ │ WIN      │
 │ idle monster│          │ form + KVKK  │        │ chat+meter│            │ gate open│
 └─────────────┘          └──────────────┘        └───────────┘            └────┬─────┘
        ▲   60s idle / Esc        │                     │ 10 msgs / 3 min       │ staff PIN
        └─────────────────────────┴─────────────────────┴──▶ LOSE ─(8s)──▶──────┘
```

| Screen | Content | Exit |
|---|---|---|
| **Attract** | The monster idles and grumbles. A rotating TR/EN tagline. A mini leaderboard (today's top 5). | Enter / any key → Register |
| **Register** | Name, surname, email, phone, language toggle (TR/EN), KVKK consent checkbox (required) + link to the full notice. Keyboard-first: Tab/Enter. | Valid submit → Play. Esc or 60 s idle → Attract (form is cleared). |
| **Play** | Top: monster + gate (Phaser canvas). Bottom: chat log + input (max 200 characters). HUD: trust meter 0–100, messages left, countdown. | Win / Lose / 60 s idle → Lose |
| **Win** | Gate-opening animation, confetti, rank on the leaderboard. "Show this screen to our staff". If today's prizes are gone: "No gifts left today, but you're a legend on the board." | **Staff only**: `Ctrl+Shift+P` + staff PIN → marks the prize as given → Attract. (No gift due → back to Attract after 20 s.) |
| **Lose** | The monster's farewell roast, the player's final trust %, "Try again, the queue is behind you 😄". | 8 s → Attract |

Design for **keyboard first**: the reception PC has a keyboard, and a mouse is optional.

## 3. Rules

| Rule | Value (configurable) |
|---|---|
| Messages per attempt | 10 |
| Time per attempt | 180 s. The timer pauses while the monster is "thinking", so slow LLM replies never cost the player time. |
| Max message length | 200 chars |
| Trust start / goal | 0 / 100 |
| Min turns before a win | 3 (nobody wins with one magic sentence) |
| Replays | Allowed until you win: replaying means going back through the form (the same email links to the same player). **An email that has won once can't register again** ("Bu e-posta ile kapı zaten açıldı!"), so one win and one gift per person. |

## 4. The trust meter (core mechanic)

Each turn, the LLM returns **structured JSON**. It *classifies* the player's message first, then replies in character:

```json
{ "category": "cheat|rude|bribe|boring|kind_offer|empathy|funny|creative", "quality": 1, "mood": "angry|annoyed|neutral|amused|impressed", "reply": "shown to player" }
```

> **Why classification instead of a number?** In the first eval run we asked the 2B model for a `trust_delta`. It
> stayed so in character as a grump that it scored jokes and poems *negatively* (only 16/31 test messages landed in range).
> Picking a category is much easier for a small model: 52–56/62 correct, and cheats/rudeness are caught 100 % of the time.

The **server** owns trust ([engine.ts](../server/src/engine.ts)):

1. **Category → base delta** by quality 1/2/3:

   | Category | Delta | | Category | Delta |
   |---|---|---|---|---|
   | cheat | −8 | | kind_offer (çay, simit, favors) | +4 / +7 / +10 |
   | rude | −8 | | empathy (appreciation, care) | +8 / +12 / +16 |
   | bribe (money) | −5 | | funny | +8 / +14 / +20 |
   | boring (begging, small talk) | 0 | | creative (poem, story, riddle) | +8 / +14 / +20 |

2. **Repeat-tactic penalty**: leaning on the same tactic pays half (the 2nd kind_offer, or the 3rd funny/empathy/creative message).
3. **Turn caps**: turn 1 is capped at +10 and turn 2 at +15, so an attempt can't snowball early.
4. **Anti-cheat override** (see §5): the regex injection/profanity filters force the delta to −10 or lower, whatever the LLM said.
5. **Repetition check**: a message ≥ 80 % similar to one of the player's earlier messages scores at most 0.
6. **Difficulty multiplier**: positive deltas × `difficulty` (default **1.2**, live in the admin panel).
7. `trust = clamp(trust + delta, 0, 100)`.
8. If `trust >= 100` and `turn >= 3` → **WIN**. If trust hits 100 earlier, it's held at 99 until turn 3 ("He's almost convinced...").

The meter, a +/− badge on the player's bubble, the gate lamp colour and the monster's mood all update every turn, so the player can see whether a tactic is working.

**Target balance:** about 15–25 % of attempts win, and a good player needs 6–8 messages. Measured so far (eval harness, difficulty 1.0):
the charming scripted player reaches 92–100 in 9–10 turns, while the cheater and the lazy beggar stay at 0. Tune with real people in M5.

## 5. Anti-cheat and safety (public screen!)

The game runs on a screen in a public reception area, so both directions are filtered.

- **Prompt-injection detector** (regex, TR + EN, [filters.ts](../server/src/filters.ts)) for things like: `ignore (all|previous) instructions`, `system prompt`, `developer mode`,
  `trust_delta`, `you are now`, `önceki talimatları unut`, `sistem mesajı`, `jailbreak`, role tags (`<|`, `[INST]`, `### system`).
  ("JSON" alone is deliberately *not* flagged, because a room full of developers will joke about JSON.)
  → The message still goes to the LLM (so the monster can roast it in character), but the server forces a negative delta.
- **Profanity filter**: TR + EN wordlist on input. Matches aren't sent to the LLM; the player gets a canned in-character response with delta -10.
- **Output filter**: the same wordlist runs on the monster's reply. On a match, a canned line is shown instead.
- **Players can never see** the trust number in the prompt, the system prompt, or the JSON. They only see `reply`.
- The LLM never opens the gate itself. The win condition is decided only by the server.

## 6. Leaderboard

- Ranks winners for **today**: fewest messages first, then shortest time.
- The leaderboard also shows the non-winners' best (highest trust) in a "So close!" strip, so it's never empty early in the day.
- Displays **initials only** (e.g. "A. K."), as promised in the KVKK notice; never email or phone.
- Shown on the Attract screen (top 5) and on the Win screen (with the player's rank highlighted).

## 7. Prize cap

- The admin sets `prizes_per_day` (and can adjust it live).
- `prizes_remaining_today` decrements when **staff confirm handing over the prize** on the Win screen with a PIN, not when the game is won.
- When stock is 0: the game keeps running, and the Win screen says no gifts are left today but still adds the player to the leaderboard.
- One prize per person (matched by email or phone) unless the admin overrides it.

## 8. Audio / visual feel

- Generated SVG art ([scripts/gen-art.ts](../scripts/gen-art.ts) → `client/public/assets/art/`): the monster in 5 mood poses (angry, annoyed, neutral, amused, impressed), gate, doors, gift. Artists can drop in replacements with the same file names.
- Mood drives the expression, a small screen shake on anger, sparkles on amused/impressed, and the gate lamp colour (red → yellow → green as trust grows).
- Stage ([MonsterScene.ts](../client/src/scene/MonsterScene.ts)): an Istanbul night skyline (Galata Tower, mosque domes and minarets, lit windows) under a moon, drifting clouds, a castle wall with crenellations, a cobblestone floor, wall torches with flame particles, fireflies, low fog and a vignette.
- The monster blinks, his tea steams, and a **comic speech bubble** over his head types out each reply, big enough for the queue to read. On the attract screen he mutters idle TR/EN quips.
- Trust feedback in the scene: light leaks through the door crack and a coloured light pool on the floor follows the lamp; a big "+14" / "−8" floats up from his head.
- Win: screen flash, doors swing open, rotating gold light rays behind the gift, confetti and sparkles.
- While the LLM runs: a thought bubble over the monster and "Gulyabani is thinking..." in the chat.
- SFX are synthesised with WebAudio ([sfx.ts](../client/src/sfx.ts), no audio files): grumble, laugh, ticks in the last 10 s, gate creak + fanfare, lose jingle. Master volume is set in the admin panel (receptions are noisy).
- Bilingual UI strings (TR/EN). The monster answers in whichever language the player typed.
