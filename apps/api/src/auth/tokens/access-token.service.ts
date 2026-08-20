import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { UnauthorizedError } from '@cryptopay/shared';
import { ENV, type Env } from '../../config/env.provider.js';

export interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class AccessTokenService {
  private readonly secret: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(@Inject(ENV) env: Env) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.ttlSeconds = env.ACCESS_TOKEN_TTL_SECONDS;
  }

  async sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + this.ttlSeconds)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    let sub: string | undefined;
    try {
      const { payload } = await jwtVerify(token, this.secret);
      sub = payload.sub;
    } catch {
      throw new UnauthorizedError('Invalid or expired session');
    }
    if (typeof sub !== 'string') {
      throw new UnauthorizedError('Invalid session token');
    }
    return { sub };
  }

  get ttl(): number {
    return this.ttlSeconds;
  }
}
