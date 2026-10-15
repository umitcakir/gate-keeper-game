// LM Studio (OpenAI-compatible) client for the monster brain.
// Gemma 4 "thinks" by default, which truncates the JSON and takes ~20 s — we always send
// reasoning_effort: "none" AND end the prompt with "Do not think step by step" (docs/ARCHITECTURE.md §5).
import { config } from './config.ts';
import { MONSTER_SCHEMA, type ChatMessage } from './prompt.ts';
import { CATEGORIES, MOODS, type Category, type Mood, type MonsterTurn } from './types.ts';

export interface LlmResult {
  turn: MonsterTurn | null;
  latencyMs: number;
  error?: string;
}

const MAX_REPLY_CHARS = 280;
const MAX_REPLY_SENTENCES = 3;

/** One line, quotes/speaker prefix stripped, at most a few sentences (small models sometimes ramble). */
export function cleanReply(raw: string): string {
  const oneLine = raw
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
    .replace(/^(gulyabani|monster|canavar)\s*:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  const sentences = oneLine.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [oneLine];
  const short = sentences.slice(0, MAX_REPLY_SENTENCES).join('').trim();
  return short.length > MAX_REPLY_CHARS ? `${short.slice(0, MAX_REPLY_CHARS - 1)}…` : short;
}

function parseTurn(content: string | null | undefined): MonsterTurn | null {
  if (!content) return null;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.reply !== 'string') return null;
  const reply = cleanReply(r.reply);
  if (!reply) return null;
  if (!CATEGORIES.includes(r.category as Category)) return null;
  const mood: Mood = MOODS.includes(r.mood as Mood) ? (r.mood as Mood) : 'neutral';
  const q = Number(r.quality);
  return {
    category: r.category as Category,
    quality: q === 1 || q === 2 || q === 3 ? q : 1,
    mood,
    reply,
  };
}

async function completeOnce(messages: ChatMessage[], maxTokens: number): Promise<MonsterTurn | null> {
  const res = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(config.llmTimeoutMs),
    body: JSON.stringify({
      model: config.llmModel,
      temperature: config.llmTemperature,
      max_tokens: maxTokens,
      reasoning_effort: 'none',
      messages,
      response_format: { type: 'json_schema', json_schema: { name: 'monster', strict: true, schema: MONSTER_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`LM Studio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseTurn(data.choices?.[0]?.message?.content);
}

/** One monster turn with a single retry. Never throws. */
export async function askMonster(messages: ChatMessage[]): Promise<LlmResult> {
  const t0 = Date.now();
  let lastError = 'empty or invalid JSON';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const turn = await completeOnce(messages, 200);
      if (turn) return { turn, latencyMs: Date.now() - t0 };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // A timeout already burned our budget; retrying would keep the player waiting too long.
      if (err instanceof Error && err.name === 'TimeoutError') break;
    }
  }
  setHealth(false);
  return { turn: null, latencyMs: Date.now() - t0, error: lastError };
}

// ---- health ----------------------------------------------------------------

let healthy = false;
let lastCheck = 0;

function setHealth(ok: boolean) {
  healthy = ok;
  lastCheck = Date.now();
}

/** Checks that LM Studio is up and our model is listed. Cached for 15 s. */
export async function llmHealthy(force = false): Promise<boolean> {
  if (!force && Date.now() - lastCheck < 15_000) return healthy;
  try {
    const res = await fetch(`${config.llmBaseUrl}/models`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { data?: { id: string }[] };
    setHealth(res.ok && !!data.data?.some((m) => m.id === config.llmModel));
  } catch {
    setHealth(false);
  }
  return healthy;
}

/** Loads the model into memory before the first player arrives. */
export async function warmUp(): Promise<LlmResult> {
  const result = await askMonster([
    { role: 'system', content: 'Reply as a grumpy monster. Respond immediately with the JSON object only. Do not think step by step.' },
    { role: 'user', content: 'Hello!' },
  ]);
  if (result.turn) setHealth(true);
  return result;
}
