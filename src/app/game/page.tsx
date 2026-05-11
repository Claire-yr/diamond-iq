'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createInitialState,
  generateNextBatterEvent,
  resolveHitBall,
  describeEvent,
  GameState,
  BatterEvent,
  ResolutionResult,
  DefensivePosition,
  POSITION_LABELS,
  OPTION_LABELS,
} from '@/lib/engine';
import {
  GameConfig,
  GameDecisionRecord,
  GameScoreboard,
  GameReport,
  PlayPositionOptions,
  createEmptyScoreboard,
  updateScoreboard,
  finalizeIncompleteInnings,
  isGameOver,
  isSideRetired,
  resolveWithWrongDecision,
  generatePlayPositionOptions,
  pickPlayerPosition,
  buildGameReport,
} from '@/lib/gameSim';
import { getDistractorLabel } from '@/util/optionDistractors';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// =============================================================================
// Types
// =============================================================================

type Phase = 'intro' | 'setup' | 'playing' | 'result' | 'halfEnd' | 'gameOver';

interface SavedGameState {
  config: GameConfig;
  gameState: GameState;
  scoreboard: GameScoreboard;
  decisions: GameDecisionRecord[];
}

const DECISION_TIME = 8;

// =============================================================================
// Diamond Diagram
// =============================================================================

