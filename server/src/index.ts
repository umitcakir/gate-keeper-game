import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { config } from './config.ts';
import { GameError } from './game.ts';
import { warmUp } from './llm.ts';
import { adminRoutes } from './routes/admin.ts';
import { gameRoutes } from './routes/game.ts';

const app = Fastify({ logger: { level: config.production ? 'warn' : 'info' }, bodyLimit: 16 * 1024 });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof GameError) return reply.code(err.status).send({ error: err.message });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
  app.log.error(err);
  return reply.code(500).send({ error: 'internal error' });
});

await app.register(gameRoutes);
await app.register(adminRoutes);

if (existsSync(config.clientDist)) {
  await app.register(fastifyStatic, { root: config.clientDist });
  app.get('/admin', (_req, reply) => reply.sendFile('admin.html'));
} else {
  app.log.warn('client/dist not found — run `npm run build`, or use `npm run dev` for the Vite dev server');
}

await app.listen({ port: config.port, host: config.host });
console.log(`\n  Gate of Gulyabani on http://localhost:${config.port}  (admin: /admin)\n  LLM: ${config.llmModel} @ ${config.llmBaseUrl}`);

warmUp().then((r) =>
  console.log(r.turn ? `  LLM warm-up OK in ${r.latencyMs} ms` : `  ⚠ LLM warm-up FAILED: ${r.error} — is LM Studio running with ${config.llmModel}?`),
);
