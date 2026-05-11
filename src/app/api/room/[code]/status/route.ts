import { NextRequest } from 'next/server';
import { getRoom, subscribeToRoom, checkDeadline, getPerPositionOptionsPublic } from '@/lib/roomStore';

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();

  const room = getRoom(code);
  if (!room) {
    return new Response('Room not found', { status: 404 });
  }

  // Check deadline on each poll (handles auto-timeout)
  checkDeadline(code);

  // Set up SSE response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state immediately
      const currentRoom = getRoom(code);
      if (currentRoom) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(serializeRoom(currentRoom))}\n\n`));
      }

      // Subscribe to future updates
      const unsubscribe = subscribeToRoom(code, (updatedRoom) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(serializeRoom(updatedRoom))}\n\n`));
        } catch {
          unsubscribe();
        }
      });

      // Keep-alive: send a comment every 15 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive);
          unsubscribe();
        }
      }, 15000);

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function serializeRoom(room: NonNullable<ReturnType<typeof getRoom>>) {
  if (!room) return null;
  return {
    code: room.code,
    coachId: room.coachId,
    phase: room.phase,
    players: room.players.map(p => ({
      sessionId: p.sessionId,
      nickname: p.nickname,
      position: p.position,
      hasSubmitted: p.submission !== null,
    })),
    scenario: room.scenario ? {
      state: room.scenario.state,
      event: room.scenario.event,
      perPositionOptions: getPerPositionOptionsPublic(room.scenario.perPositionOptions),
      startedAt: room.scenario.startedAt,
      deadline: room.scenario.deadline,
    } : null,
    analysis: room.analysis ? {
      playerResults: room.analysis.playerResults.map(r => ({
        nickname: r.nickname,
        position: r.position,
        chosenOption: r.chosenOption,
        correct: r.correct,
        correctAnswer: r.correctAnswer,
        reactionTime: r.reactionTime,
      })),
      bestPlayDescription: room.analysis.bestPlayDescription,
      collaborativeAnalysis: room.analysis.collaborativeAnalysis,
      optimalPath: room.analysis.optimalPath,
      actualPath: room.analysis.actualPath,
      teamOutcome: room.analysis.teamOutcome,
    } : null,
    createdAt: room.createdAt,
  };
}