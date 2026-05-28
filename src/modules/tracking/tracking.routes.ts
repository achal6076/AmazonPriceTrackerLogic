import type { FastifyInstance } from 'fastify';
import { StartTrackingSchema, UpdateTrackingSchema } from './tracking.schemas';
import { getUserTracking, startTracking, updateTracking, stopTracking } from './tracking.service';

export default async function trackingRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/', {
    schema: { tags: ['Tracking'], security: [{ bearerAuth: [] }] },
    ...auth,
  }, async (request, reply) => {
    reply.send(await getUserTracking(fastify.db, request.user.sub));
  });

  fastify.post('/', {
    schema: {
      tags: ['Tracking'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['product_id'],
        properties: {
          product_id: { type: 'string', format: 'uuid' },
          target_price: { type: 'number', minimum: 0 },
        },
      },
    },
    ...auth,
  }, async (request, reply) => {
    const input = StartTrackingSchema.parse(request.body);
    reply.status(201).send(await startTracking(fastify.db, request.user.sub, input));
  });

  fastify.patch('/:id', {
    schema: {
      tags: ['Tracking'],
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          target_price: { type: ['number', 'null'], minimum: 0 },
          is_active: { type: 'boolean' },
        },
      },
    },
    ...auth,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateTrackingSchema.parse(request.body);
    reply.send(await updateTracking(fastify.db, request.user.sub, id, input));
  });

  fastify.delete('/:id', {
    schema: {
      tags: ['Tracking'],
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    ...auth,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await stopTracking(fastify.db, request.user.sub, id);
    reply.status(204).send();
  });
}
