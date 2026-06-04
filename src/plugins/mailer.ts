import fp from 'fastify-plugin';
import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Transporter;
  }
}

export default fp(async function mailerPlugin(fastify: FastifyInstance) {
  const hasSmtp = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

  const transporter = hasSmtp
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : nodemailer.createTransport({
        host: 'localhost',
        port: 1025,
        ignoreTLS: true,
      });

  if (hasSmtp) {
    // Verify in background — don't block startup
    transporter.verify()
      .then(() => fastify.log.info('Mailer ready (SMTP connected)'))
      .catch((err) => fastify.log.error({ err }, 'Mailer SMTP connection failed — check SMTP_HOST/USER/PASS'));
  } else {
    fastify.log.warn('Mailer running in NO-OP mode — set SMTP_HOST, SMTP_USER, SMTP_PASS to send real emails');
  }

  fastify.decorate('mailer', transporter);
});
