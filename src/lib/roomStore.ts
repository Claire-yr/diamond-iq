// =============================================================================
// Diamond IQ — In-Memory Room Store
// =============================================================================
// Manages room state, players, scenarios, submissions, and SSE subscribers.
// All state is ephemeral (lost on server restart) — no database persistence.
// =============================================================================

import {
  GameState, BatterEvent, DefensivePosition, ResolutionResult,
  POSITION_LABELS, OPTION_LABELS, correctOptionsByPosition,
  generateRandomState, generateRandomEvent, resolveHitBall,
  shuffleArray, pickRandom,
} from './engine';
import { generateDistractors } from '../util/optionDistractors';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomPhase = 'waiting' | 'active' | 'result';

export interface Player {
  sessionId: string;
  nickname: string;
  position: DefensivePosition | null; // null until they pick
  submission: Submission | null;
}

export interface Submission {
  chosenOption: string;
  correct: boolean;
  reactionTime: number; // ms
  timestamp: number;     // ms epoch
}

export interface PositionOptions {
  correctAnswer: string;    // stored server-side only, NOT sent via SSE
  allOptions: string[];     // 4 shuffled options (1 correct + 3 distractors)
  isObserver: boolean;      // true if this position has no relevant action in this scenario
}

// For SSE serialization (no correctAnswer)
export interface PositionOptionsPublic {
  allOptions: string[];
  isObserver: boolean;
}

export interface ActiveScenario {
  state: GameState;
  event: BatterEvent;
  result: ResolutionResult;
  perPositionOptions: Map<DefensivePosition, PositionOptions>;
  startedAt: number;         // ms epoch — used for reaction time calc
  deadline: number;          // ms epoch — startedAt + 8000
}

export interface TeamAnalysis {
  playerResults: {
    nickname: string;
    position: DefensivePosition | null;
    chosenOption: string;
    correct: boolean;
    correctAnswer: string;    // the actual correct answer for their position
    reactionTime: number;
  }[];
  bestPlayDescription: string;
  collaborativeAnalysis: string;    // dynamic sentence like "游击手正确，二垒手错误，双杀失败"
  optimalPath: AnimationStep[];
  actualPath: AnimationStep[];
  teamOutcome: string;             // "双杀成功" or "仅一出局" etc.
}

export interface AnimationStep {
  label: string;
  fromBase: string;
  toBase: string;
  result: string;
  isDeviation?: boolean;   // true if this step differs from optimal (for red coloring)
}

export interface Room {
  code: string;
  coachId: string;
  players: Player[];
  phase: RoomPhase;
  scenario: ActiveScenario | null;
  analysis: TeamAnalysis | null;
  createdAt: number;
}

// ─── SSE Subscriber Management ────────────────────────────────────────────────

type SSEListener = (data: Room) => void;

const rooms = new Map<string, Room>();
const sseSubscribers = new Map<string, Set<SSEListener>>();

// ─── Helper: Generate 6-digit room code ──────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Helper: Notify SSE subscribers for a room ───────────────────────────────

function notifySubscribers(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  const subs = sseSubscribers.get(code);
  if (!subs) return;
  const snapshot = { ...room, players: [...room.players], scenario: room.scenario ? { ...room.scenario } : null, analysis: room.analysis ? { ...room.analysis } : null };
  subs.forEach(listener => {
    try { listener(snapshot); } catch { /* remove broken listeners */ }
  });
}

// ─── Cooperative Scenario Generation ──────────────────────────────────────────

export function generateCooperativeScenario(
  playerPositions: DefensivePosition[]
): { state: GameState; event: BatterEvent; result: ResolutionResult; perPositionOptions: Map<DefensivePosition, PositionOptions> } | null {
  const MAX_RETRIES = 30;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const state = generateRandomState();
    const event = generateRandomEvent(state);
    const result = resolveHitBall(state, event);

    if (result.correctOptions.includes('invalidScenario')) continue;

    const perPositionOptions = new Map<DefensivePosition, PositionOptions>();
    let anyRelevant = false;

    for (const pos of playerPositions) {
      const positionOpts = correctOptionsByPosition[pos];
      const intersection = result.correctOptions.filter(opt => positionOpts.includes(opt));

      if (intersection.length > 0) {
        anyRelevant = true;
        const correctAnswer = pickRandom(intersection);
        const distractors = generateDistractors(result.correctOptions, pos);
        const allOptions = shuffleArray([correctAnswer, ...distractors]);

        perPositionOptions.set(pos, {
          correctAnswer,
          allOptions,
          isObserver: false,
        });
      } else {
        perPositionOptions.set(pos, {
          correctAnswer: '',
          allOptions: [],
          isObserver: true,
        });
      }
    }

    if (!anyRelevant) continue;

    return { state, event, result, perPositionOptions };
  }

  return null;
}

