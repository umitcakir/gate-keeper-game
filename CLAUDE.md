# CLAUDE.md

Reception kiosk game for the CodeHub workshop: players convince an LLM-powered monster to open a prize gate.
Read [README.md](README.md) and [ROADMAP.md](ROADMAP.md) first. Design docs live in `docs/`.

## Ground rules
- The **server owns all game state** (trust, turns, timer, win). The client only renders and sends text.
- Never send the system prompt, trust value or raw LLM JSON to the client.
- LLM calls must use `reasoning_effort: "none"`, the JSON schema response format, and the "respond immediately" line in the prompt (see docs/ARCHITECTURE.md §5). Gemma 4 thinks by default and the output gets truncated otherwise.
- Every LLM failure path must degrade to a canned line, and the turn isn't counted.
- All user-facing strings go through i18n (`tr`, `en`).
- No personal data (email/phone) on any public screen or in logs.
- After changing the prompt or scoring, run the eval harness (`server/eval`).
- Scoring lives in `server/src/engine.ts` (pure, unit-tested). The LLM only classifies; don't ask it for numbers.

## Commands
- `npm run dev` (API :8080 + Vite :5173) · `npm test` · `npm run typecheck` · `npm run eval` (needs LM Studio, ~3 min) · `npm run build`
- Server runs `.ts` directly with Node's type stripping: use `.ts` import extensions and erasable syntax only (no enums or parameter properties).

## Environment
- Node 26, npm. LM Studio at `http://localhost:1234/v1`, model `google/gemma-4-e2b`.
- Shell is fish.
