'use client';

import { useState } from 'react';

export default function Home() {
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateRoom = async () => {
    setCreating(true);
    // Get or create session ID from cookie
    const existing = document.cookie.split('; ').find(c => c.startsWith('diamond-iq-session='));
    let sessionId: string;
    if (existing) {
      sessionId = existing.split('=')[1];
    } else {
      sessionId = 'user_' + Math.random().toString(36).substring(2, 10);
      document.cookie = `diamond-iq-session=${sessionId}; path=/; max-age=86400`;
    }

    const res = await fetch('/api/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachId: sessionId }),
    });

    const data = await res.json();
    if (data.code) {
      window.location.href = `/room/${data.code}?coach=true`;
    } else {
      alert(data.error || '创建失败');
      setCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) return;
    window.location.href = `/room/${joinCode.trim().toUpperCase()}`;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">Diamond IQ</h1>
      <p className="text-lg text-gray-600 mb-8">
        棒球场面决策训练平台
      </p>

      {/* Room section */}
      <div className="max-w-md w-full mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">协同训练</h2>
        <div className="space-y-3">
          {/* Create room */}
          <button
            className="w-full p-4 bg-blue-600 text-white rounded-lg text-center hover:bg-blue-700 font-semibold disabled:opacity-50"
            disabled={creating}
            onClick={handleCreateRoom}
          >
            {creating ? '创建中...' : '创建房间（教练）'}
          </button>

          {/* Join room */}
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-3 text-center font-mono text-lg focus:border-green-500 focus:outline-none uppercase"
              placeholder="输入6位房间码"
              maxLength={6}
            />
            <button
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
              disabled={joinCode.length < 6}
              onClick={handleJoinRoom}
            >
              加入房间
            </button>
          </div>
        </div>
      </div>

      {/* Solo drill */}
      <div className="max-w-md w-full mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">单人训练</h2>
        <div className="space-y-3">
          <a href="/drill" className="block p-4 bg-indigo-600 text-white rounded-lg text-center hover:bg-indigo-700 font-semibold">
            综合训练（闪卡）
          </a>
          <a href="/batting-inning" className="block p-4 bg-emerald-600 text-white rounded-lg text-center hover:bg-emerald-700 font-semibold">
            半局模拟
          </a>
          <a href="/game" className="block p-4 bg-amber-600 text-white rounded-lg text-center hover:bg-amber-700 font-semibold">
            完整比赛
          </a>
        </div>
      </div>

      {/* Coach tools */}
      <div className="max-w-md w-full mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">教练工具</h2>
        <a href="/editor" className="block p-4 bg-violet-600 text-white rounded-lg text-center hover:bg-violet-700 font-semibold">
          场景编辑器
        </a>
      </div>

      {/* Position training */}
      <h2 className="text-xl font-semibold text-gray-700 mb-4">专项位置训练</h2>
      <div className="grid grid-cols-3 gap-3 max-w-md w-full">
        {[
          { pos: 'pitcher', label: '投手' },
          { pos: 'catcher', label: '捕手' },
          { pos: 'firstBase', label: '一垒手' },
          { pos: 'secondBase', label: '二垒手' },
          { pos: 'thirdBase', label: '三垒手' },
          { pos: 'shortstop', label: '游击手' },
          { pos: 'leftField', label: '左外场手' },
          { pos: 'centerField', label: '中外场手' },
          { pos: 'rightField', label: '右外场手' },
        ].map(({ pos, label }) => (
          <a
            key={pos}
            href={`/train/${encodeURIComponent(label)}`}
            className="block p-3 bg-white border-2 border-gray-200 rounded-lg text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
          >
            <div className="font-semibold text-gray-800">{label}</div>
            <div className="text-xs text-gray-500">{pos}</div>
          </a>
        ))}
      </div>
    </main>
  );
}