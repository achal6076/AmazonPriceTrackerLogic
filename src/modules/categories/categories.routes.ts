import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCategories, addCategory, deleteCategory } from './categories.service';

const AddCategorySchema = z.object({
  name:        z.string().min(1).max(255),
  url:         z.string().url().optional(),
  description: z.string().max(500).optional(),
});

export default async function categoryRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: { tags: ['Categories'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const user = (request as any).user as { id: string };
    reply.send(await getCategories(fastify.db, user.id));
  });

  fastify.post('/', {
    schema: {
      tags: ['Categories'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:        { type: 'string' },
          url:         { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const user  = (request as any).user as { id: string };
    const input = AddCategorySchema.parse(request.body);
    reply.status(201).send(await addCategory(fastify.db, user.id, input));
  });

  fastify.delete('/:id', {
    schema: {
      tags: ['Categories'],
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const user = (request as any).user as { id: string };
    const { id } = request.params as { id: string };
    await deleteCategory(fastify.db, user.id, id);
    reply.status(204).send();
  });
}
