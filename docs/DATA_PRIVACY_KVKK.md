# Personal Data and KVKK

> This is the technical plan, **not legal advice**. The KVKK notice (*aydınlatma metni*) and consent wording must come
> from, or be approved by, the studio's legal/compliance contact. The app shows whatever text we place in `server/content/kvkk_{tr,en}.md`.

## What we collect and why

| Data | Purpose | Required |
|---|---|---|
| First name, surname | Leaderboard display (first name + initial), identifying the prize winner | Yes |
| Email | Unique player identity (one prize per person), contacting winners | Yes |
| Phone | Contacting winners, duplicate-prize check | Yes |
| Chat messages | Game play, tuning the monster afterwards | Yes (part of the game) |

## Consent UX

- **Checkbox 1 (required):** "I have read the KVKK Information Notice and consent to the processing of my data for this game." Includes a link that opens the full notice in a modal (keyboard-accessible).
- No marketing consent is collected: the data is used only for the game and prizes. (If you later want to send marketing emails or SMS, you'd need a separate, unticked opt-in checkbox and Turkish ETK/İYS rules apply.)
- We store the consent timestamp and `kvkk_notice_version` with each player.
- A small on-screen note says that chat messages appear on a public screen, so don't type personal information.

## Storage and security

- The data stays **only on the reception PC** in `data/game.db`. Nothing goes to the cloud, and the LLM runs locally.
- The leaderboard and screens never show email or phone. The admin page is behind a PIN.
- The form is cleared on idle timeout, and nothing personal is kept in `localStorage`.
- Kiosk mode: no browser UI, no dev tools, no address bar.
- Recommended: an encrypted disk (LUKS) on the reception PC, an OS screen lock when staff leave, and the PC taken home after the event rather than left at the venue.

## Export and retention

- The admin page has a **CSV export** of players and their attempts.
- Retention: proposed **delete everything N days after the event** (e.g. 30 days, once prizes are settled). The final number comes from legal.
- `npm run purge -- --yes [--export backup.csv]`: deletes the DB, optionally exporting a CSV first (store that file encrypted).
- Players can ask for their data to be deleted: the admin page can delete a player by email.
