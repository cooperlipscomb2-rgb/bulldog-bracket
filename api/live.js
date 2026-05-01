// api/live.js — Server-Sent Events for live user count
// Tracks unique session IDs so refresh doesn't inflate the count

const sessions = new Map(); // sessionId -> { controller, intervalId }

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sid');

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sid' }), { status: 400 });
  }

  // Close any existing connection for this session (handles refresh)
  if (sessions.has(sessionId)) {
    const old = sessions.get(sessionId);
    clearInterval(old.intervalId);
    try { old.controller.close(); } catch(e) {}
    sessions.delete(sessionId);
  }

  const encoder = new TextEncoder();
  let intervalId;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      sessions.set(sessionId, { controller, intervalId: null });

      const broadcast = () => {
        // Send current count to all active sessions
        const count = sessions.size;
        for (const [sid, session] of sessions.entries()) {
          try {
            session.controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ count })}\n\n`)
            );
          } catch(e) {
            // Dead connection — clean it up
            clearInterval(session.intervalId);
            sessions.delete(sid);
          }
        }
      };

      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ count: sessions.size })}\n\n`)
          );
        } catch(e) { cleanup(); }
      };

      send();
      intervalId = setInterval(send, 5000);
      sessions.get(sessionId).intervalId = intervalId;

      // Broadcast updated count to everyone when someone joins
      broadcast();

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(intervalId);
        sessions.delete(sessionId);
        // Broadcast updated count to remaining sessions
        const count = sessions.size;
        for (const [sid, session] of sessions.entries()) {
          try {
            session.controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ count })}\n\n`)
            );
          } catch(e) {
            clearInterval(session.intervalId);
            sessions.delete(sid);
          }
        }
        try { controller.close(); } catch(e) {}
      }

      req.signal?.addEventListener('abort', cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
