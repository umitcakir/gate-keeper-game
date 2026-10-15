import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttemptClock, applyTurn, scoreTurn } from '../src/engine.ts';

const settings = { maxTurns: 10, minTurnsToWin: 3, difficulty: 1 };

test('clamps the base delta to the allowed range', () => {
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: 99, flags: [], settings }).appliedDelta, 25);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: -99, flags: [], settings }).appliedDelta, -15);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: Number.NaN, flags: [], settings }).appliedDelta, 0);
});

test('caps early turns', () => {
  assert.equal(applyTurn({ trust: 0, turn: 1, baseDelta: 25, flags: [], settings }).appliedDelta, 10);
  assert.equal(applyTurn({ trust: 0, turn: 2, baseDelta: 25, flags: [], settings }).appliedDelta, 15);
  assert.equal(applyTurn({ trust: 0, turn: 3, baseDelta: 25, flags: [], settings }).appliedDelta, 25);
});

test('cheating is always penalised regardless of the LLM verdict', () => {
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: 25, flags: ['injection'], settings }).appliedDelta, -10);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: 25, flags: ['profanity'], settings }).appliedDelta, -10);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: 20, flags: ['repeat'], settings }).appliedDelta, 0);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: -5, flags: ['repeat'], settings }).appliedDelta, -5);
});

test('trust stays within 0..100', () => {
  assert.equal(applyTurn({ trust: 5, turn: 5, baseDelta: -15, flags: [], settings }).trust, 0);
});

test('cannot win before the minimum number of turns', () => {
  const r = applyTurn({ trust: 95, turn: 2, baseDelta: 15, flags: [], settings });
  assert.equal(r.trust, 99);
  assert.equal(r.status, 'playing');
});

test('wins when reaching the goal', () => {
  const r = applyTurn({ trust: 90, turn: 4, baseDelta: 20, flags: [], settings });
  assert.deepEqual([r.trust, r.status, r.endReason], [100, 'won', 'trust']);
});

test('winning on the last turn beats running out of messages', () => {
  assert.equal(applyTurn({ trust: 90, turn: 10, baseDelta: 20, flags: [], settings }).status, 'won');
  const r = applyTurn({ trust: 10, turn: 10, baseDelta: 5, flags: [], settings });
  assert.deepEqual([r.status, r.endReason], ['lost', 'messages']);
});

test('difficulty scales only positive deltas', () => {
  const hard = { ...settings, difficulty: 0.5 };
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: 20, flags: [], settings: hard }).appliedDelta, 10);
  assert.equal(applyTurn({ trust: 50, turn: 5, baseDelta: -10, flags: [], settings: hard }).appliedDelta, -10);
});

test('clock does not count paused time', () => {
  const c = new AttemptClock(0, 1000);
  c.pause(3000);
  assert.equal(c.elapsed(9000), 2000);
  c.resume(10000);
  assert.equal(c.elapsed(11000), 3000);
});

test('scores categories by quality', () => {
  assert.equal(scoreTurn('funny', 3, []), 20);
  assert.equal(scoreTurn('empathy', 1, []), 8);
  assert.equal(scoreTurn('cheat', 3, []), -8);
  assert.equal(scoreTurn('boring', 2, []), 0);
  assert.equal(scoreTurn('funny', 9, []), 20);
});

test('repeating the same tactic pays less', () => {
  assert.equal(scoreTurn('kind_offer', 3, ['kind_offer']), 5);
  assert.equal(scoreTurn('funny', 3, ['funny']), 20);
  assert.equal(scoreTurn('funny', 3, ['funny', 'empathy', 'funny']), 10);
  assert.equal(scoreTurn('rude', 1, ['rude', 'rude', 'rude']), -8);
});
