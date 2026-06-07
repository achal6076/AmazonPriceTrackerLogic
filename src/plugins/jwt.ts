import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRY ?? '15m' },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rows } = await fastify.db.query('SELECT role FROM users WHERE id = $1', [request.user.sub]);
    if (rows[0]?.role !== 'admin') {
      reply.status(403).send({ error: 'Admin access required' });
    }
  });
});
