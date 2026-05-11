import { NextRequest, NextResponse } from 'next/server';
import { createRoom } from '@/lib/roomStore';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const coachId = body.coachId;

  if (!coachId) {
    return NextResponse.json({ error: '缺少教练ID' }, { status: 400 });
  }

  const room = createRoom(coachId);

  return NextResponse.json({
    code: room.code,
    coachId: room.coachId,
    createdAt: room.createdAt,
  });
}