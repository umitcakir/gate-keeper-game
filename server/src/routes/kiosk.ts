import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import * as store from '../db.ts';

const MAX_FAILS = 5;
const LOCK_MS = 60_000;

// Staff exit for the kiosk launcher (server/src/kiosk/launcher.ts). It reopens the browser whenever it is closed
// (Alt+F4 etc.), and stops only when the server exits, so the right PIN shuts the server down cleanly.
// Only registered when the launcher started the server (KIOSK=1).
export async function kioskRoutes(app: FastifyInstance) {
  if (!config.kiosk) return;
  let fails = 0;
  let lockedUntil = 0;

  app.post<{ Body: { pin?: string } }>('/api/kiosk/exit', async (req, reply) => {
    if (Date.now() < lockedUntil) return reply.code(429).send({ error: 'too many attempts' });
    if (String(req.body?.pin ?? '') !== config.kioskExitPin) {
      if (++fails >= MAX_FAILS) {
        fails = 0;
        lockedUntil = Date.now() + LOCK_MS;
      }
      return reply.code(403).send({ error: 'wrong PIN' });
    }
    console.log('\n  Kiosk exit requested by staff. Shutting down.');
    setTimeout(() => void app.close().finally(() => {
      store.db.close();
      process.exit(0);
    }), 200);
    return { ok: true };
  });
}
