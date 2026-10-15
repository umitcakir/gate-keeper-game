// Static configuration (env). Runtime-tunable game settings live in the DB `settings` table (see settings.ts).
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');

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
  clientDist: resolve(projectRoot, 'client', 'dist'),
  contentDir: resolve(projectRoot, 'server', 'content'),

  adminPin: process.env.ADMIN_PIN ?? '4242',
  staffPin: process.env.STAFF_PIN ?? '1234',

  /** Bump when the KVKK notice text changes; stored with every consent. */
  kvkkNoticeVersion: process.env.KVKK_NOTICE_VERSION ?? 'v0-placeholder',

  maxMessageChars: 200,
};
