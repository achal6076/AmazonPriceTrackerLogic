import type { Pool } from 'pg';
import type { Transporter } from 'nodemailer';

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@pricezap.com';
const APP_NAME = 'PriceZap';

function buildEmailHtml(data: {
  userEmail: string;
  productTitle: string;
  productUrl: string;
  targetPrice: number;
  triggeredPrice: number;
  currency: string;
}): string {
  const saved = (data.targetPrice - data.triggeredPrice).toFixed(2);
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#e47911">🎉 Price Drop Alert — ${APP_NAME}</h2>
      <p>Good news! A product you're tracking has dropped to your target price.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">Product</td>
            <td style="padding:8px">${data.productTitle}</td></tr>
        <tr style="background:#f9f9f9">
            <td style="padding:8px;font-weight:bold">Current Price</td>
            <td style="padding:8px;color:#2e7d32;font-size:1.2em;font-weight:bold">
              ${data.currency} ${data.triggeredPrice.toFixed(2)}
            </td></tr>
        <tr><td style="padding:8px;font-weight:bold">Your Target</td>
            <td style="padding:8px">${data.currency} ${data.targetPrice.toFixed(2)}</td></tr>
        <tr style="background:#f9f9f9">
            <td style="padding:8px;font-weight:bold">You Save</td>
            <td style="padding:8px;color:#c62828">${data.currency} ${saved}</td></tr>
      </table>
      <a href="${data.productUrl}"
         style="display:inline-block;padding:12px 24px;background:#e47911;color:#fff;
                text-decoration:none;border-radius:4px;font-weight:bold">
        Buy Now on Amazon
      </a>
      <p style="color:#999;font-size:0.85em;margin-top:24px">
        You received this because you set a target price alert on ${APP_NAME}.
      </p>
    </div>
  `;
}

export async function checkAndSendAlerts(
  db: Pool,
  mailer: Transporter,
  productId: string,
  currentPrice: number,
): Promise<void> {
  // Find all active tracking entries for this product where price hit target
  const result = await db.query(
    `SELECT tp.id AS tracking_id, tp.target_price, tp.user_id,
            u.email AS user_email,
            p.title AS product_title, p.url AS product_url
     FROM tracked_products tp
     JOIN users u ON u.id = tp.user_id
     JOIN products p ON p.id = tp.product_id
     WHERE tp.product_id = $1
       AND tp.is_active = TRUE
       AND tp.target_price IS NOT NULL
       AND tp.target_price >= $2`,
    [productId, currentPrice],
  );

  for (const row of result.rows) {
    // Skip if an alert was already sent for this tracking entry in the last 24 hours
    const recent = await db.query(
      `SELECT id FROM price_alerts
       WHERE tracking_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [row.tracking_id],
    );
    if (recent.rowCount && recent.rowCount > 0) continue;

    // Record alert first to prevent duplicates under race conditions
    await db.query(
      `INSERT INTO price_alerts (user_id, product_id, tracking_id, target_price, triggered_price)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.user_id, productId, row.tracking_id, row.target_price, currentPrice],
    );

    await mailer.sendMail({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: row.user_email,
      subject: `Price Drop: ${row.product_title ?? 'Your tracked product'} is now ₹${currentPrice}`,
      html: buildEmailHtml({
        userEmail: row.user_email,
        productTitle: row.product_title ?? 'Amazon Product',
        productUrl: row.product_url,
        targetPrice: parseFloat(row.target_price),
        triggeredPrice: currentPrice,
        currency: 'INR',
      }),
    });
  }
}

export async function getUserAlerts(db: Pool, userId: string) {
  const result = await db.query(
    `SELECT pa.id, pa.target_price, pa.triggered_price, pa.sent_at,
            p.id AS product_id, p.title, p.url, p.asin
     FROM price_alerts pa
     JOIN products p ON p.id = pa.product_id
     WHERE pa.user_id = $1
     ORDER BY pa.sent_at DESC
     LIMIT 50`,
    [userId],
  );
  return result.rows;
}
