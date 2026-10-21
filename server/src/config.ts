// Static configuration (env). Runtime-tunable game settings live in the DB `settings` table (see settings.ts).
import { resolve } from 'node:path';

// The single executable (server/src/kiosk/main.ts) sets GK_ROOT, CLIENT_DIST and CONTENT_DIR: it has no source tree.
const projectRoot = process.env.GK_ROOT ?? resolve(import.meta.dirname, '..', '..');

export const config = {
  projectRoot,
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '127.0.0.1',
  production: process.env.NODE_ENV === 'production',

  llmBaseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:1234/v1',
  llmModel: process.env.LLM_MODEL ?? 'google/gemma-4-e2b',
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 15000),
  llmTemperature: Number(process.env.LLM_TEMPERATURE ?? 0.6),
  /** How many previous exchanges are sent to the LLM as context. */
  llmHistoryTurns: 6,

  dbPath: process.env.DB_PATH ?? resolve(projectRoot, 'data', 'game.db'),
  clientDist: process.env.CLIENT_DIST ?? resolve(projectRoot, 'public'),
  contentDir: process.env.CONTENT_DIR ?? resolve(projectRoot, 'server', 'content'),

  adminPin: process.env.ADMIN_PIN ?? '4242',
  staffPin: process.env.STAFF_PIN ?? '1234',
  /** Set by the kiosk launcher (server/src/kiosk/launcher.ts); enables the staff exit route. */
  kiosk: process.env.KIOSK === '1',
  kioskExitPin: process.env.KIOSK_EXIT_PIN ?? '1885',

  /** Bump when the KVKK notice text changes; stored with every acknowledgement. */
  kvkkNoticeVersion: process.env.KVKK_NOTICE_VERSION ?? 'v3',

  maxMessageChars: 200,
};
