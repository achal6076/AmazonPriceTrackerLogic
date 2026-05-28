import type { Pool } from 'pg';
import type { AddProductInput, PaginationInput, HistoryQueryInput } from './products.schemas';

export async function listProducts(db: Pool, { page, limit }: PaginationInput) {
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT p.*,
        (SELECT price FROM product_price_history
         WHERE product_id = p.id ORDER BY recorded_at DESC LIMIT 1) AS current_price
       FROM products p
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    db.query('SELECT COUNT(*)::int AS total FROM products'),
  ]);

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      pages: Math.ceil(countResult.rows[0].total / limit),
    },
  };
}

export async function getProduct(db: Pool, id: string) {
  const result = await db.query(
    `SELECT p.*,
      (SELECT price FROM product_price_history
       WHERE product_id = p.id ORDER BY recorded_at DESC LIMIT 1) AS current_price,
      (SELECT MIN(price) FROM product_price_history WHERE product_id = p.id) AS lowest_price,
      (SELECT MAX(price) FROM product_price_history WHERE product_id = p.id) AS highest_price
     FROM products p
     WHERE p.id = $1`,
    [id],
  );
  if (!result.rows[0]) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function getPriceHistory(db: Pool, productId: string, query: HistoryQueryInput) {
  const { page, limit, from, to } = query;
  const offset = (page - 1) * limit;
  const conditions: string[] = ['product_id = $1'];
  const values: unknown[] = [productId];
  let idx = 2;

  if (from) { conditions.push(`recorded_at >= $${idx++}`); values.push(from); }
  if (to) { conditions.push(`recorded_at <= $${idx++}`); values.push(to); }

  const where = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT * FROM product_price_history WHERE ${where}
       ORDER BY recorded_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM product_price_history WHERE ${where}`, values),
  ]);

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      pages: Math.ceil(countResult.rows[0].total / limit),
    },
  };
}

export async function addProduct(db: Pool, input: AddProductInput) {
  const result = await db.query(
    `INSERT INTO products (asin, url, title, image_url, retailer)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (asin) DO UPDATE SET
       url = EXCLUDED.url,
       title = COALESCE(EXCLUDED.title, products.title),
       image_url = COALESCE(EXCLUDED.image_url, products.image_url),
       updated_at = NOW()
     RETURNING *`,
    [input.asin, input.url, input.title ?? null, input.image_url ?? null, input.retailer],
  );
  return result.rows[0];
}
