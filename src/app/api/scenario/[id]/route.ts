import { NextRequest, NextResponse } from 'next/server';

// In-memory scenario store (shared with scenario/route.ts via module scope)
// Assignments are also stored in memory since we have no database.

const assignments: Map<string, Set<string>> = new Map(); // scenarioId -> Set<userId>

// POST /api/scenario/[id]/assign — Assign scenario to players
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const scenarioId = params.id;
  const body = await request.json();
  const { userIds } = body;

  if (!userIds || !Array.isArray(userIds)) {
    return NextResponse.json({ error: '缺少userIds数组' }, { status: 400 });
  }

  if (!assignments.has(scenarioId)) {
    assignments.set(scenarioId, new Set());
  }

  const assigned = assignments.get(scenarioId)!;
  let created = 0;
  for (const userId of userIds) {
    if (!assigned.has(userId)) {
      assigned.add(userId);
      created++;
    }
  }

  return NextResponse.json({ success: true, assignmentsCreated: created });
}

// DELETE /api/scenario/[id] — Delete a custom scenario (in-memory)
// Note: client-side editor handles localStorage deletion independently.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const scenarioId = params.id;

  // Remove assignments
  assignments.delete(scenarioId);

  return NextResponse.json({ success: true });
}