'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GameState,
  BatterEvent,
  BaseOccupancy,
  Score,
  InfieldDirection,
  OutfieldDirection,
  OutfieldDepth,
  POSITION_LABELS,
  DefensivePosition,
  resolveHitBall,
  describeEvent,
  OPTION_LABELS,
} from '@/lib/engine';
import { getDistractorLabel } from '@/util/optionDistractors';

// =============================================================================
// Types
// =============================================================================

interface SavedScenario {
  id: string;
  name: string;
  description: string | null;
  state: GameState;
  event: BatterEvent;
  createdAt: string;
}

type Phase = 'editor' | 'preview' | 'list' | 'assign';

const ALL_DIRECTIONS: InfieldDirection[] = ['left', 'center', 'right'];
const ALL_OUTFIELD_DIRECTIONS: OutfieldDirection[] = ['left', 'center', 'right'];
const ALL_DEPTHS: OutfieldDepth[] = ['shallow', 'medium', 'deep'];
const ALL_SPEEDS = ['slow', 'medium', 'fast'] as const;
const ALL_BATTER_SPEEDS = ['slow', 'average', 'fast'] as const;

const EVENT_TYPES = [
  'groundBall', 'flyBall', 'lineDrive', 'bunt', 'steal',
  'pickoff', 'walk', 'strikeout', 'hitByPitch', 'sacrificeBunt', 'error',
] as const;

// =============================================================================
// Diamond Diagram (Interactive)
// =============================================================================

