CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tracking_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
  target_price NUMERIC(10,2) NOT NULL,
  triggered_price NUMERIC(10,2) NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate alerts for same tracking entry within 24 hours
CREATE INDEX IF NOT EXISTS idx_price_alerts_tracking_sent
  ON price_alerts(tracking_id, sent_at DESC);
