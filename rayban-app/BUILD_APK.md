# COHUA Ray-Ban Companion App — APK Build Guide

## Prerequisites

1. **macOS or Linux** with at least 8GB RAM
2. **JDK 17** — `brew install openjdk@17` (macOS) or `sudo apt install openjdk-17-jdk` (Linux)
3. **Android SDK** — Install via Android Studio or `sdkmanager`
   - SDK Platform 34
   - Build Tools 34.0.0
   - NDK 26.1.10909125
4. **Node.js 18+** and npm
5. **Environment variables** in your shell profile:
   ```bash
   export JAVA_HOME=$(/usr/libexec/java_home -v 17)  # macOS
   export ANDROID_HOME=$HOME/Library/Android/sdk        # macOS
   export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
   ```

## Build Steps

```bash
# 1. Install JS dependencies
cd rayban-app
npm install

# 2. Download the Gradle wrapper JAR (required if missing)
cd android
gradle wrapper --gradle-version 8.6
cd ..

# 3. Build debug APK (no signing key needed)
cd android
./gradlew assembleDebug

# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

## For a Release APK

Generate a signing keystore first:
```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore android/app/cohua-release.keystore \
  -alias cohua-key -keyalg RSA -keysize 2048 -validity 10000
```

Then add to `android/gradle.properties`:
```
COHUA_RELEASE_STORE_FILE=cohua-release.keystore
COHUA_RELEASE_KEY_ALIAS=cohua-key
COHUA_RELEASE_STORE_PASSWORD=your_password
COHUA_RELEASE_KEY_PASSWORD=your_password
```

Update `android/app/build.gradle` signingConfigs:
```gradle
release {
    storeFile file(COHUA_RELEASE_STORE_FILE)
    storePassword COHUA_RELEASE_STORE_PASSWORD
    keyAlias COHUA_RELEASE_KEY_ALIAS
    keyPassword COHUA_RELEASE_KEY_PASSWORD
}
```

Then build:
```bash
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Package Name

`com.cohua.rayban` — matches Meta Developer Portal registration.

## Meta SDK Integration Status

The native bridge (`MetaWearablesBridgeModule.kt`) is fully stubbed. The actual
Meta Wearables SDK (`mwdat-core`, `mwdat-camera`) imports are commented out.
To activate:

1. Get SDK access from Meta's developer portal
2. Uncomment the Maven repo URL in `android/build.gradle`
3. Uncomment the SDK dependencies in `android/app/build.gradle`
4. Uncomment the SDK import lines in `MetaWearablesBridgeModule.kt`

The app works without the SDK — it degrades to TTS through the phone speaker
(audio routes to glasses automatically via Bluetooth A2DP when paired).
