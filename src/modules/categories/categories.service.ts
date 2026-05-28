import type { Pool } from 'pg';

export async function getCategories(db: Pool, userId: string) {
  const result = await db.query(
    `SELECT * FROM watched_categories WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function addCategory(
  db: Pool,
  userId: string,
  input: { name: string; url?: string; description?: string },
) {
  const result = await db.query(
    `INSERT INTO watched_categories (user_id, name, url, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, input.name, input.url ?? null, input.description ?? null],
  );
  return result.rows[0];
}

export async function deleteCategory(db: Pool, userId: string, categoryId: string) {
  const result = await db.query(
    `DELETE FROM watched_categories WHERE id = $1 AND user_id = $2 RETURNING id`,
    [categoryId, userId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('Category not found'), { statusCode: 404 });
}
