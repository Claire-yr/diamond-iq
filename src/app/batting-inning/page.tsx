'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateInningScenario,
  createInitialState,
  GameState,
  DrillScenario,
  DefensivePosition,
  POSITION_LABELS,
  OPTION_LABELS,
} from '@/lib/engine';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// =============================================================================
// Types
// =============================================================================

interface InningRecord {
  correct: boolean;
  position: DefensivePosition;
  chosenOption: string;
  correctOption: string;
  eventDescription: string;
  reactionTime: number;
}

interface InningStats {
  totalInnings: number;
  totalDecisions: number;
  totalCorrect: number;
  bestInningScore: number;
  bestInningAccuracy: number;
  records: InningRecord[];
}

const INITIAL_STATS: InningStats = {
  totalInnings: 0,
  totalDecisions: 0,
  totalCorrect: 0,
  bestInningScore: 0,
  bestInningAccuracy: 0,
  records: [],
};

type Phase = 'intro' | 'playing' | 'result' | 'summary';

// =============================================================================
// Diamond Diagram
// =============================================================================

function DiamondDiagram({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) {
  return (
    <div className="relative w-[240px] h-[240px] mx-auto my-3">
      <div
        className="absolute inset-[16px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45"
        style={{ borderRadius: '4px' }}
      />
      <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2">
        <div className="w-[32px] h-[32px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500 block text-center mt-0.5">本垒</span>
      </div>
      <div className="absolute right-[6px] top-1/2 -translate-y-1/2">
        <div className={`w-[32px] h-[32px] border-2 rotate-45 transition-colors duration-300 ${bases.first ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.first && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full animate-pulse" />}
        <span className="text-xs text-gray-500 ml-1">一垒</span>
      </div>
      <div className="absolute top-[6px] left-1/2 -translate-x-1/2">
        <div className={`w-[32px] h-[32px] border-2 rotate-45 transition-colors duration-300 ${bases.second ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.second && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full animate-pulse" />}
        <span className="text-xs text-gray-500 block text-center mt-0.5">二垒</span>
      </div>
      <div className="absolute left-[6px] top-1/2 -translate-y-1/2">
        <div className={`w-[32px] h-[32px] border-2 rotate-45 transition-colors duration-300 ${bases.third ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.third && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full animate-pulse" />}
        <span className="text-xs text-gray-500 mr-1">三垒</span>
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
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
      <div className={`h-full ${color} rounded-full transition-all duration-100`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// =============================================================================
// Out Indicator
// =============================================================================

function OutIndicator({ outs }: { outs: number }) {
  return (
    <div className="flex gap-2 items-center">
      <span className="text-sm font-semibold text-gray-700">出局</span>
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${i < outs ? 'bg-red-500 border-red-600' : 'bg-white border-gray-300'}`} />
      ))}
    </div>
  );
}

// =============================================================================
// Play Log
// =============================================================================

