#!/bin/bash

# Build Release APK and copy to Desktop with current date

set -e  # Exit on error

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
DESKTOP_DIR="$HOME/Desktop"
CURRENT_DATE=$(date +%Y%m%d)
APK_DESTINATION="$DESKTOP_DIR/splitsmart-$CURRENT_DATE.apk"

echo "🔨 Building release APK..."
cd "$ANDROID_DIR"
./gradlew assembleRelease

echo "✅ Build complete!"

if [ -f "$APK_SOURCE" ]; then
  echo "📱 Copying APK to Desktop..."
  cp "$APK_SOURCE" "$APK_DESTINATION"
  echo "🎉 Release APK ready: $APK_DESTINATION"
else
  echo "❌ Error: APK not found at $APK_SOURCE"
  exit 1
fi
