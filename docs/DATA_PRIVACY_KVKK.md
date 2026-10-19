# Personal Data and KVKK

> This is the technical plan, **not legal advice**. The KVKK notice (*aydınlatma metni*) comes from legal: data controller
> Sisal Technology Yazılım A.Ş., requests to ik@sisal.com. The app shows the text in `server/content/kvkk_{tr,en}.md`
> (Turkish is the official text; English is a convenience translation). Bump `KVKK_NOTICE_VERSION` (`server/src/config.ts`) when it changes.
> **The app must keep matching what the notice promises** (initials only on screen, local processing only, 30-day retention).

## What we collect and why

| Data | Purpose | Required |
|---|---|---|
| First name, surname | Leaderboard display (initials only, e.g. "A. K."), identifying the prize winner | Yes |
| Email | Unique player identity (one prize per person), contacting winners | Yes |
| Phone | Contacting winners, duplicate-prize check | Yes |
| Chat messages | Game play, tuning the monster afterwards | Yes (part of the game) |

## Legal basis and notice UX

- Legal basis is **legitimate interest (KVKK Art. 5/2-f)**, not explicit consent. So the form asks for an acknowledgement, not consent: asking for consent where another legal basis applies is considered misleading under KVKK.
- **Checkbox (required):** "I have read and understood the KVKK Privacy Notice." Includes a link that opens the full notice in a modal (keyboard-accessible).
- No marketing consent is collected: the data is used only for the game and prizes. (If you later want to send marketing emails or SMS, you'd need a separate, unticked opt-in checkbox and Turkish ETK/İYS rules apply.)
- We store the acknowledgement timestamp (`kvkk_consent_at`) and `kvkk_notice_version` with each player.
- A small on-screen note says that chat messages appear on a public screen, so don't type personal information.

## Storage and security

- The data stays **only on the reception PC** in `data/game.db`. Nothing goes to the cloud, and the LLM runs locally.
- Public screens show names as initials only (leaderboard and closest chips); the win screen shows no name. Email and phone are never shown. The admin page is behind a PIN.
- The form is cleared on idle timeout, and nothing personal is kept in `localStorage`.
- Kiosk mode: no browser UI, no dev tools, no address bar.
- Recommended: an encrypted disk (LUKS) on the reception PC, an OS screen lock when staff leave, and the PC taken home after the event rather than left at the venue.

## Export and retention

- The admin page has a **CSV export** of players and their attempts.
- Retention (from the notice): **at most 30 days after the game results are final**, earlier if the purpose ends sooner. Put the purge date in the calendar.
- `npm run purge -- --yes [--export backup.csv]`: deletes the DB, optionally exporting a CSV first (store that file encrypted).
- Players can ask for their data to be deleted: the admin page can delete a player by email.