// ─── Per-Position Options Public (for SSE) ────────────────────────────────────

export function getPerPositionOptionsPublic(
  perPositionOptions: Map<DefensivePosition, PositionOptions>
): Record<string, PositionOptionsPublic> {
  const result: Record<string, PositionOptionsPublic> = {};
  perPositionOptions.forEach((opts, pos) => {
    result[pos] = {
      allOptions: opts.allOptions,
      isObserver: opts.isObserver,
    };
  });
  return result;
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

export function createRoom(coachId: string): Room {
  let code = generateCode();
  while (rooms.has(code)) {
    code = generateCode();
  }

  const room: Room = {
    code,
    coachId,
    players: [],
    phase: 'waiting',
    scenario: null,
    analysis: null,
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | null {
  return rooms.get(code) || null;
}

export function joinRoom(code: string, sessionId: string, nickname: string): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.phase !== 'waiting') return { success: false, error: '房间已在进行中，无法加入' };

  if (room.players.some(p => p.sessionId === sessionId)) {
    return { success: false, error: '你已经在这个房间了' };
  }
  if (sessionId === room.coachId) {
    return { success: false, error: '教练不能以球员身份加入' };
  }

  const player: Player = {
    sessionId,
    nickname,
    position: null,
    submission: null,
  };

  room.players.push(player);
  notifySubscribers(code);
  return { success: true, room };
}

export function setPlayerPosition(code: string, sessionId: string, position: DefensivePosition): { success: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.phase !== 'waiting') return { success: false, error: '局面进行中，无法更改位置' };

  const player = room.players.find(p => p.sessionId === sessionId);
  if (!player) return { success: false, error: '你不是该房间的成员' };

  if (room.players.some(p => p.position === position && p.sessionId !== sessionId)) {
    return { success: false, error: '该位置已被其他球员选择' };
  }

  player.position = position;
  notifySubscribers(code);
  return { success: true };
}

export function startScenario(
  code: string,
  scenarioData: {
    state: GameState;
    event: BatterEvent;
    result: ResolutionResult;
    perPositionOptions: Map<DefensivePosition, PositionOptions>;
  }
): { success: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: '房间不存在' };

  // Validate: all players must have a position
  const unpositioned = room.players.filter(p => p.position === null);
  if (unpositioned.length > 0) {
    return { success: false, error: `有${unpositioned.length}位球员未选择位置：${unpositioned.map(p => p.nickname).join(', ')}` };
  }

  // Reset all submissions
  room.players.forEach(p => { p.submission = null; });
  room.analysis = null;

  const now = Date.now();
  room.scenario = {
    state: scenarioData.state,
    event: scenarioData.event,
    result: scenarioData.result,
    perPositionOptions: scenarioData.perPositionOptions,
    startedAt: now,
    deadline: now + 8000,
  };
  room.phase = 'active';

  notifySubscribers(code);
  return { success: true };
}

