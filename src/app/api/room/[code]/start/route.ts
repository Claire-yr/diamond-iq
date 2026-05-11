import { NextRequest, NextResponse } from 'next/server';
import { getRoom, startScenario, generateCooperativeScenario } from '@/lib/roomStore';
import { describeEvent } from '@/lib/engine';

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const body = await request.json();
  const { coachId } = body;

  if (!coachId) {
    return NextResponse.json({ error: '缺少教练ID' }, { status: 400 });
  }

  const room = getRoom(code);
  if (!room) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 });
  }
  if (room.coachId !== coachId) {
    return NextResponse.json({ error: '只有教练可以开始局面' }, { status: 403 });
  }

  // Validate all players have positions
  const unpositioned = room.players.filter(p => p.position === null);
  if (unpositioned.length > 0) {
    return NextResponse.json({
      error: `有${unpositioned.length}位球员未选择位置：${unpositioned.map(p => p.nickname).join(', ')}`,
    }, { status: 400 });
  }

  // Get all player positions
  const playerPositions = room.players.map(p => p.position!);

  // Generate cooperative scenario with per-position options
  const scenario = generateCooperativeScenario(playerPositions);
  if (!scenario) {
    return NextResponse.json({ error: '无法生成适合当前位置的局面，请重试' }, { status: 500 });
  }

  const result = startScenario(code, {
    state: scenario.state,
    event: scenario.event,
    result: scenario.result,
    perPositionOptions: scenario.perPositionOptions,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Return scenario info to coach (no correct answers leaked)
  return NextResponse.json({
    success: true,
    eventDescription: describeEvent(scenario.event),
    description: scenario.result.description,
  });
}