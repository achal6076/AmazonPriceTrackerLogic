import type { FastifyInstance } from 'fastify';
import { scrapeProduct, scrapeAndStore, scrapeAllTrackedProducts } from './scraper.service';

export default async function scraperRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // Scrape a URL without saving — useful for previewing before adding a product
  fastify.post('/preview', {
    schema: {
      tags: ['Scraper'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
        },
      },
    },
    ...auth,
  }, async (request, reply) => {
    const { url } = request.body as { url: string };
    const result = await scrapeProduct(url);
    reply.send(result);
  });

  // Scrape a tracked product by ID and save price to history
  fastify.post('/:productId', {
    schema: {
      tags: ['Scraper'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { productId: { type: 'string', format: 'uuid' } },
      },
    },
    ...auth,
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const result = await scrapeAndStore(fastify.db, productId, fastify.mailer);
    reply.send(result);
  });

  // Trigger scrape for all actively tracked products
  fastify.post('/run-all', {
    schema: {
      tags: ['Scraper'],
      security: [{ bearerAuth: [] }],
    },
    ...auth,
  }, async (request, reply) => {
    const result = await scrapeAllTrackedProducts(fastify.db, fastify.mailer);
    reply.send({ message: 'Scrape completed', ...result });
  });
}
