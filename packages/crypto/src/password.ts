import argon2 from 'argon2';

export interface Argon2Params {
  memoryCostKib: number;
  timeCost: number;
  parallelism: number;
}

/** Defaults mirror packages/config's ARGON2_* env defaults for standalone use/tests. */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryCostKib: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(
  password: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: params.memoryCostKib,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  });
}

/**
 * Never throws on malformed/foreign hashes — a corrupt or unexpected hash
 * must fail the login, not crash the request.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
