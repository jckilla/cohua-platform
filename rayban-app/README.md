# COHUA — Meta Ray-Ban Display Companion App

React Native companion app for Meta Ray-Ban Display glasses. Detects nearby COHUA campaigns via GPS and announces them through the glasses speakers using text-to-speech (TTS). Display/HUD stubs are retained for when Meta releases a third-party overlay API.

## Audio-First Architecture

The Meta Wearables SDK **does not** currently expose a display or HUD API for third-party apps. Our approach:

- **PRIMARY — Audio:** When the user walks within `trigger_distance_m` of a campaign (default 50 m), the glasses speakers announce the business name, distance, and direction via TTS routed over Bluetooth.
- **CAMERA — Stub:** `mwdat-camera` integration is scaffolded for future storefront visual detection.
- **DISPLAY — Stub:** HUD rendering methods are retained as placeholders for when Meta releases a third-party overlay API.

```
Phone (React Native App)
  ├── GPS tracking              locationService
  ├── Supabase campaign fetch   campaignFetcher   ← pull model (5 s poll + 2 m move)
  ├── Proximity engine          proximityEngine
  │     └── campaign within trigger_distance_m?
  │           └── glasses.showSign() → TTS announcement
  └── glasses-bridge.js
        ├── Audio (ACTIVE)      TTS → Bluetooth A2DP → glasses speakers
        ├── Camera (stub)       mwdat-camera — awaiting integration
        └── Display (stub)      awaiting Meta HUD API
```

## Pull Model State Machine

`fetcher.js` polls Supabase every 5 seconds (or after 2 m of movement) and fires `enter`/`exit` proximity events. `proximityEngine` listens and calls the glasses bridge. Each campaign can override the trigger distance via the `trigger_distance_m` column; the fallback is `Config.TRIGGER_M` (50 m).

Future gaze-triggered (pull) display: when the user looks toward a sign direction for `GAZE_DWELL_MS` (1500 ms) within `CONE_ANGLE_DEG` (60°), the HUD overlay is pulled into view. Configurable in `src/services/config.js`.

## Meta SDK Setup

| SDK Package | Purpose | Status |
|---|---|---|
| `com.meta.wearable:mwdat-core` | Device pairing, audio | commented in build.gradle |
| `com.meta.wearable:mwdat-camera` | 720p camera stream | commented in build.gradle |
| `com.meta.wearable:mwdat-mockdevice` | Dev/test without glasses | commented in build.gradle |

To activate the real SDK:

1. Request access at the Meta Developer Portal and get Maven credentials.
2. Uncomment the Maven repo in `android/build.gradle`.
3. Uncomment the three SDK dependencies in `android/app/build.gradle`.
4. Uncomment the SDK import lines in `android/app/src/main/java/com/cohua/rayban/MetaWearablesBridgeModule.kt`.

The app works without the SDK — TTS falls back to the phone speaker and routes automatically to glasses via Bluetooth A2DP when paired.

## Setup

```bash
npm install

# Android
npx react-native run-android

# iOS (not primary target — Meta SDK is Android-only)
cd ios && pod install && cd ..
npx react-native run-ios
```

See **BUILD_APK.md** for full debug/release APK build instructions.

## Project Structure

```
src/
  App.js                        Root component
  screens/
    HomeScreen.js               Dashboard: GPS status, campaigns list, controls
  services/
    config.js                   All tunable constants (Supabase, thresholds, TTS, pull model)
    geo-math.js                 Haversine, bearing, relative direction utilities
    location.js                 GPS + compass service
    fetcher.js                  Supabase pull: fetch → radius filter → proximity events
    proximity-engine.js         Orchestrator: GPS → fetch → enter/exit → glasses bridge
  meta-sdk/
    glasses-bridge.js           Meta Wearables bridge (audio active, camera/display stubs)
android/
  app/src/main/java/com/cohua/rayban/
    MetaWearablesBridgeModule.kt  Native Kotlin bridge to mwdat-core/camera
    MetaWearablesPackage.kt       RN package registration
```

## Supabase Backend

Same backend as Snap Spectacles — no schema changes needed for audio-only mode.

- **URL:** `https://sgredejirqatcmstlzqi.supabase.co`
- **Table:** `campaigns` (`status = 'live'`, `latitude not null`)
- **Per-campaign overrides:** `trigger_distance_m`, `opt_in_required`, `model_url`, `deploy_payload`
- **Detection radius:** 914 m (3000 ft)
- **Default glasses trigger:** 50 m (overridable per campaign)
- **Poll interval:** 5 seconds or every 2 m of movement

## Key Configuration (`src/services/config.js`)

| Constant | Default | Purpose |
|---|---|---|
| `TRIGGER_M` | 50 | Fallback proximity trigger (m) |
| `TTS_THROTTLE_MS` | 8000 | Min ms between announcements for same campaign |
| `TTS_DISTANCE_BUCKET_FT` | 100 | Re-announce every 100 ft closer |
| `TTS_RATE` | 0.48 | Speech rate for clarity through glasses speakers |
| `CONE_ANGLE_DEG` | 60 | Gaze cone width for future pull-model HUD |
| `GAZE_DWELL_MS` | 1500 | Dwell time to trigger pull-model HUD |
