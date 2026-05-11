// =============================================================================
// Diamond IQ — Scenario Bank
// =============================================================================
// Enumerates all meaningful GameState × BatterEvent combinations,
// resolves each via the engine, and filters to scenarios where a given
// defensive position has relevant decision options.
//
// Results are cached on first call (the enumeration is deterministic
// and the cache never expires within a session).
// =============================================================================

import {
  GameState,
  BatterEvent,
  BaseOccupancy,
  DefensivePosition,
  POSITION_LABELS,
  correctOptionsByPosition,
  resolveHitBall,
  describeEvent,
  OPTION_LABELS,
} from './engine';

// ─── Scenario Category System ────────────────────────────────────────────────

export type ScenarioCategory =
  | 'groundBall'      // 地滚球
  | 'flyBall'         // 高飞球
  | 'lineDrive'       // 平飞球
  | 'steal'           // 盗垒
  | 'bunt'            // 触击
  | 'doublePlay'      // 双杀机会
  | 'forcePlay'       // 强迫进垒
  | 'preventRun'      // 阻止得分
  | 'sacrificeFly'    // 高飞牺牲打
  | 'uncaughtStrike'  // 不死三振
  | 'emptyBases'      // 垒空（基础）
  | 'runnerOn1st'     // 仅一垒有人
  | 'runnerOn2nd'     // 仅二垒有人
  | 'runnerOn3rd'     // 仅三垒有人
  | 'multipleRunners' // 多垒有人（进阶）
  | 'loadedBases'     // 满垒（高级）

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  groundBall: '地滚球',
  flyBall: '高飞球',
  lineDrive: '平飞球',
  steal: '盗垒',
  bunt: '触击',
  doublePlay: '双杀机会',
  forcePlay: '强迫进垒',
  preventRun: '阻止得分',
  sacrificeFly: '高飞牺牲打',
  uncaughtStrike: '不死三振',
  emptyBases: '垒空（基础）',
  runnerOn1st: '一垒有人',
  runnerOn2nd: '二垒有人',
  runnerOn3rd: '三垒有人',
  multipleRunners: '多垒有人（进阶）',
  loadedBases: '满垒（高级）',
};

function categorizeScenario(s: Scenario): ScenarioCategory[] {
  const categories: ScenarioCategory[] = [];
  const event = s.event;
  const state = s.state;

  // Event type categories
  if (event.type === 'groundBall') categories.push('groundBall');
  if (event.type === 'flyBall') categories.push('flyBall');
  if (event.type === 'lineDrive') categories.push('lineDrive');
  if (event.type === 'steal') categories.push('steal');
  if (event.type === 'bunt' || event.type === 'sacrificeBunt') categories.push('bunt');

  // Situation-based categories
  if (s.correctOptions.some(opt => opt.includes('doublePlay') || opt.includes('relayToFirst_doublePlay'))) {
    categories.push('doublePlay');
  }
  if (s.correctOptions.some(opt => opt.includes('forceOut') || opt.includes('forcePlay'))) {
    categories.push('forcePlay');
  }
  if (s.correctOptions.some(opt => opt.includes('ToHome') || opt.includes('preventRun') || opt === 'fieldAndThrowToHome_forceOut' || opt === 'fieldAndThrowToHome_forceOut_preventRun' || opt === 'fieldBuntAndThrowToHome_forceOut' || opt === 'backupHomeOnFlyBall' || opt === 'lateThrowHome')) {
    categories.push('preventRun');
  }
  if (s.correctOptions.some(opt => opt.includes('sacrificeFly') || opt.includes('TagsAndScores'))) {
    categories.push('sacrificeFly');
  }
  if (s.correctOptions.some(opt => opt.includes('uncaught') || opt.includes('catcherTagBatter') || opt.includes('catcherRetrieve'))) {
    categories.push('uncaughtStrike');
  }

  // Base occupancy categories
  const { first, second, third } = state.bases;
  if (!first && !second && !third) categories.push('emptyBases');
  if (first && !second && !third) categories.push('runnerOn1st');
  if (!first && second && !third) categories.push('runnerOn2nd');
  if (!first && !second && third) categories.push('runnerOn3rd');
  if ((first && second && !third) || (first && !second && third) || (!first && second && third)) categories.push('multipleRunners');
  if (first && second && third) categories.push('loadedBases');

  return categories;
}

