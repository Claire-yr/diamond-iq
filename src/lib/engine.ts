// =============================================================================
// Diamond IQ — Baseball Rules Engine (Pure TypeScript, No UI Dependencies)
// =============================================================================
// This module implements a complete baseball situation-decision engine.
// All types and functions are pure TypeScript; no React/Next.js dependency.
// =============================================================================

// ─── Core State Types ────────────────────────────────────────────────────────

export interface BaseOccupancy {
  first: boolean;
  second: boolean;
  third: boolean;
}

export interface Score {
  home: number;
  away: number;
}

export interface GameState {
  outs: 0 | 1 | 2;
  bases: BaseOccupancy;
  inning: number;          // 1-9 (or extra innings)
  topInning: boolean;      // true = top (away bats), false = bottom (home bats)
  score: Score;
  count?: PitchCount;      // optional: current pitch count before an event
}

export interface PitchCount {
  balls: number;  // 0-3
  strikes: number; // 0-2
}

// ─── Batter / Runner Event Types ─────────────────────────────────────────────

export type InfieldDirection = 'left' | 'right' | 'center';
export type OutfieldDirection = 'left' | 'right' | 'center';
export type OutfieldDepth = 'shallow' | 'medium' | 'deep';

export interface GroundBallEvent {
  type: 'groundBall';
  direction: InfieldDirection;
  speed: 'slow' | 'medium' | 'fast';  // slow = possible bunt-like dribbler
  batterSpeed: 'slow' | 'average' | 'fast';
}

export interface FlyBallEvent {
  type: 'flyBall';
  depth: OutfieldDepth;
  direction: OutfieldDirection;
  popUp: boolean;  // true = infield pop-up (easy catch)
}

export interface LineDriveEvent {
  type: 'lineDrive';
  direction: InfieldDirection | OutfieldDirection;
  caught: boolean;  // whether the line drive is caught (pre-determined by scenario)
}

export interface BuntEvent {
  type: 'bunt';
  direction: InfieldDirection;
  quality: 'good' | 'poor';  // good = well-placed, poor = easy field
  batterSpeed: 'slow' | 'average' | 'fast';
}

export interface StealEvent {
  type: 'steal';
  targetBase: 'second' | 'third' | 'home';  // which base the runner is stealing
  runnerSpeed: 'slow' | 'average' | 'fast';
  catcherArm: 'weak' | 'average' | 'strong';
  pitchType: 'fastball' | 'breaking' | 'changeup';  // breaking/changeup favor runner
}

export interface PickoffEvent {
  type: 'pickoff';
  targetBase: 'first' | 'second' | 'third';
  pitcherMove: 'quick' | 'average' | 'slow';
  runnerReaction: 'alert' | 'average' | 'distracted';
}

export interface WalkEvent {
  type: 'walk';
}

export interface StrikeoutEvent {
  type: 'strikeout';
  looking: boolean;  // true = called strike 3 (looking), false = swinging
  wildPitch: boolean;  // did the ball get away on strike 3?
  passedBall: boolean;  // did the catcher fail to catch strike 3?
}

export interface HitByPitchEvent {
  type: 'hitByPitch';
}

export interface SacrificeBuntEvent {
  type: 'sacrificeBunt';
  direction: InfieldDirection;
  batterSpeed: 'slow' | 'average' | 'fast';
}

export interface ErrorEvent {
  type: 'error';
  fielderPosition: 'pitcher' | 'catcher' | 'firstBase' | 'secondBase' | 'thirdBase' | 'shortstop' | 'leftField' | 'centerField' | 'rightField';
  severity: 'minor' | 'major';  // minor = bobble/delay, major = wild throw/drop
}

export type BatterEvent =
  | GroundBallEvent
  | FlyBallEvent
  | LineDriveEvent
  | BuntEvent
  | StealEvent
  | PickoffEvent
  | WalkEvent
  | StrikeoutEvent
  | HitByPitchEvent
  | SacrificeBuntEvent
  | ErrorEvent;

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ForcePlayInfo {
  first: boolean;   // runner on first is forced to second
  second: boolean;  // runner on second is forced to third
  third: boolean;   // runner on third is forced to home
  home: boolean;    // batter is forced to first (always true when play is live)
}

export interface ResolutionResult {
  newState: GameState;
  description: string;
  runsScored?: number;
  correctOptions: string[];  // correct defensive decisions for this scenario
}

export interface DoublePlayOption {
  type: 'forceOutAtBase' | 'tagOut' | 'throwToFirst' | 'doublePlay';
  base: 'first' | 'second' | 'third' | 'home';
  description: string;
}

// ─── Helper: Clone State ──────────────────────────────────────────────────────

function cloneState(state: GameState): GameState {
  return {
    outs: state.outs,
    bases: { ...state.bases },
    inning: state.inning,
    topInning: state.topInning,
    score: { ...state.score },
    count: state.count ? { ...state.count } : undefined,
  };
}

// ─── Helper: Advance runners based on forced movement ────────────────────────

function advanceBatter(state: GameState): GameState {
  const s = cloneState(state);
  s.bases.first = true; // batter always reaches first
  return s;
}

// ─── Helper: Count total runners on base ─────────────────────────────────────

function runnersOnBase(bases: BaseOccupancy): number {
  let count = 0;
  if (bases.first) count++;
  if (bases.second) count++;
  if (bases.third) count++;
  return count;
}

// ─── Helper: Which side is batting ───────────────────────────────────────────

function battingTeam(state: GameState): 'home' | 'away' {
  return state.topInning ? 'away' : 'home';
}

function fieldingTeam(state: GameState): 'home' | 'away' {
  return state.topInning ? 'home' : 'away';
}

// ─── Helper: Add runs to the batting team ────────────────────────────────────

function addRuns(state: GameState, runs: number): GameState {
  const s = cloneState(state);
  if (state.topInning) {
    s.score.away += runs;
  } else {
    s.score.home += runs;
  }
  return s;
}

// ─── Helper: Increment outs (handles inning change) ──────────────────────────

function incrementOuts(state: GameState): GameState {
  const s = cloneState(state);

  if (s.outs === 0) { s.outs = 1; return s; }
  if (s.outs === 1) { s.outs = 2; return s; }

  // 3 outs — side retired
  s.outs = 0;
  s.bases = { first: false, second: false, third: false };
  s.count = undefined;

  if (s.topInning) {
    // Top of inning ends, switch to bottom
    s.topInning = false;
  } else {
    // Bottom of inning ends, go to next inning top
    s.inning += 1;
    s.topInning = true;
  }

  return s;
}

// ─── Helper: Advance all forced runners ──────────────────────────────────────

function advanceForcedRunners(state: GameState, forceInfo: ForcePlayInfo): GameState {
  const s = cloneState(state);

  // When batter becomes a runner, first is always occupied
  // Advance from highest force first to avoid collision
  if (forceInfo.third && s.bases.third) {
    s.bases.third = false;
    // Runner from third scores (forced home)
  }
  if (forceInfo.second && s.bases.second) {
    s.bases.second = false;
    s.bases.third = true; // runner from second goes to third
  }
  if (forceInfo.first && s.bases.first) {
    s.bases.first = false;
    s.bases.second = true; // runner from first goes to second
  }
  // Batter takes first
  s.bases.first = true;

  return s;
}

// =============================================================================
// Core Judgment Functions
// =============================================================================

/**
 * isForcePlay: Determines which bases have forced runners.
 * A runner is forced when every base behind them is occupied.
 * - Batter always forces runner on first (if present).
 * - Runner on first forces runner on second (if present).
 * - Runner on first+second forces runner on third (if present).
 */
export function isForcePlay(state: GameState): ForcePlayInfo {
  const bases = state.bases;
  const forceFirst = bases.first;  // runner on first is forced to second
  const forceSecond = bases.first && bases.second;  // first+second occupied
  const forceThird = bases.first && bases.second && bases.third;  // all occupied (loaded)
  const forceHome = forceThird;  // runner on third forced home = batter forced to first

  return {
    first: forceFirst,
    second: forceSecond,
    third: forceThird,
    home: forceHome,
  };
}

/**
 * isInfieldFly: Determines if the Infield Fly Rule applies.
 * Conditions:
 * - Less than 2 outs (0 or 1 out)
 * - Runners on first AND second, OR runners on first, second, AND third (loaded)
 * - The batter hits a fair fly ball that can be caught by an infielder with ordinary effort
 * Purpose: Prevent infielders from deliberately dropping a fly ball to get a cheap double play.
 */
export function isInfieldFly(state: GameState): boolean {
  if (state.outs >= 2) return false;

  // Must have runners on first AND second at minimum
  if (!state.bases.first || !state.bases.second) return false;

  // First + second occupied (third optional) = infield fly applies
  return true;
}

/**
 * isUncaughtThirdStrike: Determines if the batter can run on strike 3.
 * Conditions:
 * - 2 outs AND first base unoccupied → batter can run (always)
 * - Less than 2 outs AND first base unoccupied → batter can run
 * - Less than 2 outs AND first base occupied → batter CANNOT run (forced runner prevents it)
 * - Additionally: wild pitch or passed ball on strike 3 → batter can always attempt
 */
export function isUncaughtThirdStrike(state: GameState, wildPitch?: boolean, passedBall?: boolean): boolean {
  // If the ball gets away (wild pitch / passed ball), batter can always run
  if (wildPitch || passedBall) return true;

  // With 2 outs, batter can always run on uncaught strike 3 regardless of base occupancy
  if (state.outs === 2) return true;

  // With <2 outs, batter can run only if first base is NOT occupied
  // (because if first is occupied, the forced runner would make it a cheap double play)
  return !state.bases.first;
}

// =============================================================================
// Core Processing Functions
// =============================================================================

// ─── resolveGroundBall ────────────────────────────────────────────────────────

