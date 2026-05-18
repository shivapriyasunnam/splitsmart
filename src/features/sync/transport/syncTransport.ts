/**
 * Transport interface for sync package delivery.
 * Both Drive and Bluetooth implement this so orchestration logic stays transport-agnostic.
 */

export interface OutboundTransferResult {
  success: boolean;
  /** True when the remote device explicitly acknowledged receipt and merge. */
  remoteAcked: boolean;
  remoteDeviceId?: string;
  error?: string;
}

export interface InboundPayload {
  /** Serialized EncryptedPayload JSON string. */
  encryptedPayload: string;
  transportMetadata?: Record<string, unknown>;
}

export interface SyncTransport {
  readonly id: 'drive' | 'bluetooth';
  sendPackage(args: {
    filename: string;
    encryptedPayload: string;
    packageId: string;
  }): Promise<OutboundTransferResult>;
  receivePackages(args?: Record<string, unknown>): Promise<InboundPayload[]>;
}