// ─── Scenario type ────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;                  // unique identifier for this scenario
  state: GameState;            // game state before the event
  event: BatterEvent;          // the batter/runner event
  correctOptions: string[];    // engine's correct options for this scenario
  relevantPositions: DefensivePosition[]; // positions that have options here
  description: string;         // human-readable description
  eventDescription: string;    // description of the event only
  categories: ScenarioCategory[]; // categories for filtering
}

// ─── Enumerate all base occupancy configs ────────────────────────────────────

const BASE_CONFIGS: BaseOccupancy[] = [
  { first: false, second: false, third: false },  // empty
  { first: true,  second: false, third: false },  // 1st only
  { first: false, second: true,  third: false },  // 2nd only
  { first: false, second: false, third: true  },  // 3rd only
  { first: true,  second: true,  third: false },  // 1st+2nd
  { first: true,  second: false, third: true  },  // 1st+3rd
  { first: false, second: true,  third: true  },  // 2nd+3rd
  { first: true,  second: true,  third: true  },  // loaded
];

const OUT_CONFIGS: (0 | 1 | 2)[] = [0, 1, 2];

// ─── Enumerate all BatterEvent variants ───────────────────────────────────────

const DIRECTIONS: ('left' | 'right' | 'center')[] = ['left', 'right', 'center'];
const SPEEDS: ('slow' | 'medium' | 'fast')[] = ['slow', 'medium', 'fast'];
const BATTER_SPEEDS: ('slow' | 'average' | 'fast')[] = ['slow', 'average', 'fast'];
const DEPTHS: ('shallow' | 'medium' | 'deep')[] = ['shallow', 'medium', 'deep'];
const POPUPS: boolean[] = [true, false];
const LINE_CAUGHT: boolean[] = [true, false];
const BUNT_QUALITIES: ('good' | 'poor')[] = ['good', 'poor'];
const STEAL_TARGETS: ('second' | 'third' | 'home')[] = ['second', 'third', 'home'];
const CATCHER_ARMS: ('weak' | 'average' | 'strong')[] = ['weak', 'average', 'strong'];
const PITCH_TYPES: ('fastball' | 'breaking' | 'changeup')[] = ['fastball', 'breaking', 'changeup'];
const PICKOFF_TARGETS: ('first' | 'second' | 'third')[] = ['first', 'second', 'third'];
const PITCHER_MOVES: ('quick' | 'average' | 'slow')[] = ['quick', 'average', 'slow'];
const RUNNER_REACTIONS: ('alert' | 'average' | 'distracted')[] = ['alert', 'average', 'distracted'];
const LOOKINGS: boolean[] = [true, false];
const WILD_PITCHES: boolean[] = [true, false];
const PASSED_BALLS: boolean[] = [true, false];
const ERROR_SEVERITIES: ('minor' | 'major')[] = ['minor', 'major'];
const ERROR_POSITIONS: DefensivePosition[] = [
  'pitcher', 'catcher', 'firstBase', 'secondBase',
  'thirdBase', 'shortstop', 'leftField', 'centerField', 'rightField',
];