function resolveGroundBall(state: GameState, event: GroundBallEvent): ResolutionResult {
  const force = isForcePlay(state);
  const correctOptions: string[] = [];
  let description = '';
  let runsScored = 0;

  // Slow ground ball — possible infield single or close play at first
  if (event.speed === 'slow') {
    if (event.batterSpeed === 'fast') {
      // Fast runner on slow grounder — likely reaches first
      // Count runs from forced runners scoring
      if (force.third && state.bases.third) runsScored = 1 + (force.second && state.bases.second ? 1 : 0) + (force.first && state.bases.first ? 0 : 0);
      // Actually, let's be more precise for slow grounder
      // With a slow grounder, the defense's best play depends on force situation
      if (force.first && !force.second) {
        // Runner on first only — fielder should throw to second for force, then relay to first
        correctOptions.push('fieldAndThrowToSecond_forceOut', 'thenThrowToFirst_doublePlay_attempt');
        description = `慢速地滚球向${event.direction}方，快腿打者。防守方最佳：传二垒封杀再传一垒尝试双杀。`;
      } else if (force.third) {
        // Loaded bases — go home then first for double play
        correctOptions.push('fieldAndThrowToHome_forceOut', 'thenThrowToFirst_doublePlay_attempt');
        description = `慢速地滚球向${event.direction}方，满垒快腿打者。防守方最佳：传本垒封杀再传一垒尝试双杀。`;
      } else {
        correctOptions.push('fieldAndThrowToFirst');
        description = `慢速地滚球向${event.direction}方，快腿打者，一垒空。打者可能安全上垒。`;
      }

      let s = cloneState(state);
      // For slow grounder with fast batter, batter reaches first
      // Forced runners advance
      if (force.third) { s.bases.third = false; runsScored++; }
      if (force.second) { s.bases.second = false; s.bases.third = true; }
      if (force.first) { s.bases.first = false; s.bases.second = true; }
      s.bases.first = true;
      s = addRuns(s, runsScored);

      return { newState: s, description, runsScored, correctOptions };
    }
  }

  // Medium/Fast ground ball — standard infield play
  if (event.speed === 'medium' || event.speed === 'fast') {
    const s = cloneState(state);

    if (force.first && !force.second) {
      // Runner on first only (no second) — classic double play opportunity
      // Correct: field → throw to second (force out) → relay to first
      correctOptions.push('fieldAndThrowToSecond_forceOut', 'relayToFirst_doublePlay');
      description = `${event.speed === 'fast' ? '快速' : '中等'}地滚球向${event.direction}，一垒有跑者。标准双杀：传二垒封杀→转传一垒。`;

      // Execute: runner at first forced out at second, batter out at first = 2 outs added
      // But if outs were 0, now 2; if outs were 1, now 3 (side retired)
      s.bases.first = false;  // runner forced out at second
      s.bases.second = true;  // actually, runner is out at second, batter out at first
      // Wait — in a successful double play:
      // Runner on first is out at second (force), batter is out at first
      // So both are out. Bases empty after DP.
      s.bases.first = false;
      s.bases.second = false;
      // If outs < 2, DP succeeds → outs += 2
      if (state.outs === 0) {
        s.outs = 2;
        // No runners remain
      } else if (state.outs === 1) {
        // DP makes 3 outs → side retired
        const retired = incrementOuts(incrementOuts(state));
        return { newState: retired, description, runsScored: 0, correctOptions };
      }

      return { newState: s, description, runsScored: 0, correctOptions };
    }

    if (force.second && !force.third) {
      // First and second occupied — double play: tag second (force out), relay to first
      // Or: field, throw to third (force), then tag second or throw to first
      correctOptions.push('fieldAndThrowToSecond_forceOut', 'relayToFirst_doublePlay');
      description = `${event.speed === 'fast' ? '快速' : '中等'}地滚球，一二垒有跑者。双杀路线：传二垒封杀→传一垒。`;

      // Successful DP: runner on second out at third? No —
      // Standard DP: fielder throws to second (force out runner from first),
      // shortstop/second baseman tags second, relays to first for batter out
      // Runner on second advances to third (not forced out at third in this sequence)
      // Actually, with force on second: runner on second forced to third
      // But the standard play is: out at second (force from first), out at first (batter)
      // Runner originally on second goes to third safely
      s.bases.second = false; // runner from first out at second
      s.bases.first = false;  // batter out at first
      s.bases.third = true;   // runner from second reaches third safely

      if (state.outs === 0) {
        s.outs = 2;
      } else if (state.outs === 1) {
        const retired = incrementOuts(incrementOuts(state));
        return { newState: retired, description, runsScored: 0, correctOptions };
      }

      return { newState: s, description, runsScored: 0, correctOptions };
    }

    if (force.third) {
      // Loaded bases — best play: throw home (force out), then first (DP)
      // Or: third (force out), then first depending on situation
      correctOptions.push('fieldAndThrowToHome_forceOut', 'relayToFirst_doublePlay_attempt');
      description = `${event.speed === 'fast' ? '快速' : '中等'}地滚球，满垒！防守最佳：传本垒封杀→传一垒尝试双杀。`;

      // Runner from third forced out at home, runner from second to third, runner from first to second, batter to first
      // Or if DP: also batter out at first
      // Assuming successful DP (home + first):
      s.bases.third = false;   // runner from second now at third
      s.bases.second = false;  // runner from first now at second
      s.bases.first = true;    // batter at first (if not out at first)
      // In DP: runner from third out at home, batter out at first
      // So: bases have runner from second now at third, runner from first now at second
      if (state.outs === 0) {
        s.outs = 2;
        s.bases.third = true;  // runner originally on second → third
        s.bases.second = true; // runner originally on first → second
        s.bases.first = false; // batter out at first in DP
        runsScored = 0; // no run scores because runner from third out at home
      } else if (state.outs === 1) {
        // One more out needed to retire side. DP = 2 more outs = side retired
        const retired = incrementOuts(incrementOuts(state));
        return { newState: retired, description, runsScored: 0, correctOptions };
      }

      return { newState: s, description, runsScored, correctOptions };
    }

    // No forced runners — field and throw to first for routine out
    correctOptions.push('fieldAndThrowToFirst');
    description = `${event.speed === 'fast' ? '快速' : '中等'}地滚球向${event.direction}，垒包空置。标准：接球传一垒封杀打者。`;

    s.bases.first = false; // batter out at first
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  // Fallback for slow ground ball without fast batter
  let s = cloneState(state);
  if (force.first) {
    correctOptions.push('fieldAndThrowToSecond_forceOut', 'relayToFirst_doublePlay_attempt');
    description = `慢速地滚球向${event.direction}，一垒有跑者但打者不快。可能只完成一垒封杀。`;

    // Only force out at second (DP unlikely with slow batter)
    if (force.third) {
      s.bases.third = false; runsScored++;
    }
    if (force.second) { s.bases.second = false; s.bases.third = true; }
    s.bases.first = false;
    s.bases.second = true; // runner from first to second
    s.bases.first = event.batterSpeed === 'average'; // average might reach, slow likely out
    s = addRuns(s, runsScored);
    if (event.batterSpeed === 'slow') {
      s.bases.first = false;
      return { newState: incrementOuts(incrementOuts(state)), description, runsScored, correctOptions };
    }
    return { newState: incrementOuts(s), description, runsScored, correctOptions };
  }

  // Slow grounder, no force, slow batter — routine out at first
  correctOptions.push('fieldAndThrowToFirst');
  description = `慢速地滚球，垒空，慢腿打者。轻松一垒封杀。`;
  return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
}

// ─── resolveFlyBall ───────────────────────────────────────────────────────────

function resolveFlyBall(state: GameState, event: FlyBallEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';
  let runsScored = 0;

  // Infield fly rule check
  if (isInfieldFly(state) && !event.popUp) {
    // Infield fly rule applies — batter is automatically out, runners hold
    // They cannot be forced to advance (the out is declared immediately)
    correctOptions.push('infieldFlyRule_declared', 'catchOrLetDrop_sameResult');
    description = `内野高飞球规则生效！打者自动出局，跑者不必进垒。0/1出局+一二垒有人。`;

    // Batter is out, runners stay (no force advance since batter out is automatic)
    const s = incrementOuts(state);
    return { newState: s, description, runsScored: 0, correctOptions };
  }

  if (event.popUp) {
    // Infield pop-up — easy catch, batter out
    correctOptions.push('catchPopUp');
    description = `内野小飞球，轻松接杀。打者出局。`;

    // With <2 outs, runners should hold; with 2 outs, runners can run on contact
    const s = incrementOuts(state);
    return { newState: s, description, runsScored: 0, correctOptions };
  }

  // Outfield fly ball
  const caught = true; // in our model, outfield fly balls are caught (defense decides)

  if (state.outs < 2) {
    // Tag up situation — runners can advance after catch if they tag their base
    if (event.depth === 'deep' || event.depth === 'medium') {
      // Deep fly = sacrifice fly opportunity for runner on third
      if (state.bases.third) {
        correctOptions.push('catchFlyBall', 'runnerOnThirdTagsAndScores_sacrificeFly');
        description = `${event.depth}外场高飞球向${event.direction}，0/1出局三垒有跑者。高飞牺牲打！跑者回垒起跑得分。`;

        let s = cloneState(state);
        s.bases.third = false;
        runsScored = 1;
        s = addRuns(s, runsScored);
        // Batter is out (fly caught)
        return { newState: incrementOuts(s), description, runsScored, correctOptions };
      }

      if (state.bases.second && !state.bases.third) {
        correctOptions.push('catchFlyBall', 'runnerOnSecondTagsAndAdvances');
        description = `${event.depth}外场高飞球，0/1出局二垒有跑者。跑者回垒后起跑进三垒。`;

        const s = cloneState(state);
        s.bases.second = false;
        s.bases.third = true;
        const afterOut = incrementOuts(s);
        return { newState: afterOut, description, runsScored, correctOptions };
      }

      correctOptions.push('catchFlyBall');
      description = `${event.depth}外场高飞球，无跑者或仅一垒。打者出局，跑者回垒。`;
      return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
    }

    // Shallow fly — runner on third probably can't score on tag-up
    if (state.bases.third) {
      correctOptions.push('catchFlyBall', 'runnerOnThirdHolds_shallowFly');
      description = `浅外场高飞球，三垒跑者回垒但不宜起跑——距离太近。`;

      return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
    }

    correctOptions.push('catchFlyBall');
    description = `浅外场高飞球接杀，打者出局。`;
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  // 2 outs — runners run on contact (no need to tag up since they'd advance anyway if ball drops)
  // But if caught, they must return. In practice with 2 outs, runners go on contact.
  if (state.outs === 2) {
    if (state.bases.third) {
      correctOptions.push('catchFlyBall', 'runnerOnThirdScoresOnContact_2outs');
      description = `外场高飞球，2出局三垒有人。跑者起跑——接杀则出局数达3攻守交换，漏接则跑者得分。`;

      // If caught: 3 outs, side retired, no run
      // If dropped: runner scores, batter reaches (but in our model, fly balls are caught)
      // We model the "caught" outcome:
      const s = incrementOuts(state); // 3 outs → side retired
      return { newState: s, description, runsScored: 0, correctOptions };
    }

    correctOptions.push('catchFlyBall');
    description = `外场高飞球接杀，2出局。第三出局攻守交换。`;
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  // Shouldn't reach here
  correctOptions.push('catchFlyBall');
  return { newState: incrementOuts(state), description: '外场高飞球接杀。', runsScored: 0, correctOptions };
}

// ─── resolveLineDrive ─────────────────────────────────────────────────────────

function resolveLineDrive(state: GameState, event: LineDriveEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';

  if (event.caught) {
    // Line drive caught — batter out, runners must return to their bases
    // If runner was off the base, they can be doubled off (tag base + tag runner)
    correctOptions.push('catchLineDrive', 'tagRunnerOffBase_doublePlay_attempt');

    if (state.bases.first || state.bases.second || state.bases.third) {
      description = `平飞球被接杀！跑者必须回垒，否则可被触杀双杀。`;

      // If runner failed to return → double play
      // In our model, we assume runners return safely (conservative play)
      // But correct option notes the double-play opportunity
      const s = incrementOuts(state);
      return { newState: s, description, runsScored: 0, correctOptions };
    }

    description = `平飞球被接杀，打者出局。`;
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  // Line drive not caught — falls for a hit
  // Runners advance based on ball location
  correctOptions.push('fieldBall_quickly', 'throwToCorrectBase');

  const s = cloneState(state);
  let runsScored = 0;

  // Not caught = hit. Runners advance at least one base.
  if (s.bases.third) { s.bases.third = false; runsScored++; }
  if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
  if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
  s.bases.first = true; // batter reaches first

  description = `平飞球落地为安打！跑者至少前进一个垒包。`;
  return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
}

// ─── resolveBunt ──────────────────────────────────────────────────────────────

function resolveBunt(state: GameState, event: BuntEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';
  let runsScored = 0;

  const force = isForcePlay(state);

  if (event.quality === 'poor') {
    // Poor bunt — easy for defense
    if (force.first) {
      correctOptions.push('fieldBuntAndThrowToSecond_forceOut', 'relayToFirst_doublePlay_attempt');
      description = `拙劣触击向${event.direction}，一垒有人。防守轻松：传二垒封杀→传一垒双杀。`;

      if (state.outs < 2) {
        // Successful double play on poor bunt
        const s = cloneState(state);
        if (force.third) { s.bases.third = false; runsScored = 1; }
        // Actually on poor bunt DP: runner from first out at second, batter out at first
        s.bases.first = false;
        s.bases.second = false;
        // Runner on second/third may or may not advance
        // In DP scenario, let's keep it simple
        if (state.outs === 0) {
          s.outs = 2;
          s.bases = { first: false, second: false, third: state.bases.third };
        } else {
          return { newState: incrementOuts(incrementOuts(state)), description, runsScored: 0, correctOptions };
        }
        return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
      }

      correctOptions.push('fieldBuntAndThrowToFirst');
      description = `拙劣触击，2出局。直接传一垒封杀打者。`;
      return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
    }

    correctOptions.push('fieldBuntAndThrowToFirst');
    description = `拙劣触击向${event.direction}，垒空。轻松一垒封杀。`;
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  // Good bunt — well-placed
  if (force.first && !force.second) {
    // Runner on first only — sacrifice bunt attempt
    if (state.outs < 2) {
      correctOptions.push('fieldBuntAndThrowToFirst_sacrifice', 'runnerAdvancesToSecond');
      description = `优质触击向${event.direction}，0/1出局一垒有人。打者出局但跑者推进二垒——牺牲触击。`;

      const s = cloneState(state);
      s.bases.first = false;
      s.bases.second = true; // runner from first to second
      return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
    }

    // 2 outs — bunt is risky, defense throws to first
    correctOptions.push('fieldBuntAndThrowToFirst');
    description = `优质触击但2出局——不宜牺牲触击。防守传一垒封杀。`;
    return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
  }

  if (force.second) {
    // First and second occupied
    if (state.outs < 2) {
      correctOptions.push('fieldBuntAndThrowToSecond_forceOut', 'relayToFirst');
      description = `优质触击，一二垒有人。防守：传二垒封杀（一垒跑者），再传一垒。`;

      const s = cloneState(state);
      s.bases.first = false;
      s.bases.second = false; // runner from first out at second
      s.bases.third = true;   // runner from second to third
      // batter out at first in DP
      if (state.outs === 0) {
        s.outs = 2;
        s.bases.first = false;
      } else {
        return { newState: incrementOuts(incrementOuts(state)), description, runsScored: 0, correctOptions };
      }
      return { newState: s, description, runsScored: 0, correctOptions };
    }
  }

  if (force.third) {
    // Loaded bases, good bunt
    if (state.outs < 2) {
      correctOptions.push('fieldBuntAndThrowToHome_forceOut');
      description = `优质触击，满垒0/1出局。防守：传本垒封杀三垒跑者，阻止得分。`;

      const s = cloneState(state);
      s.bases.third = false; // runner from third out at home
      s.bases.second = false;
      s.bases.third = true;  // runner from second → third
      s.bases.second = true; // runner from first → second
      s.bases.first = true;  // batter reaches first (sacrifice)
      return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
    }
  }

  // No runners on base — bunt for hit
  if (event.batterSpeed === 'fast') {
    correctOptions.push('fieldAndThrowToFirst_closePlay');
    description = `优质触击向${event.direction}，快腿打者尝试触击安打！一垒攻防紧张。`;

    const s = cloneState(state);
    s.bases.first = true; // fast runner reaches
    return { newState: s, description, runsScored: 0, correctOptions };
  }

  correctOptions.push('fieldAndThrowToFirst');
  description = `触击向${event.direction}，打者被封杀一垒。`;
  return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
}

// ─── resolveStealAttempt ──────────────────────────────────────────────────────

export function resolveStealAttempt(state: GameState, event: StealEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';
  let runsScored = 0;

  // Determine steal success based on speed vs catcher arm vs pitch type
  const pitchFactor = event.pitchType === 'breaking' || event.pitchType === 'changeup' ? 1 : 0;
  const speedFactor = event.runnerSpeed === 'fast' ? 2 : event.runnerSpeed === 'average' ? 1 : 0;
  const armFactor = event.catcherArm === 'strong' ? 2 : event.catcherArm === 'average' ? 1 : 0;

  const stealScore = speedFactor + pitchFactor - armFactor;

  // Also need to check if the target base makes sense
  if (event.targetBase === 'second' && !state.bases.first) {
    // Can't steal second if nobody on first (no runner there)
    return { newState: cloneState(state), description: '二垒无人，无法盗垒。', runsScored: 0, correctOptions: ['invalidScenario'] };
  }

  if (event.targetBase === 'third' && !state.bases.second) {
    return { newState: cloneState(state), description: '二垒无人，无法盗三垒。', runsScored: 0, correctOptions: ['invalidScenario'] };
  }

  if (event.targetBase === 'home' && !state.bases.third) {
    return { newState: cloneState(state), description: '三垒无人，无法盗本垒。', runsScored: 0, correctOptions: ['invalidScenario'] };
  }

  // If target base is already occupied (and not forced), steal fails
  if (event.targetBase === 'second' && state.bases.second) {
    correctOptions.push('catcherThrowsToSecond_tagOut_or_collision');
    description = `盗二垒但二垒已有人！跑者被封杀或夹杀。`;
    const s = cloneState(state);
    s.bases.first = false; // runner out
    return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
  }

  const s = cloneState(state);

  if (stealScore > 0) {
    // Steal successful
    if (event.targetBase === 'second') {
      correctOptions.push('catcherThrowsToSecond_late');
      s.bases.first = false;
      s.bases.second = true;
      description = `跑者盗二垒成功！快腿+${event.pitchType}有利于盗垒。`;
    } else if (event.targetBase === 'third') {
      correctOptions.push('catcherThrowsToThird_late');
      s.bases.second = false;
      s.bases.third = true;
      description = `跑者盗三垒成功！`;
    } else if (event.targetBase === 'home') {
      correctOptions.push('catcherThrowsToHome_late');
      s.bases.third = false;
      runsScored = 1;
      description = `跑者盗本垒得分！`;
    }

    return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
  }

  if (stealScore === 0) {
    // Close play — depends on exact situation, but we model as "caught stealing" with
    // potential for rundown (夹杀)
    correctOptions.push('catcherThrowsToTargetBase', 'tagOrRundown');

    if (event.targetBase === 'second') {
      description = `盗二垒——攻防纠缠！可能夹杀。`;
      s.bases.first = false;
      // Runner caught stealing
      return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
    } else if (event.targetBase === 'third') {
      description = `盗三垒——夹杀出现！`;
      s.bases.second = false;
      return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
    } else {
      description = `盗本垒失败——触杀出局！`;
      s.bases.third = false;
      return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
    }
  }

  // stealScore < 0 — clearly caught
  correctOptions.push('catcherThrowsToTargetBase_out');

  if (event.targetBase === 'second') {
    description = `盗二垒失败——强臂捕手${event.catcherArm}投杀！`;
    s.bases.first = false;
  } else if (event.targetBase === 'third') {
    description = `盗三垒失败——被触杀！`;
    s.bases.second = false;
  } else {
    description = `盗本垒失败——本垒触杀！`;
    s.bases.third = false;
  }

  return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
}

// ─── resolvePickoff ───────────────────────────────────────────────────────────

function resolvePickoff(state: GameState, event: PickoffEvent): ResolutionResult {
  const correctOptions: string[] = [];

  const moveFactor = event.pitcherMove === 'quick' ? 2 : event.pitcherMove === 'average' ? 1 : 0;
  const reactionFactor = event.runnerReaction === 'distracted' ? 2 : event.runnerReaction === 'average' ? 1 : 0;

  const pickoffScore = moveFactor + reactionFactor;

  const s = cloneState(state);

  if (pickoffScore >= 2) {
    // Pickoff successful
    correctOptions.push('pitcherPickoffMove_tagOut');
    if (event.targetBase === 'first') {
      s.bases.first = false;
      return { newState: incrementOuts(s), description: `牵制一垒成功！投手${event.pitcherMove}动作+跑者${event.runnerReaction}。`, runsScored: 0, correctOptions };
    } else if (event.targetBase === 'second') {
      s.bases.second = false;
      return { newState: incrementOuts(s), description: `牵制二垒成功！`, runsScored: 0, correctOptions };
    } else {
      s.bases.third = false;
      return { newState: incrementOuts(s), description: `牵制三垒成功！`, runsScored: 0, correctOptions };
    }
  }

  // Pickoff fails — runner returns safely, or gets into rundown
  if (pickoffScore === 1) {
    correctOptions.push('rundown_tagOut_or_safe');
    const desc = `牵制尝试——跑者和防守纠缠，夹杀可能性！`;

    // Close play: sometimes safe, sometimes out. We model as out (runner was average/distacted + pitcher quick)
    if (event.targetBase === 'first') {
      s.bases.first = false;
    } else if (event.targetBase === 'second') {
      s.bases.second = false;
    } else {
      s.bases.third = false;
    }
    return { newState: incrementOuts(s), description: desc, runsScored: 0, correctOptions };
  }

  // pickoffScore < 1 — clearly fails, runner safe
  correctOptions.push('pickoffFails_runnerReturnsSafely');
  return { newState: cloneState(state), description: `牵制失败——跑者${event.runnerReaction}，安全回垒。`, runsScored: 0, correctOptions };
}

// ─── resolveWalk ──────────────────────────────────────────────────────────────

export function resolveWalk(state: GameState): ResolutionResult {
  const correctOptions: string[] = [];
  let runsScored = 0;
  let description = '';

  const force = isForcePlay(state);
  const s = cloneState(state);

  // Walk: batter goes to first. Forced runners advance.
  // If bases loaded, runner from third scores (forced home)
  if (state.bases.first && state.bases.second && state.bases.third) {
    // Loaded bases walk → run scores
    correctOptions.push('walkWithLoadedBases_runScores');
    description = `满垒四坏球！打者上一垒，三垒跑者被迫进本垒得分。`;
    runsScored = 1;

    s.bases.third = false;  // runner scores
    s.bases.second = false;
    s.bases.third = true;   // runner from second → third
    s.bases.first = false;
    s.bases.second = true;  // runner from first → second
    s.bases.first = true;   // batter walks to first

    return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
  }

  if (state.bases.first && state.bases.second) {
    // First and second occupied — walk pushes everyone
    correctOptions.push('walkRunnersAdvance');
    description = `四坏球！一二垒有人，跑者被迫推进。`;

    s.bases.second = false;
    s.bases.third = true;   // runner from second → third
    s.bases.first = false;
    s.bases.second = true;  // runner from first → second
    s.bases.first = true;   // batter walks to first

    return { newState: s, description, runsScored, correctOptions };
  }

  if (state.bases.first) {
    // Runner on first only — walk pushes runner to second
    correctOptions.push('walkRunnerAdvances');
    description = `四坏球！一垒跑者被迫进二垒，打者上一垒。`;

    s.bases.first = false;
    s.bases.second = true;  // runner from first → second
    s.bases.first = true;   // batter walks to first

    return { newState: s, description, runsScored, correctOptions };
  }

  // No runners — simple walk
  correctOptions.push('walkBatterToFirst');
  description = `四坏球！打者上一垒。`;

  s.bases.first = true;

  return { newState: s, description, runsScored, correctOptions };
}

// ─── resolveStrikeout ─────────────────────────────────────────────────────────

export function resolveStrikeout(state: GameState, event: StrikeoutEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';

  // Check uncaught third strike
  const canRun = isUncaughtThirdStrike(state, event.wildPitch, event.passedBall);

  if (canRun && (event.wildPitch || event.passedBall)) {
    // Ball got away — batter can attempt to reach first
    correctOptions.push('catcherRetrieveBall_throwToFirst');

    if (state.bases.first && state.outs < 2) {
      // First occupied with <2 outs — batter CANNOT run (unless wild pitch)
      // But wild pitch/passed ball overrides: all runners advance
      // However, with first occupied <2 outs, the uncaught third strike rule
      // means batter is still out even if ball gets away... wait no.
      // Wild pitch/passed ball: batter IS allowed to attempt regardless.
      // Actually, the rule: if first is occupied with <2 outs AND it's NOT a wild pitch/passed ball,
      // batter can't run. But with WP/PB, batter can always attempt.

      description = `不死三振！${event.wildPitch ? '暴投' : '漏接'}球跑开，打者冲向一垒！`;

      const s = cloneState(state);
      // Forced runners advance due to wild pitch/passed ball
      if (s.bases.third) {
        s.bases.third = false;
        // Runner from third scores on wild pitch
        return { newState: addRuns(incrementOuts({ ...s, bases: { ...s.bases, third: false, second: s.bases.second, first: true } }), 1), description: `${event.wildPitch ? '暴投' : '漏接'}——三垒跑者得分，打者冲一垒！`, runsScored: 1, correctOptions: ['catcherRetrieveBall_tagBatterOrThrowToFirst'] };
      }

      if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
      if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
      s.bases.first = true; // batter reaches

      // The batter reaching means the strike 3 is NOT an out
      // The runner from first forced to second is safe
      // Only the previously existing out count stays
      description = `不死三振！${event.wildPitch ? '暴投' : '漏接'}，打者冲一垒安全！跑者被迫推进。`;
      return { newState: s, description, runsScored: 0, correctOptions };
    }

    if (state.outs === 2 || !state.bases.first) {
      description = `不死三振！${event.wildPitch ? '暴投' : '漏接'}球跑开，${state.outs === 2 ? '2出局' : '一垒空'}，打者冲一垒！`;

      correctOptions.push('catcherRetrieveBall_throwToFirst_tagBatter');
      const s = cloneState(state);

      // Runners advance on wild pitch/passed ball
      if (s.bases.third) {
        // Runner on third scores on wild pitch
        const runs = 1;
        s.bases.third = false;
        if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
        if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
        s.bases.first = true; // batter reaches
        return { newState: addRuns(s, runs), description: `${event.wildPitch ? '暴投' : '漏接'}不死三振！三垒跑者得分，打者上一垒。`, runsScored: runs, correctOptions };
      }

      if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
      if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
      s.bases.first = true;

      return { newState: s, description, runsScored: 0, correctOptions };
    }
  }

  if (canRun) {
    // Uncaught third strike, batter can attempt to reach first
    correctOptions.push('catcherTagBatter_or_throwToFirst');

    description = `不死三振！捕手未接住第三击，${state.outs === 2 ? '2出局' : '一垒空'}，打者冲一垒！`;

    const s = cloneState(state);
    // Batter attempts to reach first — model as batter being tagged out (defense responds)
    // In practice, this is often a close play
    // We model: catcher tags batter out
    return { newState: incrementOuts(s), description: `不死三振——捕手触杀打者出局！`, runsScored: 0, correctOptions: ['catcherTagBatter'] };
  }

  // Normal strikeout — batter is out
  correctOptions.push('strikeout_recorded');

  if (event.looking) {
    description = `三振出局（看牌）！打者被判三振。`;
  } else {
    description = `三振出局（挥空）！打者挥棒落空。`;
  }

  return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
}

// ─── resolveHitByPitch ────────────────────────────────────────────────────────

function resolveHitByPitch(state: GameState): ResolutionResult {
  // Hit by pitch = same as walk for base advancement (forced runners advance)
  const force = isForcePlay(state);
  const correctOptions: string[] = [];
  let description = '';
  let runsScored = 0;

  const s = cloneState(state);

  if (s.bases.first && s.bases.second && s.bases.third) {
    runsScored = 1;
    s.bases.third = false;
    s.bases.second = false;
    s.bases.third = true;
    s.bases.first = false;
    s.bases.second = true;
    s.bases.first = true;
    correctOptions.push('hitByPitch_loadedBases_runScores');
    description = `触身球！满垒，三垒跑者被迫得分。`;
    return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
  }

  if (s.bases.first && s.bases.second) {
    s.bases.second = false;
    s.bases.third = true;
    s.bases.first = false;
    s.bases.second = true;
    s.bases.first = true;
    correctOptions.push('hitByPitch_runnersAdvance');
    description = `触身球！一二垒跑者被迫推进，打者上一垒。`;
    return { newState: s, description, runsScored, correctOptions };
  }

  if (s.bases.first) {
    s.bases.first = false;
    s.bases.second = true;
    s.bases.first = true;
    correctOptions.push('hitByPitch_runnerAdvances');
    description = `触身球！一垒跑者进二垒，打者上一垒。`;
    return { newState: s, description, runsScored, correctOptions };
  }

  s.bases.first = true;
  correctOptions.push('hitByPitch_batterToFirst');
  description = `触身球！打者上一垒。`;
  return { newState: s, description, runsScored, correctOptions };
}

// ─── resolveSacrificeBunt ─────────────────────────────────────────────────────

function resolveSacrificeBunt(state: GameState, event: SacrificeBuntEvent): ResolutionResult {
  // Similar to bunt but explicitly a sacrifice attempt
  if (state.outs >= 2) {
    // 2 outs — sacrifice doesn't help, batter just out
    const correctOptions: string[] = ['fieldAndThrowToFirst'];
    return { newState: incrementOuts(state), description: `2出局触击牺牲无效，打者被封杀一垒。`, runsScored: 0, correctOptions };
  }

  const force = isForcePlay(state);
  const correctOptions: string[] = [];
  let description = '';
  const s = cloneState(state);

  if (force.third) {
    // Loaded bases sacrifice bunt
    correctOptions.push('fieldAndThrowToHome_forceOut_preventRun');
    description = `满垒牺牲触击向${event.direction}！防守传本垒封杀阻止得分。`;

    s.bases.third = false; // runner out at home
    s.bases.second = false; s.bases.third = true;
    s.bases.first = false; s.bases.second = true;
    s.bases.first = true;
    return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
  }

  if (force.second) {
    correctOptions.push('fieldAndThrowToSecond_forceOut', 'relayToFirst_or_allowSacrifice');
    description = `一二垒有人牺牲触击。防守：传二垒封杀→打者出局（双杀）或仅封杀二垒让打者出局（牺牲成功）。`;

    // Model: defense chooses the smart play
    // With 0 outs: let the sacrifice happen (1 out, runners advance)
    // But defense can try for DP
    s.bases.first = false;
    s.bases.second = false;
    s.bases.third = true; // runner from second → third
    s.bases.second = true; // runner from first → second
    // batter out at first
    if (state.outs === 0) {
      s.outs = 1;
      s.bases.first = false; // batter sacrificed
      return { newState: s, description: `牺牲触击成功！1出局，跑者推进。`, runsScored: 0, correctOptions };
    }
    return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
  }

  if (force.first) {
    correctOptions.push('fieldAndThrowToFirst_sacrifice');
    description = `一垒有人牺牲触击。打者出局，跑者推进二垒。`;

    s.bases.first = false;
    s.bases.second = true;
    return { newState: incrementOuts(s), description, runsScored: 0, correctOptions };
  }

  // No runners — bunt for hit
  if (event.batterSpeed === 'fast') {
    correctOptions.push('fieldAndThrowToFirst_closePlay');
    s.bases.first = true;
    description = `无人垒触击安打尝试！快腿打者冲一垒。`;
    return { newState: s, description, runsScored: 0, correctOptions };
  }

  correctOptions.push('fieldAndThrowToFirst');
  description = `无人垒触击，打者被封杀一垒。`;
  return { newState: incrementOuts(state), description, runsScored: 0, correctOptions };
}

// ─── resolveError ─────────────────────────────────────────────────────────────

function resolveError(state: GameState, event: ErrorEvent): ResolutionResult {
  const correctOptions: string[] = [];
  let description = '';
  const s = cloneState(state);
  let runsScored = 0;

  if (event.severity === 'major') {
    // Major error — extra base advancement
    correctOptions.push('error_defensiveMisplay');

    // All runners advance at least one extra base
    if (s.bases.third) { s.bases.third = false; runsScored++; }
    if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
    if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
    s.bases.first = true; // batter reaches on error

    description = `${event.fielderPosition}严重失误！跑者多进一个垒，打者上垒。`;
    return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
  }

  // Minor error — batter reaches, runners advance one base
  correctOptions.push('error_minorMisplay');

  if (s.bases.third) { s.bases.third = false; runsScored++; }
  if (s.bases.second) { s.bases.second = false; s.bases.third = true; }
  if (s.bases.first) { s.bases.first = false; s.bases.second = true; }
  s.bases.first = true;

  description = `${event.fielderPosition}轻微失误，打者安全上垒。`;
  return { newState: addRuns(s, runsScored), description, runsScored, correctOptions };
}

// =============================================================================
// Master Resolve Function
// =============================================================================

export function resolveHitBall(state: GameState, event: BatterEvent): ResolutionResult {
  switch (event.type) {
    case 'groundBall':
      return resolveGroundBall(state, event);
    case 'flyBall':
      return resolveFlyBall(state, event);
    case 'lineDrive':
      return resolveLineDrive(state, event);
    case 'bunt':
      return resolveBunt(state, event);
    case 'steal':
      return resolveStealAttempt(state, event);
    case 'pickoff':
      return resolvePickoff(state, event);
    case 'walk':
      return resolveWalk(state);
    case 'strikeout':
      return resolveStrikeout(state, event);
    case 'hitByPitch':
      return resolveHitByPitch(state);
    case 'sacrificeBunt':
      return resolveSacrificeBunt(state, event);
    case 'error':
      return resolveError(state, event);
    default:
      throw new Error(`Unknown event type: ${(event as any).type}`);
  }
}

// =============================================================================
// Utility: Create initial game state
// =============================================================================

export function createInitialState(): GameState {
  return {
    outs: 0,
    bases: { first: false, second: false, third: false },
    inning: 1,
    topInning: true,
    score: { home: 0, away: 0 },
  };
}

// =============================================================================
// Utility: Create state with specific runners (for testing)
// =============================================================================

export function createStateWithRunners(
  outs: 0 | 1 | 2,
  first: boolean,
  second: boolean,
  third: boolean,
  inning: number = 1,
  topInning: boolean = true
): GameState {
  return {
    outs,
    bases: { first, second, third },
    inning,
    topInning,
    score: { home: 0, away: 0 },
  };
}

// =============================================================================
// Defensive Positions & correctOptionsByPosition
// =============================================================================

export type DefensivePosition =
  | 'pitcher'
  | 'catcher'
  | 'firstBase'
  | 'secondBase'
  | 'thirdBase'
  | 'shortstop'
  | 'leftField'
  | 'centerField'
  | 'rightField';

export const POSITION_LABELS: Record<DefensivePosition, string> = {
  pitcher: '投手',
  catcher: '捕手',
  firstBase: '一垒手',
  secondBase: '二垒手',
  thirdBase: '三垒手',
  shortstop: '游击手',
  leftField: '左外场手',
  centerField: '中外场手',
  rightField: '右外场手',
};

/**
 * correctOptionsByPosition: Maps each position to the action options
 * that are relevant (and potentially correct) for that position.
 * This allows the drill to assign a position role and generate
 * position-specific choices for the user.
 */
export const correctOptionsByPosition: Record<DefensivePosition, string[]> = {
  pitcher: [
    'fieldAndThrowToHome_forceOut',
    'pitcherPickoffMove_tagOut',
    'coverFirstOnGroundBall',
    'backupHomeOnFlyBall',
    'fieldAndThrowToFirst',
  ],
  catcher: [
    'catcherTagBatter',
    'catcherTagBatter_or_throwToFirst',
    'catcherRetrieveBall_throwToFirst',
    'catcherRetrieveBall_throwToFirst_tagBatter',
    'catcherRetrieveBall_tagBatterOrThrowToFirst',
    'catcherThrowsToSecond_late',
    'catcherThrowsToSecond_tagOut_or_collision',
    'catcherThrowsToTargetBase',
    'catcherThrowsToTargetBase_out',
    'tagOrRundown',
    'catchPopUp',
  ],
  firstBase: [
    'fieldAndThrowToFirst',
    'fieldAndThrowToSecond_forceOut',
    'relayToFirst_doublePlay',
    'relayToFirst_doublePlay_attempt',
    'fieldAndThrowToFirst_sacrifice',
    'fieldAndThrowToFirst_closePlay',
    'fieldBuntAndThrowToFirst',
    'fieldBuntAndThrowToFirst_sacrifice',
    'coverFirstOnGroundBall',
    'thenThrowToFirst_doublePlay_attempt',
  ],
  secondBase: [
    'fieldAndThrowToSecond_forceOut',
    'relayToFirst_doublePlay',
    'relayToFirst_doublePlay_attempt',
    'fieldBuntAndThrowToSecond_forceOut',
    'fieldBuntAndThrowToHome_forceOut',
    'fieldAndThrowToHome_forceOut',
    'catchFlyBall',
    'catchPopUp',
  ],
  thirdBase: [
    'fieldAndThrowToHome_forceOut',
    'fieldAndThrowToSecond_forceOut',
    'fieldBuntAndThrowToHome_forceOut',
    'fieldAndThrowToHome_forceOut_preventRun',
    'thenThrowToFirst_doublePlay_attempt',
    'catchLineDrive',
    'tagRunnerOffBase_doublePlay_attempt',
    'rundown_tagOut_or_safe',
  ],
  shortstop: [
    'fieldAndThrowToSecond_forceOut',
    'relayToFirst_doublePlay',
    'relayToFirst_doublePlay_attempt',
    'fieldBuntAndThrowToSecond_forceOut',
    'fieldAndThrowToThird_forceOut',
    'catchLineDrive',
    'tagRunnerOffBase_doublePlay_attempt',
    'catchPopUp',
    'rundown_tagOut_or_safe',
  ],
  leftField: [
    'catchFlyBall',
    'runnerOnThirdTagsAndScores_sacrificeFly',
    'runnerOnSecondTagsAndAdvances',
    'fieldBall_quickly',
    'throwToCorrectBase',
    'backupThirdOnGroundBall',
  ],
  centerField: [
    'catchFlyBall',
    'runnerOnThirdTagsAndScores_sacrificeFly',
    'runnerOnSecondTagsAndAdvances',
    'runnerOnThirdHolds_shallowFly',
    'runnerOnThirdScoresOnContact_2outs',
    'fieldBall_quickly',
    'throwToCorrectBase',
  ],
  rightField: [
    'catchFlyBall',
    'runnerOnThirdTagsAndScores_sacrificeFly',
    'runnerOnSecondTagsAndAdvances',
    'fieldBall_quickly',
    'throwToCorrectBase',
    'backupFirstOnGroundBall',
  ],
};

// =============================================================================
// Random Scenario Generator
// =============================================================================

export interface DrillScenario {
  state: GameState;
  event: BatterEvent;
  result: ResolutionResult;
  assignedPosition: DefensivePosition;
  positionLabel: string;
  correctAnswer: string;       // one correct option for the assigned position
  allOptions: string[];        // 4 total options (1 correct + 3 distractors)
  eventDescription: string;    // human-readable description of the event
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Human-readable event description */
export function describeEvent(event: BatterEvent): string {
  switch (event.type) {
    case 'groundBall':
      return `${event.speed === 'fast' ? '快速' : event.speed === 'medium' ? '中等' : '慢速'}地滚球向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中路'}方向`;
    case 'flyBall':
      if (event.popUp) return '内野小飞球（Pop-up）';
      return `${event.depth === 'deep' ? '深远' : event.depth === 'medium' ? '中等距离' : '浅'}外场高飞球向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中'}方向`;
    case 'lineDrive':
      return event.caught ? '平飞球被接杀' : '平飞球落地';
    case 'bunt':
      return `${event.quality === 'good' ? '优质' : '拙劣'}触击向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中路'}方向`;
    case 'steal':
      return `跑者尝试盗${event.targetBase === 'second' ? '二垒' : event.targetBase === 'third' ? '三垒' : '本垒'}`;
    case 'pickoff':
      return `投手牵制${event.targetBase === 'first' ? '一垒' : event.targetBase === 'second' ? '二垒' : '三垒'}`;
    case 'walk':
      return '打者获得四坏球保送';
    case 'strikeout':
      if (event.wildPitch) return '三振+暴投！';
      if (event.passedBall) return '三振+漏接！';
      return event.looking ? '三振出局（看牌）' : '三振出局（挥空）';
    case 'hitByPitch':
      return '打者被触身球击中';
    case 'sacrificeBunt':
      return `牺牲触击向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中路'}方向`;
    case 'error':
      return `${POSITION_LABELS[event.fielderPosition as DefensivePosition] || event.fielderPosition}防守失误`;
  }
}

/** Human-readable option label (Chinese) */
export const OPTION_LABELS: Record<string, string> = {
  'fieldAndThrowToFirst': '接球传一垒封杀打者',
  'fieldAndThrowToSecond_forceOut': '接球传二垒封杀（强迫进垒）',
  'relayToFirst_doublePlay': '转传一垒完成双杀',
  'relayToFirst_doublePlay_attempt': '转传一垒尝试双杀',
  'fieldAndThrowToHome_forceOut': '接球传本垒封杀阻止得分',
  'fieldAndThrowToHome_forceOut_preventRun': '传本垒封杀阻止得分',
  'fieldAndThrowToThird_forceOut': '接球传三垒封杀',
  'thenThrowToFirst_doublePlay_attempt': '再传一垒尝试双杀',
  'catchFlyBall': '接杀高飞球',
  'catchPopUp': '接杀小飞球',
  'catchLineDrive': '接杀平飞球',
  'tagRunnerOffBase_doublePlay_attempt': '触杀离垒跑者尝试双杀',
  'runnerOnThirdTagsAndScores_sacrificeFly': '三垒跑者回垒起跑得分（高飞牺牲打）',
  'runnerOnSecondTagsAndAdvances': '二垒跑者回垒起跑进三垒',
  'runnerOnThirdHolds_shallowFly': '三垒跑者回垒不动（浅飞球不宜起跑）',
  'runnerOnThirdScoresOnContact_2outs': '三垒跑者2出局起跑得分',
  'infieldFlyRule_declared': '内野高飞球规则生效（打者自动出局）',
  'catchOrLetDrop_sameResult': '接或不接结果相同（内野高飞规则）',
  'catcherTagBatter': '捕手触杀打者（不死三振）',
  'catcherTagBatter_or_throwToFirst': '捕手触杀或传一垒',
  'catcherRetrieveBall_throwToFirst': '捕手捡球传一垒',
  'catcherRetrieveBall_throwToFirst_tagBatter': '捕手捡球触杀或传一垒',
  'catcherRetrieveBall_tagBatterOrThrowToFirst': '捕手捡球后触杀打者或传一垒',
  'catcherThrowsToSecond_late': '捕手传二垒（跑者已到）',
  'catcherThrowsToSecond_tagOut_or_collision': '捕手传二垒触杀或夹杀',
  'catcherThrowsToTargetBase': '捕手传目标垒包',
  'catcherThrowsToTargetBase_out': '捕手传目标垒包触杀出局',
  'tagOrRundown': '触杀或制造夹杀',
  'rundown_tagOut_or_safe': '夹杀（跑者攻防纠缠）',
  'pitcherPickoffMove_tagOut': '投手牵制触杀出局',
  'pickoffFails_runnerReturnsSafely': '牵制失败跑者安全回垒',
  'walkWithLoadedBases_runScores': '满垒四坏球跑者得分',
  'walkRunnersAdvance': '四坏球跑者被迫推进',
  'walkRunnerAdvances': '四坏球一垒跑者进二垒',
  'walkBatterToFirst': '四坏球打者上一垒',
  'strikeout_recorded': '记录三振出局',
  'hitByPitch_loadedBases_runScores': '触身球满垒跑者得分',
  'hitByPitch_runnersAdvance': '触身球跑者被迫推进',
  'hitByPitch_runnerAdvances': '触身球一垒跑者进二垒',
  'hitByPitch_batterToFirst': '触身球打者上一垒',
  'fieldBuntAndThrowToFirst': '接触击传一垒封杀',
  'fieldBuntAndThrowToFirst_sacrifice': '接触击传一垒（牺牲触击）',
  'fieldBuntAndThrowToSecond_forceOut': '接触击传二垒封杀',
  'fieldBuntAndThrowToHome_forceOut': '接触击传本垒封杀',
  'relayToFirst_or_allowSacrifice': '转传一垒或允许牺牲',
  'fieldAndThrowToFirst_sacrifice': '接球传一垒（牺牲出局）',
  'fieldAndThrowToFirst_closePlay': '接球传一垒（紧张攻防）',
  'coverFirstOnGroundBall': '跑向一垒补位',
  'backupHomeOnFlyBall': '回本垒后方补位',
  'backupThirdOnGroundBall': '回三垒后方补位',
  'backupFirstOnGroundBall': '回一垒后方补位',
  'fieldBall_quickly': '快速捡球',
  'throwToCorrectBase': '传向正确垒包',
  'error_defensiveMisplay': '防守失误处理',
  'error_minorMisplay': '轻微失误处理',
  'runnerAdvancesToSecond': '跑者推进到二垒',
  'invalidScenario': '无效局面',
};

// Pool of ALL option keys for distractor generation
const ALL_OPTION_KEYS = Object.keys(OPTION_LABELS);

/**
 * Generate a pool of valid game states (not all combos make sense).
 * We pick interesting situations: various runner configs + out counts.
 */
export function generateRandomState(): GameState {
  const outs: 0 | 1 | 2 = pickRandom([0, 0, 0, 1, 1, 2] as (0|1|2)[]);
  // Runner configs weighted toward interesting situations
  const runnerConfigs: BaseOccupancy[] = [
    { first: false, second: false, third: false },
    { first: true, second: false, third: false },
    { first: true, second: true, third: false },
    { first: true, second: false, third: true },
    { first: true, second: true, third: true },
    { first: false, second: true, third: false },
    { first: false, second: false, third: true },
    { first: false, second: true, third: true },
  ];
  // Weight toward runner-on-base scenarios (more interesting decisions)
  const weighted: BaseOccupancy[] = [
    ...runnerConfigs.slice(1), // skip empty bases, repeat non-empty
    ...runnerConfigs.slice(1),
    runnerConfigs[0], // include empty but less often
  ];
  const bases = pickRandom(weighted);
  const inning = pickRandom([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const topInning = pickRandom([true, false]);

  return {
    outs,
    bases,
    inning,
    topInning,
    score: { home: Math.floor(Math.random() * 5), away: Math.floor(Math.random() * 5) },
  };
}

export function generateRandomEvent(state: GameState): BatterEvent {
  // Generate events that make sense for the current state
  const hasRunnerOnFirst = state.bases.first;
  const hasRunnerOnSecond = state.bases.second;
  const hasRunnerOnThird = state.bases.third;
  const hasAnyRunner = hasRunnerOnFirst || hasRunnerOnSecond || hasRunnerOnThird;

  // Build a pool of possible events
  const possibleEvents: BatterEvent[] = [];

  // Ground balls — always possible
  possibleEvents.push(
    { type: 'groundBall', direction: pickRandom(['left', 'right', 'center']), speed: 'fast', batterSpeed: pickRandom(['slow', 'average', 'fast']) },
    { type: 'groundBall', direction: pickRandom(['left', 'right', 'center']), speed: 'medium', batterSpeed: pickRandom(['slow', 'average', 'fast']) },
    { type: 'groundBall', direction: pickRandom(['left', 'right', 'center']), speed: 'slow', batterSpeed: pickRandom(['slow', 'average', 'fast']) },
  );

  // Fly balls — always possible
  possibleEvents.push(
    { type: 'flyBall', depth: 'deep', direction: pickRandom(['left', 'right', 'center']), popUp: false },
    { type: 'flyBall', depth: 'medium', direction: pickRandom(['left', 'right', 'center']), popUp: false },
    { type: 'flyBall', depth: 'shallow', direction: pickRandom(['left', 'right', 'center']), popUp: false },
  );

  // Pop-ups — more likely with runners (infield fly rule scenario)
  if (hasRunnerOnFirst && hasRunnerOnSecond) {
    possibleEvents.push({ type: 'flyBall', depth: 'shallow', direction: 'center', popUp: true });
  }
  possibleEvents.push({ type: 'flyBall', depth: 'shallow', direction: pickRandom(['left', 'right', 'center']), popUp: true });

  // Line drives
  possibleEvents.push(
    { type: 'lineDrive', direction: pickRandom(['left', 'right', 'center']), caught: true },
    { type: 'lineDrive', direction: pickRandom(['left', 'right', 'center']), caught: false },
  );

  // Bunts — more common with runners
  if (hasAnyRunner && state.outs < 2) {
    possibleEvents.push(
      { type: 'bunt', direction: pickRandom(['left', 'right', 'center']), quality: 'good', batterSpeed: pickRandom(['slow', 'average', 'fast']) },
      { type: 'bunt', direction: pickRandom(['left', 'right', 'center']), quality: 'poor', batterSpeed: pickRandom(['slow', 'average', 'fast']) },
    );
  }
  // Bunt for hit (no runners)
  possibleEvents.push(
    { type: 'bunt', direction: pickRandom(['left', 'right', 'center']), quality: 'good', batterSpeed: 'fast' },
  );

  // Steals — only if runner on appropriate base
  if (hasRunnerOnFirst && !state.bases.second) {
    possibleEvents.push(
      { type: 'steal', targetBase: 'second', runnerSpeed: pickRandom(['slow', 'average', 'fast']), catcherArm: pickRandom(['weak', 'average', 'strong']), pitchType: pickRandom(['fastball', 'breaking', 'changeup']) },
    );
  }
  if (hasRunnerOnSecond && !state.bases.third) {
    possibleEvents.push(
      { type: 'steal', targetBase: 'third', runnerSpeed: pickRandom(['slow', 'average', 'fast']), catcherArm: pickRandom(['weak', 'average', 'strong']), pitchType: pickRandom(['fastball', 'breaking', 'changeup']) },
    );
  }
  if (hasRunnerOnThird) {
    possibleEvents.push(
      { type: 'steal', targetBase: 'home', runnerSpeed: pickRandom(['slow', 'average', 'fast']), catcherArm: pickRandom(['weak', 'average', 'strong']), pitchType: pickRandom(['fastball', 'breaking', 'changeup']) },
    );
  }

  // Pickoffs — only if runner on a base
  if (hasRunnerOnFirst) {
    possibleEvents.push(
      { type: 'pickoff', targetBase: 'first', pitcherMove: pickRandom(['quick', 'average', 'slow']), runnerReaction: pickRandom(['alert', 'average', 'distracted']) },
    );
  }
  if (hasRunnerOnSecond) {
    possibleEvents.push(
      { type: 'pickoff', targetBase: 'second', pitcherMove: pickRandom(['quick', 'average', 'slow']), runnerReaction: pickRandom(['alert', 'average', 'distracted']) },
    );
  }

  // Walk
  possibleEvents.push({ type: 'walk' });

  // Strikeout — include interesting variants
  possibleEvents.push({ type: 'strikeout', looking: true, wildPitch: false, passedBall: false });
  possibleEvents.push({ type: 'strikeout', looking: false, wildPitch: false, passedBall: false });
  // Uncaught third strike scenarios
  if (!hasRunnerOnFirst || state.outs === 2) {
    possibleEvents.push({ type: 'strikeout', looking: false, wildPitch: true, passedBall: false });
    possibleEvents.push({ type: 'strikeout', looking: false, wildPitch: false, passedBall: true });
  }

  // Hit by pitch
  possibleEvents.push({ type: 'hitByPitch' });

  // Sacrifice bunt — with runners
  if (hasAnyRunner && state.outs < 2) {
    possibleEvents.push(
      { type: 'sacrificeBunt', direction: pickRandom(['left', 'right', 'center']), batterSpeed: pickRandom(['slow', 'average', 'fast']) },
    );
  }

  return pickRandom(possibleEvents);
}

/**
 * Determine which defensive position is most relevant for a given scenario.
 * Based on the event type, direction, and runner configuration.
 */
function assignPosition(state: GameState, event: BatterEvent): DefensivePosition {
  switch (event.type) {
    case 'groundBall':
      if (event.direction === 'left') return pickRandom(['thirdBase', 'shortstop']);
      if (event.direction === 'right') return pickRandom(['firstBase', 'secondBase']);
      return pickRandom(['pitcher', 'secondBase', 'shortstop']);
    case 'flyBall':
      if (event.popUp) return pickRandom(['pitcher', 'catcher', 'firstBase', 'secondBase', 'thirdBase', 'shortstop']);
      if (event.direction === 'left') return 'leftField';
      if (event.direction === 'right') return 'rightField';
      return 'centerField';
    case 'lineDrive':
      if (event.caught) {
        if (event.direction === 'left') return pickRandom(['thirdBase', 'shortstop', 'leftField']);
        if (event.direction === 'right') return pickRandom(['firstBase', 'secondBase', 'rightField']);
        return pickRandom(['pitcher', 'centerField', 'shortstop', 'secondBase']);
      }
      return pickRandom(['leftField', 'centerField', 'rightField']);
    case 'bunt':
      if (event.direction === 'left') return pickRandom(['thirdBase', 'pitcher']);
      if (event.direction === 'right') return pickRandom(['firstBase', 'pitcher', 'catcher']);
      return pickRandom(['pitcher', 'catcher', 'firstBase', 'thirdBase']);
    case 'steal':
      return 'catcher';
    case 'pickoff':
      return 'pitcher';
    case 'walk':
      return pickRandom(['catcher', 'firstBase']);
    case 'strikeout':
      return 'catcher';
    case 'hitByPitch':
      return pickRandom(['catcher', 'pitcher']);
    case 'sacrificeBunt':
      if (event.direction === 'left') return pickRandom(['thirdBase', 'pitcher']);
      if (event.direction === 'right') return pickRandom(['firstBase', 'pitcher']);
      return pickRandom(['pitcher', 'firstBase', 'thirdBase']);
    case 'error':
      return event.fielderPosition as DefensivePosition;
  }
}

/**
 * Generate 3 distractor options that are NOT in the correct options list
 * for the assigned position.
 */
function generateDistractors(
  correctOption: string,
  positionOptions: string[],
  allCorrectOptions: string[],
): string[] {
  // Distractors come from:
  // 1. Other position options (not correct for THIS position but sound plausible)
  // 2. General wrong actions (反义/opposite descriptions)
  const distractorPool = ALL_OPTION_KEYS.filter(
    key => key !== correctOption && !allCorrectOptions.includes(key)
  );

  // Also add some "wrong but plausible" options from the same position
  // (other things the position could do that aren't optimal for THIS scenario)
  const positionDistractors = positionOptions.filter(
    key => key !== correctOption && !allCorrectOptions.includes(key)
  );

  const combinedPool = [...positionDistractors, ...distractorPool];

  // Pick 3 unique distractors
  const chosen: string[] = [];
  const shuffled = shuffleArray(combinedPool);
  for (const opt of shuffled) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(opt)) chosen.push(opt);
  }

  // If we couldn't get 3, fill from ALL_OPTION_KEYS
  while (chosen.length < 3) {
    const opt = pickRandom(ALL_OPTION_KEYS);
    if (opt !== correctOption && !chosen.includes(opt) && !allCorrectOptions.includes(opt)) {
      chosen.push(opt);
    }
  }

  return chosen;
}

/**
 * getRandomScenario: Generates a complete drill scenario for the training page.
 * Returns a DrillScenario with:
 * - game state
 * - batter event
 * - resolution result
 * - assigned position + label
 * - 4 options (1 correct + 3 distractors), shuffled
 * - event description
 */
export function getRandomScenario(): DrillScenario {
  const state = generateRandomState();
  const event = generateRandomEvent(state);
  const result = resolveHitBall(state, event);

  // Skip invalid scenarios (e.g., steal with no runner)
  if (result.correctOptions.includes('invalidScenario')) {
    return getRandomScenario(); // retry
  }

  const position = assignPosition(state, event);
  const positionOptions = correctOptionsByPosition[position];

  // Pick one correct answer from the intersection of result.correctOptions and positionOptions
  // If no intersection, pick from result.correctOptions directly
  const intersection = result.correctOptions.filter(opt => positionOptions.includes(opt));
  const correctAnswer = intersection.length > 0
    ? pickRandom(intersection)
    : pickRandom(result.correctOptions);

  // Generate 3 distractors
  const distractors = generateDistractors(correctAnswer, positionOptions, result.correctOptions);

  // Shuffle 4 options
  const allOptions = shuffleArray([correctAnswer, ...distractors]);

  const eventDescription = describeEvent(event);

  return {
    state,
    event,
    result,
    assignedPosition: position,
    positionLabel: POSITION_LABELS[position],
    correctAnswer,
    allOptions,
    eventDescription,
  };
}

/**
 * getScenarioForPosition: Like getRandomScenario but forces the assigned position.
 * Keeps generating state+event combos until assignPosition() returns the desired position.
 * Uses a max retry count to avoid infinite loops for rare combos.
 */
export function getScenarioForPosition(targetPosition: DefensivePosition): DrillScenario {
  const MAX_RETRIES = 50;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const state = generateRandomState();
    const event = generateRandomEvent(state);
    const result = resolveHitBall(state, event);

    if (result.correctOptions.includes('invalidScenario')) continue;

    const position = assignPosition(state, event);
    if (position !== targetPosition) continue;

    const positionOptions = correctOptionsByPosition[position];
    const intersection = result.correctOptions.filter(opt => positionOptions.includes(opt));
    const correctAnswer = intersection.length > 0
      ? pickRandom(intersection)
      : pickRandom(result.correctOptions);

    const distractors = generateDistractors(correctAnswer, positionOptions, result.correctOptions);
    const allOptions = shuffleArray([correctAnswer, ...distractors]);
    const eventDescription = describeEvent(event);

    return {
      state,
      event,
      result,
      assignedPosition: position,
      positionLabel: POSITION_LABELS[position],
      correctAnswer,
      allOptions,
      eventDescription,
    };
  }

  // Fallback: if we can't find a matching scenario, return a random one
  // with the position label overridden
  const fallback = getRandomScenario();
  return {
    ...fallback,
    assignedPosition: targetPosition,
    positionLabel: POSITION_LABELS[targetPosition],
  };
}

// =============================================================================
// Probability-Based Next Batter Event Generator (for half-inning simulation)
// =============================================================================
// Approximate MLB probability distributions for batter outcomes.
// Used by the batting-inning page to simulate a realistic half-inning.
// =============================================================================

/** Weighted random pick from entries [value, weight] */
function weightedPick<T>(entries: [T, number][]): T {
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * totalWeight;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * generateNextBatterEvent: Produces the next batter event based on
 * realistic probability distributions, adapted to the current game state.
 * - Ground balls ~30%
 * - Fly balls ~25%
 * - Line drives ~15%
 * - Walks ~10%
 * - Strikeouts ~15%
 * - Other (bunt, HBP, steal, etc.) ~5%
 * Steals/pickoffs only when runners are on base.
 */
export function generateNextBatterEvent(state: GameState): BatterEvent {
  const hasFirst = state.bases.first;
  const hasSecond = state.bases.second;
  const hasThird = state.bases.third;
  const hasAnyRunner = hasFirst || hasSecond || hasThird;

  // Build event type pool with weights
  const eventTypePool: [string, number][] = [
    ['groundBall', 30],
    ['flyBall', 25],
    ['lineDrive', 15],
    ['strikeout', 15],
    ['walk', 10],
    ['hitByPitch', 2],
  ];

  // Conditional events based on runner configuration
  if (hasAnyRunner && state.outs < 2) {
    eventTypePool.push(['bunt', 3]);
    eventTypePool.push(['sacrificeBunt', 2]);
  }
  if (hasFirst && !state.bases.second) {
    eventTypePool.push(['steal_second', 1.5]);
  }
  if (hasSecond && !state.bases.third) {
    eventTypePool.push(['steal_third', 0.5]);
  }
  if (hasFirst) {
    eventTypePool.push(['pickoff', 1]);
  }

  const eventType = weightedPick(eventTypePool);

  switch (eventType) {
    case 'groundBall':
      return {
        type: 'groundBall',
        direction: weightedPick([['left', 3], ['right', 3], ['center', 2]]),
        speed: weightedPick([['fast', 4], ['medium', 3], ['slow', 1]]),
        batterSpeed: weightedPick([['average', 5], ['fast', 2], ['slow', 1]]),
      };
    case 'flyBall':
      const isPopup = state.outs < 2 && hasFirst && hasSecond
        ? Math.random() < 0.15  // infield fly scenario
        : Math.random() < 0.25; // general popup chance
      return {
        type: 'flyBall',
        depth: weightedPick([['deep', 3], ['medium', 3], ['shallow', 2]]),
        direction: weightedPick([['left', 3], ['right', 3], ['center', 3]]),
        popUp: isPopup,
      };
    case 'lineDrive':
      return {
        type: 'lineDrive',
        direction: weightedPick([['left', 3], ['right', 3], ['center', 3]]),
        caught: Math.random() < 0.6,
      };
    case 'strikeout':
      const isWildPitch = Math.random() < 0.08;
      const isPassedBall = !isWildPitch && Math.random() < 0.05;
      return {
        type: 'strikeout',
        looking: Math.random() < 0.35,
        wildPitch: isWildPitch,
        passedBall: isPassedBall,
      };
    case 'walk':
      return { type: 'walk' };
    case 'hitByPitch':
      return { type: 'hitByPitch' };
    case 'bunt':
      return {
        type: 'bunt',
        direction: weightedPick([['left', 3], ['right', 3], ['center', 1]]),
        quality: weightedPick([['good', 3], ['poor', 2]]),
        batterSpeed: weightedPick([['average', 3], ['fast', 2], ['slow', 1]]),
      };
    case 'sacrificeBunt':
      return {
        type: 'sacrificeBunt',
        direction: weightedPick([['left', 3], ['right', 3], ['center', 1]]),
        batterSpeed: weightedPick([['average', 3], ['fast', 1]]),
      };
    case 'steal_second':
      return {
        type: 'steal',
        targetBase: 'second',
        runnerSpeed: weightedPick([['average', 4], ['fast', 3], ['slow', 1]]),
        catcherArm: weightedPick([['average', 4], ['strong', 2], ['weak', 1]]),
        pitchType: weightedPick([['fastball', 5], ['breaking', 2], ['changeup', 2]]),
      };
    case 'steal_third':
      return {
        type: 'steal',
        targetBase: 'third',
        runnerSpeed: weightedPick([['average', 3], ['fast', 3], ['slow', 1]]),
        catcherArm: weightedPick([['average', 4], ['strong', 2], ['weak', 1]]),
        pitchType: weightedPick([['fastball', 4], ['breaking', 3], ['changeup', 2]]),
      };
    case 'pickoff':
      return {
        type: 'pickoff',
        targetBase: hasFirst ? 'first' : 'second',
        pitcherMove: weightedPick([['average', 4], ['quick', 2], ['slow', 1]]),
        runnerReaction: weightedPick([['average', 4], ['alert', 2], ['distracted', 1]]),
      };
    default:
      // Fallback to ground ball
      return {
        type: 'groundBall',
        direction: 'center',
        speed: 'medium',
        batterSpeed: 'average',
      };
  }
}

/**
 * generateInningScenario: For the batting-inning page, produces a
 * complete scenario (state + event + result + position assignment + options)
 * similar to getRandomScenario but using a given current state and a
 * probability-generated next event.
 */
export function generateInningScenario(currentState: GameState): DrillScenario {
  const event = generateNextBatterEvent(currentState);
  const result = resolveHitBall(currentState, event);

  if (result.correctOptions.includes('invalidScenario')) {
    // Reroll invalid events (e.g. steal with no runner)
    return generateInningScenario(currentState);
  }

  const position = assignPosition(currentState, event);
  const positionOptions = correctOptionsByPosition[position];

  const intersection = result.correctOptions.filter(opt => positionOptions.includes(opt));
  const correctAnswer = intersection.length > 0
    ? pickRandom(intersection)
    : pickRandom(result.correctOptions);

  const distractors = generateDistractors(correctAnswer, positionOptions, result.correctOptions);
  const allOptions = shuffleArray([correctAnswer, ...distractors]);

  return {
    state: currentState,
    event,
    result,
    assignedPosition: position,
    positionLabel: POSITION_LABELS[position],
    correctAnswer,
    allOptions,
    eventDescription: describeEvent(event),
  };
}

// =============================================================================
// TEST CASES — 15+ scenarios covering edge cases
// =============================================================================
// Run these tests with: npx ts-node src/lib/engine.test.ts
// =============================================================================

/*
=== TEST CASES (verified manually / can be automated) ===

1. GROUND BALL DOUBLE PLAY (0 outs, runner on first)
   State: outs=0, bases={first:true, second:false, third:false}
   Event: groundBall { direction:'right', speed:'fast', batterSpeed:'average' }
   Expected: 2 outs, bases empty, correctOptions includes doublePlay
   Verification: resolveHitBall(state, event).outs === 2

2. GROUND BALL DOUBLE PLAY (1 outs, runner on first)
   State: outs=1, bases={first:true, second:false, third:false}
   Event: groundBall { direction:'right', speed:'fast', batterSpeed:'average' }
   Expected: 3 outs → side retired, inning switches

3. INFIELD FLY RULE (0 outs, runners on 1st+2nd)
   State: outs=0, bases={first:true, second:true, third:false}
   Event: flyBall { depth:'shallow', direction:'center', popUp:false }
   Expected: isInfieldFly(state) === true, batter automatically out, runners hold
   Verification: isInfieldFly(state) returns true

4. INFIELD FLY RULE (2 outs — does NOT apply)
   State: outs=2, bases={first:true, second:true, third:false}
   Expected: isInfieldFly(state) === false

5. SACRIFICE FLY (0 outs, runner on third)
   State: outs=0, bases={first:false, second:false, third:true}
   Event: flyBall { depth:'deep', direction:'center', popUp:false }
   Expected: outs=1, runner scores, correctOptions includes sacrificeFly

6. SACRIFICE FLY (1 outs, runner on third)
   Same as above but outs=1 → outs=2, run still scores

7. SHALLOW FLY — NO SACRIFICE (0 outs, runner on third)
   State: outs=0, bases={first:false, second:false, third:true}
   Event: flyBall { depth:'shallow', direction:'center', popUp:false }
   Expected: outs=1, runner holds at third (too shallow to tag and score)

8. UNCAUGHT THIRD STRIKE (2 outs, first base empty)
   State: outs=2, bases={first:false, second:false, third:false}
   Event: strikeout { looking:false, wildPitch:false, passedBall:true }
   Expected: isUncaughtThirdStrike === true, batter can run

9. UNCAUGHT THIRD STRIKE (0 outs, first base occupied — CANNOT run)
   State: outs=0, bases={first:true, second:false, third:false}
   Event: strikeout { looking:true, wildPitch:false, passedBall:false }
   Expected: isUncaughtThirdStrike === false (first occupied, <2 outs)

10. WILD PITCH ON STRIKE 3 (overrides restriction)
    State: outs=0, bases={first:true, second:false, third:true}
    Event: strikeout { looking:false, wildPitch:true, passedBall:false }
    Expected: isUncaughtThirdStrike === true even with first occupied
    (wildPitch overrides the restriction)

11. WALK WITH LOADED BASES (run scores)
    State: outs=0, bases={first:true, second:true, third:true}
    Event: walk {}
    Expected: batter to first, runner from third scores, outs still 0

12. LINE DRIVE CAUGHT + DOUBLE PLAY OPPORTUNITY
    State: outs=0, bases={first:true, second:false, third:false}
    Event: lineDrive { direction:'center', caught:true }
    Expected: batter out, runner must return, correctOptions includes doublePlay

13. STEAL SUCCESS (fast runner, breaking ball, weak catcher)
    State: outs=0, bases={first:true, second:false, third:false}
    Event: steal { targetBase:'second', runnerSpeed:'fast', catcherArm:'weak', pitchType:'breaking' }
    Expected: runner on second, first empty

14. STEAL FAILURE (slow runner, fastball, strong catcher)
    State: outs=0, bases={first:true, second:false, third:false}
    Event: steal { targetBase:'second', runnerSpeed:'slow', catcherArm:'strong', pitchType:'fastball' }
    Expected: runner out (caught stealing), outs=1

15. PICKOFF SUCCESS (quick pitcher, distracted runner at first)
    State: outs=1, bases={first:true, second:false, third:false}
    Event: pickoff { targetBase:'first', pitcherMove:'quick', runnerReaction:'distracted' }
    Expected: runner out, outs=2

16. GROUND BALL WITH LOADED BASES — HOME FORCE OUT
    State: outs=0, bases={first:true, second:true, third:true}
    Event: groundBall { direction:'center', speed:'fast', batterSpeed:'average' }
    Expected: correctOptions includes 'fieldAndThrowToHome_forceOut'
    Runner from third forced out at home (preventing run)

17. BUNT FOR HIT (fast runner, no one on base)
    State: outs=1, bases={first:false, second:false, third:false}
    Event: bunt { direction:'left', quality:'good', batterSpeed:'fast' }
    Expected: batter may reach first (close play)

18. RUNDOWN (夹杀) ON STEAL ATTEMPT
    State: outs=0, bases={first:true, second:false, third:false}
    Event: steal { targetBase:'second', runnerSpeed:'average', catcherArm:'average', pitchType:'fastball' }
    Expected: stealScore = 0, close play, correctOptions includes rundown

19. GROUND BALL — NO FORCE, ROUTINE OUT
    State: outs=1, bases={first:false, second:false, third:false}
    Event: groundBall { direction:'right', speed:'fast', batterSpeed:'slow' }
    Expected: outs=2, batter out at first

20. HIT BY PITCH WITH LOADED BASES
    State: outs=0, bases={first:true, second:true, third:true}
    Event: hitByPitch {}
    Expected: run scores, same as loaded bases walk
*/