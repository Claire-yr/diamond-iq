'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DefensivePosition,
  POSITION_LABELS,
  resolveHitBall,
} from '@/lib/engine';
import {
  getAllScenariosForPosition,
  resolvePositionKey,
  Scenario,
} from '@/lib/scenarioBank';
import {
  generateDistractors,
  getDistractorLabel,
} from '@/util/optionDistractors';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// =============================================================================
// Types
// =============================================================================

interface DrillRecord {
  scenarioId: string;
  correct: boolean;
  chosenOption: string;
  correctOption: string;
}

interface PositionProgress {
  position: string;
  completedScenarios: string[];
  scores: { correct: number; total: number };
  totalSessions: number;
  records: DrillRecord[];
}

const INITIAL_STATS: PositionProgress = {
  position: '',
  completedScenarios: [],
  scores: { correct: 0, total: 0 },
  totalSessions: 0,
  records: [],
};

type Phase = 'loading' | 'playing' | 'answered' | 'summary';

// =============================================================================
// Diamond Diagram
// =============================================================================

function DiamondDiagram({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) {
  return (
    <div className="relative w-[220px] h-[220px] mx-auto my-3">
      <div
        className="absolute inset-[14px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45"
        style={{ borderRadius: '4px' }}
      />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-[28px] h-[28px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500">本垒</span>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 transition-colors duration-300 ${bases.first ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.first && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 ml-1">一垒</span>
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 transition-colors duration-300 ${bases.second ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.second && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500">二垒</span>
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[28px] h-[28px] border-2 rotate-45 transition-colors duration-300 ${bases.third ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'}`} />
        {bases.third && <div className="absolute w-[10px] h-[10px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 mr-1">三垒</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function PositionTrainPageInner({ params }: { params: { position: string } }) {
  const positionParam = decodeURIComponent(params.position);

  // Resolve position key (supports Chinese like '一垒手' or English like 'firstBase')
  let posKey: DefensivePosition;
  let posLabel: string;
  try {
    posKey = resolvePositionKey(positionParam);
    posLabel = POSITION_LABELS[posKey];
  } catch {
    return <InvalidPositionPage />;
  }

  // Load scenarios for this position
  const scenarios = useMemo(() => getAllScenariosForPosition(posKey), [posKey]);

  // State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(scenarios.length > 0 ? 'playing' : 'loading');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [records, setRecords] = useState<DrillRecord[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  // localStorage
  const localStorageKey = `diamond-iq-train-${posKey}`;
  const [progress, setProgress, isLoaded] = useLocalStorage<PositionProgress>(localStorageKey, { ...INITIAL_STATS, position: posKey });

  // Generate 4 options for current scenario (1 correct + 3 distractors)
  const currentScenario = scenarios[currentIndex];
  const currentResult = useMemo(() => {
    if (!currentScenario) return null;
    return resolveHitBall(currentScenario.state, currentScenario.event);
  }, [currentScenario]);

  const currentOptions = useMemo(() => {
    if (!currentScenario) return [];
    const correct = currentScenario.correctOptions[0] || currentScenario.correctOptions[0];
    const distractors = generateDistractors(currentScenario.correctOptions, posKey);
    // Shuffle all 4
    const all = [correct, ...distractors];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [currentScenario, posKey]);

  // Handle choice
  const handleChoice = useCallback((option: string) => {
    if (phase !== 'playing' || !currentScenario) return;

    const isCorrect = currentScenario.correctOptions.includes(option);

    setSelectedOption(option);
    setPhase('answered');
    setRecords(prev => [...prev, {
      scenarioId: currentScenario.id,
      correct: isCorrect,
      chosenOption: option,
      correctOption: currentScenario.correctOptions[0],
    }]);
    if (isCorrect) setCorrectCount(prev => prev + 1);

    // Track completed scenario in localStorage
    if (isLoaded) {
      setProgress(prev => ({
        ...prev,
        position: posKey,
        completedScenarios: prev.completedScenarios.includes(currentScenario.id)
          ? prev.completedScenarios
          : [...prev.completedScenarios, currentScenario.id],
        scores: {
          correct: prev.scores.correct + (isCorrect ? 1 : 0),
          total: prev.scores.total + 1,
        },
      }));
    }
  }, [phase, currentScenario, isLoaded, posKey, setProgress]);

  // Next question
  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= scenarios.length) {
      // All done — go to summary
      setPhase('summary');
      // Save session to localStorage
      if (isLoaded) {
        setProgress(prev => ({
          ...prev,
          position: posKey,
          totalSessions: prev.totalSessions + 1,
          records: [...prev.records.slice(-199), ...records],
        }));
      }
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setPhase('playing');
    }
  }, [currentIndex, scenarios.length, records, isLoaded, posKey, setProgress]);

  // Restart
  const handleRestart = useCallback(() => {
    // Shuffle scenarios for variety
    const shuffled = [...scenarios];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setCurrentIndex(0);
    setSelectedOption(null);
    setRecords([]);
    setCorrectCount(0);
    setPhase('playing');
  }, [scenarios]);

  // ─── No scenarios found ────────────────────────────────────────────────
  if (scenarios.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto text-center">
        <h1 className="text-xl font-bold mb-4">{posLabel}训练</h1>
        <p className="text-gray-600 mb-6">暂无{posLabel}专属场面数据。</p>
        <a href="/" className="text-sm text-gray-500 hover:text-blue-600">← 返回首页</a>
      </div>
    );
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    const total = records.length;
    const acc = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const grade = acc >= 90 ? 'A+' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : acc >= 50 ? 'D' : 'F';
    const completionPct = isLoaded && scenarios.length > 0
      ? Math.round((progress.completedScenarios.length / scenarios.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">{posLabel}训练完成!</h1>

        <div className="bg-indigo-100 border border-indigo-300 rounded-lg p-6 text-center mb-4">
          <div className="text-3xl font-bold text-indigo-700">{grade}</div>
          <div className="mt-2 flex gap-4 justify-center text-sm">
            <div className="bg-white rounded px-3 py-1">
              <span className="text-gray-500">总题数</span> <span className="font-bold">{total}</span>
            </div>
            <div className="bg-white rounded px-3 py-1">
              <span className="text-green-600">正确</span> <span className="font-bold">{correctCount}</span>
            </div>
            <div className="bg-white rounded px-3 py-1">
              <span className="text-gray-500">正确率</span> <span className="font-bold">{acc}%</span>
            </div>
          </div>
        </div>

        {/* Completion progress */}
        {isLoaded && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="text-sm font-semibold text-gray-700 mb-2">完成进度</div>
            <div className="w-full h-4 bg-gray-200 rounded-full mb-1">
              <div className="h-4 bg-indigo-500 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <div className="text-xs text-gray-500 text-center">
              已完成 {progress.completedScenarios.length} / {scenarios.length} 场景 · {completionPct}%
            </div>
            <div className="text-xs text-gray-500 text-center mt-1">
              累计 {progress.scores.total} 题 · 正确率 {progress.scores.total > 0 ? Math.round((progress.scores.correct / progress.scores.total) * 100) : 0}%
            </div>
          </div>
        )}

        {/* Detailed results */}
        <div className="bg-white rounded-lg shadow p-4 mb-4 max-h-[300px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">逐题回顾</h3>
          {records.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs mb-2 py-1 border-b border-gray-100">
              <span className={`w-2 h-2 rounded-full ${r.correct ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">{r.correct ? '正确' : '错误'}</span>
              <span className="text-gray-400">→ {getDistractorLabel(r.correctOption)}</span>
              {!r.correct && (
                <span className="text-red-400">(你选: {getDistractorLabel(r.chosenOption)})</span>
              )}
            </div>
          ))}
        </div>

        {/* localStorage history */}
        {progress.totalSessions > 1 && (
          <div className="bg-gray-100 rounded-lg p-3 text-center text-sm text-gray-600 mb-4">
            累计训练 {progress.totalSessions} 次 · {progress.scores.total} 题 · 正确率 {progress.scores.total > 0 ? Math.round((progress.scores.correct / progress.scores.total) * 100) : 0}%
          </div>
        )}

        <button
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold mb-2"
          onClick={handleRestart}
        >
          重新训练（随机顺序）
        </button>

        {/* Reset progress */}
        <button
          className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-lg text-sm mb-2"
          onClick={() => setProgress({ ...INITIAL_STATS, position: posKey })}
        >
          重置进度
        </button>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-blue-600">
          ← 返回首页
        </a>
      </div>
    );
  }

  // ─── Playing / Answered ────────────────────────────────────────────────
  if (!currentScenario || !currentResult) return <div className="p-8 text-center">加载中...</div>;

  const state = currentScenario.state;
  const runners = [];
  if (state.bases.first) runners.push('一垒');
  if (state.bases.second) runners.push('二垒');
  if (state.bases.third) runners.push('三垒');
  const runnersText = runners.length > 0 ? runners.join('+') + '有人' : '垒空';
  const isCorrect = selectedOption ? currentScenario.correctOptions.includes(selectedOption) : null;

  // Build display label for any option key
  const getLabel = (key: string) => getDistractorLabel(key);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <h1 className="text-xl font-bold text-center mb-1">{posLabel}位置专精训练</h1>
      <div className="text-center text-sm text-gray-500 mb-1">
        第 {currentIndex + 1} / {scenarios.length} 题
      </div>
      {isLoaded && progress.completedScenarios.length > 0 && (
        <div className="text-center text-xs text-indigo-600 mb-2">
          已掌握 {progress.completedScenarios.length} / {scenarios.length} 场景 · {Math.round((progress.completedScenarios.length / scenarios.length) * 100)}%
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full mb-4">
        <div className="h-2 bg-indigo-500 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / scenarios.length) * 100}%` }} />
      </div>

      {/* Position role */}
      <div className="bg-indigo-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
        你的位置：{posLabel}（{posKey}）
      </div>

      {/* Game state display */}
      <div className="bg-white rounded-lg shadow p-4 mb-3">
        <div className="flex justify-between items-center text-sm mb-1">
          <span className="font-semibold text-gray-700">
            {state.inning}局{state.topInning ? '上半' : '下半'}
          </span>
          <span className="text-gray-500">
            {state.outs}出局 · {runnersText}
          </span>
        </div>
        <DiamondDiagram bases={state.bases} />
      </div>

      {/* Event / scenario description */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-center font-medium text-yellow-800">
        {currentScenario.eventDescription}
      </div>

      {/* 4 option buttons */}
      <div className="space-y-2 mb-4">
        {currentOptions.map((option) => {
          let btnClass = 'bg-white border-2 border-gray-300 text-gray-800';
          let disabled = false;

          if (phase === 'answered') {
            disabled = true;
            const optIsCorrect = currentScenario.correctOptions.includes(option);
            if (optIsCorrect) {
              btnClass = 'bg-green-100 border-2 border-green-500 text-green-800 font-bold';
            } else if (option === selectedOption && !isCorrect) {
              btnClass = 'bg-red-100 border-2 border-red-500 text-red-800';
            } else {
              btnClass = 'bg-gray-100 border-2 border-gray-300 text-gray-400';
            }
          } else {
            btnClass += ' hover:border-indigo-400 hover:bg-indigo-50';
          }

          return (
            <button
              key={option}
              className={`w-full py-3 px-4 rounded-lg text-left transition-colors ${btnClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
              disabled={disabled}
              onClick={() => handleChoice(option)}
            >
              {getLabel(option)}
            </button>
          );
        })}
      </div>

      {/* Answer feedback */}
      {phase === 'answered' && (
        <div className="space-y-3">
          <div className={`text-center font-bold py-3 rounded-lg ${
            isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isCorrect ? '正确!' : '错误!'}
            — 正确答案：{getLabel(currentScenario.correctOptions[0])}
          </div>

          {/* Engine rule explanation */}
          <div className="bg-gray-800 text-white rounded-lg p-4">
            <div className="text-sm font-semibold mb-1">规则解析</div>
            <p className="text-sm leading-relaxed">{currentResult.description}</p>
            {currentResult.runsScored && currentResult.runsScored > 0 && (
              <p className="text-xs text-yellow-300 mt-1">得分：{currentResult.runsScored}分</p>
            )}
          </div>

          {/* Next button */}
          <button
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
            onClick={handleNext}
          >
            {currentIndex + 1 >= scenarios.length ? '查看结果' : '下一题'}
          </button>
        </div>
      )}

      {/* Session progress */}
      <div className="mt-4 flex gap-2 justify-center text-xs text-gray-500">
        <span>正确 {correctCount}/{currentIndex + (phase === 'answered' ? 1 : 0)}</span>
        <span>· 剩余 {scenarios.length - currentIndex - (phase === 'answered' ? 1 : 0)} 题</span>
      </div>

      {/* Bottom nav */}
      <div className="mt-6 text-center">
        <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
      </div>
    </div>
  );
}

// =============================================================================
// Invalid Position Page
// =============================================================================

const ALL_POSITIONS: DefensivePosition[] = [
  'pitcher', 'catcher', 'firstBase', 'secondBase',
  'thirdBase', 'shortstop', 'leftField', 'centerField', 'rightField',
];

function InvalidPositionPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-center mb-2">无效的位置参数</h1>
      <p className="text-center text-gray-600 mb-4">
        请选择以下位置进行训练：
      </p>
      <div className="grid grid-cols-3 gap-3">
        {ALL_POSITIONS.map(pos => (
          <a
            key={pos}
            href={`/train/${encodeURIComponent(POSITION_LABELS[pos])}`}
            className="block p-3 bg-white border-2 border-gray-200 rounded-lg text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
          >
            <div className="font-semibold text-gray-800">{POSITION_LABELS[pos]}</div>
            <div className="text-xs text-gray-500">{pos}</div>
          </a>
        ))}
      </div>
      <a href="/" className="block text-center text-sm text-gray-500 hover:text-blue-600 mt-4">← 返回首页</a>
    </div>
  );
}