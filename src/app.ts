import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import databasePlugin from './plugins/database';
import jwtPlugin from './plugins/jwt';
import swaggerPlugin from './plugins/swagger';
import schedulerPlugin from './plugins/scheduler';

import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/products.routes';
import trackingRoutes from './modules/tracking/tracking.routes';
import scraperRoutes from './modules/scraper/scraper.routes';

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    genReqId: () => crypto.randomUUID(),
  });

  fastify.register(helmet, { contentSecurityPolicy: false });
  fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({ error: 'Too many requests, slow down' }),
  });

  fastify.register(swaggerPlugin);
  fastify.register(databasePlugin);
  fastify.register(jwtPlugin);
  fastify.register(schedulerPlugin);

  fastify.get('/health', { schema: { tags: ['System'] } }, async () => ({
    status: 'ok',
    service: 'amazon-price-tracker',
    timestamp: new Date().toISOString(),
  }));

  fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  fastify.register(productRoutes, { prefix: '/api/v1/products' });
  fastify.register(trackingRoutes, { prefix: '/api/v1/tracking' });
  fastify.register(scraperRoutes, { prefix: '/api/v1/scraper' });

  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? error.statusCode ?? 500;
    request.log.error({ err: error }, error.message);
    reply.status(statusCode).send({
      error: error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  });

  return fastify;
}
