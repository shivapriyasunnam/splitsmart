import {GoogleSignin, statusCodes} from '@react-native-google-signin/google-signin';
import {DriveConfig} from '../../../types';

// Drive API scope for file access
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function configureDriveAuth(webClientId: string): void {
  GoogleSignin.configure({
    scopes: [DRIVE_SCOPE],
    webClientId,
  });
}

export async function signInWithGoogle(): Promise<{
  email: string;
  accessToken: string;
}> {
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const userInfo = await GoogleSignin.signIn();
  const tokens = await GoogleSignin.getTokens();
  return {
    email: userInfo.data?.user?.email ?? '',
    accessToken: tokens.accessToken,
  };
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await GoogleSignin.signOut();
}

export async function isSignedIn(): Promise<boolean> {
  return GoogleSignin.hasPreviousSignIn();
}

export async function silentSignIn(): Promise<string | null> {
  try {
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (err: any) {
    if (err.code === statusCodes.SIGN_IN_REQUIRED) {
      return null;
    }
    throw err;
  }
}

// ─── Drive File Ops ──────────────────────────────────────────────────────────

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function driveRequest(
  path: string,
  options: RequestInit,
  accessToken: string,
): Promise<any> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json') || res.status !== 204) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return null;
}

export async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  accessToken: string,
): Promise<string> {
  // Search for existing folder
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const searchRes = await driveRequest(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {method: 'GET'},
    accessToken,
  );

  if (searchRes?.files?.length > 0) {
    return searchRes.files[0].id;
  }

  // Create folder
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await driveRequest(
    '/files?fields=id',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(metadata),
    },
    accessToken,
  );
  return createRes.id;
}

export async function uploadFileToDrive(
  filename: string,
  content: string,
  folderId: string,
  accessToken: string,
): Promise<string> {
  const metadata = {
    name: filename,
    parents: [folderId],
  };

  const boundary = 'boundary_splitsmart_upload';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.id;
}

export async function listFilesInFolder(
  folderId: string,
  accessToken: string,
  nameSuffix?: string,
): Promise<Array<{id: string; name: string; modifiedTime: string}>> {
  let query = `'${folderId}' in parents and trashed=false`;
  if (nameSuffix) {
    query += ` and name contains '${nameSuffix}'`;
  }
  const res = await driveRequest(
    `/files?q=${encodeURIComponent(query)}&orderBy=name&fields=files(id,name,modifiedTime)`,
    {method: 'GET'},
    accessToken,
  );
  return res?.files ?? [];
}

export async function downloadFileFromDrive(
  fileId: string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  if (!res.ok) {
    throw new Error(`Drive download error ${res.status}`);
  }
  return res.text();
}

/**
 * Set up the full SplitSmart folder structure in Drive.
 * Returns the folder IDs for the app, currentDevice, and a reference to partnerFolder.
 */
export async function setupDriveFolders(
  deviceId: string,
  accessToken: string,
): Promise<{appFolderId: string; deviceFolderId: string; changesFolderId: string; backupsFolderId: string}> {
  const appFolderId = await findOrCreateFolder('SplitSmart', null, accessToken);
  const devicesFolderId = await findOrCreateFolder('devices', appFolderId, accessToken);
  const deviceFolderId = await findOrCreateFolder(deviceId, devicesFolderId, accessToken);
  const changesFolderId = await findOrCreateFolder('changes', deviceFolderId, accessToken);
  const backupsFolderId = await findOrCreateFolder('backups', deviceFolderId, accessToken);

  return {appFolderId, deviceFolderId, changesFolderId, backupsFolderId};
}
