// =============================================================================
// Diamond IQ — Game Simulation Helpers
// =============================================================================
// Supports the full-game simulation page (/game) with:
// - Wrong decision consequence logic (worse outcome when player errs)
// - Game-over detection
// - Scoreboard tracking
// - Post-game defense report generation
// =============================================================================

import {
  GameState,
  BatterEvent,
  ResolutionResult,
  DefensivePosition,
  POSITION_LABELS,
  correctOptionsByPosition,
  BaseOccupancy,
} from './engine';
import { generateDistractors } from '../util/optionDistractors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameConfig {
  totalInnings: number;        // typically 9
  homeTeam: string;            // team name
  awayTeam: string;            // team name
  playerSide: 'home' | 'away'; // which team the player coaches defense for
}

export interface GameDecisionRecord {
  inning: number;
  topInning: boolean;
  outsBefore: number;
  basesBefore: BaseOccupancy;
  event: BatterEvent;
  eventDescription: string;
  position: DefensivePosition;
  chosenOption: string;
  correctAnswer: string;
  correct: boolean;
  reactionTime: number;        // ms
  consequence: string;         // what happened because of this decision
  runsScored: number;          // runs scored on this play
}

export interface InningScore {
  top: number | null;          // null = hasn't happened yet
  bottom: number | null;
}

export interface GameScoreboard {
  innings: InningScore[];
  homeTotal: number;
  awayTotal: number;
}

export interface GameReport {
  totalDecisions: number;
  totalCorrect: number;
  accuracy: number;            // percentage
  grade: string;               // A+, A, B, C, D, F
  gradeMessage: string;
  positionBreakdown: {
    position: DefensivePosition;
    label: string;
    decisions: number;
    correct: number;
    accuracy: number;
  }[];
  worstMistakes: GameDecisionRecord[];   // top 3 worst decisions
  runsPrevented: number;                 // runs that WOULD have scored if all decisions wrong
  runsAllowedDueToErrors: number;        // extra runs from wrong decisions
  finalScore: { home: number; away: number };
}

// ─── Scoreboard Helpers ───────────────────────────────────────────────────────

export function createEmptyScoreboard(totalInnings: number): GameScoreboard {
  return {
    innings: Array.from({ length: totalInnings }, () => ({ top: null, bottom: null })),
    homeTotal: 0,
    awayTotal: 0,
  };
}

export function updateScoreboard(
  scoreboard: GameScoreboard,
  state: GameState,
  runsScored: number
): GameScoreboard {
  const sb = { ...scoreboard, innings: scoreboard.innings.map(i => ({ ...i })) };
  const inningIdx = state.inning - 1;

  if (inningIdx >= 0 && inningIdx < sb.innings.length) {
    if (state.topInning) {
      // Away team batting (top of inning)
      if (sb.innings[inningIdx].top === null) {
        sb.innings[inningIdx].top = 0;
      }
      sb.innings[inningIdx].top += runsScored;
      sb.awayTotal += runsScored;
    } else {
      // Home team batting (bottom of inning)
      if (sb.innings[inningIdx].bottom === null) {
        sb.innings[inningIdx].bottom = 0;
      }
      sb.innings[inningIdx].bottom += runsScored;
      sb.homeTotal += runsScored;
    }
  }

  return sb;
}

export function finalizeIncompleteInnings(scoreboard: GameScoreboard): GameScoreboard {
  const sb = { ...scoreboard, innings: scoreboard.innings.map(i => ({ ...i })) };
  for (const inning of sb.innings) {
    if (inning.top === null) inning.top = 0;
    if (inning.bottom === null) inning.bottom = 0;
  }
  return sb;
}

// ─── Game-Over Detection ─────────────────────────────────────────────────────

export function isGameOver(state: GameState, config: GameConfig): boolean {
  // Game is over if:
  // 1. We've completed all innings AND the bottom of the last inning
  // 2. Or: top of 9th (or later) is done AND home team is winning (walk-off)

  if (state.inning > config.totalInnings) return true;

  if (state.inning === config.totalInnings) {
    // In the 9th inning
    // If topInning is false (we're in the bottom), and home is winning:
    // Actually, we check after the TOP is complete (3 outs in top).
    // The game continues to the bottom only if away > home.
    // Walk-off: bottom of 9th, home takes lead → game ends immediately.

    // Simple check: if we're past the 9th inning entirely, game over.
    // If we're at the start of bottom of 9th and away <= home, game may already be decided.
    if (!state.topInning && state.score.home > state.score.away) {
      // Walk-off condition: home team leads in bottom of final inning
      return true;
    }
  }

  // If we've completed bottom of the last inning (inning advanced past totalInnings)
  return state.inning > config.totalInnings;
}

// ─── Side Retired Detection ──────────────────────────────────────────────────

export function isSideRetired(oldState: GameState, newState: GameState): boolean {
  if (newState.outs !== 0) return false;
  return newState.topInning !== oldState.topInning || newState.inning !== oldState.inning;
}

