import {NativeModules} from 'react-native';

const {FilePickerModule} = NativeModules as {
  FilePickerModule: {
    /** Opens the system file picker for JSON files. Resolves with file content string, or null if cancelled. */
    pickJsonFile(): Promise<string | null>;
  };
};

/**
 * Opens Android's system file picker restricted to JSON files.
 * Returns the file content as a string, or null if the user cancelled.
 * Only available on Android.
 */
export function pickJsonFile(): Promise<string | null> {
  return FilePickerModule.pickJsonFile();
}
