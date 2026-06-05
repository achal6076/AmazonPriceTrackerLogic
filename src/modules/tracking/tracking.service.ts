import type { Pool } from 'pg';
import type { StartTrackingInput, UpdateTrackingInput } from './tracking.schemas';

export async function getUserTracking(db: Pool, userId: string) {
  const result = await db.query(
    `SELECT tp.id, tp.target_price, tp.is_active, tp.created_at,
       p.id AS product_id, p.asin, p.title, p.url, p.image_url, p.retailer,
       (SELECT price FROM product_price_history
        WHERE product_id = p.id ORDER BY recorded_at DESC LIMIT 1) AS current_price
     FROM tracked_products tp
     JOIN products p ON p.id = tp.product_id
     WHERE tp.user_id = $1
     ORDER BY tp.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function startTracking(db: Pool, userId: string, input: StartTrackingInput) {
  const productExists = await db.query('SELECT id FROM products WHERE id = $1', [input.product_id]);
  if (!productExists.rowCount || productExists.rowCount === 0) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  const result = await db.query(
    `INSERT INTO tracked_products (user_id, product_id, target_price)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET
       target_price = EXCLUDED.target_price,
       is_active = TRUE
     RETURNING *, (xmax = 0) AS is_new`,
    [userId, input.product_id, input.target_price ?? null],
  );
  const row = result.rows[0];
  if (!row.is_new) {
    throw Object.assign(new Error('You are already tracking this product'), { statusCode: 409 });
  }
  return row;
}

export async function updateTracking(
  db: Pool,
  userId: string,
  trackingId: string,
  input: UpdateTrackingInput,
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if ('target_price' in input) { fields.push(`target_price = $${idx++}`); values.push(input.target_price); }
  if (input.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(input.is_active); }

  if (fields.length === 0) throw Object.assign(new Error('No fields to update'), { statusCode: 400 });

  values.push(trackingId, userId);
  const result = await db.query(
    `UPDATE tracked_products SET ${fields.join(', ')}
     WHERE id = $${idx} AND user_id = $${idx + 1}
     RETURNING *`,
    values,
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw Object.assign(new Error('Tracking entry not found'), { statusCode: 404 });
  }
  return result.rows[0];
}

export async function stopTracking(db: Pool, userId: string, trackingId: string) {
  const result = await db.query(
    'DELETE FROM tracked_products WHERE id = $1 AND user_id = $2 RETURNING id',
    [trackingId, userId],
  );
  if (!result.rowCount || result.rowCount === 0) {
    throw Object.assign(new Error('Tracking entry not found'), { statusCode: 404 });
  }
}
