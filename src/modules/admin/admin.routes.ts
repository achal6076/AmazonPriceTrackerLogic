import type { FastifyInstance } from 'fastify';
import { getDashboardStats, getUsers, setUserRole } from './admin.service';
import { ListUsersQuerySchema, UpdateUserRoleSchema } from './admin.schemas';

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

  fastify.get('/users', {
    schema: {
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const query = ListUsersQuerySchema.parse(request.query);
    reply.send(await getUsers(fastify.db, query));
  });

  fastify.patch('/users/:id/role', {
    schema: {
      tags: ['Admin'],
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['role'],
        properties: { role: { type: 'string', enum: ['user', 'admin'] } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = UpdateUserRoleSchema.parse(request.body);

    if (id === request.user.sub && role !== 'admin') {
      throw Object.assign(new Error('You cannot remove your own admin access'), { statusCode: 400 });
    }

    reply.send(await setUserRole(fastify.db, id, role));
  });
}