// ─── Wrong Decision Consequence Logic ─────────────────────────────────────────

/**
 * resolveWithWrongDecision: Produces a worse outcome when the player
 * chooses incorrectly. The exact consequence depends on the scenario type.
 *
 * Strategy: Take the engine's optimal result, then degrade it:
 * - Ground ball DP: remove the second out, runner safe
 * - Ground ball force at home: runner scores instead
 * - Fly ball with tag-up: missed catch or extra advance
 * - Steal: steal succeeds
 * - General: add 1 extra run or advance an extra runner
 */
export function resolveWithWrongDecision(
  state: GameState,
  event: BatterEvent,
  optimalResult: ResolutionResult,
  chosenOption: string,
  wrongPosition: DefensivePosition
): ResolutionResult {
  const newState = { ...optimalResult.newState, bases: { ...optimalResult.newState.bases }, score: { ...optimalResult.newState.score } };

  // Calculate extra runs from wrong decision
  let extraRuns = 0;
  let consequence = '';

  // Determine consequence based on scenario
  if (event.type === 'groundBall') {
    if (optimalResult.correctOptions.includes('relayToFirst_doublePlay')) {
      // Double play scenario — wrong decision means only 1 out
      // Reduce outs: if engine gave 2 outs, reduce to 1
      if (newState.outs >= 2) {
        newState.outs = (newState.outs - 1) as 0 | 1 | 2;
      }
      // Runner that should have been out on DP is now safe
      // Put a runner back on base
      if (!newState.bases.first) {
        newState.bases.first = true;
      }
      consequence = '双杀失败——仅完成一出局，跑者安全';
    } else if (optimalResult.correctOptions.includes('fieldAndThrowToHome_forceOut')) {
      // Force at home — wrong means runner scores
      const battingTeamRuns = state.topInning ? 'away' : 'home';
      newState.score[battingTeamRuns] += 1;
      extraRuns = 1;
      newState.bases.third = false;
      consequence = '未传本垒封杀——跑者得分!';
    } else {
      // General ground ball — wrong means batter safe, possible extra advance
      newState.bases.first = true;
      if (newState.outs > state.outs) {
        newState.outs = state.outs as 0 | 1 | 2;
      }
      // If runners were on, they may advance extra
      if (state.bases.second && !newState.bases.third) {
        newState.bases.third = true;
        newState.bases.second = false;
      }
      consequence = '防守失误——打者安全上垒，跑者额外推进';
    }
  } else if (event.type === 'flyBall') {
    if (optimalResult.correctOptions.includes('runnerOnThirdTagsAndScores_sacrificeFly')) {
      // Sac fly — wrong means missed catch or no tag-up awareness
      // Result: fly ball NOT caught, becomes a hit, extra bases
      const battingTeamRuns = state.topInning ? 'away' : 'home';
      newState.score[battingTeamRuns] += 1;
      extraRuns = 1;
      consequence = '高飞球处理失误——跑者额外得分';
    } else if (optimalResult.correctOptions.includes('runnerOnThirdHolds_shallowFly')) {
      // Should hold — wrong means runner tries to score and gets thrown out
      // OR wrong means outfielder doesn't catch and runner scores anyway
      newState.bases.third = false;
      newState.bases.first = true;
      consequence = '浅飞球判断失误——跑者冒险或防守未接杀';
    } else {
      consequence = '高飞球防守决策失误';
      // Extra runner advance
      if (state.bases.first && !newState.bases.second) {
        newState.bases.second = true;
      }
    }
  } else if (event.type === 'lineDrive') {
    if (optimalResult.correctOptions.includes('tagRunnerOffBase_doublePlay_attempt')) {
      // Line drive caught, should tag runner — wrong means no tag
      // Only 1 out instead of double play
      consequence = '平飞球接杀后未触杀——仅一出局';
    } else {
      consequence = '平飞球防守失误';
    }
  } else if (event.type === 'steal') {
    // Wrong catcher decision → steal succeeds
    const target = event.targetBase;
    if (target === 'second') {
      newState.bases.second = true;
      newState.bases.first = false;
    } else if (target === 'third') {
      newState.bases.third = true;
      newState.bases.second = false;
    } else {
      // Stealing home — runner scores
      const battingTeamRuns = state.topInning ? 'away' : 'home';
      newState.score[battingTeamRuns] += 1;
      extraRuns = 1;
      newState.bases.third = false;
    }
    // No out recorded for this play
    if (newState.outs > state.outs) {
      // outs increased (steal caught) — reverse that
      newState.outs = state.outs as 0 | 1 | 2;
    }
    consequence = `盗${target === 'second' ? '二' : target === 'third' ? '三' : '本'}垒成功——防守决策错误`;
  } else if (event.type === 'bunt' || event.type === 'sacrificeBunt') {
    if (optimalResult.correctOptions.includes('fieldBuntAndThrowToSecond_forceOut')) {
      // Should throw to 2nd for force — wrong means only sacrifice
      newState.outs = (newState.outs > 0 ? newState.outs - 1 : 0) as 0 | 1 | 2;
      newState.bases.first = true;
      consequence = '接触击防守失误——跑者推进';
    } else {
      consequence = '接触击处理不当';
    }
  } else {
    // Generic fallback — add 1 run for wrong decision
    const battingTeamRuns = state.topInning ? 'away' : 'home';
    newState.score[battingTeamRuns] += 1;
    extraRuns = 1;
    consequence = '防守决策失误——额外失分';
  }

  const runsScored = (optimalResult.runsScored || 0) + extraRuns;

  return {
    newState,
    description: consequence,
    runsScored,
    correctOptions: optimalResult.correctOptions,
  };
}