export function submitAnswer(code: string, sessionId: string, chosenOption: string): { success: boolean; error?: string; correct?: boolean } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.phase !== 'active') return { success: false, error: '当前不在答题阶段' };

  const player = room.players.find(p => p.sessionId === sessionId);
  if (!player) return { success: false, error: '你不是该房间的成员' };
  if (!player.position) return { success: false, error: '你未选择防守位置' };
  if (player.submission) return { success: false, error: '你已经提交了答案' };

  const posOptions = room.scenario!.perPositionOptions.get(player.position);

  // Observer position — auto-correct
  if (!posOptions || posOptions.isObserver) {
    player.submission = {
      chosenOption: 'observer',
      correct: true,
      reactionTime: 0,
      timestamp: Date.now(),
    };
    const allSubmitted = room.players.every(p => p.submission !== null);
    if (allSubmitted || Date.now() >= room.scenario!.deadline) {
      resolveScenario(code);
    } else {
      notifySubscribers(code);
    }
    return { success: true, correct: true };
  }

  // Validate chosenOption is in their allowed options
  if (!posOptions.allOptions.includes(chosenOption)) {
    return { success: false, error: '无效选项' };
  }

  const now = Date.now();
  const reactionTime = now - room.scenario!.startedAt;
  const correct = chosenOption === posOptions.correctAnswer;

  player.submission = {
    chosenOption,
    correct,
    reactionTime,
    timestamp: now,
  };

  const allSubmitted = room.players.every(p => p.submission !== null);
  const isDeadline = now >= room.scenario!.deadline;

  if (allSubmitted || isDeadline) {
    resolveScenario(code);
  } else {
    notifySubscribers(code);
  }

  return { success: true, correct };
}

// Auto-submit timeout for remaining players
export function checkDeadline(code: string): boolean {
  const room = rooms.get(code);
  if (!room || room.phase !== 'active' || !room.scenario) return false;

  const now = Date.now();
  if (now < room.scenario.deadline) return false;

  room.players.forEach(p => {
    if (!p.submission) {
      // Observer auto-correct, others timeout
      const posOpts = p.position ? room.scenario!.perPositionOptions.get(p.position) : null;
      const isObs = !posOpts || posOpts.isObserver;

      p.submission = {
        chosenOption: isObs ? 'observer' : 'timeout',
        correct: isObs,
        reactionTime: 8000,
        timestamp: now,
      };
    }
  });

  resolveScenario(code);
  return true;
}

// ─── Resolve Scenario ─────────────────────────────────────────────────────────

function resolveScenario(code: string) {
  const room = rooms.get(code);
  if (!room || !room.scenario) return;

  room.phase = 'result';

  const result = room.scenario.result;

  // Build player results with correctAnswer
  const playerResults = room.players.map(p => {
    const posOpts = p.position ? room.scenario!.perPositionOptions.get(p.position) : null;
    const correctAnswer = posOpts ? posOpts.correctAnswer : '';
    return {
      nickname: p.nickname,
      position: p.position,
      chosenOption: p.submission!.chosenOption,
      correct: p.submission!.correct,
      correctAnswer,
      reactionTime: p.submission!.reactionTime,
    };
  });

  const collaborativeAnalysis = buildCollaborativeAnalysis(room);
  const optimalPath = buildOptimalPath(room);
  const actualPath = buildActualPath(room);
  const teamOutcome = determineTeamOutcome(room);

  room.analysis = {
    playerResults,
    bestPlayDescription: result.description,
    collaborativeAnalysis,
    optimalPath,
    actualPath,
    teamOutcome,
  };

  notifySubscribers(code);
}

// ─── Build Collaborative Analysis ────────────────────────────────────────────

function buildCollaborativeAnalysis(room: Room): string {
  if (!room.scenario) return '';

  const parts: string[] = [];
  const result = room.scenario.result;

  for (const player of room.players) {
    if (!player.position || !player.submission) continue;

    const posOpts = room.scenario.perPositionOptions.get(player.position);
    if (!posOpts || posOpts.isObserver) {
      parts.push(`${POSITION_LABELS[player.position]}旁观（本局面无相关动作）`);
      continue;
    }

    const posLabel = POSITION_LABELS[player.position];
    const optionLabel = OPTION_LABELS[player.submission.chosenOption] || player.submission.chosenOption;

    if (player.submission.correct) {
      parts.push(`${posLabel}正确(${optionLabel})`);
    } else {
      const correctLabel = OPTION_LABELS[posOpts.correctAnswer] || posOpts.correctAnswer;
      parts.push(`${posLabel}错误(选了${optionLabel}，应选${correctLabel})`);
    }
  }

  const allRelevantCorrect = room.players.every(p => {
    if (!p.submission) return true;
    const posOpts = p.position ? room.scenario!.perPositionOptions.get(p.position) : null;
    if (!posOpts || posOpts.isObserver) return true;
    return p.submission.correct;
  });

  let consequence = '';
  if (allRelevantCorrect) {
    consequence = `——最优防守执行成功！`;
  } else {
    const wrongPositions = room.players
      .filter(p => p.submission && !p.submission.correct)
      .map(p => p.position ? POSITION_LABELS[p.position] : '未知');
    consequence = `——${wrongPositions.join('、')}决策失误，导致${determineFailureConsequence(room)}`;
  }

  return parts.join('，') + consequence;
}

