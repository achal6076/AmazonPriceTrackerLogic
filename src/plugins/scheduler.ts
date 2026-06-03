import fp from 'fastify-plugin';
import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { scrapeAllTrackedProducts } from '../modules/scraper/scraper.service';

// Default: every 30 minutes. Override with SCRAPE_CRON env var.
const SCRAPE_CRON = process.env.SCRAPE_CRON ?? '*/30 * * * *';

export default fp(async function schedulerPlugin(fastify: FastifyInstance) {
  let isRunning = false;

  const task = cron.schedule(SCRAPE_CRON, async () => {
    if (isRunning) {
      fastify.log.warn('Scrape job still running from previous tick, skipping');
      return;
    }

    isRunning = true;
    fastify.log.info('Scheduled scrape started');

    try {
      const result = await scrapeAllTrackedProducts(fastify.db, fastify.mailer, fastify.whatsapp);
      fastify.log.info({ result }, 'Scheduled scrape completed');
    } catch (err) {
      fastify.log.error({ err }, 'Scheduled scrape failed');
    } finally {
      isRunning = false;
    }
  });

  fastify.addHook('onReady', async () => {
    fastify.log.info({ cron: SCRAPE_CRON }, 'Price scrape scheduler started');
  });

  fastify.addHook('onClose', async () => {
    task.stop();
    fastify.log.info('Price scrape scheduler stopped');
  });
});