function PlayLog({ records }: { records: InningRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-[180px] overflow-y-auto">
      <div className="text-xs font-semibold text-gray-600 mb-2">本局记录</div>
      <div className="space-y-1">
        {records.map((r, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span className={`w-2 h-2 rounded-full ${r.correct ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className="text-gray-600 font-medium">{POSITION_LABELS[r.position]}</span>
            <span className="text-gray-400">{r.eventDescription.substring(0, 12)}...</span>
            <span className={r.correct ? 'text-green-600' : 'text-red-500'}>
              {r.correct ? '正确' : '错误'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// History Stats
// =============================================================================

function HistoryStats({ stats }: { stats: InningStats }) {
  if (stats.totalInnings === 0) return null;
  const acc = stats.totalDecisions > 0 ? Math.round((stats.totalCorrect / stats.totalDecisions) * 100) : 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
      <div className="text-sm font-semibold text-gray-700 mb-2">历史统计</div>
      <div className="flex gap-3 text-sm flex-wrap">
        <div><span className="text-gray-500">完成半局</span> <span className="font-bold">{stats.totalInnings}</span></div>
        <div><span className="text-gray-500">总决策</span> <span className="font-bold">{stats.totalDecisions}</span></div>
        <div><span className="text-green-600">正确</span> <span className="font-bold">{stats.totalCorrect}</span></div>
        <div><span className="text-gray-500">正确率</span> <span className="font-bold">{acc}%</span></div>
        <div><span className="text-orange-600">最少失分</span> <span className="font-bold">{stats.bestInningScore}</span></div>
        <div><span className="text-indigo-600">最佳正确率</span> <span className="font-bold">{stats.bestInningAccuracy}%</span></div>
      </div>
    </div>
  );
}

// =============================================================================
// Helper: detect if 3 outs happened (side retired)
// =============================================================================

function isSideRetired(oldState: GameState, newState: GameState): boolean {
  // After incrementOuts reaches 3 outs, the engine resets outs to 0
  // and either switches from top to bottom, or advances the inning.
  // So: outs went from some number → 3 → reset to 0.
  // Detect by: new outs are 0 AND (topInning changed OR inning advanced)
  // AND old outs were < 3 (they were 0,1,2 before the play)
  if (newState.outs !== 0) return false; // still have outs, inning continues
  if (oldState.outs === 0 && newState.topInning === oldState.topInning && newState.inning === oldState.inning) {
    // This shouldn't normally happen (0 outs → 0 outs same half = no outs recorded)
    // Could happen on a walk or hit where no outs are made. Inning continues.
    return false;
  }
  // If outs went to 0 and half/inning changed, it means 3 outs were reached
  return newState.topInning !== oldState.topInning || newState.inning !== oldState.inning;
}

// =============================================================================
// Main Page
// =============================================================================

const DECISION_TIME = 8;

export default function BattingInningPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [scenario, setScenario] = useState<DrillScenario | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(DECISION_TIME);
  const [inningRecords, setInningRecords] = useState<InningRecord[]>([]);
  const [inningDecisions, setInningDecisions] = useState(0);
  const [inningCorrect, setInningCorrect] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [runsThisPlay, setRunsThisPlay] = useState<number>(0);

  // Refs to break circular dependencies and avoid stale closures
  const scenarioRef = useRef<DrillScenario | null>(null);
  const timeLeftRef = useRef(DECISION_TIME);
  const inningDecisionsRef = useRef(0);
  const inningCorrectRef = useRef(0);
  const totalRunsRef = useRef(0);
  const inningRecordsRef = useRef<InningRecord[]>([]);
  const phaseRef = useRef<Phase>('intro');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state
  useEffect(() => { scenarioRef.current = scenario; }, [scenario]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { inningDecisionsRef.current = inningDecisions; }, [inningDecisions]);
  useEffect(() => { inningCorrectRef.current = inningCorrect; }, [inningCorrect]);
  useEffect(() => { totalRunsRef.current = totalRuns; }, [totalRuns]);
  useEffect(() => { inningRecordsRef.current = inningRecords; }, [inningRecords]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // localStorage
  const [stats, setStats, isLoaded] = useLocalStorage<InningStats>('diamond-iq-inning-stats', INITIAL_STATS);

  // ─── Generate next play ──────────────────────────────────────────────
  const generateNextPlay = useCallback((state: GameState) => {
    const s = generateInningScenario(state);
    setScenario(s);
    scenarioRef.current = s;
    setSelected(null);
    setTimeLeft(DECISION_TIME);
    timeLeftRef.current = DECISION_TIME;
    setRunsThisPlay(0);
  }, []);

  // ─── Apply engine result and advance ──────────────────────────────────
  const applyEngineResult = useCallback((s: DrillScenario) => {
    const oldState = s.state;
    const newState = s.result.newState;
    const runs = s.result.runsScored || 0;

    setTotalRuns(prev => prev + runs);
    totalRunsRef.current += runs;
    setRunsThisPlay(runs);
    setGameState(newState);

    if (isSideRetired(oldState, newState)) {
      // 3 outs reached — side retired, show summary
      setTimeout(() => {
        setPhase('summary');
        phaseRef.current = 'summary';
        // Save to localStorage
        saveInningToStorage();
      }, 1500);
    } else {
      // Continue inning — generate next play after brief delay
      setTimeout(() => {
        generateNextPlay(newState);
      }, 1500);
    }
  }, [generateNextPlay]);

  // ─── Save inning to localStorage ────────────────────────────────────
  const saveInningToStorage = useCallback(() => {
    if (!isLoaded) return;
    const d = inningDecisionsRef.current;
    const c = inningCorrectRef.current;
    const r = totalRunsRef.current;
    const recs = inningRecordsRef.current;
    const acc = d > 0 ? Math.round((c / d) * 100) : 0;
    setStats(prev => ({
      totalInnings: prev.totalInnings + 1,
      totalDecisions: prev.totalDecisions + d,
      totalCorrect: prev.totalCorrect + c,
      bestInningScore: Math.max(prev.bestInningScore, r),
      bestInningAccuracy: Math.max(prev.bestInningAccuracy, acc),
      records: [...prev.records.slice(-199), ...recs],
    }));
  }, [isLoaded, setStats]);

  // ─── Submit answer (user choice or timeout) ──────────────────────────
  const submitAnswer = useCallback((option: string) => {
    if (phaseRef.current !== 'playing') return;
    const s = scenarioRef.current;
    if (!s) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = option === s.correctAnswer;

    setSelected(option);
    setPhase('result');
    phaseRef.current = 'result';
    setInningDecisions(prev => prev + 1);
    inningDecisionsRef.current += 1;
    if (isCorrect) {
      setInningCorrect(prev => prev + 1);
      inningCorrectRef.current += 1;
    }

    const newRecord: InningRecord = {
      correct: isCorrect,
      position: s.assignedPosition,
      chosenOption: option,
      correctOption: s.correctAnswer,
      eventDescription: s.eventDescription,
      reactionTime: Math.round((DECISION_TIME - timeLeftRef.current) * 1000),
    };
    setInningRecords(prev => [...prev, newRecord]);
    inningRecordsRef.current = [...inningRecordsRef.current, newRecord];

    // Apply engine result to advance the inning
    applyEngineResult(s);
  }, [applyEngineResult]);

  // ─── Timer countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || selected !== null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 0.1;
        timeLeftRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          // Timeout — submit as 'timeout'
          submitAnswer('timeout');
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, selected, submitAnswer]);

  // ─── Start new inning ────────────────────────────────────────────────
  const startInning = useCallback(() => {
    const initialState = createInitialState();
    setGameState(initialState);
    setInningRecords([]);
    inningRecordsRef.current = [];
    setInningDecisions(0);
    inningDecisionsRef.current = 0;
    setInningCorrect(0);
    inningCorrectRef.current = 0;
    setTotalRuns(0);
    totalRunsRef.current = 0;
    setRunsThisPlay(0);
    generateNextPlay(initialState);
    setPhase('playing');
    phaseRef.current = 'playing';
  }, [generateNextPlay]);

  // ─── Intro Screen ───────────────────────────────────────────────────
  if (phase === 'intro' || !isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">半局模拟</h1>
        <p className="text-center text-gray-600 mb-6">
          模拟一个完整半局的防守决策流程。<br />
          从无人出局、无人上垒开始，连续击球直到3出局。<br />
          每次击球你作为防守方教练为关键位置做选择。
        </p>

        <div className="bg-white rounded-lg shadow p-6 mb-4 text-center">
          <div className="text-lg font-semibold mb-3">规则</div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>1. 系统自动生成连续击球事件（基于真实概率分布）</p>
            <p>2. 每次你被分配到一个防守位置，选择最佳决策</p>
            <p>3. {DECISION_TIME}秒限时，超时视为错误</p>
            <p>4. 无论你的选择是否正确，局面按引擎最优方案推进</p>
            <p>5. 3出局后半局结束，记录失分和正确率</p>
          </div>
        </div>

        <button
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-lg transition-colors"
          onClick={startInning}
        >
          开始半局
        </button>

        <HistoryStats stats={stats} />
      </div>
    );
  }

  // ─── Summary Screen ──────────────────────────────────────────────────
  if (phase === 'summary') {
    const acc = inningDecisions > 0 ? Math.round((inningCorrect / inningDecisions) * 100) : 0;
    const grade = acc >= 90 ? 'A+' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : acc >= 50 ? 'D' : 'F';
    const gradeMsg = acc >= 90 ? '防守大师! 几乎完美的判断。' :
      acc >= 70 ? '不错的防守，继续保持！' :
      acc >= 50 ? '还需练习，多关注强迫进垒和双杀机会。' :
      '防守漏洞较大，建议先从专项位置训练开始。';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">半局结束!</h1>

        <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-6 text-center mb-4">
          <div className="text-4xl font-bold text-emerald-700 mb-1">{totalRuns} 分</div>
          <div className="text-sm text-emerald-600">防守方失分</div>
          <div className="mt-3 flex gap-3 justify-center text-sm">
            <div className="bg-white rounded px-3 py-1">
              <span className="text-gray-500">决策</span> <span className="font-bold">{inningDecisions}</span>
            </div>
            <div className="bg-white rounded px-3 py-1">
              <span className="text-green-600">正确</span> <span className="font-bold">{inningCorrect}</span>
            </div>
            <div className="bg-white rounded px-3 py-1">
              <span className="text-gray-500">正确率</span> <span className="font-bold">{acc}%</span>
            </div>
          </div>
        </div>

        <PlayLog records={inningRecords} />

        <div className="bg-white rounded-lg shadow p-4 mt-4 text-center">
          <div className="text-3xl font-bold mb-1">{grade}</div>
          <div className="text-sm text-gray-600">{gradeMsg}</div>
        </div>

        <button
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-lg transition-colors mt-4"
          onClick={startInning}
        >
          再来一局
        </button>

        <HistoryStats stats={stats} />
      </div>
    );
  }

  // ─── Playing / Result Screen ────────────────────────────────────────────
  if (!scenario) return <div className="p-8 text-center">生成局面...</div>;

  const { state: currentState, result, assignedPosition, positionLabel, correctAnswer, allOptions, eventDescription } = scenario;
  const isCorrect = selected === correctAnswer;
  const isTimeout = selected === 'timeout';
  const showingResult = selected !== null;

  const runners = [];
  if (currentState.bases.first) runners.push('一垒');
  if (currentState.bases.second) runners.push('二垒');
  if (currentState.bases.third) runners.push('三垒');
  const runnersText = runners.length > 0 ? runners.join('+') + '有人' : '垒空';

  // Show current game state (updated after engine result applied)
  // During result phase, show the NEW state (after play resolved)
  // During playing phase, show the scenario's current state (before resolution)
  const displayState = showingResult ? gameState : currentState;

  const displayOuts = showingResult ? gameState.outs : currentState.outs;
  const displayRunners = showingResult ? gameState.bases : currentState.bases;
  const displayRunnersArr = [];
  if (displayRunners.first) displayRunnersArr.push('一垒');
  if (displayRunners.second) displayRunnersArr.push('二垒');
  if (displayRunners.third) displayRunnersArr.push('三垒');
  const displayRunnersText = displayRunnersArr.length > 0 ? displayRunnersArr.join('+') + '有人' : '垒空';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-center mb-1">半局模拟 — 防守决策</h1>

      {/* Score + Outs */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <OutIndicator outs={displayOuts} />
          <span className="text-sm text-gray-500">{displayState.inning}局{displayState.topInning ? '上' : '下'}</span>
        </div>
        <div className="text-sm font-semibold">
          <span className="text-blue-600">主 {displayState.score.home}</span>
          <span className="text-gray-400 mx-1">:</span>
          <span className="text-red-600">客 {displayState.score.away}</span>
        </div>
      </div>

      {/* Inning stats */}
      <div className="flex gap-2 justify-center text-xs mb-3">
        <div className="bg-gray-100 rounded px-2 py-1">决策 <span className="font-bold">{inningDecisions}</span></div>
        <div className="bg-green-100 rounded px-2 py-1">正确 <span className="font-bold text-green-700">{inningCorrect}</span></div>
        <div className="bg-orange-100 rounded px-2 py-1">失分 <span className="font-bold text-orange-700">{totalRuns}</span></div>
      </div>

      {/* Timer */}
      {!showingResult && <TimerBar timeLeft={timeLeft} totalTime={DECISION_TIME} />}
      {!showingResult && (
        <div className="text-center text-xs text-gray-500 mb-2">{Math.max(0, Math.round(timeLeft))} 秒</div>
      )}

      {/* Position role */}
      <div className="bg-emerald-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
        你是{positionLabel}（{assignedPosition}）— {displayRunnersText} · {currentState.outs}出局
      </div>

      {/* Diamond */}
      <div className="bg-white rounded-lg shadow p-3 mb-3">
        <DiamondDiagram bases={displayRunners} />
      </div>

      {/* Event */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3 text-center font-medium text-yellow-800">
        {eventDescription}
      </div>

      {/* Choice buttons OR result */}
      {!showingResult ? (
        <div className="space-y-2 mb-3">
          {allOptions.map((option) => {
            const label = OPTION_LABELS[option] || option;
            return (
              <button
                key={option}
                className="w-full py-3 px-4 rounded-lg text-left transition-colors bg-white border-2 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 text-gray-800"
                onClick={() => submitAnswer(option)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 mb-3">
          <div className={`text-center font-bold py-3 rounded-lg ${
            isCorrect ? 'bg-green-100 text-green-700' : isTimeout ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
          }`}>
            {isCorrect ? '正确!' : isTimeout ? '超时!' : '错误!'}
            — 正确答案：{OPTION_LABELS[correctAnswer] || correctAnswer}
          </div>

          {runsThisPlay > 0 && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-center">
              <span className="text-red-700 font-bold">防守失分：{runsThisPlay}分!</span>
            </div>
          )}

          <div className="bg-gray-800 text-white rounded-lg p-3">
            <div className="text-sm font-semibold mb-1">局面推进</div>
            <p className="text-sm leading-relaxed">{result.description}</p>
          </div>

          <PlayLog records={inningRecords} />
        </div>
      )}

      <div className="mt-4 text-center">
        <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
      </div>
    </div>
  );
}