import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Transporter } from 'nodemailer';
import type { RegisterInput, LoginInput, UpdateProfileInput } from './auth.schemas';

const APP_NAME = 'PriceZap';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@pricezap.com';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const RESET_EXPIRY_MINUTES = 30;

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export async function registerUser(
  db: Pool,
  fastify: FastifyInstance,
  input: RegisterInput,
) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const result = await db.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
    [input.email, password_hash],
  );
  const user = result.rows[0];

  const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email });
  const { refreshToken, tokenHash, expiresAt } = await createRefreshToken(db, user.id);

  return { user: { id: user.id, email: user.email }, accessToken, refreshToken };
}

export async function loginUser(
  db: Pool,
  fastify: FastifyInstance,
  input: LoginInput,
) {
  const result = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [input.email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email });
  const { refreshToken } = await createRefreshToken(db, user.id);

  return { user: { id: user.id, email: user.email }, accessToken, refreshToken };
}

export async function refreshAccessToken(
  db: Pool,
  fastify: FastifyInstance,
  rawToken: string,
) {
  const tokenHash = hashToken(rawToken);
  const result = await db.query(
    'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  const stored = result.rows[0];

  if (!stored || new Date(stored.expires_at) < new Date()) {
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  await db.query('DELETE FROM refresh_tokens WHERE id = $1', [stored.id]);

  const userResult = await db.query('SELECT id, email FROM users WHERE id = $1', [stored.user_id]);
  const user = userResult.rows[0];

  const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email });
  const { refreshToken } = await createRefreshToken(db, user.id);

  return { accessToken, refreshToken };
}

export async function logoutUser(db: Pool, userId: string) {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function getUserProfile(db: Pool, userId: string) {
  const result = await db.query(
    'SELECT id, email, name, whatsapp_number, created_at FROM users WHERE id = $1',
    [userId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return result.rows[0];
}

export async function updateUserProfile(
  db: Pool,
  userId: string,
  input: UpdateProfileInput,
) {
  if (input.new_password) {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!rows[0] || !(await bcrypt.compare(input.current_password!, rows[0].password_hash))) {
      throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) { fields.push(`name = $${idx++}`); values.push(input.name); }
  if ('whatsapp_number' in input) { fields.push(`whatsapp_number = $${idx++}`); values.push(input.whatsapp_number ?? null); }
  if (input.new_password) {
    fields.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(input.new_password, BCRYPT_ROUNDS));
  }
  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, whatsapp_number, created_at`,
    values,
  );
  return result.rows[0];
}

export async function sendForgotPassword(db: Pool, mailer: Transporter, email: string) {
  const { rows } = await db.query('SELECT id, email FROM users WHERE email = $1', [email]);
  // Always return success to prevent email enumeration
  if (!rows[0]) return;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [rows[0].id, tokenHash, expiresAt],
  );

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  await mailer.sendMail({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="text-align:center;margin-bottom:32px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#f59e0b;border-radius:14px;margin-bottom:16px">
            <span style="font-size:24px">🛍</span>
          </div>
          <h1 style="font-size:22px;font-weight:800;color:#0f1117;margin:0">${APP_NAME}</h1>
        </div>
        <h2 style="font-size:20px;font-weight:700;color:#0f1117;margin:0 0 10px">Reset your password</h2>
        <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 28px">
          We received a request to reset the password for your account.<br>
          Click the button below to choose a new password.
        </p>
        <a href="${resetUrl}"
           style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
          Reset Password
        </a>
        <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 8px">
          This link expires in <strong>${RESET_EXPIRY_MINUTES} minutes</strong>.<br>
          If you didn't request a password reset, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0">
        <p style="color:#c4c9d4;font-size:12px;margin:0">
          If the button doesn't work, paste this URL in your browser:<br>
          <a href="${resetUrl}" style="color:#6c63ff;word-break:break-all">${resetUrl}</a>
        </p>
      </div>
    `,
  });
}

export async function resetPassword(db: Pool, token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Invalid or expired reset link. Please request a new one.'), { statusCode: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, rows[0].user_id]);
  await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [rows[0].id]);
  // Invalidate all refresh tokens for security
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [rows[0].user_id]);
}

export async function sendTestEmail(mailer: Transporter, to: string) {
  await mailer.sendMail({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `✅ ${APP_NAME} — Email is working!`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#10b981;border-radius:14px;margin-bottom:12px">
            <span style="font-size:26px">✅</span>
          </div>
          <h2 style="font-size:20px;font-weight:800;color:#0f1117;margin:0">Email is working!</h2>
        </div>
        <p style="color:#6b7280;font-size:15px;line-height:1.6;text-align:center;margin:0">
          Your <strong>${APP_NAME}</strong> SMTP configuration is correct.<br>
          You will now receive price drop alerts at this address.
        </p>
      </div>
    `,
  });
}

async function createRefreshToken(db: Pool, userId: string) {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400 * 1000);

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );

  return { refreshToken, tokenHash, expiresAt };
}
