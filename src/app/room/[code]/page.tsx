'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DefensivePosition,
  POSITION_LABELS,
  OPTION_LABELS,
  BatterEvent,
  GameState,
} from '@/lib/engine';
import { getDistractorLabel } from '@/util/optionDistractors';

// =============================================================================
// Types
// =============================================================================

type RoomPhase = 'waiting' | 'active' | 'result';

interface PositionOptionsPublic {
  allOptions: string[];
  isObserver: boolean;
}

interface RoomPlayer {
  sessionId: string;
  nickname: string;
  position: DefensivePosition | null;
  hasSubmitted: boolean;
}

interface RoomScenario {
  state: GameState;
  event: BatterEvent;
  perPositionOptions: Record<string, PositionOptionsPublic>;
  startedAt: number;
  deadline: number;
}

interface PlayerResult {
  nickname: string;
  position: DefensivePosition | null;
  chosenOption: string;
  correct: boolean;
  correctAnswer: string;
  reactionTime: number;
}

interface AnimationStep {
  label: string;
  fromBase: string;
  toBase: string;
  result: string;
  isDeviation?: boolean;
}

interface RoomAnalysis {
  playerResults: PlayerResult[];
  bestPlayDescription: string;
  collaborativeAnalysis: string;
  optimalPath: AnimationStep[];
  actualPath: AnimationStep[];
  teamOutcome: string;
}

interface RoomStatus {
  code: string;
  coachId: string;
  phase: RoomPhase;
  players: RoomPlayer[];
  scenario: RoomScenario | null;
  analysis: RoomAnalysis | null;
  createdAt: number;
}

const ALL_POSITIONS: DefensivePosition[] = [
  'pitcher', 'catcher', 'firstBase', 'secondBase',
  'thirdBase', 'shortstop', 'leftField', 'centerField', 'rightField',
];

// =============================================================================
// Diamond Diagram Component
// =============================================================================

