#!/bin/bash

# Build Release AAB (Play Store) and APK, copy to Desktop with current date

set -e  # Exit on error

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
DESKTOP_DIR="$HOME/Desktop"
CURRENT_DATE=$(date +%Y%m%d)

AAB_SOURCE="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
AAB_DESTINATION="$DESKTOP_DIR/splitsmart-$CURRENT_DATE.aab"

APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
APK_DESTINATION="$DESKTOP_DIR/splitsmart-$CURRENT_DATE.apk"

echo "Building release AAB and APK..."
cd "$ANDROID_DIR"
./gradlew bundleRelease assembleRelease

echo "Build complete!"

if [ -f "$AAB_SOURCE" ]; then
  cp "$AAB_SOURCE" "$AAB_DESTINATION"
  echo "Play Store AAB ready: $AAB_DESTINATION"
fi

if [ -f "$APK_SOURCE" ]; then
  cp "$APK_SOURCE" "$APK_DESTINATION"
  echo "APK ready: $APK_DESTINATION"
fi
