// SQLite storage via node:sqlite. Schema: docs/ARCHITECTURE.md §6.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import { DEFAULT_SETTINGS } from './engine.ts';
import type { AttemptStatus, Category, EndReason, GameSettings, Lang, MessageFlag, Mood } from './types.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('tr','en')),
  kvkk_consent_at TEXT NOT NULL,
  kvkk_notice_version TEXT NOT NULL,
  age_confirmed_at TEXT,
  birth_year INTEGER,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS players_email ON players(lower(email));

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  end_reason TEXT,
  trust INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  active_ms INTEGER NOT NULL DEFAULT 0,
  prize_claimed_at TEXT,
  kvkk_consent_at TEXT,
  kvkk_notice_version TEXT,
  age_confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS attempts_started ON attempts(started_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  player_text TEXT NOT NULL,
  monster_reply TEXT NOT NULL,
  mood TEXT,
  category TEXT,
  quality INTEGER,
  applied_delta INTEGER,
  flags TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_attempt ON messages(attempt_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

/** Adds columns introduced after the first event DB was created (CREATE TABLE IF NOT EXISTS skips them). */
function addMissingColumns(table: string, columns: Record<string, string>): void {
  const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}
addMissingColumns('players', { age_confirmed_at: 'TEXT', birth_year: 'INTEGER' });
addMissingColumns('attempts', { kvkk_consent_at: 'TEXT', kvkk_notice_version: 'TEXT', age_confirmed_at: 'TEXT' });

const now = () => new Date().toISOString();

/** ISO timestamp of local midnight today — "today" means the event day at the venue. */
export function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---- settings ----------------------------------------------------------------

export { DEFAULT_SETTINGS };

export function getSettings(): GameSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s: GameSettings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in s && Number.isFinite(Number(value))) (s as unknown as Record<string, number>)[key] = Number(value);
  }
  return s;
}

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS && typeof value === 'number' && Number.isFinite(value)) stmt.run(key, String(value));
  }
  return getSettings();
}

// ---- players & attempts ------------------------------------------------------

export interface PlayerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthYear: number;
  lang: Lang;
}

export interface PlayerRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  lang: Lang;
  kvkk_consent_at: string;
  kvkk_notice_version: string;
  age_confirmed_at: string | null;
  birth_year: number | null;
}

/**
 * Insert, or update the existing player with the same email (returning players replay).
 * Only called after the form's KVKK acknowledgement and 18+ confirmation, so both are stamped with the submit time.
 */
export function upsertPlayer(p: PlayerInput): PlayerRow {
  const ts = now();
  db.prepare(
    `INSERT INTO players (first_name, last_name, email, phone, lang, kvkk_consent_at, kvkk_notice_version, age_confirmed_at, birth_year, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lower(email)) DO UPDATE SET
       first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone, lang = excluded.lang,
       kvkk_consent_at = excluded.kvkk_consent_at, kvkk_notice_version = excluded.kvkk_notice_version,
       age_confirmed_at = excluded.age_confirmed_at, birth_year = excluded.birth_year`,
  ).run(p.firstName, p.lastName, p.email, p.phone, p.lang, ts, config.kvkkNoticeVersion, ts, p.birthYear, ts);
  return db.prepare('SELECT * FROM players WHERE lower(email) = lower(?)').get(p.email) as unknown as PlayerRow;
}

export interface AttemptRow {
  id: string;
  player_id: number;
  started_at: string;
  ended_at: string | null;
  status: AttemptStatus;
  end_reason: EndReason | null;
  trust: number;
  turns: number;
  active_ms: number;
  prize_claimed_at: string | null;
  /** Snapshot of the player's acknowledgements for this attempt (the player row only keeps the latest). */
  kvkk_consent_at: string | null;
  kvkk_notice_version: string | null;
  age_confirmed_at: string | null;
}