function generateAllEvents(): BatterEvent[] {
  const events: BatterEvent[] = [];

  // Ground balls: direction × speed × batterSpeed = 3×3×3 = 27
  for (const dir of DIRECTIONS) {
    for (const speed of SPEEDS) {
      for (const bs of BATTER_SPEEDS) {
        events.push({ type: 'groundBall', direction: dir, speed, batterSpeed: bs });
      }
    }
  }

  // Fly balls: depth × direction × popUp = 3×3×2 = 18
  for (const depth of DEPTHS) {
    for (const dir of DIRECTIONS) {
      for (const popUp of POPUPS) {
        events.push({ type: 'flyBall', depth, direction: dir, popUp });
      }
    }
  }

  // Line drives: direction × caught = 3×2 = 6
  for (const dir of DIRECTIONS) {
    for (const caught of LINE_CAUGHT) {
      events.push({ type: 'lineDrive', direction: dir, caught });
    }
  }

  // Bunts: direction × quality × batterSpeed = 3×2×3 = 18
  for (const dir of DIRECTIONS) {
    for (const q of BUNT_QUALITIES) {
      for (const bs of BATTER_SPEEDS) {
        events.push({ type: 'bunt', direction: dir, quality: q, batterSpeed: bs });
      }
    }
  }

  // Steals: target × runnerSpeed × catcherArm × pitchType = 3×3×3×3 = 81
  for (const target of STEAL_TARGETS) {
    for (const rs of BATTER_SPEEDS) {
      for (const ca of CATCHER_ARMS) {
        for (const pt of PITCH_TYPES) {
          events.push({ type: 'steal', targetBase: target, runnerSpeed: rs, catcherArm: ca, pitchType: pt });
        }
      }
    }
  }

  // Pickoffs: target × pitcherMove × runnerReaction = 3×3×3 = 27
  for (const target of PICKOFF_TARGETS) {
    for (const pm of PITCHER_MOVES) {
      for (const rr of RUNNER_REACTIONS) {
        events.push({ type: 'pickoff', targetBase: target, pitcherMove: pm, runnerReaction: rr });
      }
    }
  }

  // Walk: 1
  events.push({ type: 'walk' });

  // Strikeouts: looking × wildPitch × passedBall = 2×2×2 = 8
  for (const looking of LOOKINGS) {
    for (const wp of WILD_PITCHES) {
      for (const pb of PASSED_BALLS) {
        events.push({ type: 'strikeout', looking, wildPitch: wp, passedBall: pb });
      }
    }
  }

  // Hit by pitch: 1
  events.push({ type: 'hitByPitch' });

  // Sacrifice bunts: direction × batterSpeed = 3×3 = 9
  for (const dir of DIRECTIONS) {
    for (const bs of BATTER_SPEEDS) {
      events.push({ type: 'sacrificeBunt', direction: dir, batterSpeed: bs });
    }
  }

  // Errors: fielderPosition × severity = 9×2 = 18
  for (const fp of ERROR_POSITIONS) {
    for (const sev of ERROR_SEVERITIES) {
      events.push({ type: 'error', fielderPosition: fp, severity: sev });
    }
  }

  return events;
}

// ─── Determine which positions have options for a scenario ─────────────────────

function getRelevantPositions(correctOptions: string[]): DefensivePosition[] {
  const positions: DefensivePosition[] = [];
  for (const [pos, opts] of Object.entries(correctOptionsByPosition)) {
    if (opts.some(opt => correctOptions.includes(opt))) {
      positions.push(pos as DefensivePosition);
    }
  }
  return positions;
}

// ─── Validate that an event makes sense for a given state ─────────────────────