// ─── Determine Team Outcome ──────────────────────────────────────────────────

function determineTeamOutcome(room: Room): string {
  if (!room.scenario) return '';

  const allRelevantCorrect = room.players.every(p => {
    if (!p.submission) return true;
    const posOpts = p.position ? room.scenario!.perPositionOptions.get(p.position) : null;
    if (!posOpts || posOpts.isObserver) return true;
    return p.submission.correct;
  });

  if (allRelevantCorrect) {
    const result = room.scenario.result;
    if (result.correctOptions.includes('relayToFirst_doublePlay') ||
        result.correctOptions.includes('fieldAndThrowToSecond_forceOut')) {
      return '双杀成功';
    }
    if (result.runsScored === 0) {
      return '防守成功，阻止得分';
    }
    return '最优防守执行';
  }

  return determineFailureConsequence(room);
}

function determineFailureConsequence(room: Room): string {
  if (!room.scenario) return '防守失误';

  const result = room.scenario.result;
  const hasDPOptions = result.correctOptions.some(opt =>
    opt.includes('doublePlay') || opt.includes('forceOut')
  );
  const wrongFielders = room.players.filter(p => p.submission && !p.submission.correct);

  if (hasDPOptions && wrongFielders.length > 0) {
    return '双杀失败，仅一出局';
  }
  if (result.runsScored && result.runsScored > 0) {
    return `得分${result.runsScored}分`;
  }
  return '防守不完整';
}

// ─── Build Optimal Path (renamed from buildAnimation) ─────────────────────────

function buildOptimalPath(room: Room): AnimationStep[] {
  if (!room.scenario) return [];

  const event = room.scenario.event;
  const result = room.scenario.result;
  const steps: AnimationStep[] = [];

  if (event.type === 'groundBall') {
    const fielderDir = event.direction === 'left' ? 'thirdBase' : event.direction === 'right' ? 'firstBase' : 'secondBase';
    steps.push({ label: `地滚球→${fielderDir}`, fromBase: 'home', toBase: fielderDir, result: '防守接球' });

    if (result.correctOptions.includes('fieldAndThrowToSecond_forceOut') || result.correctOptions.includes('relayToFirst_doublePlay')) {
      steps.push({ label: '传二垒封杀', fromBase: fielderDir, toBase: 'second', result: '跑者出局' });
      if (result.correctOptions.includes('relayToFirst_doublePlay')) {
        steps.push({ label: '转传一垒双杀', fromBase: 'second', toBase: 'first', result: '打者出局' });
      }
    } else if (result.correctOptions.includes('fieldAndThrowToHome_forceOut')) {
      steps.push({ label: '传本垒封杀', fromBase: fielderDir, toBase: 'home', result: '阻止得分' });
      if (result.correctOptions.includes('relayToFirst_doublePlay_attempt')) {
        steps.push({ label: '传一垒尝试双杀', fromBase: 'home', toBase: 'first', result: '打者出局' });
      }
    } else {
      steps.push({ label: '传一垒封杀打者', fromBase: fielderDir, toBase: 'first', result: '打者出局' });
    }
  } else if (event.type === 'flyBall') {
    const outfieldPos = event.direction === 'left' ? 'leftField' : event.direction === 'right' ? 'rightField' : 'centerField';
    steps.push({ label: `高飞球→${outfieldPos}`, fromBase: 'home', toBase: outfieldPos, result: '接杀' });

    if (result.correctOptions.includes('runnerOnThirdTagsAndScores_sacrificeFly')) {
      steps.push({ label: '三垒跑者回垒起跑', fromBase: 'third', toBase: 'home', result: '得分！' });
    } else if (result.correctOptions.includes('runnerOnSecondTagsAndAdvances')) {
      steps.push({ label: '二垒跑者回垒起跑', fromBase: 'second', toBase: 'third', result: '进三垒' });
    }
  } else if (event.type === 'lineDrive') {
    steps.push({ label: '平飞球被接杀', fromBase: 'home', toBase: 'pitcher', result: '打者出局' });
    if (result.correctOptions.includes('tagRunnerOffBase_doublePlay_attempt')) {
      steps.push({ label: '触杀离垒跑者', fromBase: 'first', toBase: 'first', result: '双杀！' });
    }
  } else if (event.type === 'steal') {
    const target = event.targetBase === 'second' ? 'second' : event.targetBase === 'third' ? 'third' : 'home';
    steps.push({ label: `跑者起跑盗${target}`, fromBase: 'first', toBase: target, result: '盗垒尝试' });
    if (result.newState.outs > room.scenario.state.outs) {
      steps.push({ label: '捕手传垒触杀', fromBase: 'home', toBase: target, result: '出局' });
    } else {
      steps.push({ label: '盗垒成功', fromBase: 'first', toBase: target, result: '安全' });
    }
  } else if (event.type === 'walk') {
    steps.push({ label: '四坏球保送', fromBase: 'home', toBase: 'first', result: '打者上垒' });
  } else if (event.type === 'strikeout') {
    steps.push({ label: '三振出局', fromBase: 'home', toBase: 'home', result: '打者出局' });
  } else {
    steps.push({ label: result.description.substring(0, 20), fromBase: 'home', toBase: 'first', result: '局面结束' });
  }

  if (result.runsScored && result.runsScored > 0) {
    steps.push({ label: `得分${result.runsScored}`, fromBase: 'third', toBase: 'home', result: `${result.runsScored}分` });
  }

  return steps;
}

