import type { FastifyInstance } from 'fastify';
import { RegisterSchema, LoginSchema, RefreshSchema, UpdateProfileSchema } from './auth.schemas';
import { registerUser, loginUser, refreshAccessToken, logoutUser, getUserProfile, updateUserProfile, sendForgotPassword, resetPassword, sendTestEmail } from './auth.service';

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

  fastify.get('/me', {
    schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    reply.send(await getUserProfile(fastify.db, request.user.sub));
  });

  fastify.post('/forgot-password', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as { email: string };
    await sendForgotPassword(fastify.db, fastify.mailer, email);
    reply.send({ message: 'If that email exists, a reset link has been sent.' });
  });

  fastify.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token:    { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { token, password } = request.body as { token: string; password: string };
    if (password.length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
    await resetPassword(fastify.db, token, password);
    reply.send({ message: 'Password reset successfully. You can now log in.' });
  });

  fastify.post('/test-email', {
    schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const { rows } = await fastify.db.query('SELECT email FROM users WHERE id = $1', [request.user.sub]);
    await sendTestEmail(fastify.mailer, rows[0].email);
    reply.send({ message: `Test email sent to ${rows[0].email}` });
  });

  fastify.patch('/me', {
    schema: {
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          whatsapp_number: { type: 'string', nullable: true },
          current_password: { type: 'string' },
          new_password: { type: 'string', minLength: 8 },
        },
      },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const input = UpdateProfileSchema.parse(request.body);
    reply.send(await updateUserProfile(fastify.db, request.user.sub, input));
  });

  fastify.get('/whatsapp/status', {
    schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (_request, reply) => {
    const { status, qrBase64 } = fastify.whatsapp;
    reply.send({ status, qrBase64 });
  });

  fastify.post('/whatsapp/test', {
    schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const { rows } = await fastify.db.query('SELECT whatsapp_number FROM users WHERE id = $1', [request.user.sub]);
    const number = rows[0]?.whatsapp_number;
    if (!number) throw Object.assign(new Error('No WhatsApp number saved on your profile'), { statusCode: 400 });
    const sent = await fastify.whatsapp.sendMessage(number, '✅ *PriceZap* — WhatsApp notifications are working!');
    if (!sent) throw Object.assign(new Error('WhatsApp not connected. Please scan the QR code first.'), { statusCode: 503 });
    reply.send({ message: `Test message sent to ${number}` });
  });
}
