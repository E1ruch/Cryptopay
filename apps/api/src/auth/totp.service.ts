import { Injectable } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';

export interface GeneratedTotpSecret {
  secretBase32: string;
  otpauthUrl: string;
}

const ISSUER = 'CryptoPay';
const DIGITS = 6;
const PERIOD = 30;

@Injectable()
export class TotpService {
  generateSecret(accountLabel: string): GeneratedTotpSecret {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: ISSUER,
      label: accountLabel,
      algorithm: 'SHA1',
      digits: DIGITS,
      period: PERIOD,
      secret,
    });
    return { secretBase32: secret.base32, otpauthUrl: totp.toString() };
  }

  verify(secretBase32: string, code: string): boolean {
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: DIGITS,
      period: PERIOD,
      secret: Secret.fromBase32(secretBase32),
    });
    // window: 1 tolerates client clock drift of one 30s step either side.
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }
}
