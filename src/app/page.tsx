'use client';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">Diamond IQ</h1>
      <p className="text-lg text-gray-600 mb-8">
        棒球场面决策训练平台
      </p>

      {/* Training modes */}
      <div className="max-w-md w-full mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center">训练模式</h2>
        <div className="space-y-3">
          <a href="/drill" className="block p-4 bg-indigo-600 text-white rounded-lg text-center hover:bg-indigo-700 font-semibold">
            综合训练（闪卡）
          </a>
          <a href="/game" className="block p-4 bg-amber-600 text-white rounded-lg text-center hover:bg-amber-700 font-semibold">
            比赛模拟器
          </a>
          <a href="/editor" className="block p-4 bg-violet-600 text-white rounded-lg text-center hover:bg-violet-700 font-semibold">
            场景编辑器
          </a>
        </div>
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
