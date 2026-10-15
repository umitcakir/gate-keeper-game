// Game service: one attempt = one player session. Owns the clock, trust and win/lose decisions.
import { config } from './config.ts';
import * as store from './db.ts';
import { AttemptClock, applyTurn, scoreTurn } from './engine.ts';
import { detectLang, hasInjection, hasProfanity, isRepeat } from './filters.ts';
import { line } from './lines.ts';
import { askMonster } from './llm.ts';
import { buildMessages, type HistoryItem } from './prompt.ts';
import type { Category, EndReason, Lang, MessageFlag, Mood } from './types.ts';

/** In-memory state for attempts currently being played (single kiosk, so this stays tiny). */
interface Live {
  clock: AttemptClock;
  busy: boolean;
  lang: Lang;
  history: HistoryItem[];
  playerTexts: string[];
  categories: Category[];
}
const live = new Map<string, Live>();

/** Extra time accepted beyond the limit to absorb network/render latency. */
const TIME_GRACE_MS = 1500;

export class GameError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function startAttempt(input: store.PlayerInput) {
  store.abandonOpenAttempts();
  for (const id of live.keys()) live.delete(id);
  const player = store.upsertPlayer(input);
  const attempt = store.createAttempt(player.id);
  live.set(attempt.id, { clock: new AttemptClock(), busy: false, lang: input.lang, history: [], playerTexts: [], categories: [] });
  const s = store.getSettings();
  return {
    attemptId: attempt.id,
    greeting: line('greeting', input.lang),
    limits: { maxTurns: s.maxTurns, timeLimitMs: s.timeLimitS * 1000, maxChars: config.maxMessageChars },
  };
}

export interface MessageResponse {
  reply: string;
  mood: Mood;
  trust: number;
  delta: number;
  turn: number;
  messagesLeft: number;
  timeLeftMs: number;
  status: 'playing' | 'won' | 'lost';
  endReason?: EndReason;
  /** Canned closing line when the attempt ends this turn. */
  finale?: string;
  /** Only set when the turn did not count (LLM failure). */
  notCounted?: boolean;
  result?: AttemptResult;
}

export interface AttemptResult {
  turns: number;
  activeMs: number;
  trust: number;
  rank: number | null;
  prize: 'eligible' | 'out_of_stock' | 'already_claimed' | 'none';
}

function getLive(attemptId: string) {
  const attempt = store.getAttempt(attemptId);
  if (!attempt) throw new GameError(404, 'attempt not found');
  const l = live.get(attemptId);
  if (attempt.status !== 'playing' || !l) throw new GameError(409, 'attempt is not active');
  return { attempt, l };
}

export function attemptResult(attemptId: string): AttemptResult {
  const a = store.getAttempt(attemptId);
  if (!a) throw new GameError(404, 'attempt not found');
  let prize: AttemptResult['prize'] = 'none';
  if (a.status === 'won') {
    if (a.prize_claimed_at || store.playerHasPrize(a.player_id)) prize = 'already_claimed';
    else if (store.prizesRemainingToday() <= 0) prize = 'out_of_stock';
    else prize = 'eligible';
  }
  return { turns: a.turns, activeMs: a.active_ms, trust: a.trust, rank: store.rankOf(a.id), prize };
}

