'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getRandomScenario,
  resolveHitBall,
  OPTION_LABELS,
  DrillScenario,
  POSITION_LABELS,
  correctOptionsByPosition,
} from '@/lib/engine';
import {
  getScenariosByCategory,
  ScenarioCategory,
  CATEGORY_LABELS,
  getCategoryCount,
  Scenario,
} from '@/lib/scenarioBank';
import { generateDistractors, getDistractorLabel } from '@/util/optionDistractors';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// =============================================================================
// Types
// =============================================================================

interface DrillRecord {
  correct: boolean;
  position: string;
  chosenOption: string;
  correctOption: string;
  timestamp: number;
}

interface SessionSummary {
  date: string; // YYYY-MM-DD
  questions: number;
  correct: number;
  wrong: number;
  accuracy: number; // percentage
}

interface DrillStats {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  maxStreak: number;
  records: DrillRecord[];
  todayQuestions: number;
  todayCorrect: number;
  todayDate: string; // YYYY-MM-DD
  lastSessions: SessionSummary[];
}

const INITIAL_STATS: DrillStats = {
  totalQuestions: 0,
  correctCount: 0,
  wrongCount: 0,
  maxStreak: 0,
  records: [],
  todayQuestions: 0,
  todayCorrect: 0,
  todayDate: '',
  lastSessions: [],
};

type Phase = 'menu' | 'playing' | 'result';

// =============================================================================
// Diamond Diagram
// =============================================================================

