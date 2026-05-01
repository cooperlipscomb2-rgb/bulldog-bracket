// api/live.js — Server-Sent Events for live user count
// Uses a simple in-memory counter (resets on cold start, good enough for Vercel)

let connections = new Set();

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const encoder = new TextEncoder();
  let intervalId;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      connections.add(controller);

      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ count: connections.size })}\n\n`)
          );
        } catch (e) {
          cleanup();
        }
      };

      // Send immediately then every 5 seconds
      send();
      intervalId = setInterval(send, 5000);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(intervalId);
        connections.delete(controller);
        try { controller.close(); } catch(e) {}
      }

      req.signal?.addEventListener('abort', cleanup);
    },
    cancel() {
      clearInterval(intervalId);
      connections.delete(this);
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
