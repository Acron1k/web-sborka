import { tripListener } from '@/lib/server/listener';
import { badRequest, isUuid } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      send('event: hello\ndata: {}\n\n');
      const unsubscribe = await tripListener.subscribe(tripId, (table) => {
        send(`event: change\ndata: ${JSON.stringify({ table })}\n\n`);
      });
      // Клиент мог отвалиться, пока ждали подписку (окно реконнекта БД) —
      // abort-листенер ниже уже не сработает, прибираемся сами
      if (request.signal.aborted) {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
        return;
      }
      const heartbeat = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
      };
      // клиент отвалился — прибираемся
      request.signal.addEventListener('abort', () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
