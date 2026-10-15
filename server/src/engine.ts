// Pure game rules: turns the LLM's classification of a message into trust and the new attempt status.
// The server is the only authority on trust — the LLM merely classifies. See docs/GAME_DESIGN.md §4.
import type { Category, EndReason, GameSettings, MessageFlag } from './types.ts';

export const TRUST_GOAL = 100;
export const DELTA_MIN = -15;
export const DELTA_MAX = 25;
/** Max positive delta for early turns, so nobody wins with one magic sentence. */
const EARLY_TURN_CAPS: Record<number, number> = { 1: 10, 2: 15 };
const CHEAT_PENALTY = -10;

export const DEFAULT_SETTINGS: GameSettings = {
  maxTurns: 10,
  timeLimitS: 180,
  minTurnsToWin: 3,
  difficulty: 1.2,
  prizesPerDay: 20,
  volume: 0.7,
};

/** Base trust per category, indexed by quality 1..3. */
const CATEGORY_DELTAS: Record<Category, [number, number, number]> = {
  // The LLM's negative calls are milder than the regex filters' -10: they also catch some innocent edge cases.
  cheat: [-8, -8, -8],
  rude: [-8, -8, -8],
  bribe: [-5, -5, -5],
  boring: [0, 0, 0],
  kind_offer: [4, 7, 10],
  empathy: [8, 12, 16],
  funny: [8, 14, 20],
  creative: [8, 14, 20],
};
/** Leaning on the same tactic pays less: from this many previous uses on, the delta is halved. */
const REPEAT_TACTIC_AFTER: Partial<Record<Category, number>> = { kind_offer: 1, empathy: 2, funny: 2, creative: 2 };

/**
 * Turns the LLM's classification into a base trust delta (before caps and flags).
 * `previous` are the categories of this attempt's earlier turns.
 */
export function scoreTurn(category: Category, quality: number, previous: readonly Category[]): number {
  const q = Math.min(3, Math.max(1, Math.round(quality))) - 1;
  let delta = CATEGORY_DELTAS[category][q]!;
  const limit = REPEAT_TACTIC_AFTER[category];
  if (delta > 0 && limit !== undefined && previous.filter((c) => c === category).length >= limit) {
    delta = Math.round(delta / 2);
  }
  return delta;
}

export interface TurnInput {
  /** Trust before this turn. */
  trust: number;
  /** 1-based number of the turn being played. */
  turn: number;
  /** Base delta from scoreTurn(). */
  baseDelta: number;
  flags: readonly MessageFlag[];
  settings: Pick<GameSettings, 'maxTurns' | 'minTurnsToWin' | 'difficulty'>;
}

export interface TurnResult {
  appliedDelta: number;
  trust: number;
  status: 'playing' | 'won' | 'lost';
  endReason?: EndReason;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function applyTurn({ trust, turn, baseDelta, flags, settings }: TurnInput): TurnResult {
  let delta = clamp(Math.round(Number.isFinite(baseDelta) ? baseDelta : 0), DELTA_MIN, DELTA_MAX);

  const cap = EARLY_TURN_CAPS[turn];
  if (cap !== undefined) delta = Math.min(delta, cap);

  if (flags.includes('injection') || flags.includes('profanity')) delta = Math.min(delta, CHEAT_PENALTY);
  else if (flags.includes('repeat')) delta = Math.min(delta, 0);

  if (delta > 0) delta = Math.round(delta * settings.difficulty);

  let next = clamp(trust + delta, 0, TRUST_GOAL);
  // Reaching the goal before the minimum turn count holds the meter just below it.
  if (next >= TRUST_GOAL && turn < settings.minTurnsToWin) next = TRUST_GOAL - 1;
  const appliedDelta = next - trust;

  if (next >= TRUST_GOAL) return { appliedDelta, trust: next, status: 'won', endReason: 'trust' };
  if (turn >= settings.maxTurns) return { appliedDelta, trust: next, status: 'lost', endReason: 'messages' };
  return { appliedDelta, trust: next, status: 'playing' };
}

export function trustLabel(trust: number): string {
  if (trust >= 90) return 'almost convinced';
  if (trust >= 60) return 'warming up';
  if (trust >= 30) return 'curious';
  return 'suspicious';
}

/**
 * Attempt clock. Time only runs while the player can type: it is paused while the monster "thinks",
 * so slow LLM replies never cost the player time.
 */
export class AttemptClock {
  activeMs: number;
  private resumedAt: number | null;

  constructor(activeMs = 0, now = Date.now()) {
    this.activeMs = activeMs;
    this.resumedAt = now;
  }

  pause(now = Date.now()): void {
    if (this.resumedAt !== null) this.activeMs += now - this.resumedAt;
    this.resumedAt = null;
  }

  resume(now = Date.now()): void {
    if (this.resumedAt === null) this.resumedAt = now;
  }

  elapsed(now = Date.now()): number {
    return this.activeMs + (this.resumedAt === null ? 0 : now - this.resumedAt);
  }
}