function DiamondDiagram({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) {
  return (
    <div className="relative w-[280px] h-[280px] mx-auto my-4">
      <div className="absolute inset-[20px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45" style={{ borderRadius: '4px' }} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-[40px] h-[40px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500 mt-1">本垒</span>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[36px] h-[36px] border-2 ${bases.first ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.first && <div className="absolute w-[14px] h-[14px] bg-red-500 rounded-full -translate-x-[2px] -translate-y-[2px]" />}
        <span className="text-xs text-gray-500 mt-1 ml-2">一垒</span>
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className={`w-[36px] h-[36px] border-2 ${bases.second ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.second && <div className="absolute w-[14px] h-[14px] bg-red-500 rounded-full translate-x-[4px] translate-y-[4px]" />}
        <span className="text-xs text-gray-500 mt-1">二垒</span>
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[36px] h-[36px] border-2 ${bases.third ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.third && <div className="absolute w-[14px] h-[14px] bg-red-500 rounded-full -translate-x-[2px] translate-y-[2px]" />}
        <span className="text-xs text-gray-500 mt-1 mr-2">三垒</span>
      </div>
    </div>
  );
}

// =============================================================================
// Timer & Score
// =============================================================================

function TimerBar({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const percent = (timeLeft / totalTime) * 100;
  const color = percent > 50 ? 'bg-green-500' : percent > 20 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
      <div className={`h-full ${color} rounded-full transition-all duration-100`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function ScoreBoard({ total, correct, streak }: { total: number; correct: number; streak: number }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex gap-3 justify-center text-sm mb-4">
      <div className="bg-gray-100 rounded-lg px-3 py-1">回合 <span className="font-bold">{total}</span></div>
      <div className="bg-green-100 rounded-lg px-3 py-1">正确 <span className="font-bold">{correct}</span></div>
      <div className="bg-gray-100 rounded-lg px-3 py-1">正确率 <span className="font-bold">{pct}%</span></div>
      <div className="bg-orange-100 rounded-lg px-3 py-1">连续 <span className="font-bold">{streak}</span></div>
    </div>
  );
}

// =============================================================================
// Main Drill Page
// =============================================================================

const TOTAL_TIME = 5;

const EVENT_CATEGORIES: ScenarioCategory[] = [
  'groundBall', 'flyBall', 'lineDrive', 'steal', 'bunt',
];

const SITUATION_CATEGORIES: ScenarioCategory[] = [
  'doublePlay', 'forcePlay', 'preventRun', 'sacrificeFly', 'uncaughtStrike',
];

const BASE_CATEGORIES: ScenarioCategory[] = [
  'emptyBases', 'runnerOn1st', 'runnerOn2nd', 'runnerOn3rd',
  'multipleRunners', 'loadedBases',
];

export default function DrillPageInner() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [selectedCategories, setSelectedCategories] = useState<ScenarioCategory[]>([]);
  const [scenario, setScenario] = useState<DrillScenario | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessionStartTotal, setSessionStartTotal] = useState<number>(0); // totalQuestions at session start
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [stats, setStats, isLoaded] = useLocalStorage<DrillStats>('diamond-iq-drill-stats', INITIAL_STATS);

  // Category counts
  const [categoryCounts, setCategoryCounts] = useState<Record<ScenarioCategory, number> | null>(null);
  useEffect(() => {
    setCategoryCounts(getCategoryCount());
  }, []);

  // ─── Generate scenario from categories ──────────────────────────────
  const startRound = useCallback(() => {
    if (selectedCategories.length === 0) {
      const s = getRandomScenario();
      setScenario(s);
    } else {
      // Pick from scenario bank filtered by categories
      const pool: Scenario[] = [];
      for (const cat of selectedCategories) {
        pool.push(...getScenariosByCategory(cat));
      }
      const unique = Array.from(new Map(pool.map(s => [s.id, s])).values());

      if (unique.length === 0) {
        setScenario(getRandomScenario());
      } else {
        const chosen = unique[Math.floor(Math.random() * unique.length)];
        const result = resolveHitBall(chosen.state, chosen.event);
        const position = chosen.relevantPositions[Math.floor(Math.random() * chosen.relevantPositions.length)];

        const positionOptKeys = correctOptionsByPosition[position];
        const intersection = chosen.correctOptions.filter(opt => positionOptKeys.includes(opt));
        const correctAnswer = intersection.length > 0 ? intersection[0] : chosen.correctOptions[0];
        const distractors = generateDistractors(chosen.correctOptions, position);
        const allOptions = shuffleArr([correctAnswer, ...distractors]);

        setScenario({
          state: chosen.state,
          event: chosen.event,
          result,
          assignedPosition: position,
          positionLabel: POSITION_LABELS[position],
          correctAnswer,
          allOptions,
          eventDescription: chosen.eventDescription,
        });
      }
    }

    setSelected(null);
    setTimeLeft(TOTAL_TIME);
    setSessionStartTotal(total);
    setPhase('playing');
  }, [selectedCategories, total]);

  // ─── Save session summary when returning to menu ──────────────────
  const saveSessionAndGoMenu = useCallback(() => {
    if (total > 0 && isLoaded) {
      const sessionQuestions = total - sessionStartTotal;
      if (sessionQuestions > 0) {
        setStats(prev => {
          const sessCorrect = sessionQuestions > 0 ? Math.round((correct / total) * sessionQuestions) : 0;
          const sessWrong = sessionQuestions - sessCorrect;
          const sessAcc = sessionQuestions > 0 ? Math.round((sessCorrect / sessionQuestions) * 100) : 0;
          const newSession: SessionSummary = {
            date: new Date().toISOString().slice(0, 10),
            questions: sessionQuestions,
            correct: sessCorrect,
            wrong: sessWrong,
            accuracy: sessAcc,
          };
          return {
            ...prev,
            lastSessions: [...prev.lastSessions.slice(-19), newSession],
          };
        });
      }
    }
    setPhase('menu');
  }, [total, correct, sessionStartTotal, isLoaded, setStats]);

  function shuffleArr<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Timer
  useEffect(() => {
    if (phase !== 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(timerRef.current!);
          setSelected('timeout');
          setPhase('result');
          setTotal(t => t + 1);
          setStreak(0);
          if (scenario && isLoaded) {
            setStats(prev => {
              const today = new Date().toISOString().slice(0, 10);
              const isToday = prev.todayDate === today;
              return {
                ...prev,
                totalQuestions: prev.totalQuestions + 1,
                correctCount: prev.correctCount,
                wrongCount: prev.wrongCount + 1,
                maxStreak: Math.max(prev.maxStreak, maxStreak),
                records: [...prev.records.slice(-99), {
                  correct: false, position: scenario.assignedPosition,
                  chosenOption: 'timeout', correctOption: scenario.correctAnswer, timestamp: Date.now(),
                }],
                todayQuestions: isToday ? prev.todayQuestions + 1 : 1,
                todayCorrect: isToday ? prev.todayCorrect : 0,
                todayDate: today,
              };
            });
          }
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, scenario, isLoaded, maxStreak, setStats]);

  // Handle choice
  const handleChoice = useCallback((option: string) => {
    if (phase !== 'playing' || selected !== null) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrectChoice = option === scenario!.correctAnswer;
    setSelected(option);
    setPhase('result');
    setTotal(t => t + 1);

    if (isCorrectChoice) {
      setCorrect(c => c + 1);
      setStreak(s => { const ns = s + 1; setMaxStreak(m => Math.max(m, ns)); return ns; });
    } else {
      setStreak(0);
    }

    if (scenario && isLoaded) {
      const cms = isCorrectChoice ? Math.max(maxStreak, streak + 1) : maxStreak;
      setStats(prev => {
        const today = new Date().toISOString().slice(0, 10);
        const isToday = prev.todayDate === today;
        return {
          ...prev,
          totalQuestions: prev.totalQuestions + 1,
          correctCount: prev.correctCount + (isCorrectChoice ? 1 : 0),
          wrongCount: prev.wrongCount + (isCorrectChoice ? 0 : 1),
          maxStreak: Math.max(prev.maxStreak, cms),
          records: [...prev.records.slice(-99), {
            correct: isCorrectChoice, position: scenario.assignedPosition,
            chosenOption: option, correctOption: scenario.correctAnswer, timestamp: Date.now(),
          }],
          todayQuestions: isToday ? prev.todayQuestions + 1 : 1,
          todayCorrect: isToday ? prev.todayCorrect + (isCorrectChoice ? 1 : 0) : (isCorrectChoice ? 1 : 0),
          todayDate: today,
        };
      });
    }
  }, [phase, selected, scenario, isLoaded, maxStreak, streak, setStats]);

  // ─── Category toggle ──────────────────────────────────────────────
  const toggleCategory = useCallback((cat: ScenarioCategory) => {
    setSelectedCategories(prev => {
      if (prev.includes(cat)) return prev.filter(c => c !== cat);
      return [...prev, cat];
    });
  }, []);

  // ─── Menu Screen ──────────────────────────────────────────────────
  if (phase === 'menu' || !isLoaded) {
    const totalAcc = stats.totalQuestions > 0 ? Math.round((stats.correctCount / stats.totalQuestions) * 100) : 0;
    const todayAcc = stats.todayQuestions > 0 ? Math.round((stats.todayCorrect / stats.todayQuestions) * 100) : 0;

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">综合训练（闪卡）</h1>

        {/* Stats summary at top */}
        {isLoaded && stats.totalQuestions > 0 && (
          <div className="bg-white rounded-lg shadow p-3 mb-4">
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="bg-blue-50 rounded-lg p-2">
                <div className="text-xs text-gray-500">累计统计</div>
                <div className="font-bold text-blue-700">{stats.totalQuestions}题 · {totalAcc}%</div>
                <div className="text-xs text-gray-400">正确{stats.correctCount} · 错误{stats.wrongCount} · 连续{stats.maxStreak}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <div className="text-xs text-gray-500">今日统计</div>
                <div className="font-bold text-green-700">{stats.todayQuestions}题 · {todayAcc}%</div>
                <div className="text-xs text-gray-400">正确{stats.todayCorrect}</div>
              </div>
            </div>
            {stats.lastSessions.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-1">最近训练</div>
                {stats.lastSessions.slice(-3).reverse().map((sess, i) => (
                  <div key={i} className="text-xs text-gray-600 flex justify-between">
                    <span>{sess.date}</span>
                    <span>{sess.questions}题 · 正确{sess.correct} · {sess.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-right">
              <button className="text-xs text-red-400 hover:text-red-600" onClick={() => setStats(INITIAL_STATS)}>
                重置统计
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-gray-600 mb-4">选择你想要重点训练的场景类型</p>

        {/* Event type categories */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">事件类型</div>
          <div className="flex flex-wrap gap-2">
            {EVENT_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategories.includes(cat)
                    ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-800 font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
                onClick={() => toggleCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
                {categoryCounts && <span className="text-xs text-gray-400 ml-1">({categoryCounts[cat] || 0})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Situation categories */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">防守局势</div>
          <div className="flex flex-wrap gap-2">
            {SITUATION_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategories.includes(cat)
                    ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-800 font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
                onClick={() => toggleCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
                {categoryCounts && <span className="text-xs text-gray-400 ml-1">({categoryCounts[cat] || 0})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Base occupancy categories */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">跑者配置</div>
          <div className="flex flex-wrap gap-2">
            {BASE_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategories.includes(cat)
                    ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-800 font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
                onClick={() => toggleCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
                {categoryCounts && <span className="text-xs text-gray-400 ml-1">({categoryCounts[cat] || 0})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        {selectedCategories.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 text-center">
            <span className="text-sm text-indigo-700">
              已选 {selectedCategories.length} 类 · 题库约 {
                (() => {
                  const pool: Scenario[] = [];
                  for (const cat of selectedCategories) pool.push(...getScenariosByCategory(cat));
                  return Array.from(new Map(pool.map(s => [s.id, s])).values()).length;
                })()
              } 题
            </span>
            <button className="text-xs text-gray-500 ml-2" onClick={() => setSelectedCategories([])}>
              清空
            </button>
          </div>
        )}

        <button
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-lg"
          onClick={startRound}
        >
          {selectedCategories.length === 0 ? '全部随机训练' : '开始分类训练'}
        </button>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    );
  } else if (!scenario) {
    return <div className="p-8 text-center">加载中...</div>;
  } else {
    // ─── Playing / Result ──────────────────────────────────────────────
    const { state, result, assignedPosition, positionLabel, correctAnswer, allOptions, eventDescription } = scenario;
    const runners = [];
    if (state.bases.first) runners.push('一垒');
    if (state.bases.second) runners.push('二垒');
    if (state.bases.third) runners.push('三垒');
    const runnersText = runners.length > 0 ? runners.join('+') + '有人' : '垒包空置';
    const half = state.topInning ? '上半' : '下半';
    const battingSide = state.topInning ? '客队' : '主队';

    const isCorrect = selected === correctAnswer;
    const isTimeout = selected === 'timeout';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        {/* Category label */}
        {selectedCategories.length > 0 && (
          <div className="text-xs text-indigo-600 text-center mb-1">
            分类训练 · {selectedCategories.map(c => CATEGORY_LABELS[c]).join('、')}
          </div>
        )}

        <ScoreBoard total={total} correct={correct} streak={streak} />
        {phase === 'playing' && <TimerBar timeLeft={timeLeft} totalTime={TOTAL_TIME} />}

        <div className="bg-blue-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
          你现在是{positionLabel}（{assignedPosition}）
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="flex justify-between items-center text-sm mb-2">
            <span className="font-semibold text-gray-700">{state.inning}局{half} · {battingSide}进攻</span>
            <span className="text-gray-500">{state.outs}出局 · {runnersText}</span>
          </div>
          <DiamondDiagram bases={state.bases} />
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-center font-medium text-yellow-800">
          事件：{eventDescription}
        </div>

        <div className="space-y-2 mb-4">
          {allOptions.map((option) => {
            let btnClass = 'bg-white border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-800';
            let disabled = false;

            if (phase === 'result') {
              disabled = true;
              if (option === correctAnswer) {
                btnClass = 'bg-green-100 border-2 border-green-500 text-green-800 font-bold';
              } else if (option === selected && !isCorrect) {
                btnClass = 'bg-red-100 border-2 border-red-500 text-red-800';
              } else {
                btnClass = 'bg-gray-100 border-2 border-gray-300 text-gray-400';
              }
            }

            const label = OPTION_LABELS[option] || getDistractorLabel(option);

            return (
              <button key={option} className={`w-full py-3 px-4 rounded-lg text-left transition-colors ${btnClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                disabled={disabled} onClick={() => handleChoice(option)}>
                {label}
              </button>
            );
          })}
        </div>

        {phase === 'result' && (
          <div className="space-y-3">
            <div className={`text-center font-bold py-3 rounded-lg ${
              isCorrect ? 'bg-green-100 text-green-700' : isTimeout ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
            }`}>
              {isCorrect ? '正确!' : isTimeout ? '超时!' : '错误!'}
              — 正确答案：{OPTION_LABELS[correctAnswer] || getDistractorLabel(correctAnswer)}
            </div>

            <div className="bg-gray-800 text-white rounded-lg p-4">
              <div className="text-sm font-semibold mb-1">规则解析</div>
              <p className="text-sm leading-relaxed">{result.description}</p>
              {result.runsScored && result.runsScored > 0 && (
                <p className="text-xs text-yellow-300 mt-1">得分：{result.runsScored}分</p>
              )}
            </div>

            <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
              onClick={startRound}>
              下一回合
            </button>
          </div>
        )}

        {total > 0 && (
          <div className="mt-4 bg-gray-100 rounded-lg p-3 text-center text-sm text-gray-600">
            本轮：{correct}/{total} 正确 · {Math.round((correct / total) * 100)}% · 最高连续 {maxStreak}
          </div>
        )}

        {/* Back to menu */}
        <div className="mt-4 text-center">
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={saveSessionAndGoMenu}>
            ← 返回菜单
          </button>
        </div>
      </div>
    );
  }
}