export async function sendMessage(attemptId: string, rawText: string): Promise<MessageResponse> {
  const { attempt, l } = getLive(attemptId);
  if (l.busy) throw new GameError(409, 'monster is still answering');
  const text = rawText.replace(/\s+/g, ' ').trim().slice(0, config.maxMessageChars);
  if (!text) throw new GameError(400, 'empty message');

  const settings = store.getSettings();
  const timeLimitMs = settings.timeLimitS * 1000;
  if (l.clock.elapsed() > timeLimitMs + TIME_GRACE_MS) {
    finish(attemptId, l, 'lost', 'time');
    return {
      reply: line('loseTime', l.lang), mood: 'annoyed', trust: attempt.trust, delta: 0, turn: attempt.turns,
      messagesLeft: settings.maxTurns - attempt.turns, timeLeftMs: 0, status: 'lost', endReason: 'time',
      result: attemptResult(attemptId),
    };
  }

  l.busy = true;
  l.clock.pause();
  try {
    const turn = attempt.turns + 1;
    const lang = detectLang(text, l.lang);
    l.lang = lang;
    const flags: MessageFlag[] = [];
    if (hasInjection(text)) flags.push('injection');
    if (hasProfanity(text)) flags.push('profanity');
    if (isRepeat(text, l.playerTexts)) flags.push('repeat');

    let reply: string;
    let mood: Mood;
    let category: Category = 'rude';
    let quality = 1;
    let latencyMs: number | null = null;

    if (flags.includes('profanity')) {
      // Never forward profanity to the model; answer with a canned scolding.
      reply = line('profanity', lang);
      mood = 'angry';
    } else {
      const messages = buildMessages(
        { turn, maxTurns: settings.maxTurns, trust: attempt.trust, lang },
        l.history.slice(-config.llmHistoryTurns),
        text,
      );
      const res = await askMonster(messages);
      latencyMs = res.latencyMs;
      if (!res.turn) {
        // LLM failure: apologise in character and do not count the turn.
        store.insertMessage({
          attemptId, turn, playerText: text, monsterReply: `[llm_error] ${res.error ?? ''}`, mood: null, category: null,
          quality: null, appliedDelta: 0, flags: ['llm_error'], latencyMs,
        });
        return {
          reply: line('llmError', lang), mood: 'neutral', trust: attempt.trust, delta: 0, turn: attempt.turns,
          messagesLeft: settings.maxTurns - attempt.turns, timeLeftMs: Math.max(0, timeLimitMs - l.clock.elapsed()),
          status: 'playing', notCounted: true,
        };
      }
      reply = res.turn.reply;
      mood = res.turn.mood;
      category = res.turn.category;
      quality = res.turn.quality;
      if (hasProfanity(reply)) {
        flags.push('output_filtered');
        reply = line('outputFiltered', lang);
      }
      l.history.push({ player: text, monster: res.turn });
    }
    const baseDelta = scoreTurn(category, quality, l.categories);
    l.playerTexts.push(text);
    l.categories.push(category);

    const outcome = applyTurn({ trust: attempt.trust, turn, baseDelta, flags, settings });
    if (flags.includes('injection') && mood !== 'angry') mood = 'annoyed';

    store.insertMessage({
      attemptId, turn, playerText: text, monsterReply: reply, mood, category, quality, appliedDelta: outcome.appliedDelta, flags, latencyMs,
    });
    store.saveAttemptProgress(attemptId, outcome.trust, turn, l.clock.elapsed());

    const response: MessageResponse = {
      reply, mood, trust: outcome.trust, delta: outcome.appliedDelta, turn,
      messagesLeft: settings.maxTurns - turn, timeLeftMs: Math.max(0, timeLimitMs - l.clock.elapsed()), status: outcome.status,
    };
    if (outcome.status !== 'playing') {
      finish(attemptId, l, outcome.status, outcome.endReason!);
      response.endReason = outcome.endReason;
      response.finale = line(outcome.status === 'won' ? 'win' : 'loseMessages', lang);
      response.result = attemptResult(attemptId);
    }
    return response;
  } finally {
    l.busy = false;
    l.clock.resume();
  }
}

function finish(attemptId: string, l: Live, status: 'won' | 'lost', reason: EndReason) {
  l.clock.pause();
  store.endAttempt(attemptId, status, reason, l.clock.elapsed());
  live.delete(attemptId);
}

/** Client-reported end (countdown hit zero, idle timeout, staff reset). Can only ever lose, never win. */
export function endByClient(attemptId: string, reason: 'time' | 'idle' | 'abandon') {
  const attempt = store.getAttempt(attemptId);
  if (!attempt) throw new GameError(404, 'attempt not found');
  const l = live.get(attemptId);
  let finale: string | undefined;
  if (attempt.status === 'playing') {
    if (l) finish(attemptId, l, 'lost', reason);
    else store.endAttempt(attemptId, 'lost', reason, attempt.active_ms);
    const lang = l?.lang ?? store.getPlayer(attempt.player_id)?.lang ?? 'tr';
    finale = line(reason === 'time' ? 'loseTime' : 'loseMessages', lang);
  }
  return { status: 'lost' as const, finale, result: attemptResult(attemptId) };
}

export function claim(attemptId: string, pin: string, give: boolean) {
  if (pin !== config.staffPin) throw new GameError(403, 'wrong PIN');
  const attempt = store.getAttempt(attemptId);
  if (!attempt) throw new GameError(404, 'attempt not found');
  const claimed = give ? store.claimPrize(attemptId) : false;
  return { claimed, prizesRemaining: store.prizesRemainingToday() };
}
