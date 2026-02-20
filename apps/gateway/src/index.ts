import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import * as dotenv from 'dotenv';
import { riskRoutes } from './routes/risk';

dotenv.config();

const fastify = Fastify({
  logger: true,
});

const start = async () => {
  try {
    // Security Middlewares
    await fastify.register(helmet);
    await fastify.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    });
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Documentation
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Reality Firewall v3 Gateway',
          description: 'Autonomous Risk Orchestration API',
          version: '3.0.0',
        },
      },
    });
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
    });

    // Routes
    await fastify.register(riskRoutes, { prefix: '/api/v1' });

    // Health Check
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    const port = Number(process.env.PORT) || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Gateway running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
