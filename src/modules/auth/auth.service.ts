import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { RegisterInput, LoginInput, UpdateProfileInput } from './auth.schemas';

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
    'SELECT id, email, name, created_at FROM users WHERE id = $1',
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
  if (input.new_password) {
    fields.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(input.new_password, BCRYPT_ROUNDS));
  }
  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, created_at`,
    values,
  );
  return result.rows[0];
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
