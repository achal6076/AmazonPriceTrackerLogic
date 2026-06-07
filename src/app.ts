import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import databasePlugin from './plugins/database';
import jwtPlugin from './plugins/jwt';
import swaggerPlugin from './plugins/swagger';
import schedulerPlugin from './plugins/scheduler';
import mailerPlugin from './plugins/mailer';
import whatsappPlugin from './plugins/whatsapp';

import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/products.routes';
import trackingRoutes from './modules/tracking/tracking.routes';
import scraperRoutes from './modules/scraper/scraper.routes';
import alertRoutes from './modules/alerts/alerts.routes';
import categoryRoutes from './modules/categories/categories.routes';
import adminRoutes from './modules/admin/admin.routes';

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
  fastify.register(cors, {
    origin: process.env.APP_URL ?? true,
    credentials: true,
  });
  fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({ error: 'Too many requests, slow down' }),
  });

  fastify.register(swaggerPlugin);
  fastify.register(databasePlugin);
  fastify.register(jwtPlugin);
  fastify.register(mailerPlugin);
  fastify.register(whatsappPlugin);
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
  fastify.register(alertRoutes,    { prefix: '/api/v1/alerts' });
  fastify.register(categoryRoutes, { prefix: '/api/v1/categories' });
  fastify.register(adminRoutes,    { prefix: '/api/v1/admin' });

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
