import { NextRequest, NextResponse } from 'next/server';
import { submitAnswer, checkDeadline } from '@/lib/roomStore';

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const body = await request.json();
  const { sessionId, chosenOption } = body;

  if (!sessionId || !chosenOption) {
    return NextResponse.json({ error: '缺少必要参数（sessionId, chosenOption）' }, { status: 400 });
  }

  // Check deadline first
  checkDeadline(code);

  const result = submitAnswer(code, sessionId, chosenOption);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    correct: result.correct,
  });
}