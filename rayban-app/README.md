# COHUA - Meta Ray-Ban Display Companion App

React Native mobile app that serves as the companion for Meta Ray-Ban Display glasses. Detects nearby COHUA advertising campaigns via GPS and announces them through the glasses speakers using text-to-speech.

## Audio-First Approach

The Meta Wearables SDK (Device Access Toolkit) does **not** yet provide a display/HUD API for third-party apps. This app uses an **audio-first** strategy:

- **Primary**: When the user walks within 50m of a COHUA campaign, the glasses **speak** the business info through their built-in speakers via Bluetooth A2DP.
- **Camera**: Stubs are in place for future storefront visual detection using the glasses camera (720p/30fps).
- **Display**: Placeholder methods are retained for when Meta releases third-party HUD APIs.

## Prerequisites

- **Node.js** >= 18
- **React Native CLI** (`npx react-native`)
- **Android Studio** (for Android builds)
  - Android SDK 34+
  - Kotlin plugin
- **Xcode 15+** (for iOS builds, macOS only)
  - CocoaPods (`gem install cocoapods`)
- **Meta Wearables Device Access Toolkit** (optional, for real glasses)
  - Request access at [Meta for Developers](https://developers.facebook.com/)
  - Meta App ID: configured in `src/meta-sdk/glasses-bridge.js`

## Setup

```bash
# Clone and install
cd rayban-app
npm install

# iOS only
cd ios && pod install && cd ..
```

## Running the App

### MockDevice Mode (Development - No Glasses Needed)

The app defaults to MockDevice mode in development (`__DEV__`). This simulates the glasses connection and camera without physical hardware.

```bash
# Start Metro bundler
npm start

# Run on Android emulator/device
npm run android

# Run on iOS simulator/device
npm run ios
```

In MockDevice mode:
- Glasses connection is simulated immediately
- Camera frames are mocked at 30fps
- TTS announcements play through the phone speaker
- All proximity detection and campaign fetching work normally via real GPS

### Real Device (Physical Ray-Ban Glasses)

1. Install the **Meta AI** companion app on your phone
2. Pair your Ray-Ban glasses through Meta AI
3. Build the app in release mode:

```bash
# Android
npx react-native run-android --mode=release

# iOS
npx react-native run-ios --configuration Release
```

4. The app will connect to the glasses via Bluetooth
5. TTS audio automatically routes to the glasses speakers via Bluetooth A2DP

### Meta SDK Setup (Android)

To enable the real Meta Wearables SDK (beyond stubs):

1. Add the Meta Maven repository to `android/settings.gradle`:
   ```groovy
   dependencyResolutionManagement {
       repositories {
           maven { url 'https://github.com/nicklockwood/meta-wearables-dat-android/raw/main/repo' }
       }
   }
   ```

2. Apply the dependency patch from `android/app/build.gradle.patch` to your `build.gradle`

3. Register the native package in `MainApplication.kt`:
   ```kotlin
   packages.add(com.cohua.rayban.MetaWearablesPackage())
   ```

4. Uncomment the SDK imports in `MetaWearablesBridgeModule.kt`

### Meta SDK Setup (iOS)

1. Add the Meta Wearables SDK via Swift Package Manager or CocoaPods
2. Uncomment the SDK imports in `ios/MetaWearablesBridge.swift`
3. The ObjC bridging file (`MetaWearablesBridge.m`) is already configured

## Architecture

```
Phone (React Native App)
  +-- index.js                         Entry point, registers App
  +-- src/App.js                       Root component, renders HomeScreen
  +-- src/screens/HomeScreen.js        Main dashboard UI
  +-- src/services/
  |     +-- config.js                  Constants (Supabase, radius, thresholds)
  |     +-- geo-math.js                Haversine, bearing, direction utilities
  |     +-- location.js                GPS + compass service (singleton)
  |     +-- fetcher.js                 Supabase campaign fetcher (singleton)
  |     +-- proximity-engine.js        Orchestrator: GPS -> fetch -> proximity -> glasses
  +-- src/meta-sdk/
  |     +-- glasses-bridge.js          Meta SDK integration (TTS + native bridge)
  |     +-- mock-test.js               MockDevice integration test
  +-- android/app/src/main/java/com/cohua/rayban/
  |     +-- MetaWearablesBridgeModule.kt   Android native module (Kotlin)
  |     +-- MetaWearablesPackage.kt        React Native package registration
  +-- android/app/build.gradle.patch       Meta SDK Gradle dependencies
  +-- ios/
        +-- MetaWearablesBridge.swift       iOS native module (Swift)
        +-- MetaWearablesBridge.m           ObjC bridging declarations
```

### Data Flow

1. **GPS** (`location.js`) tracks user position continuously
2. **Fetcher** (`fetcher.js`) queries Supabase for live campaigns every 5s or on 2m+ movement
3. **Proximity Engine** (`proximity-engine.js`) filters campaigns within 914m (3000 ft) detection radius
4. When user enters the **50m trigger zone**, the engine calls `glasses-bridge.js`
5. **Glasses Bridge** speaks the business name, distance, and direction through the glasses speakers via TTS over Bluetooth

### Connection Modes

| Mode | Description |
|------|-------------|
| `audio_only` | TTS through glasses speakers (or phone speaker fallback) |
| `audio_camera` | Audio + camera streaming from glasses |
| `mock_device` | Simulated glasses for development |
| `disconnected` | No glasses connected |

## Supabase Backend

Uses the same backend as the Snap Spectacles version.

- **Table**: `campaigns` (filtered by `status = 'live'` and `latitude not null`)
- **Detection radius**: 914m (3000 ft)
- **Glasses trigger**: 50m
- **Poll interval**: 5 seconds

## Running the Mock Test

The mock test validates the full sign lifecycle without glasses:

```bash
# From the rayban-app directory
node src/meta-sdk/mock-test.js
```

This simulates walking near the Downey Post Office, logging all TTS output that would route to the glasses speakers.
