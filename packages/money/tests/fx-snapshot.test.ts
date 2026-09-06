import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@imajin/auth';
import { signFxSnapshot, verifyFxSnapshot, type FxSnapshot } from '../src/fx-snapshot';

const SNAPSHOT: FxSnapshot = {
  base: 'USD',
  quote: 'CAD',
  rate: '1.35',
  source: 'ecb',
  asOf: '2024-01-15',
};

describe('signFxSnapshot / verifyFxSnapshot', () => {
  it('verifies a signature produced with the matching keypair', async () => {
    const { privateKey, publicKey } = generateKeypair();
    const signed = await signFxSnapshot(SNAPSHOT, privateKey);
    expect(signed.signature).toEqual(expect.any(String));
    await expect(verifyFxSnapshot(signed, publicKey)).resolves.toBe(true);
  });

  it('fails verification against the wrong public key', async () => {
    const { privateKey } = generateKeypair();
    const { publicKey: wrongPublicKey } = generateKeypair();
    const signed = await signFxSnapshot(SNAPSHOT, privateKey);
    await expect(verifyFxSnapshot(signed, wrongPublicKey)).resolves.toBe(false);
  });

  it('fails verification when the rate is tampered with after signing', async () => {
    const { privateKey, publicKey } = generateKeypair();
    const signed = await signFxSnapshot(SNAPSHOT, privateKey);
    const tampered = { ...signed, rate: '999.99' };
    await expect(verifyFxSnapshot(tampered, publicKey)).resolves.toBe(false);
  });

  it('fails verification when any other field is tampered with', async () => {
    const { privateKey, publicKey } = generateKeypair();
    const signed = await signFxSnapshot(SNAPSHOT, privateKey);
    const tampered = { ...signed, quote: 'EUR' };
    await expect(verifyFxSnapshot(tampered, publicKey)).resolves.toBe(false);
  });
});
