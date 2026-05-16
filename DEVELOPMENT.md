# SplitSmart — Development Guide

## Prerequisites

### 1. Java 17
```bash
brew install openjdk@17
```

### 2. Android Studio
Download from https://developer.android.com/studio, then open **SDK Manager** and install:
- Android SDK Platform 34
- Android SDK Build-Tools 34
- Android Emulator

### 3. Environment variables
Add to `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
```
Then reload: `source ~/.zshrc`

### 4. Install dependencies
```bash
cd /Users/priya/Desktop/splitsmart
npm install
```

---

## Running on Android

**Step 1 — Start Metro bundler** (keep this running in a terminal):
```bash
npm start
```

**Step 2 — Launch emulator or plug in a device**, then in a second terminal:
```bash
npm run android
```

This compiles the Kotlin/Java code (including the WorkManager bridge), installs the APK on the emulator/device, and opens the app.

---

## Running Tests

**All unit tests:**
```bash
npm test
```

**Specific test files:**
```bash
npx jest balanceService         # balance math
npx jest categorizationService  # auto-categorization regex
npx jest budgetService          # budget rows + summary
npx jest encryptionService      # AES encrypt/decrypt
npx jest mergeService           # sync merge (DB mocked)
npx jest eodSequence            # upload-before-backup ordering
```

**With coverage report:**
```bash
npx jest --coverage
```

---

## Google Sign-In Setup (required for Drive sync)

1. Go to https://console.cloud.google.com → create a project → enable **Google Drive API**
2. Create an **OAuth 2.0 Client ID** for Android with package name `com.splitsmart`
3. Get your app's SHA-1 fingerprint:
   ```bash
   cd android && ./gradlew signingReport
   ```
4. Add the SHA-1 to your OAuth client, then download `google-services.json` and place it at `android/app/google-services.json`
5. In `android/build.gradle`, add to the `dependencies` block:
   ```groovy
   classpath 'com.google.gms:google-services:4.4.0'
   ```
6. At the bottom of `android/app/build.gradle`, add:
   ```groovy
   apply plugin: 'com.google.gms.google-services'
   ```

---

## Building an APK

**Debug APK** (no signing required — easiest for testing):
```bash
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

**Release APK:**
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

To install a debug APK directly on a connected device:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```
