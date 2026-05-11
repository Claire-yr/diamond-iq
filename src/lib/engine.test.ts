// =============================================================================
// Diamond IQ — Engine Test Runner
// =============================================================================
// Run with: npx ts-node src/lib/engine.test.ts
// =============================================================================

import {
  GameState,
  isForcePlay,
  isInfieldFly,
  isUncaughtThirdStrike,
  resolveHitBall,
  resolveWalk,
  resolveStrikeout,
  resolveStealAttempt,
  createInitialState,
  createStateWithRunners,
  GroundBallEvent,
  FlyBallEvent,
  LineDriveEvent,
  BuntEvent,
  StealEvent,
  PickoffEvent,
  WalkEvent,
  StrikeoutEvent,
  HitByPitchEvent,
  SacrificeBuntEvent,
  ErrorEvent,
} from './engine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertIncludes(arr: string[], item: string, testName: string) {
  if (arr.includes(item)) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName} — expected "${item}" in ${JSON.stringify(arr)}`);
    failed++;
  }
}

// ─── Helper: count total runners ──────────────────────────────────────────────
function totalRunners(state: GameState): number {
  let c = 0;
  if (state.bases.first) c++;
  if (state.bases.second) c++;
  if (state.bases.third) c++;
  return c;
}

console.log('\n=== Diamond IQ Engine Tests ===\n');

// ─── Test 1: Ground Ball Double Play (0 outs, runner on first) ────────────────
console.log('Test 1: Ground Ball Double Play (0 outs, runner on 1st)');
{
  const state = createStateWithRunners(0, true, false, false);
  const event: GroundBallEvent = { type: 'groundBall', direction: 'right', speed: 'fast', batterSpeed: 'average' };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 2, 'outs should be 2 after DP');
  assert(result.newState.bases.first === false && result.newState.bases.second === false, 'bases should be empty after DP');
  assertIncludes(result.correctOptions, 'relayToFirst_doublePlay', 'correctOptions includes double play');
}

// ─── Test 2: Ground Ball with 1 out → side retired ───────────────────────────
console.log('Test 2: Ground Ball DP (1 out, runner on 1st) → side retired');
{
  const state = createStateWithRunners(1, true, false, false);
  const event: GroundBallEvent = { type: 'groundBall', direction: 'right', speed: 'fast', batterSpeed: 'average' };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 0, 'outs should reset to 0 (side retired)');
  assert(result.newState.topInning === false, 'should switch to bottom of inning');
  assert(!result.newState.bases.first && !result.newState.bases.second, 'bases should be empty after side retired');
}

// ─── Test 3: Infield Fly Rule (0 outs, 1st+2nd) ──────────────────────────────
console.log('Test 3: Infield Fly Rule (0 outs, runners on 1st+2nd)');
{
  const state = createStateWithRunners(0, true, true, false);
  assert(isInfieldFly(state), 'infield fly rule should apply');
  const event: FlyBallEvent = { type: 'flyBall', depth: 'medium', direction: 'center', popUp: false };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'batter automatically out (infield fly)');
  assertIncludes(result.correctOptions, 'infieldFlyRule_declared', 'infield fly declared in options');
}

// ─── Test 4: Infield Fly Rule DOES NOT apply (2 outs) ────────────────────────
console.log('Test 4: Infield Fly Rule (2 outs — does NOT apply)');
{
  const state = createStateWithRunners(2, true, true, false);
  assert(!isInfieldFly(state), 'infield fly rule should NOT apply with 2 outs');
}

// ─── Test 5: Sacrifice Fly (0 outs, runner on 3rd) ───────────────────────────
console.log('Test 5: Sacrifice Fly (0 outs, runner on 3rd)');
{
  const state = createStateWithRunners(0, false, false, true);
  const event: FlyBallEvent = { type: 'flyBall', depth: 'deep', direction: 'center', popUp: false };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'batter out (fly caught)');
  assertEqual(result.runsScored, 1, 'run scores on sacrifice fly');
  assert(!result.newState.bases.third, 'runner left third after scoring');
  assertIncludes(result.correctOptions, 'runnerOnThirdTagsAndScores_sacrificeFly', 'sacrifice fly in options');
}

// ─── Test 6: Sacrifice Fly (1 out, runner on 3rd) ────────────────────────────
console.log('Test 6: Sacrifice Fly (1 out, runner on 3rd)');
{
  const state = createStateWithRunners(1, false, false, true);
  const event: FlyBallEvent = { type: 'flyBall', depth: 'deep', direction: 'center', popUp: false };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 2, 'outs = 2 after sacrifice fly');
  assertEqual(result.runsScored, 1, 'run scores');
}

// ─── Test 7: Shallow Fly — No Sacrifice ──────────────────────────────────────
console.log('Test 7: Shallow Fly — runner holds at 3rd');
{
  const state = createStateWithRunners(0, false, false, true);
  const event: FlyBallEvent = { type: 'flyBall', depth: 'shallow', direction: 'center', popUp: false };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'batter out');
  assertEqual(result.runsScored, 0, 'no run on shallow fly');
  assert(result.newState.bases.third, 'runner holds at third');
  assertIncludes(result.correctOptions, 'runnerOnThirdHolds_shallowFly', 'runner holds noted');
}

// ─── Test 8: Uncaught Third Strike (2 outs, first empty) ─────────────────────
console.log('Test 8: Uncaught Third Strike (2 outs, first empty)');
{
  const state = createStateWithRunners(2, false, false, false);
  assert(isUncaughtThirdStrike(state), 'batter can run with 2 outs');
  const event: StrikeoutEvent = { type: 'strikeout', looking: false, wildPitch: false, passedBall: true };
  const result = resolveHitBall(state, event);
  assertIncludes(result.correctOptions, 'catcherRetrieveBall_throwToFirst_tagBatter', 'catcher must retrieve ball and tag/throw');
}

// ─── Test 9: Uncaught Third Strike (0 outs, first occupied — CANNOT run) ─────
console.log('Test 9: Uncaught Third Strike (0 outs, first occupied — cannot run)');
{
  const state = createStateWithRunners(0, true, false, false);
  assert(!isUncaughtThirdStrike(state), 'batter CANNOT run with first occupied and <2 outs');
  const event: StrikeoutEvent = { type: 'strikeout', looking: true, wildPitch: false, passedBall: false };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'normal strikeout, outs = 1');
}

// ─── Test 10: Wild Pitch overrides restriction ───────────────────────────────
console.log('Test 10: Wild Pitch on Strike 3 overrides first-base restriction');
{
  const state = createStateWithRunners(0, true, false, true);
  assert(isUncaughtThirdStrike(state, true, false), 'wildPitch overrides — batter CAN run');
  const event: StrikeoutEvent = { type: 'strikeout', looking: false, wildPitch: true, passedBall: false };
  const result = resolveHitBall(state, event);
  // With wild pitch, runner on third scores, batter reaches
  assertIncludes(result.correctOptions, 'catcherRetrieveBall_tagBatterOrThrowToFirst', 'catcher must act quickly');
}

// ─── Test 11: Walk with loaded bases (run scores) ────────────────────────────
console.log('Test 11: Walk with loaded bases');
{
  const state = createStateWithRunners(0, true, true, true);
  const result = resolveWalk(state);
  assertEqual(result.runsScored, 1, 'run scores on loaded bases walk');
  assertEqual(result.newState.outs, 0, 'no outs on walk');
  assert(result.newState.bases.first && result.newState.bases.second && result.newState.bases.third, 'still loaded after walk');
  assertIncludes(result.correctOptions, 'walkWithLoadedBases_runScores', 'loaded bases walk noted');
}

// ─── Test 12: Line Drive caught + double play opportunity ────────────────────
console.log('Test 12: Line Drive caught — double play opportunity');
{
  const state = createStateWithRunners(0, true, false, false);
  const event: LineDriveEvent = { type: 'lineDrive', direction: 'center', caught: true };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'batter out on caught line drive');
  assertIncludes(result.correctOptions, 'tagRunnerOffBase_doublePlay_attempt', 'double play option noted');
}

// ─── Test 13: Steal success (fast runner + breaking ball + weak catcher) ─────
console.log('Test 13: Steal success (fast runner, breaking ball, weak catcher)');
{
  const state = createStateWithRunners(0, true, false, false);
  const event: StealEvent = { type: 'steal', targetBase: 'second', runnerSpeed: 'fast', catcherArm: 'weak', pitchType: 'breaking' };
  const result = resolveHitBall(state, event);
  assert(result.newState.bases.second, 'runner on second after steal');
  assert(!result.newState.bases.first, 'first base empty after successful steal');
  assertEqual(result.newState.outs, 0, 'no outs on successful steal');
}

// ─── Test 14: Steal failure (slow runner, fastball, strong catcher) ───────────
console.log('Test 14: Steal failure (slow runner, fastball, strong catcher)');
{
  const state = createStateWithRunners(0, true, false, false);
  const event: StealEvent = { type: 'steal', targetBase: 'second', runnerSpeed: 'slow', catcherArm: 'strong', pitchType: 'fastball' };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 1, 'runner caught stealing');
  assert(!result.newState.bases.first, 'first base empty (runner out)');
}

// ─── Test 15: Pickoff success ────────────────────────────────────────────────
console.log('Test 15: Pickoff success (quick pitcher, distracted runner)');
{
  const state = createStateWithRunners(1, true, false, false);
  const event: PickoffEvent = { type: 'pickoff', targetBase: 'first', pitcherMove: 'quick', runnerReaction: 'distracted' };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 2, 'runner picked off, outs = 2');
  assert(!result.newState.bases.first, 'first base empty after pickoff');
}

// ─── Test 16: Ground ball loaded bases → home force out ──────────────────────
console.log('Test 16: Ground ball loaded bases — home force out');
{
  const state = createStateWithRunners(0, true, true, true);
  const event: GroundBallEvent = { type: 'groundBall', direction: 'center', speed: 'fast', batterSpeed: 'average' };
  const result = resolveHitBall(state, event);
  assertIncludes(result.correctOptions, 'fieldAndThrowToHome_forceOut', 'home force out is correct option');
}

// ─── Test 17: Bunt for hit (fast runner, no runners) ──────────────────────────
console.log('Test 17: Bunt for hit (fast runner, bases empty)');
{
  const state = createStateWithRunners(1, false, false, false);
  const event: BuntEvent = { type: 'bunt', direction: 'left', quality: 'good', batterSpeed: 'fast' };
  const result = resolveHitBall(state, event);
  assert(result.newState.bases.first, 'fast runner reaches on bunt');
  assertEqual(result.newState.outs, 1, 'no additional outs (reaches safely)');
}

// ─── Test 18: Rundown on steal attempt ───────────────────────────────────────
console.log('Test 18: Rundown possibility on steal (average vs average)');
{
  const state = createStateWithRunners(0, true, false, false);
  const event: StealEvent = { type: 'steal', targetBase: 'second', runnerSpeed: 'average', catcherArm: 'average', pitchType: 'fastball' };
  const result = resolveHitBall(state, event);
  assertIncludes(result.correctOptions, 'tagOrRundown', 'rundown option present');
}

// ─── Test 19: Routine ground ball out (no force) ─────────────────────────────
console.log('Test 19: Routine ground ball out (no runners)');
{
  const state = createStateWithRunners(1, false, false, false);
  const event: GroundBallEvent = { type: 'groundBall', direction: 'right', speed: 'fast', batterSpeed: 'slow' };
  const result = resolveHitBall(state, event);
  assertEqual(result.newState.outs, 2, 'outs = 2 after routine ground ball');
  assertIncludes(result.correctOptions, 'fieldAndThrowToFirst', 'throw to first is correct');
}

// ─── Test 20: Hit by pitch with loaded bases ─────────────────────────────────
console.log('Test 20: Hit by pitch with loaded bases');
{
  const state = createStateWithRunners(0, true, true, true);
  const event: HitByPitchEvent = { type: 'hitByPitch' };
  const result = resolveHitBall(state, event);
  assertEqual(result.runsScored, 1, 'run scores on HBP with loaded bases');
  assertEqual(result.newState.outs, 0, 'no outs on HBP');
}

// ─── Test 21: Force play detection ───────────────────────────────────────────
console.log('Test 21: Force play detection');
{
  // Only first occupied → first forced
  const s1 = createStateWithRunners(0, true, false, false);
  const f1 = isForcePlay(s1);
  assert(f1.first && !f1.second && !f1.third, 'first forced, others not');

  // First + second → first and second forced
  const s2 = createStateWithRunners(0, true, true, false);
  const f2 = isForcePlay(s2);
  assert(f2.first && f2.second && !f2.third, 'first and second forced');

  // Loaded → all forced
  const s3 = createStateWithRunners(0, true, true, true);
  const f3 = isForcePlay(s3);
  assert(f3.first && f3.second && f3.third, 'all bases forced (loaded)');

  // Empty → no forces
  const s4 = createStateWithRunners(0, false, false, false);
  const f4 = isForcePlay(s4);
  assert(!f4.first && !f4.second && !f4.third, 'no forces with empty bases');
}

// ─── Test 22: Walk with runner on first only ─────────────────────────────────
console.log('Test 22: Walk with runner on first');
{
  const state = createStateWithRunners(0, true, false, false);
  const result = resolveWalk(state);
  assert(result.newState.bases.first && result.newState.bases.second, 'first and second occupied after walk');
  assert(!result.newState.bases.third, 'third empty');
  assertEqual(result.runsScored, 0, 'no run scores');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
console.log(failed === 0 ? '\n✓ All tests passed!' : `\n✗ ${failed} tests failed.`);