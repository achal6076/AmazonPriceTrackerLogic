import type { FastifyInstance } from 'fastify';
import { getDashboardStats } from './admin.service';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.requireAdmin);

  fastify.get('/dashboard/stats', {
    schema: {
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
    },
  }, async (_request, reply) => {
    reply.send(await getDashboardStats(fastify.db));
  });
}
