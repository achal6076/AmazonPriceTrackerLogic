import fp from 'fastify-plugin';
import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Transporter;
  }
}

export default fp(async function mailerPlugin(fastify: FastifyInstance) {
  const isDev = process.env.NODE_ENV !== 'production';

  const transporter = isDev
    ? nodemailer.createTransport({
        host: 'localhost',
        port: 1025,
        ignoreTLS: true,
      })
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

  fastify.decorate('mailer', transporter);
  fastify.log.info(`Mailer ready (${isDev ? 'dev/mock' : 'smtp'})`);
});