function DiamondDiagram({ bases }: { bases: { first: boolean; second: boolean; third: boolean } }) {
  return (
    <div className="relative w-[220px] h-[220px] mx-auto my-3">
      <div
        className="absolute inset-[16px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45"
        style={{ borderRadius: '4px' }}
      />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-[32px] h-[32px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500">本垒</span>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[30px] h-[30px] border-2 ${bases.first ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.first && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500 ml-1">一垒</span>
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className={`w-[30px] h-[30px] border-2 ${bases.second ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.second && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full" />}
        <span className="text-xs text-gray-500">二垒</span>
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className={`w-[30px] h-[30px] border-2 ${bases.third ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'} rotate-45`} />
        {bases.third && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full" />}
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
  const color = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
      <div className={`h-full ${color} rounded-full transition-all duration-100`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// =============================================================================
// Animation Comparison — Optimal vs Actual
// =============================================================================

function AnimationComparison({ optimalPath, actualPath, teamOutcome }: { optimalPath: AnimationStep[]; actualPath: AnimationStep[]; teamOutcome: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = Math.max(optimalPath.length, actualPath.length);

  useEffect(() => {
    if (totalSteps === 0) return;
    setCurrentStep(0);
  }, [totalSteps]);

  useEffect(() => {
    if (currentStep >= totalSteps) return;
    const timer = setTimeout(() => {
      setCurrentStep(s => Math.min(s + 1, totalSteps));
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentStep, totalSteps]);

  if (totalSteps === 0) return null;

  const pathsAreEqual = optimalPath.length === actualPath.length &&
    optimalPath.every((step, i) => step.label === actualPath[i]?.label && !actualPath[i]?.isDeviation);

  return (
    <div className="bg-gray-800 text-white rounded-lg p-4 mt-3">
      <div className="text-sm font-semibold mb-2">
        {pathsAreEqual ? '防守动画（执行完美）' : '最优防守 vs 实际执行'}
      </div>
      {!pathsAreEqual && (
        <div className="text-xs text-yellow-400 mb-2 font-semibold">{teamOutcome}</div>
      )}
      <div className={pathsAreEqual ? '' : 'grid grid-cols-2 gap-4'}>
        {/* Optimal path */}
        <div>
          <div className="text-xs text-green-400 font-semibold mb-1">最优方案</div>
          <div className="space-y-1">
            {optimalPath.map((step, i) => (
              <div key={i} className={`flex items-center gap-1 text-xs transition-opacity duration-300 ${i < currentStep ? 'opacity-100' : i === currentStep ? 'opacity-100 font-bold' : 'opacity-30'}`}>
                <span className={`w-2 h-2 rounded-full ${i < currentStep ? 'bg-green-400' : i === currentStep ? 'bg-yellow-400 animate-pulse' : 'bg-gray-500'}`} />
                <span>{step.label}</span>
                <span className="text-xs text-gray-400">→</span>
                <span className={i < currentStep ? 'text-green-400' : 'text-gray-400'}>{step.result}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Actual path (only shown if different) */}
        {!pathsAreEqual && (
          <div>
            <div className="text-xs text-red-400 font-semibold mb-1">实际执行</div>
            <div className="space-y-1">
              {actualPath.map((step, i) => (
                <div key={i} className={`flex items-center gap-1 text-xs transition-opacity duration-300 ${i < currentStep ? 'opacity-100' : i === currentStep ? 'opacity-100 font-bold' : 'opacity-30'}`}>
                  <span className={`w-2 h-2 rounded-full ${step.isDeviation ? 'bg-red-400' : i < currentStep ? 'bg-green-400' : i === currentStep ? 'bg-yellow-400 animate-pulse' : 'bg-gray-500'}`} />
                  <span className={step.isDeviation ? 'text-red-400' : ''}>{step.label}</span>
                  <span className="text-xs text-gray-400">→</span>
                  <span className={step.isDeviation ? 'text-red-400' : 'text-gray-400'}>{step.result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Room Page
// =============================================================================

export default function RoomPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();

  const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [isCoach, setIsCoach] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [positionInput, setPositionInput] = useState<DefensivePosition>('shortstop');
  const [joined, setJoined] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitCorrect, setSubmitCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(8);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize session ID from cookie or generate new one
  useEffect(() => {
    const existing = document.cookie.split('; ').find(c => c.startsWith('diamond-iq-session='));
    if (existing) {
      setSessionId(existing.split('=')[1]);
    } else {
      const newId = 'user_' + Math.random().toString(36).substring(2, 10);
      document.cookie = `diamond-iq-session=${newId}; path=/; max-age=86400`;
      setSessionId(newId);
    }
  }, []);

  // SSE connection for real-time updates
  useEffect(() => {
    if (!joined) return;

    const eventSource = new EventSource(`/api/room/${code}/status`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as RoomStatus;
        setRoomStatus(data);

        if (sessionId && data.coachId === sessionId) {
          setIsCoach(true);
        }

        if (data.phase === 'active' && data.scenario) {
          const remaining = Math.max(0, (data.scenario.deadline - Date.now()) / 1000);
          setTimeLeft(remaining);
        }

        if (data.phase === 'result' && !submitted) {
          setSubmitted(true);
          setSubmitCorrect(false);
        }
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };

    eventSource.onerror = () => {};

    return () => {
      eventSource.close();
    };
  }, [joined, code, sessionId]);

  // Countdown timer during active phase
  useEffect(() => {
    if (!roomStatus || roomStatus.phase !== 'active' || submitted || isCoach) return;

    timerRef.current = setInterval(() => {
      if (!roomStatus.scenario) return;
      const remaining = (roomStatus.scenario.deadline - Date.now()) / 1000;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        if (!submitted) {
          setSubmitted(true);
          setSubmitCorrect(false);
          setSelectedOption('timeout');
          fetch(`/api/room/${code}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, chosenOption: 'timeout' }),
          });
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomStatus?.phase, submitted, isCoach, code, sessionId, roomStatus?.scenario?.deadline]);

  // Join room
  const handleJoin = useCallback(async () => {
    if (!nicknameInput.trim()) return;

    const res = await fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, sessionId, nickname: nicknameInput.trim() }),
    });

    const data = await res.json();

    if (data.success) {
      setJoined(true);
    } else if (data.error === '教练不能以球员身份加入' || data.error === '你已经在这个房间了') {
      setJoined(true);
    } else {
      alert(data.error || '加入失败');
    }
  }, [code, sessionId, nicknameInput]);

  // Coach: Start new scenario
  const handleStartScenario = useCallback(async () => {
    const res = await fetch(`/api/room/${code}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachId: sessionId }),
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.error || '开始失败');
    }
  }, [code, sessionId]);

  // Coach: Reset to waiting
  const handleReset = useCallback(async () => {
    await fetch(`/api/room/${code}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachId: sessionId }),
    });
  }, [code, sessionId]);

  // Player: Submit answer
  const handleSubmit = useCallback(async (option: string) => {
    if (submitted) return;

    setSelectedOption(option);

    const res = await fetch(`/api/room/${code}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, chosenOption: option }),
    });

    const data = await res.json();
    setSubmitted(true);
    setSubmitCorrect(data.correct);
  }, [code, sessionId, submitted]);

  // Player: Set position
  const handleSetPosition = useCallback(async () => {
    const res = await fetch('/api/room/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, sessionId, position: positionInput }),
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.error || '设置位置失败');
    }
  }, [code, sessionId, positionInput]);

  // ─── Loading state ──────────────────────────────────────────────────────
  if (!sessionId) return <div className="p-8 text-center">初始化中...</div>;

  // ─── Not joined yet: show join form ────────────────────────────────────
  if (!joined) {
    const isCoachFromUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('coach') === 'true';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-2">房间 {code}</h1>

        {isCoachFromUrl && (
          <div className="bg-blue-100 border border-blue-300 rounded-lg p-4 text-center mb-4">
            <div className="font-semibold text-blue-700 mb-2">你是教练</div>
            <p className="text-sm text-blue-600">请输入昵称后加入房间，等待球员加入即可开始出题。</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
          <input
            type="text"
            value={nicknameInput}
            onChange={e => setNicknameInput(e.target.value)}
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 mb-3 focus:border-blue-500 focus:outline-none"
            placeholder="输入你的昵称"
          />

          <button
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            onClick={handleJoin}
          >
            加入房间
          </button>
        </div>

        <a href="/" className="text-sm text-gray-500 hover:text-blue-600">← 返回首页</a>
      </div>
    );
  }

  // ─── Waiting for data ──────────────────────────────────────────────────
  if (!roomStatus) return <div className="p-8 text-center">连接房间中...</div>;

  // ─── Find current player ───────────────────────────────────────────────
  const me = roomStatus.players.find(p => p.sessionId === sessionId);
  const isCoachView = roomStatus.coachId === sessionId;

  // ─── Build event description ───────────────────────────────────────────
  // Use engine's describeEvent would need to import it; we can derive from scenario
  const eventDescription = roomStatus.scenario
    ? describeEventLocal(roomStatus.scenario.event as BatterEvent)
    : '';

  // ─── Coach View ─────────────────────────────────────────────────────────
  if (isCoachView) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-1">教练控制台 — 房间 {code}</h1>

        {/* Players list */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">球员列表 ({roomStatus.players.length}人)</h3>
          {roomStatus.players.length === 0 && (
            <p className="text-sm text-gray-400">等待球员加入... 分享房间码: <span className="font-bold text-blue-600">{code}</span>
              <button className="ml-2 text-blue-500 hover:text-blue-700 text-xs" onClick={() => navigator.clipboard.writeText(code)}>复制</button>
            </p>
          )}
          {roomStatus.players.map(p => (
            <div key={p.sessionId} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
              <span className="text-sm font-medium">{p.nickname}</span>
              <span className="text-xs text-gray-500">{p.position ? POSITION_LABELS[p.position] : '未选位置'}</span>
              {roomStatus.phase === 'active' && (
                <span className={`text-xs ${p.hasSubmitted ? 'text-green-600' : 'text-orange-600'}`}>
                  {p.hasSubmitted ? '已提交' : '等待...'}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Coach controls */}
        {roomStatus.phase === 'waiting' && (
          <button
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold mb-3"
            onClick={handleStartScenario}
          >
            出新题
          </button>
        )}

        {/* Active scenario display for coach */}
        {roomStatus.phase === 'active' && roomStatus.scenario && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-3">
            <div className="text-sm font-semibold text-yellow-800 mb-1">当前局面</div>
            <div className="text-sm text-yellow-700">{eventDescription}</div>
            <p className="text-xs text-gray-500 mt-2">等待球员提交答案...</p>
          </div>
        )}

        {/* Result phase for coach */}
        {roomStatus.phase === 'result' && roomStatus.analysis && (
          <div className="space-y-3 mb-3">
            {/* Collaborative analysis */}
            <div className="bg-indigo-100 border border-indigo-300 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-indigo-700 mb-2">协同分析</h3>
              <p className="text-sm text-indigo-800 leading-relaxed">{roomStatus.analysis.collaborativeAnalysis}</p>
              <div className="text-sm font-semibold text-indigo-700 mt-2">{roomStatus.analysis.teamOutcome}</div>
            </div>

            {/* Team results */}
            <div className="bg-green-100 border border-green-300 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-700 mb-2">团队结果</h3>
              {roomStatus.analysis.playerResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm mb-1">
                  <span className={`w-2 h-2 rounded-full ${r.correct ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-medium">{r.nickname}</span>
                  <span className="text-gray-500">({r.position ? POSITION_LABELS[r.position] : '未定'})</span>
                  <span className={r.correct ? 'text-green-600' : 'text-red-600'}>
                    {r.correct ? '正确' : '错误'} · {r.reactionTime}ms
                  </span>
                </div>
              ))}
            </div>

            <AnimationComparison
              optimalPath={roomStatus.analysis.optimalPath}
              actualPath={roomStatus.analysis.actualPath}
              teamOutcome={roomStatus.analysis.teamOutcome}
            />

            <button
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
              onClick={handleReset}
            >
              下一题（重置等待）
            </button>
          </div>
        )}

        {/* Diamond diagram for coach */}
        {roomStatus.scenario && (
          <div className="bg-white rounded-lg shadow p-4 mb-3">
            <div className="text-sm text-gray-600 mb-1">
              {roomStatus.scenario.state.inning}局 · {roomStatus.scenario.state.outs}出局
            </div>
            <DiamondDiagram bases={roomStatus.scenario.state.bases} />
          </div>
        )}

        <div className="text-center text-xs text-gray-400 mt-4">
          房间码: <span className="font-bold">{code}</span>
          <button className="ml-2 text-blue-500 hover:text-blue-700" onClick={() => navigator.clipboard.writeText(code)}>复制</button>
          · 创建时间: {new Date(roomStatus.createdAt).toLocaleTimeString()}
        </div>
      </div>
    );
  }

  // ─── Player View ────────────────────────────────────────────────────────

  // Position selection (if not set)
  if (me && !me.position && roomStatus.phase === 'waiting') {
    const takenPositions = roomStatus.players.filter(p => p.position && p.sessionId !== sessionId).map(p => p.position);

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-2">房间 {code}</h1>
        <div className="bg-blue-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
          球员: {me.nickname} — 请选择你的防守位置（必须选择才能参与训练）
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">选择位置</h3>
          <div className="grid grid-cols-3 gap-2">
            {ALL_POSITIONS.map(pos => {
              const taken = takenPositions.includes(pos);
              return (
                <button
                  key={pos}
                  className={`p-3 rounded-lg text-center transition-colors ${
                    taken ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                    positionInput === pos ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-800 font-semibold' :
                    'bg-white border-2 border-gray-200 hover:border-indigo-400 text-gray-800'
                  }`}
                  disabled={taken}
                  onClick={() => setPositionInput(pos)}
                >
                  <div className="font-semibold">{POSITION_LABELS[pos]}</div>
                  <div className="text-xs">{taken ? '已被选' : pos}</div>
                </button>
              );
            })}
          </div>
          <button
            className="w-full py-3 mt-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
            onClick={handleSetPosition}
          >
            确认位置
          </button>
        </div>

        <div className="bg-gray-100 rounded-lg p-3 text-center text-sm text-gray-600">
          等待教练开始出题...
        </div>
      </div>
    );
  }

  // Player: Waiting phase (position set, waiting for coach to start)
  if (roomStatus.phase === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-2">房间 {code}</h1>
        <div className="bg-indigo-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
          {me?.nickname} · {me?.position ? POSITION_LABELS[me.position] : '未选位置'}
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">球员列表</h3>
          {roomStatus.players.map(p => (
            <div key={p.sessionId} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0 text-sm">
              <span className="font-medium">{p.nickname}</span>
              <span className="text-gray-500">{p.position ? POSITION_LABELS[p.position] : '未选'}</span>
            </div>
          ))}
        </div>

        <div className="bg-gray-100 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600">等待教练开始出题...</p>
          <p className="text-xs text-gray-400 mt-1">准备好后教练会自动推送局面</p>
        </div>
      </div>
    );
  }

  // Player: Active phase — choose your action!
  if (roomStatus.phase === 'active' && roomStatus.scenario && !submitted) {
    const myPosition = me?.position;
    const myPositionOpts = myPosition ? roomStatus.scenario.perPositionOptions[myPosition] : null;

    // Observer position
    if (myPositionOpts?.isObserver) {
      return (
        <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto text-center">
          <h1 className="text-xl font-bold mb-4">房间 {code}</h1>
          <TimerBar timeLeft={timeLeft} totalTime={8} />
          <div className="bg-blue-100 border border-blue-300 rounded-lg p-6">
            <div className="text-lg font-semibold text-blue-700 mb-2">
              你是{POSITION_LABELS[myPosition!]} — 本局面无相关动作
            </div>
            <p className="text-sm text-blue-600">旁观等待，观察其他球员决策...</p>
          </div>
          <div className="text-center text-xs text-gray-400 mt-4">
            剩余 {Math.max(0, Math.round(timeLeft))} 秒
          </div>
        </div>
      );
    }

    const positionOpts = myPositionOpts?.allOptions || [];

    // Build runners description
    const bases = roomStatus.scenario.state.bases;
    const runners = [];
    if (bases.first) runners.push('一垒');
    if (bases.second) runners.push('二垒');
    if (bases.third) runners.push('三垒');
    const runnersText = runners.length > 0 ? runners.join('+') + '有人' : '垒空';

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-1">房间 {code}</h1>

        {/* Timer */}
        <TimerBar timeLeft={timeLeft} totalTime={8} />
        <div className="text-center text-sm text-gray-500 mb-2">
          剩余 {Math.max(0, Math.round(timeLeft))} 秒
        </div>

        {/* Position banner */}
        <div className="bg-indigo-600 text-white text-center rounded-lg py-2 mb-3 font-semibold">
          你是{myPosition ? POSITION_LABELS[myPosition] : '未定位置'} — 快做决策!
        </div>

        {/* Scenario display */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span>{roomStatus.scenario.state.inning}局 · {roomStatus.scenario.state.outs}出局</span>
            <span>{runnersText}</span>
          </div>
          <DiamondDiagram bases={bases} />
        </div>

        {/* Event */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3 text-center font-medium text-yellow-800">
          {eventDescription}
        </div>

        {/* Position-specific choices */}
        <div className="space-y-2 mb-3">
          {positionOpts.map((opt) => {
            const label = OPTION_LABELS[opt] || getDistractorLabel(opt);
            return (
              <button
                key={opt}
                className={`w-full py-3 px-4 rounded-lg text-left transition-colors ${
                  selectedOption === opt
                    ? 'bg-indigo-100 border-2 border-indigo-500 text-indigo-800 font-semibold'
                    : 'bg-white border-2 border-gray-300 hover:border-indigo-400 text-gray-800'
                }`}
                onClick={() => handleSubmit(opt)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Player: Already submitted, waiting for results
  if (roomStatus.phase === 'active' && submitted) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto text-center">
        <h1 className="text-xl font-bold mb-4">房间 {code}</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-lg font-semibold mb-2">
            {submitCorrect ? '你答对了! 等待其他球员...' : '答案已提交，等待结果...'}
          </div>
          <p className="text-sm text-gray-500">等待所有球员提交或超时...</p>
        </div>
      </div>
    );
  }

  // Player: Result phase — show personal result + team analysis
  if (roomStatus.phase === 'result' && roomStatus.analysis) {
    const myPlayer = roomStatus.players.find(p => p.sessionId === sessionId);
    const myResult = roomStatus.analysis.playerResults.find(r =>
      r.nickname === myPlayer?.nickname && r.position === myPlayer?.position
    );

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-2">房间 {code} — 结果</h1>

        {/* Personal result */}
        {myResult && (
          <div className={`text-center font-bold py-3 rounded-lg mb-3 ${
            myResult.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {myResult.correct ? '你答对了!' : '你答错了!'}
            {!myResult.correct && myResult.correctAnswer && (
              <span> 正确答案: {OPTION_LABELS[myResult.correctAnswer] || getDistractorLabel(myResult.correctAnswer)}</span>
            )}
            <div className="text-xs mt-1">反应时间: {myResult.reactionTime}ms</div>
          </div>
        )}

        {/* Collaborative analysis */}
        <div className="bg-indigo-100 border border-indigo-300 rounded-lg p-4 mb-3">
          <h3 className="text-sm font-semibold text-indigo-700 mb-2">协同分析</h3>
          <p className="text-sm text-indigo-800 leading-relaxed">{roomStatus.analysis.collaborativeAnalysis}</p>
          <div className="text-sm font-semibold text-indigo-700 mt-2">{roomStatus.analysis.teamOutcome}</div>
        </div>

        {/* Team results */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">团队结果</h3>
          {roomStatus.analysis.playerResults.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm mb-1">
              <span className={`w-2 h-2 rounded-full ${r.correct ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">{r.nickname}</span>
              <span className="text-gray-500">({r.position ? POSITION_LABELS[r.position] : '未定'})</span>
              <span className={r.correct ? 'text-green-600 font-semibold' : 'text-red-600'}>
                {r.correct ? '正确' : '错误'}
              </span>
              <span className="text-xs text-gray-400">{r.reactionTime}ms</span>
            </div>
          ))}
        </div>

        {/* Best play description */}
        <div className="bg-gray-800 text-white rounded-lg p-4 mb-3">
          <div className="text-sm font-semibold mb-1">最优防守方案</div>
          <p className="text-sm leading-relaxed">{roomStatus.analysis.bestPlayDescription}</p>
        </div>

        {/* Animation comparison */}
        <AnimationComparison
          optimalPath={roomStatus.analysis.optimalPath}
          actualPath={roomStatus.analysis.actualPath}
          teamOutcome={roomStatus.analysis.teamOutcome}
        />

        {/* Diamond diagram */}
        {roomStatus.scenario && (
          <div className="bg-white rounded-lg shadow p-4 mt-3">
            <DiamondDiagram bases={roomStatus.scenario.state.bases} />
          </div>
        )}

        <div className="mt-4 text-center text-sm text-gray-500">
          等待教练开始下一题...
        </div>
      </div>
    );
  }

  // Fallback
  return <div className="p-8 text-center">加载房间状态...</div>;
}

// =============================================================================
// Local event description (avoids importing engine's describeEvent on client)
// =============================================================================

function describeEventLocal(event: BatterEvent): string {
  switch (event.type) {
    case 'groundBall':
      return `${event.speed === 'fast' ? '快速' : event.speed === 'medium' ? '中等' : '慢速'}地滚球向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中'}方`;
    case 'flyBall':
      return `${event.popUp ? '内野小飞球' : event.depth + '外场高飞球'}向${event.direction === 'left' ? '左' : event.direction === 'right' ? '右' : '中'}方`;
    case 'lineDrive':
      return `平飞球向${event.direction}方${event.caught ? '（被接杀）' : '（落地）'}`;
    case 'bunt':
      return `触击向${event.direction}方（${event.quality === 'good' ? '优质' : '拙劣'}触击）`;
    case 'sacrificeBunt':
      return `牺牲触击向${event.direction}方`;
    case 'steal':
      return `跑者盗${event.targetBase === 'second' ? '二垒' : event.targetBase === 'third' ? '三垒' : '本垒'}`;
    case 'pickoff':
      return `投手牵制${event.targetBase === 'first' ? '一垒' : event.targetBase === 'second' ? '二垒' : '三垒'}`;
    case 'walk':
      return '四坏球保送';
    case 'strikeout':
      return `三振出局${event.wildPitch ? '（暴投）' : event.passedBall ? '（漏接）' : ''}`;
    case 'hitByPitch':
      return '触身球';
    case 'error':
      return `${event.fielderPosition}失误（${event.severity === 'major' ? '严重' : '轻微'}）`;
    default:
      return '未知事件';
  }
}