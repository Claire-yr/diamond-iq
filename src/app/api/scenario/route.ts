import { NextRequest, NextResponse } from 'next/server';

// POST /api/scenario — Create a custom scenario (stored in server memory)
// The editor page also saves locally via localStorage as backup.

const serverScenarios: Map<string, any[]> = new Map();

// POST /api/scenario — Create a custom scenario
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { coachId, name, description, state, event } = body;

  if (!coachId || !name || !state || !event) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  const scenario = {
    id: 'server_' + Math.random().toString(36).substring(2, 8),
    coachId,
    name,
    description: description || null,
    state,
    event,
    createdAt: new Date().toISOString(),
  };

  const list = serverScenarios.get(coachId) || [];
  list.push(scenario);
  serverScenarios.set(coachId, list);

  return NextResponse.json({ success: true, scenario });
}

// GET /api/scenario?coachId=... — List coach's scenarios
export async function GET(request: NextRequest) {
  const coachId = request.nextUrl.searchParams.get('coachId');

  if (!coachId) {
    return NextResponse.json({ error: '缺少coachId' }, { status: 400 });
  }

  const scenarios = serverScenarios.get(coachId) || [];
  return NextResponse.json({ scenarios });
}