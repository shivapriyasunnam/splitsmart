/**
 * Sync orchestrator — transport-agnostic workflow for sending and receiving sync packages.
 *
 * Handles:
 *  - building and encrypting outbound packages
 *  - decrypting, validating and merging inbound packages
 *  - updating sync status after operations
 *
 * Does NOT know about Drive folders, Bluetooth sockets, or delivery cursors.
 * Callers (driveOps, bluetoothSyncService) supply the transport and handle
 * transport-specific state (uploaded_at for Drive, lastSentSequence for BT).
 */
import {z} from 'zod';
import {SyncTransport, InboundPayload} from '../transport/syncTransport';
import {decrypt, deserializeEncrypted} from '../crypto/encryptionService';
import {mergePackage} from '../merge/mergeService';
import {hasPackageBeenApplied} from '../../../db/repositories/syncRepository';
import {SyncPackage} from '../../../types';

// ─── Zod schema for runtime validation ───────────────────────────────────────

const SyncChangeSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  operation: z.enum(['upsert', 'delete']),
  record: z.record(z.unknown()),
});

const SyncPackageSchema = z.object({
  packageId: z.string().uuid(),
  sourceDeviceId: z.string(),
  pairId: z.string(),
  createdAt: z.string(),
  sequenceRange: z.object({
    from: z.number(),
    to: z.number(),
  }),
  changes: z.array(SyncChangeSchema),
  senderMemberId: z.string().optional(),
});

// ─── Inbound processing ───────────────────────────────────────────────────────

export interface InboundResult {
  packageId: string;
  imported: boolean;
  /** True when the package was already applied before — not an error. */
  duplicate: boolean;
  error?: string;
}

/**
 * Decrypt, validate, deduplicate and merge a single inbound payload.
 * Returns structured result so callers can ACK or surface errors.
 */
export async function processInboundPayload(
  payload: InboundPayload,
  passphrase: string,
): Promise<InboundResult> {
  let packageId = 'unknown';
  try {
    const encryptedPayload = deserializeEncrypted(payload.encryptedPayload);
    const plaintext = decrypt(encryptedPayload, passphrase);
    const raw = JSON.parse(plaintext);

    // Runtime schema validation before touching the DB
    const parseResult = SyncPackageSchema.safeParse(raw);
    if (!parseResult.success) {
      return {
        packageId,
        imported: false,
        duplicate: false,
        error: `Schema validation failed: ${parseResult.error.message}`,
      };
    }

    const pkg = parseResult.data as SyncPackage;
    packageId = pkg.packageId;

    const alreadyApplied = await hasPackageBeenApplied(pkg.packageId);
    if (alreadyApplied) {
      return {packageId, imported: false, duplicate: true};
    }

    await mergePackage(pkg);
    return {packageId, imported: true, duplicate: false};
  } catch (err: any) {
    return {
      packageId,
      imported: false,
      duplicate: false,
      error: err.message ?? 'Failed to process inbound package',
    };
  }
}

/**
 * Validate and merge a single inbound payload that was sent without encryption.
 * The payload.encryptedPayload field contains raw JSON (not encrypted).
 */
export async function processRawInboundPayload(
  payload: InboundPayload,
): Promise<InboundResult> {
  let packageId = 'unknown';
  try {
    const raw = JSON.parse(payload.encryptedPayload);

    const parseResult = SyncPackageSchema.safeParse(raw);
    if (!parseResult.success) {
      return {
        packageId,
        imported: false,
        duplicate: false,
        error: `Schema validation failed: ${parseResult.error.message}`,
      };
    }

    const pkg = parseResult.data as SyncPackage;
    packageId = pkg.packageId;

    const alreadyApplied = await hasPackageBeenApplied(pkg.packageId);
    if (alreadyApplied) {
      return {packageId, imported: false, duplicate: true};
    }

    await mergePackage(pkg);
    return {packageId, imported: true, duplicate: false};
  } catch (err: any) {
    return {
      packageId,
      imported: false,
      duplicate: false,
      error: err.message ?? 'Failed to process inbound package',
    };
  }
}

/**
 * Process all inbound payloads from a transport and return aggregate results.
 */
export async function receiveAndMergePackages(
  transport: SyncTransport,
  passphrase: string,
  args?: Record<string, unknown>,
): Promise<{imported: number; errors: string[]}> {
  const payloads = await transport.receivePackages(args);
  let imported = 0;
  const errors: string[] = [];

  for (const payload of payloads) {
    const result = await processInboundPayload(payload, passphrase);
    if (result.imported) {
      imported++;
    } else if (!result.duplicate && result.error) {
      errors.push(result.error);
      console.warn('syncOrchestrator: inbound error:', result.error);
    }
  }

  return {imported, errors};
}
