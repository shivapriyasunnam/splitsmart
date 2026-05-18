/**
 * Drive transport adapter — implements SyncTransport using Google Drive.
 * Thin wrapper so DriveOps can stay the Drive-specific owner of file operations
 * while orchestration logic uses the shared interface.
 */
import {SyncTransport, OutboundTransferResult, InboundPayload} from './syncTransport';
import {
  uploadFileToDrive,
  listFilesInFolder,
  downloadFileFromDrive,
} from '../drive/driveService';

export class DriveTransport implements SyncTransport {
  readonly id = 'drive' as const;

  constructor(
    private readonly token: string,
    private readonly changesFolderId: string,
    private readonly partnerDeviceFolderId?: string,
  ) {}

  async sendPackage(args: {
    filename: string;
    encryptedPayload: string;
    packageId: string;
  }): Promise<OutboundTransferResult> {
    try {
      await uploadFileToDrive(args.filename, args.encryptedPayload, this.changesFolderId, this.token);
      // Drive upload is fire-and-forget; no explicit remote ACK from the peer device
      return {success: true, remoteAcked: false};
    } catch (err: any) {
      return {success: false, remoteAcked: false, error: err.message ?? 'Drive upload failed'};
    }
  }

  async receivePackages(): Promise<InboundPayload[]> {
    if (!this.partnerDeviceFolderId) return [];
    const files = await listFilesInFolder(this.partnerDeviceFolderId, this.token, '.sync.enc');
    files.sort((a, b) => a.name.localeCompare(b.name));

    const payloads: InboundPayload[] = [];
    for (const file of files) {
      try {
        const content = await downloadFileFromDrive(file.id, this.token);
        payloads.push({
          encryptedPayload: content,
          transportMetadata: {driveFileId: file.id, driveFileName: file.name},
        });
      } catch (err) {
        console.warn(`DriveTransport: failed to download ${file.name}:`, err);
      }
    }
    return payloads;
  }
}
