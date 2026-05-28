import type { FastifyInstance } from 'fastify';
import { RegisterSchema, LoginSchema, RefreshSchema } from './auth.schemas';
import { registerUser, loginUser, refreshAccessToken, logoutUser } from './auth.service';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const input = RegisterSchema.parse(request.body);
    const result = await registerUser(fastify.db, fastify, input);
    reply.status(201).send(result);
  });

  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const input = LoginSchema.parse(request.body);
    const result = await loginUser(fastify.db, fastify, input);
    reply.send(result);
  });

  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: { refresh_token: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { refresh_token } = RefreshSchema.parse(request.body);
    const result = await refreshAccessToken(fastify.db, fastify, refresh_token);
    reply.send(result);
  });

  fastify.post('/logout', {
    schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    await logoutUser(fastify.db, request.user.sub);
    reply.send({ message: 'Logged out successfully' });
  });
}