// ─── Build Actual Path ────────────────────────────────────────────────────────

function buildActualPath(room: Room): AnimationStep[] {
  if (!room.scenario) return [];

  const event = room.scenario.event;
  const result = room.scenario.result;

  // If all relevant players chose correctly, actual = optimal
  const allRelevantCorrect = room.players.every(p => {
    if (!p.submission) return true;
    const posOpts = p.position ? room.scenario!.perPositionOptions.get(p.position) : null;
    if (!posOpts || posOpts.isObserver) return true;
    return p.submission.correct;
  });

  if (allRelevantCorrect) return buildOptimalPath(room);

  const wrongPositions = new Map<string, string>();
  for (const player of room.players) {
    if (!player.position || !player.submission) continue;
    if (!player.submission.correct && player.submission.chosenOption !== 'timeout' && player.submission.chosenOption !== 'observer') {
      wrongPositions.set(player.position, player.submission.chosenOption);
    }
  }

  const steps: AnimationStep[] = [];

  if (event.type === 'groundBall') {
    const fielderDir = event.direction === 'left' ? 'thirdBase' : event.direction === 'right' ? 'firstBase' : 'secondBase';
    steps.push({ label: `地滚球→${fielderDir}`, fromBase: 'home', toBase: fielderDir, result: '防守接球' });

    if (result.correctOptions.includes('relayToFirst_doublePlay') || result.correctOptions.includes('fieldAndThrowToSecond_forceOut')) {
      const secondBasemanWrong = wrongPositions.has('secondBase') || wrongPositions.has('shortstop');
      if (secondBasemanWrong) {
        steps.push({ label: '传一垒封杀打者（未完成双杀）', fromBase: fielderDir, toBase: 'first', result: '仅一出局', isDeviation: true });
      } else {
        steps.push({ label: '传二垒封杀', fromBase: fielderDir, toBase: 'second', result: '跑者出局' });
        steps.push({ label: '转传一垒失败', fromBase: 'second', toBase: 'first', result: '打者安全', isDeviation: true });
      }
    } else if (result.correctOptions.includes('fieldAndThrowToHome_forceOut')) {
      const homePlayWrong = wrongPositions.has('thirdBase') || wrongPositions.has('pitcher') || wrongPositions.has('catcher');
      if (homePlayWrong) {
        steps.push({ label: '未传本垒——跑者得分！', fromBase: fielderDir, toBase: 'home', result: '得分!', isDeviation: true });
      } else {
        steps.push({ label: '传本垒封杀', fromBase: fielderDir, toBase: 'home', result: '阻止得分' });
      }
    } else {
      steps.push({ label: '防守失误', fromBase: fielderDir, toBase: 'first', result: '打者安全上垒', isDeviation: true });
    }
  } else if (event.type === 'flyBall') {
    const outfielderWrong = wrongPositions.has('leftField') || wrongPositions.has('centerField') || wrongPositions.has('rightField');

    if (outfielderWrong && !event.popUp) {
      const outfieldPos = event.direction === 'left' ? 'leftField' : event.direction === 'right' ? 'rightField' : 'centerField';
      steps.push({ label: `高飞球→${outfieldPos}（未接杀）`, fromBase: 'home', toBase: outfieldPos, result: '落地为安打', isDeviation: true });
    } else {
      // All outfielders correct or popup — actual = optimal for this part
      const optimalSteps = buildOptimalPath(room);
      // Use optimal path but mark any position-specific wrong as deviation
      for (const step of optimalSteps) {
        steps.push({ ...step });
      }
    }
  } else if (event.type === 'lineDrive') {
    steps.push({ label: '平飞球被接杀', fromBase: 'home', toBase: 'pitcher', result: '打者出局' });
    if (result.correctOptions.includes('tagRunnerOffBase_doublePlay_attempt') && wrongPositions.size > 0) {
      steps.push({ label: '触杀失败', fromBase: 'first', toBase: 'first', result: '跑者安全', isDeviation: true });
    }
  } else if (event.type === 'steal') {
    const target = event.targetBase === 'second' ? 'second' : event.targetBase === 'third' ? 'third' : 'home';
    steps.push({ label: `跑者起跑盗${target}`, fromBase: 'first', toBase: target, result: '盗垒尝试' });
    if (wrongPositions.has('catcher')) {
      steps.push({ label: '捕手决策失误——盗垒成功', fromBase: 'home', toBase: target, result: '安全', isDeviation: true });
    } else {
      // Catcher correct — actual = optimal for steal
      const optimalStealSteps = buildOptimalPath(room).filter(s => s.fromBase !== 'first' || s.toBase !== target);
      for (const step of optimalStealSteps.slice(1)) { // skip first step (same)
        steps.push({ ...step });
      }
    }
  } else {
    steps.push({ label: '防守决策失误', fromBase: 'home', toBase: 'first', result: '局面不利', isDeviation: true });
  }

  if (result.runsScored && result.runsScored > 0) {
    steps.push({ label: `得分${result.runsScored}`, fromBase: 'third', toBase: 'home', result: `${result.runsScored}分`, isDeviation: true });
  }

  return steps;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export function resetScenario(code: string): { success: boolean; error?: string } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: '房间不存在' };

  room.phase = 'waiting';
  room.scenario = null;
  room.analysis = null;
  room.players.forEach(p => { p.submission = null; });

  notifySubscribers(code);
  return { success: true };
}

export function deleteRoom(code: string): boolean {
  rooms.delete(code);
  sseSubscribers.delete(code);
  return true;
}

// ─── SSE Subscription ─────────────────────────────────────────────────────────

export function subscribeToRoom(code: string, listener: SSEListener): () => void {
  if (!sseSubscribers.has(code)) {
    sseSubscribers.set(code, new Set());
  }
  sseSubscribers.get(code)!.add(listener);

  return () => {
    const subs = sseSubscribers.get(code);
    if (subs) {
      subs.delete(listener);
      if (subs.size === 0) sseSubscribers.delete(code);
    }
  };
}

// ─── Cleanup old rooms ────────────────────────────────────────────────────────

export function cleanupOldRooms(): number {
  const maxAge = 2 * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;

  rooms.forEach((room, code) => {
    if (now - room.createdAt > maxAge) {
      rooms.delete(code);
      sseSubscribers.delete(code);
      cleaned++;
    }
  });

  return cleaned;
}