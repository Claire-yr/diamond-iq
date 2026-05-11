import { NextRequest, NextResponse } from 'next/server';
import { setPlayerPosition } from '@/lib/roomStore';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, sessionId, position } = body;

  if (!code || !sessionId || !position) {
    return NextResponse.json({ error: '缺少必要参数（code, sessionId, position）' }, { status: 400 });
  }

  const result = setPlayerPosition(code.toUpperCase(), sessionId, position);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}