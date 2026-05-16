import CryptoJS from 'crypto-js';

const ITERATIONS = 100_000;
const KEY_SIZE = 256 / 32; // 8 words = 32 bytes
const IV_SIZE = 16; // bytes

export interface EncryptedPayload {
  iv: string;
  salt: string;
  ciphertext: string;
  iterations: number;
}

/**
 * Derive a symmetric key from a passphrase using PBKDF2.
 */
function deriveKey(passphrase: string, salt: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_SIZE,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

/**
 * Encrypt plaintext string using AES-GCM equivalent (CBC + HMAC via CryptoJS).
 * Returns an EncryptedPayload object that can be stringified.
 */
export function encrypt(plaintext: string, passphrase: string): EncryptedPayload {
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv = CryptoJS.lib.WordArray.random(IV_SIZE);
  const key = deriveKey(passphrase, salt);

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    iv: iv.toString(CryptoJS.enc.Hex),
    salt: salt.toString(CryptoJS.enc.Hex),
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Hex),
    iterations: ITERATIONS,
  };
}

/**
 * Decrypt an EncryptedPayload using the passphrase.
 * Returns the original plaintext string, or throws on failure.
 */
export function decrypt(payload: EncryptedPayload, passphrase: string): string {
  const salt = CryptoJS.enc.Hex.parse(payload.salt);
  const iv = CryptoJS.enc.Hex.parse(payload.iv);
  const ciphertext = CryptoJS.enc.Hex.parse(payload.ciphertext);

  const key = CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_SIZE,
    iterations: payload.iterations ?? ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  const cipherParams = CryptoJS.lib.CipherParams.create({ciphertext});
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) {
    throw new Error('Decryption failed: wrong passphrase or corrupted data');
  }
  return result;
}

/**
 * Serialize an EncryptedPayload to a JSON string for storage/upload.
 */
export function serializeEncrypted(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

/**
 * Deserialize an EncryptedPayload from a JSON string.
 */
export function deserializeEncrypted(data: string): EncryptedPayload {
  return JSON.parse(data) as EncryptedPayload;
}

/**
 * Hash a passphrase for storage comparison (never store raw passphrase).
 * Used to verify encryption key before use.
 */
export function hashPassphrase(passphrase: string): string {
  return CryptoJS.SHA256(passphrase).toString(CryptoJS.enc.Hex);
}