function InteractiveDiamond({
  bases,
  onToggleBase,
}: {
  bases: BaseOccupancy;
  onToggleBase: (base: 'first' | 'second' | 'third') => void;
}) {
  const baseConfig = [
    { key: 'first' as const, label: '一垒', posClass: 'absolute right-[6px] top-1/2 -translate-y-1/2' },
    { key: 'second' as const, label: '二垒', posClass: 'absolute top-[6px] left-1/2 -translate-x-1/2' },
    { key: 'third' as const, label: '三垒', posClass: 'absolute left-[6px] top-1/2 -translate-y-1/2' },
  ];

  return (
    <div className="relative w-[240px] h-[240px] mx-auto my-3">
      <div className="absolute inset-[16px] border-2 border-gray-400 bg-green-800 bg-opacity-30 rotate-45" style={{ borderRadius: '4px' }} />
      {/* Home plate */}
      <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2">
        <div className="w-[32px] h-[32px] bg-white border-2 border-gray-600" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
        <span className="text-xs text-gray-500 block text-center mt-0.5">本垒</span>
      </div>
      {baseConfig.map(({ key, label, posClass }) => (
        <div key={key} className={posClass}>
          <button
            className={`w-[32px] h-[32px] border-2 rotate-45 transition-colors cursor-pointer ${
              bases[key] ? 'bg-yellow-400 border-yellow-500 hover:bg-yellow-300' : 'bg-white border-gray-400 hover:border-green-500'
            }`}
            onClick={() => onToggleBase(key)}
            title={`点击切换${label}跑者`}
          />
          {bases[key] && <div className="absolute w-[12px] h-[12px] bg-red-500 rounded-full animate-pulse" />}
          <span className="text-xs text-gray-500 block text-center mt-0.5">{label}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Out Toggle
// =============================================================================

function OutToggle({ outs, onSet }: { outs: number; onSet: (outs: 0 | 1 | 2) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <span className="text-sm font-semibold text-gray-700">出局数</span>
      {[0, 1, 2].map(i => (
        <button
          key={i}
          className={`w-8 h-8 rounded-full border-2 transition-colors ${
            i < outs ? 'bg-red-500 border-red-600 text-white' : 'bg-white border-gray-300 hover:border-red-400'
          }`}
          onClick={() => onSet(i as 0 | 1 | 2)}
        >
          {i < outs ? '✓' : i + 1}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Main Editor Page
// =============================================================================

export default function EditorPage() {
  const [phase, setPhase] = useState<Phase>('editor');
  const [sessionId, setSessionId] = useState('');

  // State builder
  const [bases, setBases] = useState<BaseOccupancy>({ first: false, second: false, third: false });
  const [outs, setOuts] = useState<0 | 1 | 2>(0);
  const [inning, setInning] = useState(1);
  const [topInning, setTopInning] = useState(true);

  // Event builder
  const [eventType, setEventType] = useState<string>('groundBall');
  const [direction, setDirection] = useState<InfieldDirection>('center');
  const [outfieldDirection, setOutfieldDirection] = useState<OutfieldDirection>('center');
  const [depth, setDepth] = useState<OutfieldDepth>('medium');
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [batterSpeed, setBatterSpeed] = useState<'slow' | 'average' | 'fast'>('average');
  const [popUp, setPopUp] = useState(false);
  const [caught, setCaught] = useState(true);
  const [buntQuality, setBuntQuality] = useState<'good' | 'poor'>('good');
  const [stealTarget, setStealTarget] = useState<'second' | 'third' | 'home'>('second');
  const [runnerSpeed, setRunnerSpeed] = useState<'slow' | 'average' | 'fast'>('average');
  const [catcherArm, setCatcherArm] = useState<'weak' | 'average' | 'strong'>('average');
  const [pitchType, setPitchType] = useState<'fastball' | 'breaking' | 'changeup'>('fastball');
  const [pickoffTarget, setPickoffTarget] = useState<'first' | 'second' | 'third'>('first');
  const [looking, setLooking] = useState(false);
  const [wildPitch, setWildPitch] = useState(false);
  const [passedBall, setPassedBall] = useState(false);
  const [errorSeverity, setErrorSeverity] = useState<'minor' | 'major'>('minor');
  const [errorPosition, setErrorPosition] = useState<DefensivePosition>('shortstop');

  // Scenario meta
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');

  // Preview result
  const [previewResult, setPreviewResult] = useState<{ description: string; correctOptions: string[]; eventDescription: string } | null>(null);

  // Saved scenarios list
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<SavedScenario | null>(null);

  // Assign
  const [playerNicknames, setPlayerNicknames] = useState('');

  // Init session
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

  // Load scenarios on mount
  useEffect(() => {
    if (sessionId) loadScenarios();
  }, [sessionId]);

  const loadScenarios = useCallback(async () => {
    try {
      const res = await fetch(`/api/scenario?coachId=${sessionId}`);
      const data = await res.json();
      if (data.scenarios) setSavedScenarios(data.scenarios);
    } catch { /* offline or no DB */ }
  }, [sessionId]);

  // ─── Build GameState ────────────────────────────────────────────────
  const buildState = useCallback((): GameState => ({
    outs,
    bases,
    inning,
    topInning,
    score: { home: 0, away: 0 },
  }), [outs, bases, inning, topInning]);

  // ─── Build BatterEvent ──────────────────────────────────────────────
  const buildEvent = useCallback((): BatterEvent => {
    switch (eventType) {
      case 'groundBall':
        return { type: 'groundBall', direction, speed, batterSpeed };
      case 'flyBall':
        return { type: 'flyBall', depth, direction: outfieldDirection, popUp };
      case 'lineDrive':
        return { type: 'lineDrive', direction, caught };
      case 'bunt':
        return { type: 'bunt', direction, quality: buntQuality, batterSpeed };
      case 'steal':
        return { type: 'steal', targetBase: stealTarget, runnerSpeed, catcherArm, pitchType };
      case 'pickoff':
        return { type: 'pickoff', targetBase: pickoffTarget, pitcherMove: 'average', runnerReaction: 'average' };
      case 'walk':
        return { type: 'walk' };
      case 'strikeout':
        return { type: 'strikeout', looking, wildPitch, passedBall };
      case 'hitByPitch':
        return { type: 'hitByPitch' };
      case 'sacrificeBunt':
        return { type: 'sacrificeBunt', direction, batterSpeed };
      case 'error':
        return { type: 'error', fielderPosition: errorPosition, severity: errorSeverity };
      default:
        return { type: 'groundBall', direction: 'center', speed: 'medium', batterSpeed: 'average' };
    }
  }, [eventType, direction, outfieldDirection, depth, speed, batterSpeed, popUp, caught, buntQuality, stealTarget, runnerSpeed, catcherArm, pitchType, pickoffTarget, looking, wildPitch, passedBall, errorSeverity, errorPosition]);

  // ─── Preview ────────────────────────────────────────────────────────
  const handlePreview = useCallback(() => {
    const state = buildState();
    const event = buildEvent();
    const result = resolveHitBall(state, event);

    if (result.correctOptions.includes('invalidScenario')) {
      setPreviewResult({
        description: '无效局面（请检查跑者和事件组合）',
        correctOptions: [],
        eventDescription: describeEvent(event),
      });
    } else {
      setPreviewResult({
        description: result.description,
        correctOptions: result.correctOptions,
        eventDescription: describeEvent(event),
      });
    }

    setPhase('preview');
  }, [buildState, buildEvent]);

  // ─── Save ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!scenarioName.trim()) {
      alert('请输入场景名称');
      return;
    }

    const state = buildState();
    const event = buildEvent();
    const result = resolveHitBall(state, event);

    if (result.correctOptions.includes('invalidScenario')) {
      alert('无效局面，无法保存');
      return;
    }

    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: sessionId,
          name: scenarioName.trim(),
          description: scenarioDescription.trim() || null,
          state,
          event,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('保存成功!');
        loadScenarios();
        setPhase('list');
      } else {
        alert(data.error || '保存失败');
      }
    } catch {
      // Save locally if DB unavailable
      const localScenarios = JSON.parse(localStorage.getItem('diamond-iq-local-scenarios') || '[]');
      const newScenario: SavedScenario = {
        id: 'local_' + Math.random().toString(36).substring(2, 8),
        name: scenarioName.trim(),
        description: scenarioDescription.trim(),
        state,
        event,
        createdAt: new Date().toISOString(),
      };
      localScenarios.push(newScenario);
      localStorage.setItem('diamond-iq-local-scenarios', JSON.stringify(localScenarios));
      setSavedScenarios(localScenarios);
      alert('已保存到本地（数据库不可用）');
      setPhase('list');
    }
  }, [scenarioName, scenarioDescription, buildState, buildEvent, sessionId, loadScenarios]);

  // ─── Assign ──────────────────────────────────────────────────────────
  const handleAssign = useCallback(async () => {
    if (!selectedScenario) return;
    if (!playerNicknames.trim()) {
      alert('请输入球员ID列表');
      return;
    }

    const userIds = playerNicknames.trim().split(/[,，\s]+/).filter(Boolean);
    if (userIds.length === 0) {
      alert('请至少输入一个球员ID');
      return;
    }

    try {
      const res = await fetch(`/api/scenario/${selectedScenario.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });

      const data = await res.json();
      if (data.success) {
        alert(`已分配给 ${data.assignmentsCreated} 位球员`);
        setPlayerNicknames('');
      } else {
        alert(data.error || '分配失败');
      }
    } catch {
      alert('分配失败（数据库不可用）');
    }
  }, [selectedScenario, playerNicknames]);

  // ─── Delete ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (scenarioId: string) => {
    if (!confirm('确认删除此场景?')) return;

    try {
      await fetch(`/api/scenario/${scenarioId}?coachId=${sessionId}`, { method: 'DELETE' });
      loadScenarios();
    } catch {
      // Delete locally
      const localScenarios = JSON.parse(localStorage.getItem('diamond-iq-local-scenarios') || '[]');
      const updated = localScenarios.filter((s: SavedScenario) => s.id !== scenarioId);
      localStorage.setItem('diamond-iq-local-scenarios', JSON.stringify(updated));
      setSavedScenarios(updated);
    }
  }, [sessionId, loadScenarios]);

  // ─── Load scenario into editor ──────────────────────────────────────
  const handleLoadIntoEditor = useCallback((scenario: SavedScenario) => {
    setBases(scenario.state.bases);
    setOuts(scenario.state.outs);
    setInning(scenario.state.inning);
    setTopInning(scenario.state.topInning);
    setEventType(scenario.event.type);
    setScenarioName(scenario.name);
    setScenarioDescription(scenario.description || '');

    const evt = scenario.event;
    if (evt.type === 'groundBall') {
      setDirection(evt.direction);
      setSpeed(evt.speed);
      setBatterSpeed(evt.batterSpeed);
    } else if (evt.type === 'flyBall') {
      setOutfieldDirection(evt.direction);
      setDepth(evt.depth);
      setPopUp(evt.popUp);
    } else if (evt.type === 'lineDrive') {
      setDirection(evt.direction);
      setCaught(evt.caught);
    } else if (evt.type === 'bunt') {
      setDirection(evt.direction);
      setBuntQuality(evt.quality);
      setBatterSpeed(evt.batterSpeed);
    } else if (evt.type === 'steal') {
      setStealTarget(evt.targetBase);
      setRunnerSpeed(evt.runnerSpeed);
      setCatcherArm(evt.catcherArm);
      setPitchType(evt.pitchType);
    } else if (evt.type === 'pickoff') {
      setPickoffTarget(evt.targetBase);
    } else if (evt.type === 'strikeout') {
      setLooking(evt.looking);
      setWildPitch(evt.wildPitch);
      setPassedBall(evt.passedBall);
    } else if (evt.type === 'sacrificeBunt') {
      setDirection(evt.direction);
      setBatterSpeed(evt.batterSpeed);
    } else if (evt.type === 'error') {
      setErrorPosition(evt.fielderPosition);
      setErrorSeverity(evt.severity);
    }

    setPhase('editor');
  }, []);

  // ─── Toggle base ────────────────────────────────────────────────────
  const toggleBase = useCallback((base: 'first' | 'second' | 'third') => {
    setBases(prev => ({ ...prev, [base]: !prev[base] }));
  }, []);

  // ─── Render Event Config ────────────────────────────────────────────
  const renderEventConfig = () => {
    switch (eventType) {
      case 'groundBall':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">方向</label>
              <div className="flex gap-2 mt-1">
                {ALL_DIRECTIONS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${direction === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setDirection(d)}>
                    {d === 'left' ? '左' : d === 'right' ? '右' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">球速</label>
              <div className="flex gap-2 mt-1">
                {ALL_SPEEDS.map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${speed === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setSpeed(s)}>
                    {s === 'slow' ? '慢' : s === 'fast' ? '快' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">打者速度</label>
              <div className="flex gap-2 mt-1">
                {ALL_BATTER_SPEEDS.map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${batterSpeed === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setBatterSpeed(s)}>
                    {s === 'slow' ? '慢' : s === 'fast' ? '快' : '普通'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'flyBall':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">方向</label>
              <div className="flex gap-2 mt-1">
                {ALL_OUTFIELD_DIRECTIONS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${outfieldDirection === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setOutfieldDirection(d)}>
                    {d === 'left' ? '左' : d === 'right' ? '右' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">深度</label>
              <div className="flex gap-2 mt-1">
                {ALL_DEPTHS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${depth === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setDepth(d)}>
                    {d === 'shallow' ? '浅' : d === 'deep' ? '深远' : '中距'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">内野小飞球(Pop-up)</label>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${popUp ? 'bg-orange-100 border-2 border-orange-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setPopUp(!popUp)}>
                {popUp ? '是' : '否'}
              </button>
            </div>
          </div>
        );
      case 'lineDrive':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">方向</label>
              <div className="flex gap-2 mt-1">
                {ALL_DIRECTIONS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${direction === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setDirection(d)}>
                    {d === 'left' ? '左' : d === 'right' ? '右' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">被接杀</label>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${caught ? 'bg-green-100 border-2 border-green-500 font-semibold' : 'bg-red-100 border-2 border-red-500'}`}
                onClick={() => setCaught(!caught)}>
                {caught ? '接杀' : '落地'}
              </button>
            </div>
          </div>
        );
      case 'bunt':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">方向</label>
              <div className="flex gap-2 mt-1">
                {ALL_DIRECTIONS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${direction === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setDirection(d)}>
                    {d === 'left' ? '左' : d === 'right' ? '右' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">触击质量</label>
              <div className="flex gap-2 mt-1">
                <button className={`px-3 py-1.5 rounded-lg text-sm ${buntQuality === 'good' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setBuntQuality('good')}>优质</button>
                <button className={`px-3 py-1.5 rounded-lg text-sm ${buntQuality === 'poor' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setBuntQuality('poor')}>拙劣</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">打者速度</label>
              <div className="flex gap-2 mt-1">
                {ALL_BATTER_SPEEDS.map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${batterSpeed === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setBatterSpeed(s)}>
                    {s === 'slow' ? '慢' : s === 'fast' ? '快' : '普通'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'steal':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">盗垒目标</label>
              <div className="flex gap-2 mt-1">
                <button className={`px-3 py-1.5 rounded-lg text-sm ${stealTarget === 'second' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setStealTarget('second')}>二垒</button>
                <button className={`px-3 py-1.5 rounded-lg text-sm ${stealTarget === 'third' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setStealTarget('third')}>三垒</button>
                <button className={`px-3 py-1.5 rounded-lg text-sm ${stealTarget === 'home' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setStealTarget('home')}>本垒</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">跑者速度</label>
              <div className="flex gap-2 mt-1">
                {ALL_BATTER_SPEEDS.map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${runnerSpeed === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setRunnerSpeed(s)}>
                    {s === 'slow' ? '慢' : s === 'fast' ? '快' : '普通'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">捕手臂力</label>
              <div className="flex gap-2 mt-1">
                {['weak', 'average', 'strong'].map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${catcherArm === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setCatcherArm(s as 'weak' | 'average' | 'strong')}>
                    {s === 'weak' ? '弱' : s === 'strong' ? '强' : '普通'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">投球类型</label>
              <div className="flex gap-2 mt-1">
                {['fastball', 'breaking', 'changeup'].map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${pitchType === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setPitchType(s as 'fastball' | 'breaking' | 'changeup')}>
                    {s === 'fastball' ? '速球' : s === 'breaking' ? '变化球' : '变速球'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'pickoff':
        return (
          <div>
            <label className="text-sm font-medium text-gray-700">牵制目标</label>
            <div className="flex gap-2 mt-1">
              <button className={`px-3 py-1.5 rounded-lg text-sm ${pickoffTarget === 'first' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setPickoffTarget('first')}>一垒</button>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${pickoffTarget === 'second' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setPickoffTarget('second')}>二垒</button>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${pickoffTarget === 'third' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setPickoffTarget('third')}>三垒</button>
            </div>
          </div>
        );
      case 'strikeout':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">看牌三振</label>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${looking ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setLooking(!looking)}>{looking ? '看牌' : '挥空'}</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">暴投</label>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${wildPitch ? 'bg-orange-100 border-2 border-orange-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setWildPitch(!wildPitch)}>{wildPitch ? '是' : '否'}</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">漏接</label>
              <button className={`px-3 py-1.5 rounded-lg text-sm ${passedBall ? 'bg-orange-100 border-2 border-orange-500 font-semibold' : 'bg-white border border-gray-300'}`}
                onClick={() => setPassedBall(!passedBall)}>{passedBall ? '是' : '否'}</button>
            </div>
          </div>
        );
      case 'sacrificeBunt':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">方向</label>
              <div className="flex gap-2 mt-1">
                {ALL_DIRECTIONS.map(d => (
                  <button key={d} className={`px-3 py-1.5 rounded-lg text-sm ${direction === d ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setDirection(d)}>
                    {d === 'left' ? '左' : d === 'right' ? '右' : '中'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">打者速度</label>
              <div className="flex gap-2 mt-1">
                {ALL_BATTER_SPEEDS.map(s => (
                  <button key={s} className={`px-3 py-1.5 rounded-lg text-sm ${batterSpeed === s ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                    onClick={() => setBatterSpeed(s)}>
                    {s === 'slow' ? '慢' : s === 'fast' ? '快' : '普通'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">失误位置</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={errorPosition} onChange={e => setErrorPosition(e.target.value as DefensivePosition)}>
                {Object.entries(POSITION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">严重程度</label>
              <div className="flex gap-2 mt-1">
                <button className={`px-3 py-1.5 rounded-lg text-sm ${errorSeverity === 'minor' ? 'bg-amber-100 border-2 border-amber-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setErrorSeverity('minor')}>轻微</button>
                <button className={`px-3 py-1.5 rounded-lg text-sm ${errorSeverity === 'major' ? 'bg-red-100 border-2 border-red-500 font-semibold' : 'bg-white border border-gray-300'}`}
                  onClick={() => setErrorSeverity('major')}>严重</button>
              </div>
            </div>
          </div>
        );
      case 'walk':
      case 'hitByPitch':
        return <div className="text-sm text-gray-500">无需额外配置</div>;
      default:
        return null;
    }
  };

  // ─── Editor Screen ────────────────────────────────────────────────
  if (phase === 'editor') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-3">场景编辑器</h1>

        {/* Scenario name */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">场景名称</label>
          <input type="text" value={scenarioName} onChange={e => setScenarioName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="例：一三垒有人地滚球" />
          <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">描述（可选）</label>
          <input type="text" value={scenarioDescription} onChange={e => setScenarioDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="训练重点：双杀判断" />
        </div>

        {/* Diamond + runners */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-1">垒上跑者（点击垒包切换）</div>
          <InteractiveDiamond bases={bases} onToggleBase={toggleBase} />
          <div className="flex items-center justify-between mt-1">
            <OutToggle outs={outs} onSet={setOuts} />
            <div className="flex items-center gap-2">
              <select className="border border-gray-300 rounded px-2 py-1 text-sm" value={inning}
                onChange={e => setInning(parseInt(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9].map(i => <option key={i} value={i}>{i}局</option>)}
              </select>
              <button className={`px-3 py-1 rounded-lg text-sm ${topInning ? 'bg-blue-100 border-2 border-blue-500' : 'bg-red-100 border-2 border-red-500'}`}
                onClick={() => setTopInning(!topInning)}>
                {topInning ? '上半' : '下半'}
              </button>
            </div>
          </div>
        </div>

        {/* Event type selection */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">击球事件</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {EVENT_TYPES.map(t => (
              <button key={t} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                eventType === t ? 'bg-amber-100 border-2 border-amber-500 text-amber-800' : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-300'
              }`} onClick={() => setEventType(t)}>
                {t === 'groundBall' ? '地滚球' : t === 'flyBall' ? '高飞球' : t === 'lineDrive' ? '平飞球' :
                  t === 'bunt' ? '触击' : t === 'steal' ? '盗垒' : t === 'pickoff' ? '牵制' :
                  t === 'walk' ? '保送' : t === 'strikeout' ? '三振' : t === 'hitByPitch' ? '触身球' :
                  t === 'sacrificeBunt' ? '牺牲触击' : '失误'}
              </button>
            ))}
          </div>
          {renderEventConfig()}
        </div>

        {/* Current config summary */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3">
          <div className="text-sm font-semibold text-yellow-800 mb-1">当前配置</div>
          <div className="text-sm text-yellow-700">
            {inning}局{topInning ? '上' : '下'} · {outs}出局 ·
            {bases.first ? '一' : ''}{bases.second ? '二' : ''}{bases.third ? '三' : ''}{(!bases.first && !bases.second && !bases.third) ? '垒空' : '垒有人'}
            · {describeEvent(buildEvent())}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm"
            onClick={handlePreview}>
            预览结果
          </button>
          <button className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm"
            onClick={handleSave}>
            保存场景
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button className="text-sm text-gray-500 hover:text-amber-600" onClick={() => { setPhase('list'); loadScenarios(); }}>
            查看已保存场景 →
          </button>
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    );
  }

  // ─── Preview Screen ────────────────────────────────────────────────
  if (phase === 'preview' && previewResult) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-3">场景预览</h1>

        {/* State summary */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="text-sm font-semibold text-gray-700 mb-1">
            {inning}局{topInning ? '上' : '下'} · {outs}出局 ·
            {bases.first ? '一' : ''}{bases.second ? '二' : ''}{bases.third ? '三' : ''}{(!bases.first && !bases.second && !bases.third) ? '垒空' : '垒有人'}
          </div>
          <InteractiveDiamond bases={bases} onToggleBase={toggleBase} />
        </div>

        {/* Event */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3 text-center font-medium text-yellow-800">
          {previewResult.eventDescription}
        </div>

        {/* Resolution result */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          {previewResult.correctOptions.length === 0 ? (
            <div className="text-center text-red-600 font-semibold">无效局面</div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">引擎解析结果</div>
              <p className="text-sm text-gray-800 leading-relaxed mb-3">{previewResult.description}</p>
              <div className="text-sm font-semibold text-gray-700 mb-1">正确防守选项</div>
              <div className="space-y-1">
                {previewResult.correctOptions.map(opt => (
                  <div key={opt} className="text-sm bg-green-50 border border-green-200 rounded px-2 py-1">
                    <span className="font-semibold text-green-700">{OPTION_LABELS[opt] || getDistractorLabel(opt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold"
          onClick={() => setPhase('editor')}>
          ← 返回编辑
        </button>
      </div>
    );
  }

  // ─── List Screen ──────────────────────────────────────────────────
  if (phase === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-3">已保存场景</h1>

        {savedScenarios.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            暂无保存的场景。返回编辑器创建新场景。
          </div>
        ) : (
          <div className="space-y-2">
            {savedScenarios.map(s => (
              <div key={s.id} className="bg-white rounded-lg shadow p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">{s.name}</div>
                    {s.description && <div className="text-xs text-gray-500 mt-0.5">{s.description}</div>}
                    <div className="text-xs text-gray-600 mt-1">
                      {s.state.inning}局 · {s.state.outs}出局 ·
                      {s.state.bases.first ? '一' : ''}{s.state.bases.second ? '二' : ''}{s.state.bases.third ? '三' : ''}
                      · {describeEvent(s.event as BatterEvent)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-200"
                    onClick={() => { setSelectedScenario(s); setPhase('assign'); }}>
                    分配给球员
                  </button>
                  <button className="px-3 py-1.5 bg-blue-100 border border-blue-300 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-200"
                    onClick={() => handleLoadIntoEditor(s)}>
                    编辑
                  </button>
                  <button className="px-3 py-1.5 bg-red-100 border border-red-300 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-200"
                    onClick={() => handleDelete(s.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold mt-4"
          onClick={() => setPhase('editor')}>
          + 创建新场景
        </button>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    );
  }

  // ─── Assign Screen ──────────────────────────────────────────────────
  if (phase === 'assign' && selectedScenario) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-center mb-3">分配场景</h1>

        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="font-semibold text-gray-800">{selectedScenario.name}</div>
          <div className="text-sm text-gray-600 mt-1">
            {selectedScenario.state.inning}局 · {selectedScenario.state.outs}出局 ·
            {selectedScenario.state.bases.first ? '一' : ''}{selectedScenario.state.bases.second ? '二' : ''}{selectedScenario.state.bases.third ? '三' : ''}
            · {describeEvent(selectedScenario.event as BatterEvent)}
          </div>
          {selectedScenario.description && (
            <div className="text-sm text-gray-500 mt-1">{selectedScenario.description}</div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">球员用户ID（逗号分隔）</label>
          <textarea
            value={playerNicknames}
            onChange={e => setPlayerNicknames(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="user_abc123, user_def456"
            rows={3}
          />
          <div className="text-xs text-gray-500 mt-1">输入球员的用户ID，用逗号或空格分隔</div>
        </div>

        <button className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold"
          onClick={handleAssign}>
          分配
        </button>

        <button className="w-full py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold mt-2"
          onClick={() => setPhase('list')}>
          ← 返回列表
        </button>
      </div>
    );
  }

  // Fallback
  return <div className="p-8 text-center">加载中...</div>;
}