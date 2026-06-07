import type { Pool } from 'pg';

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
