// Terminal chat against the monster, using the real engine rules. Usage: npm run chat
import { createInterface } from 'node:readline/promises';
import { DEFAULT_SETTINGS, applyTurn, scoreTurn } from '../src/engine.ts';
import { detectLang, hasInjection, hasProfanity, isRepeat } from '../src/filters.ts';
import { askMonster } from '../src/llm.ts';
import { buildMessages, type HistoryItem } from '../src/prompt.ts';
import type { Category, MessageFlag } from '../src/types.ts';

const settings = DEFAULT_SETTINGS;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const history: HistoryItem[] = [];
const said: string[] = [];
const cats: Category[] = [];
let trust = 0;

console.log(`Gulyabani is guarding the gate. ${settings.maxTurns} messages. Ctrl+C to quit.\n`);
for (let turn = 1; turn <= settings.maxTurns; turn++) {
  const text = (await rl.question(`[${turn}/${settings.maxTurns} | trust ${trust}] you> `)).trim();
  if (!text) { turn--; continue; }
  const flags: MessageFlag[] = [];
  if (hasInjection(text)) flags.push('injection');
  if (hasProfanity(text)) flags.push('profanity');
  if (isRepeat(text, said)) flags.push('repeat');
  said.push(text);
  const res = await askMonster(buildMessages({ turn, maxTurns: settings.maxTurns, trust, lang: detectLang(text, 'tr') }, history.slice(-6), text));
  if (!res.turn) { console.log(`  !! LLM error: ${res.error}`); turn--; continue; }
  history.push({ player: text, monster: res.turn });
  const out = applyTurn({ trust, turn, baseDelta: scoreTurn(res.turn.category, res.turn.quality, cats), flags, settings });
  cats.push(res.turn.category);
  trust = out.trust;
  console.log(`  Gulyabani (${res.turn.mood}, ${res.turn.category}/${res.turn.quality}, applied ${out.appliedDelta}${flags.length ? ', ' + flags.join('+') : ''}, ${res.latencyMs} ms): ${res.turn.reply}\n`);
  if (out.status !== 'playing') { console.log(out.status === 'won' ? '🎉 THE GATE OPENS!' : '💀 Out of messages.'); break; }
}
rl.close();
