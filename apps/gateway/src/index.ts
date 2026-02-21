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
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
    },
  },
  ajv: {
    customOptions: {
      removeAdditional: true,
      useDefaults: true,
      coerceTypes: true,
      allErrors: true,
    },
  },
});

const start = async () => {
  try {
    // Security Middlewares
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "validator.swagger.io"],
          scriptSrc: ["'self'", "https: 'unsafe-inline'"],
        },
      },
    });

    await fastify.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      errorResponseBuilder: (request, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${context.after}.`,
      }),
    });

    // Documentation
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Reality Firewall v3 Gateway',
          description: 'Autonomous Risk Orchestration API - Production Grade',
          version: '3.0.0',
        },
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              name: 'X-API-KEY',
              in: 'header',
            },
          },
        },
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });

    // Routes
    await fastify.register(riskRoutes, { prefix: '/api/v1' });

    // Health Check
    fastify.get('/health', {
      schema: {
        description: 'Health check endpoint',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    }, async () => {
      return { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '3.0.0'
      };
    });

    // Global Error Handler
    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);
      if (error.validation) {
        reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
          details: error.validation,
        });
        return;
      }
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
      });
    });

    const port = Number(process.env.PORT) || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`\n🚀 Reality Firewall v3 Gateway running at http://localhost:${port}`);
    console.log(`📚 API Documentation available at http://localhost:${port}/docs\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
