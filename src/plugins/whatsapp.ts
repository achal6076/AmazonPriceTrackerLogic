import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export interface WhatsAppState {
  status: 'disabled' | 'initializing' | 'qr' | 'ready' | 'disconnected';
  qrBase64: string | null;
  sendMessage: (number: string, message: string) => Promise<boolean>;
}

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: WhatsAppState;
  }
}

export default fp(async function whatsappPlugin(fastify: FastifyInstance) {
  fastify.decorate('whatsapp', {
    status: 'disabled' as const,
    qrBase64: null,
    sendMessage: async () => false,
  });
  fastify.log.info('WhatsApp disabled — will be enabled in next phase via Meta Cloud API');
});