// ─── Per-Position Options for a Play ──────────────────────────────────────────

export interface PlayPositionOptions {
  position: DefensivePosition;
  correctAnswer: string;
  allOptions: string[];
  isObserver: boolean;
}

export function generatePlayPositionOptions(
  correctOptions: string[]
): PlayPositionOptions[] {
  const ALL_POSITIONS: DefensivePosition[] = [
    'pitcher', 'catcher', 'firstBase', 'secondBase',
    'thirdBase', 'shortstop', 'leftField', 'centerField', 'rightField',
  ];

  return ALL_POSITIONS.map(pos => {
    const positionOpts = correctOptionsByPosition[pos];
    const intersection = correctOptions.filter(opt => positionOpts.includes(opt));

    if (intersection.length > 0) {
      const correctAnswer = intersection[0]; // take first correct option
      const distractors = generateDistractors(correctOptions, pos);
      const allOptions = [correctAnswer, ...distractors];
      // Shuffle
      for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
      }

      return {
        position: pos,
        correctAnswer,
        allOptions,
        isObserver: false,
      };
    } else {
      return {
        position: pos,
        correctAnswer: '',
        allOptions: [],
        isObserver: true,
      };
    }
  });
}

/**
 * Pick which position the player will control this play.
 * Strategy: randomly pick one of the relevant (non-observer) positions.
 */
export function pickPlayerPosition(
  positionOptions: PlayPositionOptions[]
): PlayPositionOptions | null {
  const relevant = positionOptions.filter(p => !p.isObserver);
  if (relevant.length === 0) return null;
  return relevant[Math.floor(Math.random() * relevant.length)];
}

// ─── Defense Report Generation ────────────────────────────────────────────────

export function buildGameReport(
  decisions: GameDecisionRecord[],
  scoreboard: GameScoreboard,
  config: GameConfig
): GameReport {
  const totalDecisions = decisions.length;
  const totalCorrect = decisions.filter(d => d.correct).length;
  const accuracy = totalDecisions > 0 ? Math.round((totalCorrect / totalDecisions) * 100) : 0;

  const grade = accuracy >= 90 ? 'A+' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 60 ? 'C' : accuracy >= 50 ? 'D' : 'F';
  const gradeMessage = accuracy >= 90 ? '防守大师! 几乎完美的判断。' :
    accuracy >= 70 ? '不错的防守，继续保持!' :
    accuracy >= 50 ? '还需练习，关注强迫进垒和双杀机会。' :
    '防守漏洞较大，建议从专项位置训练开始。';

  // Position breakdown
  const posMap = new Map<DefensivePosition, { decisions: number; correct: number }>();
  for (const d of decisions) {
    const existing = posMap.get(d.position) || { decisions: 0, correct: 0 };
    posMap.set(d.position, {
      decisions: existing.decisions + 1,
      correct: existing.correct + (d.correct ? 1 : 0),
    });
  }

  const positionBreakdown = Array.from(posMap.entries()).map(([pos, data]) => ({
    position: pos,
    label: POSITION_LABELS[pos],
    decisions: data.decisions,
    correct: data.correct,
    accuracy: data.decisions > 0 ? Math.round((data.correct / data.decisions) * 100) : 0,
  }));

  // Worst mistakes (top 3 by consequence severity)
  const worstMistakes = decisions
    .filter(d => !d.correct)
    .sort((a, b) => b.runsScored - a.runsScored)
    .slice(0, 3);

  // Runs analysis
  const runsAllowedDueToErrors = decisions
    .filter(d => !d.correct)
    .reduce((sum, d) => sum + d.runsScored, 0);

  const runsPrevented = decisions
    .filter(d => d.correct)
    .reduce((sum, d) => sum + (d.runsScored === 0 ? 1 : 0), 0); // each correct decision that prevented a run

  return {
    totalDecisions,
    totalCorrect,
    accuracy,
    grade,
    gradeMessage,
    positionBreakdown,
    worstMistakes,
    runsPrevented,
    runsAllowedDueToErrors,
    finalScore: { home: scoreboard.homeTotal, away: scoreboard.awayTotal },
  };
}