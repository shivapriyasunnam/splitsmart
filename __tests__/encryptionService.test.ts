import {encrypt, decrypt, hashPassphrase, serializeEncrypted, deserializeEncrypted} from '../src/features/sync/crypto/encryptionService';

describe('encryptionService', () => {
  const passphrase = 'super-secret-passphrase-123';
  const plaintext = JSON.stringify({foo: 'bar', count: 42, arr: [1, 2, 3]});

  describe('encrypt / decrypt roundtrip', () => {
    it('decrypts encrypted data back to original', () => {
      const payload = encrypt(plaintext, passphrase);
      const decrypted = decrypt(payload, passphrase);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext on each call (due to random IV/salt)', () => {
      const p1 = encrypt(plaintext, passphrase);
      const p2 = encrypt(plaintext, passphrase);
      expect(p1.ciphertext).not.toBe(p2.ciphertext);
    });

    it('throws on wrong passphrase', () => {
      const payload = encrypt(plaintext, passphrase);
      expect(() => decrypt(payload, 'wrong-passphrase')).toThrow();
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trips through serialization', () => {
      const payload = encrypt(plaintext, passphrase);
      const serialized = serializeEncrypted(payload);
      const deserialized = deserializeEncrypted(serialized);
      const decrypted = decrypt(deserialized, passphrase);
      expect(decrypted).toBe(plaintext);
    });

    it('serialized output is a non-empty string', () => {
      const payload = encrypt(plaintext, passphrase);
      const serialized = serializeEncrypted(payload);
      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);
    });
  });

  describe('hashPassphrase', () => {
    it('returns a non-empty string', () => {
      const hash = hashPassphrase(passphrase);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('is deterministic — same input → same output', () => {
      expect(hashPassphrase(passphrase)).toBe(hashPassphrase(passphrase));
    });

    it('produces different hash for different passphrases', () => {
      expect(hashPassphrase('abc')).not.toBe(hashPassphrase('xyz'));
    });

    it('does not return the raw passphrase', () => {
      expect(hashPassphrase(passphrase)).not.toBe(passphrase);
    });
  });
});
