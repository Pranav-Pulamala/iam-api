import { describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken } from '../../src/lib/refresh-token.js';

describe('refresh-token utilities', () => {
  it('generates independent 256-bit Base64URL tokens', () => {
    const firstToken = generateRefreshToken();
    const secondToken = generateRefreshToken();

    expect(firstToken).toHaveLength(43);
    expect(secondToken).toHaveLength(43);
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstToken).not.toBe(secondToken);
  });

  it('creates deterministic fixed-length SHA-256 hashes', () => {
    const token = generateRefreshToken();

    const firstHash = hashRefreshToken(token);
    const secondHash = hashRefreshToken(token);

    expect(firstHash).toHaveLength(64);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toContain(token);
  });

  it('produces different hashes for different refresh tokens', () => {
    const firstHash = hashRefreshToken(generateRefreshToken());
    const secondHash = hashRefreshToken(generateRefreshToken());

    expect(firstHash).not.toBe(secondHash);
  });
});