function isEventValidForState(state: GameState, event: BatterEvent): boolean {
  switch (event.type) {
    case 'steal':
      // Can't steal second if no runner on first
      if (event.targetBase === 'second' && !state.bases.first) return false;
      // Can't steal third if no runner on second
      if (event.targetBase === 'third' && !state.bases.second) return false;
      // Can't steal home if no runner on third
      if (event.targetBase === 'home' && !state.bases.third) return false;
      // Can't steal if target base is already occupied (and not forced)
      if (event.targetBase === 'second' && state.bases.second) return false;
      if (event.targetBase === 'third' && state.bases.third) return false;
      return true;

    case 'pickoff':
      // Can't pickoff first if no runner
      if (event.targetBase === 'first' && !state.bases.first) return false;
      if (event.targetBase === 'second' && !state.bases.second) return false;
      if (event.targetBase === 'third' && !state.bases.third) return false;
      return true;

    case 'bunt':
      // Bunt for hit with no runners is valid, but sacrifice bunt needs runners
      // Both are fine — bunt without runners = bunt for hit attempt
      return true;

    case 'sacrificeBunt':
      // Only meaningful with runners and <2 outs
      const hasAny = state.bases.first || state.bases.second || state.bases.third;
      if (!hasAny) return false;
      if (state.outs >= 2) return false;
      return true;

    default:
      return true;
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let allScenarios: Scenario[] | null = null;
let scenariosByPosition: Map<string, Scenario[]> | null = null;

// ─── Build the full scenario bank ─────────────────────────────────────────────

function buildScenarioBank(): Scenario[] {
  const events = generateAllEvents();
  const scenarios: Scenario[] = [];
  let idCounter = 0;

  for (const outs of OUT_CONFIGS) {
    for (const bases of BASE_CONFIGS) {
      const state: GameState = {
        outs,
        bases,
        inning: 1,
        topInning: true,
        score: { home: 0, away: 0 },
      };

      for (const event of events) {
        // Skip invalid event/state combos
        if (!isEventValidForState(state, event)) continue;

        // Resolve the event
        const result = resolveHitBall(state, event);

        // Skip invalid scenarios (marked by engine)
        if (result.correctOptions.includes('invalidScenario')) continue;

        // Find which positions have relevant options
        const relevantPositions = getRelevantPositions(result.correctOptions);

        // Only include scenarios where at least one position has options
        if (relevantPositions.length === 0) continue;

        const id = `scenario_${idCounter++}`;
        const eventDescription = describeEvent(event);
        const description = `${state.outs}出局 ${formatBases(bases)} → ${eventDescription}`;

        const scenarioObj: Scenario = {
          id,
          state,
          event,
          correctOptions: result.correctOptions,
          relevantPositions,
          description,
          eventDescription,
          categories: [], // will be filled below
        };
        scenarioObj.categories = categorizeScenario(scenarioObj);
        scenarios.push(scenarioObj);
      }
    }
  }

  return scenarios;
}

function formatBases(bases: BaseOccupancy): string {
  const parts: string[] = [];
  if (bases.first) parts.push('一垒');
  if (bases.second) parts.push('二垒');
  if (bases.third) parts.push('三垒');
  return parts.length > 0 ? parts.join('+') + '有人' : '垒空';
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * getAllScenarios: Returns the complete scenario bank (cached).
 * Includes all valid GameState × BatterEvent combinations where at least
 * one defensive position has decision options.
 */
export function getAllScenarios(): Scenario[] {
  // Skip heavy computation during SSR/build — only compute on client side
  if (typeof window === 'undefined') {
    return [];
  }
  if (!allScenarios) {
    allScenarios = buildScenarioBank();
  }
  return allScenarios;
}

/**
 * getAllScenariosForPosition: Filters the scenario bank to scenarios
 * where the given position has at least one decision option.
 *
 * @param position — Can be English key ('pitcher', 'catcher', etc.)
 *                    or Chinese label ('投手', '捕手', etc.)
 * @returns Scenario[] — All scenarios relevant to that position
 */
export function getAllScenariosForPosition(position: string): Scenario[] {
  // Resolve Chinese label to English key if needed
  const englishKey = resolvePositionKey(position);

  if (!scenariosByPosition) {
    scenariosByPosition = new Map();
    const all = getAllScenarios();
    for (const pos of Object.keys(correctOptionsByPosition) as DefensivePosition[]) {
      scenariosByPosition.set(pos, all.filter(s => s.relevantPositions.includes(pos)));
    }
  }

  return scenariosByPosition.get(englishKey) || [];
}

/**
 * resolvePositionKey: Accepts either an English DefensivePosition key
 * or a Chinese POSITION_LABELS value, and returns the English key.
 */
export function resolvePositionKey(position: string): DefensivePosition {
  // Check if it's already an English key
  if (Object.keys(POSITION_LABELS).includes(position)) {
    return position as DefensivePosition;
  }

  // Try to match Chinese label
  for (const [key, label] of Object.entries(POSITION_LABELS)) {
    if (label === position) return key as DefensivePosition;
  }

  // Fallback — throw error for unknown position
  throw new Error(`Unknown position: "${position}". Expected one of: ${Object.keys(POSITION_LABELS).join(', ')} or ${Object.values(POSITION_LABELS).join(', ')}`);
}

/**
 * getScenarioById: Find a specific scenario by its id.
 */
export function getScenarioById(id: string): Scenario | undefined {
  return getAllScenarios().find(s => s.id === id);
}

/**
 * getPositionScenarioCount: Returns the number of scenarios per position.
 */
export function getPositionScenarioCount(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pos of Object.keys(correctOptionsByPosition)) {
    counts[pos] = getAllScenariosForPosition(pos).length;
    counts[POSITION_LABELS[pos as DefensivePosition]] = counts[pos];
  }
  return counts;
}

/**
 * getScenariosByCategory: Filters the scenario bank by category.
 */
export function getScenariosByCategory(category: ScenarioCategory): Scenario[] {
  return getAllScenarios().filter(s => s.categories.includes(category));
}

/**
 * getCategoryCount: Returns the number of scenarios per category.
 */
export function getCategoryCount(): Record<ScenarioCategory, number> {
  const counts: Record<string, number> = {};
  for (const s of getAllScenarios()) {
    for (const cat of s.categories) {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  return counts as Record<ScenarioCategory, number>;
}