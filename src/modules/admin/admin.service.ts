import type { Pool } from 'pg';
import type { ListUsersQuery } from './admin.schemas';

export async function getDashboardStats(db: Pool) {
  const [users, products, trackedActive, alertsThisWeek, newUsersThisWeek] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS total FROM users'),
    db.query('SELECT COUNT(*)::int AS total FROM products'),
    db.query('SELECT COUNT(*)::int AS total FROM tracked_products WHERE is_active = TRUE'),
    db.query("SELECT COUNT(*)::int AS total FROM price_alerts WHERE sent_at >= NOW() - INTERVAL '7 days'"),
    db.query("SELECT COUNT(*)::int AS total FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"),
  ]);

  return {
    total_users: users.rows[0].total,
    total_products: products.rows[0].total,
    active_tracked_products: trackedActive.rows[0].total,
    alerts_sent_this_week: alertsThisWeek.rows[0].total,
    new_users_this_week: newUsersThisWeek.rows[0].total,
  };
}

export async function getUsers(db: Pool, { page, limit, search }: ListUsersQuery) {
  const offset = (page - 1) * limit;
  const values: unknown[] = [];
  let where = '';

  if (search) {
    values.push(`%${search}%`);
    where = `WHERE u.email ILIKE $1 OR u.name ILIKE $1`;
  }

  const [dataResult, countResult] = await Promise.all([
    db.query(
      `SELECT u.id, u.email, u.name, u.role, u.whatsapp_number, u.created_at,
        (SELECT COUNT(*)::int FROM tracked_products WHERE user_id = u.id AND is_active = TRUE) AS active_trackings
       FROM users u
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, values),
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

export async function setUserRole(db: Pool, userId: string, role: 'user' | 'admin') {
  const result = await db.query(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, email, name, role, whatsapp_number, created_at`,
    [role, userId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return result.rows[0];
}
