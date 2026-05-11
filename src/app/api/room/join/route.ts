import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/roomStore';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, sessionId, nickname } = body;

  if (!code || !sessionId || !nickname) {
    return NextResponse.json({ error: '缺少必要参数（code, sessionId, nickname）' }, { status: 400 });
  }

  const result = joinRoom(code.toUpperCase(), sessionId, nickname);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    code: result.room!.code,
    players: result.room!.players.map(p => ({
      nickname: p.nickname,
      position: p.position,
      sessionId: p.sessionId,
    })),
  });
}