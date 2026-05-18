import {NativeModules} from 'react-native';

const {DownloadModule} = NativeModules as {
  DownloadModule: {
    saveToDownloads(filename: string, content: string, mimeType: string): Promise<string>;
  };
};

/**
 * Saves a text file to the device's Downloads folder via the native DownloadModule.
 * Returns the filename on success.
 * Only available on Android — do not call on iOS.
 */
export function saveToDownloads(
  filename: string,
  content: string,
  mimeType: string,
): Promise<string> {
  return DownloadModule.saveToDownloads(filename, content, mimeType);
}
