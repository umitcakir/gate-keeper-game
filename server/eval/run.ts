// Prompt eval harness. Runs fixed messages + scripted games against the real LLM and prompt.
// Usage: npm run eval [-- --repeat 2] [-- --only games|cases]
import { parseArgs } from 'node:util';
import { DEFAULT_SETTINGS, applyTurn, scoreTurn } from '../src/engine.ts';
import { detectLang, hasInjection, hasProfanity, isRepeat } from '../src/filters.ts';
import { askMonster } from '../src/llm.ts';
import { buildMessages, type HistoryItem } from '../src/prompt.ts';
import type { Category, MessageFlag } from '../src/types.ts';
import { ACCEPT, CASES, SCRIPTED_GAMES } from './cases.ts';

const { values } = parseArgs({ options: { repeat: { type: 'string', default: '1' }, only: { type: 'string' } } });
const repeat = Number(values.repeat);
const settings = DEFAULT_SETTINGS;
const sign = (n: number) => Math.sign(n);

async function runCases() {
  console.log(`\n=== Single messages (turn 4, trust 40, x${repeat}) ===`);
  const perCat = new Map<Category, { ok: number; n: number }>();
  let ok = 0;
  let signOk = 0;
  let total = 0;
  const latencies: number[] = [];
  for (const c of CASES) {
    for (let i = 0; i < repeat; i++) {
      const lang = detectLang(c.text, 'tr');
      const res = await askMonster(buildMessages({ turn: 4, maxTurns: settings.maxTurns, trust: 40, lang }, [], c.text));
      latencies.push(res.latencyMs);
      total++;
      const stat = perCat.get(c.category) ?? { ok: 0, n: 0 };
      stat.n++;
      perCat.set(c.category, stat);
      if (!res.turn) {
        console.log(`  ✖ ${c.category.padEnd(10)} LLM ERROR ${res.error}  | ${c.text.slice(0, 60)}`);
        continue;
      }
      const t = res.turn;
      const pass = ACCEPT[c.category].includes(t.category);
      // Sign check: positive tactics must never be punished, cheats never rewarded.
      if (sign(scoreTurn(t.category, t.quality, [])) === sign(scoreTurn(c.category, 2, []))) signOk++;
      if (pass) { ok++; stat.ok++; }
      console.log(
        `  ${pass ? '✓' : '✖'} ${c.category.padEnd(10)} → ${`${t.category}/${t.quality}`.padEnd(12)} ${t.mood.padEnd(9)} | ${c.text.slice(0, 50).padEnd(50)} → ${t.reply.replace(/\n/g, ' ').slice(0, 90)}`,
      );
    }
  }
  console.log('\n  expected    correct');
  for (const [cat, s] of perCat) console.log(`  ${cat.padEnd(10)}  ${s.ok}/${s.n}`);
  latencies.sort((a, b) => a - b);
  console.log(`\n  category correct: ${ok}/${total}   sign correct: ${signOk}/${total}`);
  console.log(`  latency p50 ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies.at(-1)} ms`);
}

async function runGames() {
  console.log(`\n=== Scripted games (x${repeat}) ===`);
  for (const g of SCRIPTED_GAMES) {
    for (let i = 0; i < repeat; i++) {
      let trust = 0;
      const history: HistoryItem[] = [];
      const said: string[] = [];
      const cats: Category[] = [];
      let status = 'playing';
      let turn = 0;
      const trail: string[] = [];
      for (const text of g.turns) {
        turn++;
        const lang = detectLang(text, 'tr');
        const flags: MessageFlag[] = [];
        if (hasInjection(text)) flags.push('injection');
        if (hasProfanity(text)) flags.push('profanity');
        if (isRepeat(text, said)) flags.push('repeat');
        const res = await askMonster(buildMessages({ turn, maxTurns: settings.maxTurns, trust, lang }, history.slice(-6), text));
        said.push(text);
        const base = res.turn ? scoreTurn(res.turn.category, res.turn.quality, cats) : 0;
        if (res.turn) { history.push({ player: text, monster: res.turn }); cats.push(res.turn.category); }
        const out = applyTurn({ trust, turn, baseDelta: base, flags, settings });
        trail.push(`${out.appliedDelta >= 0 ? '+' : ''}${out.appliedDelta}`);
        trust = out.trust;
        status = out.status;
        if (status !== 'playing') break;
      }
      const pass = (status === 'won') === g.expectWin;
      console.log(`  ${pass ? '✓' : '✖'} ${g.name.padEnd(22)} ${status.padEnd(5)} trust ${String(trust).padStart(3)} after ${String(turn).padStart(2)} turns  [${trail.join(' ')}]`);
    }
  }
}

if (values.only !== 'games') await runCases();
if (values.only !== 'cases') await runGames();
