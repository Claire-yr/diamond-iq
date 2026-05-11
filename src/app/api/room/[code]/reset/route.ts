import { NextRequest, NextResponse } from 'next/server';
import { getRoom, resetScenario } from '@/lib/roomStore';

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
    return NextResponse.json({ error: '只有教练可以重置局面' }, { status: 403 });
  }

  const result = resetScenario(code);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}