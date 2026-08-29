import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/health', async () => ({
  status: 'ok',
  service: 'futureme-api',
  timestamp: new Date().toISOString(),
}));

app.get('/v1', async () => ({
  service: 'FutureMe API',
  version: 'v1',
  status: 'ready',
}));

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
