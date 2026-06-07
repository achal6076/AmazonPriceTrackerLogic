export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: string;
  asin: string;
  title: string | null;
  url: string;
  image_url: string | null;
  retailer: string;
  created_at: Date;
  updated_at: Date;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  price: string;
  currency: string;
  recorded_at: Date;
}

export interface TrackedProduct {
  id: string;
  user_id: string;
  product_id: string;
  target_price: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    requireAdmin: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}