function DiamondDiagram({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) {
  return (
    <div className="relative w-[200px] h-[200px] mx-auto my-2">
      <div className="absolute inset-[14px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45" style={{ borderRadius: '4px' }} />
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2">
        <div className="w-[28px] h-[28px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500 block text-center">本垒</span>
      </div>
      <div className="absolute right-[4px] top-1/2 -translate-y-1/2">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 ${bases.first ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.first && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 ml-0.5">一</span>
      </div>
      <div className="absolute top-[4px] left-1/2 -translate-x-1/2">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 ${bases.second ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.second && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 block text-center">二</span>
      </div>
      <div className="absolute left-[4px] top-1/2 -translate-y-1/2">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 ${bases.third ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.third && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 mr-0.5">三</span>
      </div>
    </div>
  );
}

// =============================================================================
// Timer Bar
// =============================================================================

function TimerBar({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const pct = Math.max(0, (timeLeft / totalTime) * 100);
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
      <div className={`h-full ${color} rounded-full transition-all duration-100`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// =============================================================================
// Out Indicator
// =============================================================================

function OutIndicator({ outs }: { outs: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      <span className="text-xs font-semibold text-gray-700">出局</span>
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${i < outs ? 'bg-red-500 border-red-600' : 'bg-white border-gray-300'}`} />
      ))}
    </div>
  );
}

// =============================================================================
// Scoreboard Grid
// =============================================================================

function ScoreboardGrid({ scoreboard, config, currentInning, currentTop }: {
  scoreboard: GameScoreboard;
  config: GameConfig;
  currentInning: number;
  currentTop: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-2 mb-2 overflow-x-auto">
      <table className="w-full text-xs text-center">
        <thead>
          <tr>
            <th className="text-left font-semibold w-12"></th>
            {scoreboard.innings.map((_, i) => (
              <th key={i} className={`font-semibold ${i + 1 === currentInning ? 'text-yellow-600' : 'text-gray-500'}`}>{i + 1}</th>
            ))}
            <th className="font-semibold text-gray-700">R</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-left font-semibold text-blue-600">{config.awayTeam}</td>
            {scoreboard.innings.map((inn, i) => (
              <td key={i} className={i + 1 === currentInning && currentTop ? 'bg-yellow-50 font-bold' : ''}>
                {inn.top === null ? '-' : inn.top}
              </td>
            ))}
            <td className="font-bold text-blue-600">{scoreboard.awayTotal}</td>
          </tr>
          <tr>
            <td className="text-left font-semibold text-red-600">{config.homeTeam}</td>
            {scoreboard.innings.map((inn, i) => (
              <td key={i} className={i + 1 === currentInning && !currentTop ? 'bg-yellow-50 font-bold' : ''}>
                {inn.bottom === null ? '-' : inn.bottom}
              </td>
            ))}
            <td className="font-bold text-red-600">{scoreboard.homeTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Play Log (compact)
// =============================================================================

function PlayLog({ decisions, maxItems }: { decisions: GameDecisionRecord[]; maxItems?: number }) {
  const shown = decisions.slice(-(maxItems || 8));
  if (shown.length === 0) return null;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 max-h-[120px] overflow-y-auto">
      <div className="text-xs font-semibold text-gray-600 mb-1">决策记录</div>
      <div className="space-y-0.5">
        {shown.map((d, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${d.correct ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className="text-gray-500">{d.inning}局{d.topInning ? '上' : '下'}</span>
            <span className="text-gray-600 font-medium">{POSITION_LABELS[d.position]}</span>
            <span className={d.correct ? 'text-green-600' : 'text-red-500'}>
              {d.correct ? '正确' : '错误'}
            </span>
            {d.runsScored > 0 && <span className="text-orange-600">{d.runsScored}分</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Defense Report
// =============================================================================

function DefenseReport({ report }: { report: GameReport }) {
  return (
    <div className="space-y-3">
      {/* Grade */}
      <div className="bg-white rounded-lg shadow p-4 text-center">
        <div className="text-4xl font-bold mb-1">{report.grade}</div>
        <div className="text-sm text-gray-600">{report.gradeMessage}</div>
        <div className="mt-2 flex gap-2 justify-center text-sm">
          <div className="bg-gray-100 rounded px-2 py-1">决策 <span className="font-bold">{report.totalDecisions}</span></div>
          <div className="bg-green-100 rounded px-2 py-1">正确 <span className="font-bold text-green-700">{report.totalCorrect}</span></div>
          <div className="bg-blue-100 rounded px-2 py-1">正确率 <span className="font-bold text-blue-700">{report.accuracy}%</span></div>
        </div>
      </div>

      {/* Position breakdown */}
      {report.positionBreakdown.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">位置表现</div>
          <div className="space-y-1">
            {report.positionBreakdown.map(pb => (
              <div key={pb.position} className="flex items-center gap-2 text-sm">
                <span className="font-medium w-16">{pb.label}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full" style={{ width: `${pb.accuracy}%` }} />
                </div>
                <span className="text-xs text-gray-600">{pb.correct}/{pb.decisions} ({pb.accuracy}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Worst mistakes */}
      {report.worstMistakes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-red-700 mb-2">关键失误</div>
          <div className="space-y-2">
            {report.worstMistakes.map((m, i) => (
              <div key={i} className="text-sm">
                <div className="font-medium text-red-600">
                  {m.inning}局{m.topInning ? '上' : '下'} · {POSITION_LABELS[m.position]}
                </div>
                <div className="text-gray-600">{m.consequence}</div>
                {m.runsScored > 0 && <div className="text-red-500">导致失分: {m.runsScored}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runs analysis */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">防守效果</div>
        <div className="flex gap-4 text-sm">
          <div><span className="text-green-600">成功阻止得分</span> <span className="font-bold">{report.runsPrevented}次</span></div>
          <div><span className="text-red-600">失误导致失分</span> <span className="font-bold">{report.runsAllowedDueToErrors}分</span></div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Game Page
// =============================================================================

export default function GamePage() {
  // ─── State ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('intro');
  const [config, setConfig] = useState<GameConfig>({
    totalInnings: 9,
    homeTeam: '主队',
    awayTeam: '客队',
    playerSide: 'home',
  });
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [scoreboard, setScoreboard] = useState<GameScoreboard>(createEmptyScoreboard(9));
  const [decisions, setDecisions] = useState<GameDecisionRecord[]>([]);

  // Current play state
  const [currentEvent, setCurrentEvent] = useState<BatterEvent | null>(null);
  const [currentResult, setCurrentResult] = useState<ResolutionResult | null>(null);
  const [positionOptions, setPositionOptions] = useState<PlayPositionOptions[]>([]);
  const [playerPosition, setPlayerPosition] = useState<PlayPositionOptions | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(DECISION_TIME);
  const [playConsequence, setPlayConsequence] = useState<string>('');
  const [playRuns, setPlayRuns] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false); // no decision needed (walk/strikeout)

  // Setup state
  const [homeTeamName, setHomeTeamName] = useState('主队');
  const [awayTeamName, setAwayTeamName] = useState('客队');
  const [playerSideChoice, setPlayerSideChoice] = useState<'home' | 'away'>('home');

  // Refs for timer/callback stability
  const phaseRef = useRef<Phase>('intro');
  const gameStateRef = useRef<GameState>(createInitialState());
  const scoreboardRef = useRef<GameScoreboard>(createEmptyScoreboard(9));
  const decisionsRef = useRef<GameDecisionRecord[]>([]);
  const timeLeftRef = useRef(DECISION_TIME);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentEventRef = useRef<BatterEvent | null>(null);
  const currentResultRef = useRef<ResolutionResult | null>(null);
  const playerPositionRef = useRef<PlayPositionOptions | null>(null);
  const selectedRef = useRef<string | null>(null);
  const configRef = useRef<GameConfig>(config);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { scoreboardRef.current = scoreboard; }, [scoreboard]);
  useEffect(() => { decisionsRef.current = decisions; }, [decisions]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { currentEventRef.current = currentEvent; }, [currentEvent]);
  useEffect(() => { currentResultRef.current = currentResult; }, [currentResult]);
  useEffect(() => { playerPositionRef.current = playerPosition; }, [playerPosition]);
  useEffect(() => { selectedRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { configRef.current = config; }, [config]);

  // localStorage for saved game state
  const [savedGame, setSavedGame, isLoaded] = useLocalStorage<SavedGameState | null>('diamond-iq-game', null);

  // ─── Generate next at-bat ──────────────────────────────────────────
  const generateNextPlay = useCallback((state: GameState) => {
    const event = generateNextBatterEvent(state);
    const result = resolveHitBall(state, event);

    setCurrentEvent(event);
    setCurrentResult(result);
    currentEventRef.current = event;
    currentResultRef.current = result;

    // Check if this play requires a defensive decision
    const hasDecision = result.correctOptions.length > 0 && !result.correctOptions.includes('invalidScenario');

    if (hasDecision) {
      const posOpts = generatePlayPositionOptions(result.correctOptions);
      setPositionOptions(posOpts);
      const assigned = pickPlayerPosition(posOpts);
      setPlayerPosition(assigned);
      playerPositionRef.current = assigned;
      setSelectedOption(null);
      selectedRef.current = null;
      setTimeLeft(DECISION_TIME);
      timeLeftRef.current = DECISION_TIME;
      setIsAutoPlay(false);
      setPhase('playing');
      phaseRef.current = 'playing';
    } else {
      // No decision needed (walk, strikeout, etc.) — auto-advance
      setIsAutoPlay(true);
      setPlayerPosition(null);
      playerPositionRef.current = null;
      setPhase('playing');
      phaseRef.current = 'playing';
      // Auto-apply after brief display
      setTimeout(() => {
        applyAutoPlay(state, event, result);
      }, 1200);
    }
  }, []);

  // ─── Apply auto-play (no decision needed) ──────────────────────────
  const applyAutoPlay = useCallback((state: GameState, event: BatterEvent, result: ResolutionResult) => {
    const runs = result.runsScored || 0;
    const newSB = updateScoreboard(scoreboardRef.current, state, runs);
    const newState = result.newState;

    setGameState(newState);
    gameStateRef.current = newState;
    setScoreboard(newSB);
    scoreboardRef.current = newSB;
    setPlayRuns(runs);
    setPlayConsequence(result.description);

    if (isGameOver(newState, configRef.current)) {
      const finalSB = finalizeIncompleteInnings(newSB);
      setScoreboard(finalSB);
      scoreboardRef.current = finalSB;
      setPhase('gameOver');
      phaseRef.current = 'gameOver';
    } else if (isSideRetired(state, newState)) {
      setPhase('halfEnd');
      phaseRef.current = 'halfEnd';
    } else {
      setTimeout(() => generateNextPlay(newState), 800);
    }
  }, [generateNextPlay]);

  // ─── Submit answer ──────────────────────────────────────────────────
  const submitAnswer = useCallback((option: string) => {
    if (phaseRef.current !== 'playing') return;
    if (!currentResultRef.current || !currentEventRef.current || !playerPositionRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const state = gameStateRef.current;
    const event = currentEventRef.current;
    const result = currentResultRef.current;
    const posInfo = playerPositionRef.current;

    const isCorrect = option === posInfo.correctAnswer;
    setSelectedOption(option);
    selectedRef.current = option;

    // Determine final result based on correctness
    let finalResult: ResolutionResult;
    let consequence: string;

    if (isCorrect) {
      finalResult = result;
      consequence = result.description;
    } else {
      finalResult = resolveWithWrongDecision(state, event, result, option, posInfo.position);
      consequence = finalResult.description;
    }

    const runs = finalResult.runsScored || 0;
    const newState = finalResult.newState;
    const newSB = updateScoreboard(scoreboardRef.current, state, runs);

    // Record decision
    const record: GameDecisionRecord = {
      inning: state.inning,
      topInning: state.topInning,
      outsBefore: state.outs,
      basesBefore: { ...state.bases },
      event,
      eventDescription: describeEvent(event),
      position: posInfo.position,
      chosenOption: option,
      correctAnswer: posInfo.correctAnswer,
      correct: isCorrect,
      reactionTime: Math.round((DECISION_TIME - timeLeftRef.current) * 1000),
      consequence,
      runsScored: runs,
    };

    const newDecisions = [...decisionsRef.current, record];

    setGameState(newState);
    gameStateRef.current = newState;
    setScoreboard(newSB);
    scoreboardRef.current = newSB;
    setDecisions(newDecisions);
    decisionsRef.current = newDecisions;
    setPlayRuns(runs);
    setPlayConsequence(consequence);

    // Save to localStorage
    setSavedGame({
      config: configRef.current,
      gameState: newState,
      scoreboard: newSB,
      decisions: newDecisions,
    });

    setPhase('result');
    phaseRef.current = 'result';

    // Check game state after brief result display
    setTimeout(() => {
      if (isGameOver(newState, configRef.current)) {
        const finalSB = finalizeIncompleteInnings(scoreboardRef.current);
        setScoreboard(finalSB);
        scoreboardRef.current = finalSB;
        setPhase('gameOver');
        phaseRef.current = 'gameOver';
      } else if (isSideRetired(state, newState)) {
        setPhase('halfEnd');
        phaseRef.current = 'halfEnd';
      } else {
        generateNextPlay(newState);
      }
    }, 1500);
  }, [generateNextPlay, setSavedGame]);

  // ─── Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || selectedOption !== null || isAutoPlay) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 0.1;
        timeLeftRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          submitAnswer('timeout');
          return 0;
        }
        return next;
      });
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, selectedOption, isAutoPlay, submitAnswer]);

  // ─── Start new game ──────────────────────────────────────────────────
  const startNewGame = useCallback(() => {
    const newConfig: GameConfig = {
      totalInnings: 9,
      homeTeam: homeTeamName || '主队',
      awayTeam: awayTeamName || '客队',
      playerSide: playerSideChoice,
    };
    setConfig(newConfig);
    configRef.current = newConfig;

    const initialState = createInitialState();
    setGameState(initialState);
    gameStateRef.current = initialState;
    setScoreboard(createEmptyScoreboard(9));
    scoreboardRef.current = createEmptyScoreboard(9);
    setDecisions([]);
    decisionsRef.current = [];
    setSelectedOption(null);
    selectedRef.current = null;
    setPlayRuns(0);
    setPlayConsequence('');
    setIsAutoPlay(false);

    generateNextPlay(initialState);
  }, [homeTeamName, awayTeamName, playerSideChoice, generateNextPlay]);

  // ─── Continue after half-inning break ──────────────────────────────
  const continueAfterHalfEnd = useCallback(() => {
    generateNextPlay(gameStateRef.current);
  }, [generateNextPlay]);

  // ─── Intro Screen ────────────────────────────────────────────────
  if (phase === 'intro' || !isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">完整比赛模拟</h1>
        <p className="text-center text-gray-600 mb-6">
          模拟一场9局完整棒球比赛。<br />
          你作为防守方教练，在每次球被打进场内时<br />
          为关键守备位置做出决策。
        </p>

        <div className="bg-white rounded-lg shadow p-6 mb-4 text-center">
          <div className="text-lg font-semibold mb-3">规则</div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>1. 选择你执教防守的一方（主队或客队）</p>
            <p>2. 每次击球事件基于真实概率分布生成</p>
            <p>3. 球在场内时，你为被分配的防守位置选择决策</p>
            <p>4. 正确决策执行最优防守；错误决策导致更差结果</p>
            <p>5. {DECISION_TIME}秒限时，超时视为错误</p>
            <p>6. 9局结束或走投(walk-off)后生成防守报告</p>
          </div>
        </div>

        {/* Resume saved game */}
        {savedGame && savedGame.decisions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-center">
            <div className="text-sm font-semibold text-blue-700 mb-2">发现未完成的比赛</div>
            <div className="text-xs text-blue-600 mb-2">
              {savedGame.config.homeTeam} vs {savedGame.config.awayTeam} ·
              {savedGame.gameState.inning}局 ·
              {savedGame.gameState.score.home}:{savedGame.gameState.score.away}
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm" onClick={() => {
              setConfig(savedGame.config);
              configRef.current = savedGame.config;
              setGameState(savedGame.gameState);
              gameStateRef.current = savedGame.gameState;
              setScoreboard(savedGame.scoreboard);
              scoreboardRef.current = savedGame.scoreboard;
              setDecisions(savedGame.decisions);
              decisionsRef.current = savedGame.decisions;
              generateNextPlay(savedGame.gameState);
            }}>
              继续比赛
            </button>
          </div>
        )}

        <button
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-lg transition-colors"
          onClick={() => { setPhase('setup'); phaseRef.current = 'setup'; }}
        >
          设置比赛
        </button>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    );
  }

  // ─── Setup Screen ──────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-4">比赛设置</h1>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">主队名称</label>
            <input type="text" value={homeTeamName} onChange={e => setHomeTeamName(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
              placeholder="主队" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">客队名称</label>
            <input type="text" value={awayTeamName} onChange={e => setAwayTeamName(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
              placeholder="客队" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">你执教防守的一方</label>
            <div className="flex gap-3">
              <button className={`flex-1 py-3 rounded-lg font-semibold text-center transition-colors ${
                playerSideChoice === 'home' ? 'bg-red-100 border-2 border-red-500 text-red-700' : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-red-300'
              }`} onClick={() => setPlayerSideChoice('home')}>
                主队（守下半局）
              </button>
              <button className={`flex-1 py-3 rounded-lg font-semibold text-center transition-colors ${
                playerSideChoice === 'away' ? 'bg-blue-100 border-2 border-blue-500 text-blue-700' : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-blue-300'
              }`} onClick={() => setPlayerSideChoice('away')}>
                客队（守上半局）
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {playerSideChoice === 'home' ? '你防守时在下半局（客队击球时做决策）' : '你防守时在上半局（主队击球时做决策）'}
            </p>
          </div>
        </div>

        <button
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-lg transition-colors"
          onClick={startNewGame}
        >
          开始比赛!
        </button>

        <div className="mt-4 text-center">
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setPhase('intro'); phaseRef.current = 'intro'; }}>
            ← 返回
          </button>
        </div>
      </div>
    );
  }

  // ─── Half-End Screen ──────────────────────────────────────────────
  if (phase === 'halfEnd') {
    const isTop = gameState.topInning; // After side retired, topInning already flipped
    const halfLabel = isTop ? '下半局开始' : `${gameState.inning}局上半开始`;
    const defendingLabel = config.playerSide === 'home' ? '你是防守方（下半局）' : '你是防守方（上半局）';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto text-center">
        <h1 className="text-2xl font-bold mb-3">3出局 — 攻守交换!</h1>
        <ScoreboardGrid scoreboard={scoreboard} config={config} currentInning={gameState.inning} currentTop={gameState.topInning} />
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="text-lg font-semibold mb-1">{halfLabel}</div>
          <div className="text-sm text-gray-600">{defendingLabel}</div>
        </div>
        <button
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-lg"
          onClick={continueAfterHalfEnd}
        >
          继续
        </button>
      </div>
    );
  }

  // ─── Game Over Screen ─────────────────────────────────────────────
  if (phase === 'gameOver') {
    const finalSB = finalizeIncompleteInnings(scoreboard);
    const report = buildGameReport(decisions, finalSB, config);
    const winner = finalSB.homeTotal > finalSB.awayTotal ? config.homeTeam :
      finalSB.awayTotal > finalSB.homeTotal ? config.awayTeam : '平局';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">比赛结束!</h1>

        {/* Final score */}
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-6 text-center mb-4">
          <div className="text-3xl font-bold mb-1">
            {config.awayTeam} {finalSB.awayTotal} : {finalSB.homeTotal} {config.homeTeam}
          </div>
          <div className="text-sm text-amber-700">
            {winner === '平局' ? '平局!' : `${winner} 获胜!`}
          </div>
        </div>

        {/* Final scoreboard */}
        <ScoreboardGrid scoreboard={finalSB} config={config} currentInning={10} currentTop={true} />

        {/* Defense report */}
        <h2 className="text-lg font-semibold text-center mt-4 mb-2">防守决策报告</h2>
        <DefenseReport report={report} />

        <button
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-lg mt-4"
          onClick={() => {
            setSavedGame(null);
            setPhase('intro');
            phaseRef.current = 'intro';
          }}
        >
          再来一场
        </button>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    );
  }

  // ─── Playing / Result Screen ──────────────────────────────────────
  if (!currentEvent || !currentResult) return <div className="p-8 text-center">生成局面...</div>;

  const isPlayerDefending = config.playerSide === 'home' ? !gameState.topInning : gameState.topInning;
  const eventDesc = describeEvent(currentEvent);

  // Auto-play (walk, strikeout, etc.) — just showing the event briefly
  if (isAutoPlay && phase === 'playing') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <ScoreboardGrid scoreboard={scoreboard} config={config} currentInning={gameState.inning} currentTop={gameState.topInning} />
        <div className="flex justify-between items-center mb-2">
          <OutIndicator outs={gameState.outs} />
          <span className="text-sm text-gray-500">{gameState.inning}局{gameState.topInning ? '上' : '下'}</span>
        </div>
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3 text-center font-medium text-yellow-800">
          {eventDesc}
        </div>
        <div className="bg-gray-100 rounded-lg p-3 text-center text-sm text-gray-500">
          无需防守决策 — 自动推进
        </div>
        <DiamondDiagram bases={gameState.bases} />
      </div>
    );
  }

  // ─── Result display ──────────────────────────────────────────────
  if (phase === 'result' && selectedOption) {
    const isCorrect = selectedOption === (playerPosition?.correctAnswer);
    const isTimeout = selectedOption === 'timeout';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <ScoreboardGrid scoreboard={scoreboard} config={config} currentInning={gameState.inning} currentTop={gameState.topInning} />

        <div className={`text-center font-bold py-3 rounded-lg mb-2 ${
          isCorrect ? 'bg-green-100 text-green-700' : isTimeout ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
        }`}>
          {isCorrect ? '正确!' : isTimeout ? '超时!' : '错误!'}
          {!isCorrect && playerPosition && (
            <span> 正确答案: {OPTION_LABELS[playerPosition.correctAnswer] || getDistractorLabel(playerPosition.correctAnswer)}</span>
          )}
        </div>

        {playRuns > 0 && (
          <div className="bg-red-100 border border-red-300 rounded-lg p-2 text-center mb-2">
            <span className="text-red-700 font-bold text-sm">失分: {playRuns}分</span>
          </div>
        )}

        <div className="bg-gray-800 text-white rounded-lg p-3 mb-2">
          <div className="text-sm font-semibold mb-1">结果</div>
          <p className="text-sm leading-relaxed">{playConsequence}</p>
        </div>

        <PlayLog decisions={decisions} maxItems={5} />
      </div>
    );
  }

  // ─── Playing: Decision needed ──────────────────────────────────────
  if (!playerPosition) return <div className="p-8 text-center">分配位置...</div>;

  const runners = [];
  if (gameState.bases.first) runners.push('一垒');
  if (gameState.bases.second) runners.push('二垒');
  if (gameState.bases.third) runners.push('三垒');
  const runnersText = runners.length > 0 ? runners.join('+') + '有人' : '垒空';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      {/* Scoreboard */}
      <ScoreboardGrid scoreboard={scoreboard} config={config} currentInning={gameState.inning} currentTop={gameState.topInning} />

      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <OutIndicator outs={gameState.outs} />
        <div className="text-sm font-semibold">
          <span className="text-red-600">主 {gameState.score.home}</span>
          <span className="text-gray-400 mx-0.5">:</span>
          <span className="text-blue-600">客 {gameState.score.away}</span>
        </div>
      </div>

      {/* Timer */}
      <TimerBar timeLeft={timeLeft} totalTime={DECISION_TIME} />
      <div className="text-center text-xs text-gray-500 mb-1">{Math.max(0, Math.round(timeLeft))} 秒</div>

      {/* Position banner */}
      <div className="bg-amber-600 text-white text-center rounded-lg py-2 mb-2 font-semibold">
        你是{POSITION_LABELS[playerPosition.position]} — {runnersText} · {gameState.outs}出局
      </div>

      {/* Diamond */}
      <div className="bg-white rounded-lg shadow p-2 mb-2">
        <DiamondDiagram bases={gameState.bases} />
      </div>

      {/* Event */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-2 mb-2 text-center font-medium text-sm text-yellow-800">
        {eventDesc}
      </div>

      {/* Options */}
      <div className="space-y-1.5 mb-2">
        {playerPosition.allOptions.map((opt) => {
          const label = OPTION_LABELS[opt] || getDistractorLabel(opt);
          return (
            <button
              key={opt}
              className="w-full py-2.5 px-3 rounded-lg text-left text-sm transition-colors bg-white border-2 border-gray-300 hover:border-amber-400 hover:bg-amber-50 text-gray-800"
              onClick={() => submitAnswer(opt)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <PlayLog decisions={decisions} maxItems={3} />
    </div>
  );
}