export function createAttempt(playerId: number): AttemptRow {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO attempts (id, player_id, started_at, status, kvkk_consent_at, kvkk_notice_version, age_confirmed_at)
     SELECT ?, id, ?, 'playing', kvkk_consent_at, kvkk_notice_version, age_confirmed_at FROM players WHERE id = ?`,
  ).run(id, now(), playerId);
  return getAttempt(id)!;
}

export function getAttempt(id: string): AttemptRow | undefined {
  return db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as unknown as AttemptRow | undefined;
}

export function getPlayer(id: number): PlayerRow | undefined {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as unknown as PlayerRow | undefined;
}

export function saveAttemptProgress(id: string, trust: number, turns: number, activeMs: number): void {
  db.prepare('UPDATE attempts SET trust = ?, turns = ?, active_ms = ? WHERE id = ?').run(trust, turns, activeMs, id);
}

export function endAttempt(id: string, status: Exclude<AttemptStatus, 'playing'>, reason: EndReason, activeMs: number): void {
  db.prepare("UPDATE attempts SET status = ?, end_reason = ?, ended_at = ?, active_ms = ? WHERE id = ? AND status = 'playing'").run(
    status, reason, now(), activeMs, id,
  );
}

/** Single kiosk: a new registration abandons any attempt still marked as playing (e.g. after a reload). */
export function abandonOpenAttempts(): void {
  db.prepare("UPDATE attempts SET status = 'lost', end_reason = 'abandon', ended_at = ? WHERE status = 'playing'").run(now());
}

export function insertMessage(m: {
  attemptId: string;
  turn: number;
  playerText: string;
  monsterReply: string;
  mood: Mood | null;
  category: Category | null;
  quality: number | null;
  appliedDelta: number;
  flags: readonly MessageFlag[];
  latencyMs: number | null;
}): void {
  db.prepare(
    `INSERT INTO messages (attempt_id, turn, player_text, monster_reply, mood, category, quality, applied_delta, flags, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(m.attemptId, m.turn, m.playerText, m.monsterReply, m.mood, m.category, m.quality, m.appliedDelta, m.flags.join(',') || null, m.latencyMs, now());
}

export interface MessageRow {
  turn: number;
  player_text: string;
  monster_reply: string;
  mood: Mood | null;
  category: Category | null;
  quality: number | null;
  applied_delta: number;
  flags: string | null;
  latency_ms: number | null;
  created_at: string;
}

export function getMessages(attemptId: string): MessageRow[] {
  return db.prepare('SELECT * FROM messages WHERE attempt_id = ? ORDER BY id').all(attemptId) as unknown as MessageRow[];
}

// ---- prizes ------------------------------------------------------------------

export function prizesClaimedToday(): number {
  return (db.prepare('SELECT count(*) AS n FROM attempts WHERE prize_claimed_at >= ?').get(startOfToday()) as { n: number }).n;
}

export function prizesRemainingToday(): number {
  return Math.max(0, getSettings().prizesPerDay - prizesClaimedToday());
}

/** One win per person: true if this email has ever opened the gate (any day of the event). */
export function emailHasWon(email: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM attempts a JOIN players p ON p.id = a.player_id WHERE lower(p.email) = lower(?) AND a.status = 'won'")
    .get(email);
}

export function playerHasPrize(playerId: number): boolean {
  return !!db.prepare('SELECT 1 FROM attempts WHERE player_id = ? AND prize_claimed_at IS NOT NULL').get(playerId);
}

/** Atomically marks a prize as handed over if stock and the one-per-person rule allow it. */
export function claimPrize(attemptId: string): boolean {
  const a = getAttempt(attemptId);
  if (!a || a.status !== 'won' || a.prize_claimed_at) return false;
  if (prizesRemainingToday() <= 0 || playerHasPrize(a.player_id)) return false;
  db.prepare('UPDATE attempts SET prize_claimed_at = ? WHERE id = ? AND prize_claimed_at IS NULL').run(now(), attemptId);
  return true;
}

// ---- leaderboard & stats -----------------------------------------------------

export interface LeaderEntry {
  attemptId: string;
  name: string;
  turns: number;
  activeMs: number;
  trust: number;
}

const initial = (s: string) => s.trim().charAt(0).toLocaleUpperCase('tr');
const displayName = (first: string, last: string) => `${initial(first)}. ${initial(last)}.`;

/** Today's winners: fewest messages, then fastest. Names are initials only, e.g. "A. K." (KVKK notice §4). */
export function winnersToday(limit = 10): LeaderEntry[] {
  const rows = db
    .prepare(
      `SELECT a.id, p.first_name, p.last_name, a.turns, a.active_ms, a.trust FROM attempts a JOIN players p ON p.id = a.player_id
       WHERE a.status = 'won' AND a.started_at >= ? ORDER BY a.turns ASC, a.active_ms ASC LIMIT ?`,
    )
    .all(startOfToday(), limit) as { id: string; first_name: string; last_name: string; turns: number; active_ms: number; trust: number }[];
  return rows.map((r) => ({ attemptId: r.id, name: displayName(r.first_name, r.last_name), turns: r.turns, activeMs: r.active_ms, trust: r.trust }));
}

/** Today's best non-winning attempts (one per player). */
export function closestToday(limit = 5): LeaderEntry[] {
  const rows = db
    .prepare(
      `SELECT a.id, p.first_name, p.last_name, a.turns, a.active_ms, MAX(a.trust) AS trust FROM attempts a JOIN players p ON p.id = a.player_id
       WHERE a.status = 'lost' AND a.trust > 0 AND a.started_at >= ?
         AND p.id NOT IN (SELECT player_id FROM attempts WHERE status = 'won' AND started_at >= ?)
       GROUP BY p.id ORDER BY trust DESC, a.turns ASC LIMIT ?`,
    )
    .all(startOfToday(), startOfToday(), limit) as { id: string; first_name: string; last_name: string; turns: number; active_ms: number; trust: number }[];
  return rows.map((r) => ({ attemptId: r.id, name: displayName(r.first_name, r.last_name), turns: r.turns, activeMs: r.active_ms, trust: r.trust }));
}

/** 1-based rank of a winning attempt among today's winners. */
export function rankOf(attemptId: string): number | null {
  const a = getAttempt(attemptId);
  if (!a || a.status !== 'won') return null;
  const { n } = db
    .prepare(
      `SELECT count(*) AS n FROM attempts WHERE status = 'won' AND started_at >= ?
       AND (turns < ? OR (turns = ? AND active_ms < ?))`,
    )
    .get(startOfToday(), a.turns, a.turns, a.active_ms) as { n: number };
  return n + 1;
}

export function statsToday() {
  const since = startOfToday();
  const q = (sql: string) => (db.prepare(sql).get(since) as { n: number }).n;
  const attempts = q("SELECT count(*) AS n FROM attempts WHERE started_at >= ? AND status != 'playing'");
  const wins = q("SELECT count(*) AS n FROM attempts WHERE started_at >= ? AND status = 'won'");
  return {
    players: q('SELECT count(DISTINCT player_id) AS n FROM attempts WHERE started_at >= ?'),
    attempts,
    wins,
    winRate: attempts ? wins / attempts : 0,
    prizesClaimed: prizesClaimedToday(),
    prizesRemaining: prizesRemainingToday(),
    avgLatencyMs: Math.round(
      (db.prepare('SELECT avg(latency_ms) AS n FROM messages WHERE created_at >= ? AND latency_ms IS NOT NULL').get(since) as { n: number | null }).n ?? 0,
    ),
    totalPlayers: (db.prepare('SELECT count(*) AS n FROM players').get() as { n: number }).n,
  };
}

export function recentAttempts(limit = 30) {
  return db
    .prepare(
      `SELECT a.id, a.started_at, a.status, a.end_reason, a.trust, a.turns, a.active_ms, a.prize_claimed_at,
              p.first_name, p.last_name, p.email
       FROM attempts a JOIN players p ON p.id = a.player_id ORDER BY a.started_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function exportRows() {
  return db
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.birth_year, p.lang, p.kvkk_consent_at, p.kvkk_notice_version,
              p.age_confirmed_at, p.created_at, count(a.id) AS attempts, sum(a.status = 'won') AS wins, max(a.trust) AS best_trust,
              max(a.prize_claimed_at) AS prize_claimed_at
       FROM players p LEFT JOIN attempts a ON a.player_id = p.id
       GROUP BY p.id ORDER BY p.created_at`,
    )
    .all() as Record<string, unknown>[];
}

export function deletePlayerByEmail(email: string): boolean {
  return Number(db.prepare('DELETE FROM players WHERE lower(email) = lower(?)').run(email).changes) > 0;
}
