import type { FastifyInstance } from 'fastify';
import { getUserAlerts } from './alerts.service';

export default async function alertRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      tags: ['Alerts'],
      security: [{ bearerAuth: [] }],
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    reply.send(await getUserAlerts(fastify.db, request.user.sub));
  });
}
