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

const disabled: WhatsAppState = {
  status: 'disabled',
  qrBase64: null,
  sendMessage: async () => false,
};

export default fp(async function whatsappPlugin(fastify: FastifyInstance) {
  let Client: any, LocalAuth: any, toDataURL: any, generate: any;

  try {
    const wwebjs = await import('whatsapp-web.js');
    Client = wwebjs.Client;
    LocalAuth = wwebjs.LocalAuth;
    toDataURL = (await import('qrcode')).toDataURL;
    generate = (await import('qrcode-terminal')).generate;
  } catch {
    fastify.log.warn('whatsapp-web.js unavailable — WhatsApp notifications disabled');
    fastify.decorate('whatsapp', disabled);
    return;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
  });

  const state: WhatsAppState = {
    status: 'initializing',
    qrBase64: null,
    async sendMessage(number: string, message: string): Promise<boolean> {
      if (state.status !== 'ready') return false;
      try {
        const cleaned = number.replace(/[^0-9]/g, '');
        await client.sendMessage(`${cleaned}@c.us`, message);
        return true;
      } catch (err) {
        fastify.log.error({ err }, 'WhatsApp send failed');
        return false;
      }
    },
  };

  client.on('qr', async (qr: string) => {
    state.status = 'qr';
    try { state.qrBase64 = await toDataURL(qr); } catch { /* ignore */ }
    try { generate(qr, { small: true }); } catch { /* ignore */ }
    fastify.log.info('WhatsApp QR ready — scan with your phone to connect');
  });

  client.on('ready', () => {
    state.status = 'ready';
    state.qrBase64 = null;
    fastify.log.info('WhatsApp client connected and ready');
  });

  client.on('disconnected', (reason: string) => {
    state.status = 'disconnected';
    fastify.log.warn({ reason }, 'WhatsApp disconnected');
  });

  client.initialize().catch((err: unknown) => {
    fastify.log.error({ err }, 'WhatsApp initialization failed');
    state.status = 'disconnected';
  });

  fastify.decorate('whatsapp', state);

  fastify.addHook('onClose', async () => {
    try { await client.destroy(); } catch { /* ignore */ }
  });
});
