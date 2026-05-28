import type { FastifyInstance } from 'fastify';
import { AddProductSchema, PaginationSchema, HistoryQuerySchema } from './products.schemas';
import { listProducts, getProduct, getPriceHistory, addProduct } from './products.service';

export default async function productRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      tags: ['Products'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const query = PaginationSchema.parse(request.query);
    reply.send(await listProducts(fastify.db, query));
  });

  fastify.get('/:id', {
    schema: {
      tags: ['Products'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await getProduct(fastify.db, id));
  });

  fastify.get('/:id/history', {
    schema: {
      tags: ['Products'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = HistoryQuerySchema.parse(request.query);
    reply.send(await getPriceHistory(fastify.db, id, query));
  });

  fastify.post('/', {
    schema: {
      tags: ['Products'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['asin', 'url'],
        properties: {
          asin: { type: 'string', pattern: '^[A-Z0-9]{10}$' },
          url: { type: 'string', format: 'uri' },
          title: { type: 'string' },
          image_url: { type: 'string', format: 'uri' },
          retailer: { type: 'string', default: 'amazon' },
        },
      },
    },
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    const input = AddProductSchema.parse(request.body);
    reply.status(201).send(await addProduct(fastify.db, input));
  });
}
