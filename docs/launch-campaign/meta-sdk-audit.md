# Meta Wearables SDK — glasses-bridge.js Technical Audit

**File:** `src/meta-sdk/glasses-bridge.js` (772 lines, ~28KB)
**Date:** March 21, 2026
**Auditor:** Claude (automated review)

---

## Executive Summary

The glasses-bridge.js is **well-architected but mostly unconnected to real hardware**. The file is honest about this — the header comment explicitly states that no third-party display/HUD API exists from Meta, and the primary approach is audio-first via TTS through Bluetooth speakers. However, the README.md is out of date and still describes visual HUD rendering that the bridge code itself has already abandoned.

**Verdict:** The JS-side bridge logic is solid and production-quality. The critical gap is that **zero native modules exist** — no `MetaWearablesBridge.kt`, no `.swift` file, no `native-bridge-spec.md`. The entire native layer that actually talks to the Meta SDK needs to be built from scratch.

---

## 1. SDK Methods/APIs Used

### What the bridge calls (via `NativeModules.MetaWearablesBridge`):

| Native Method | Purpose | Status |
|---|---|---|
| `initialize({ appId, clientToken, useMockDevice })` | Init Meta SDK | **No native module exists** |
| `isCompanionAppInstalled()` | Check for Meta AI app | **No native module exists** |
| `connectToGlasses()` | Bluetooth pairing via Meta AI | **No native module exists** |
| `requestCameraAccess()` | Camera permission grant | **No native module exists** |
| `startCameraStream(resolution)` | Start 720p video stream | **No native module exists** |
| `stopCameraStream()` | Stop video stream | **No native module exists** |
| `disconnectGlasses()` | Clean disconnect | **No native module exists** |
| `triggerHaptic(intensity)` | Haptic feedback | **No native module exists** |
| `playSpatialAudio(bearing, sound)` | Directional audio | **No native module exists** |

### What actually works today (pure JS, no native dependency):

| Component | Library | Status |
|---|---|---|
| TTS Engine | `react-native-tts` | **IMPORT EXISTS but not in package.json** |
| Native Modules bridge | `react-native` NativeModules | Framework-level, works |
| NativeEventEmitter | `react-native` NativeEventEmitter | Framework-level, works |

**Critical finding:** `react-native-tts` is imported on line 34 but is **not listed in package.json dependencies**. The app will crash on launch.

---

## 2. Display Capabilities

**Reality check:** The Meta Wearables Device Access Toolkit **does not provide any display/HUD API for third-party developers**. The bridge correctly identifies this limitation in its header comment. Display stubs are future-proofing only.

---

## 3. Audio Capabilities

Audio is the **primary functional path**:

- **TTS Engine:** `react-native-tts` with rate 0.48, pitch 1.0, language en-US
- **Bluetooth routing:** TTS audio routes to glasses speakers automatically when Bluetooth audio profile is connected
- **Throttling:** Distance-bucket system (every 100ft) with 8-second minimum gap between announcements
- **Spatial audio:** Falls back to TTS direction cues ("ahead", "to your right", etc.)

**Assessment:** The TTS approach is the correct architecture given Meta's SDK limitations.

---

## 4. Sensor Data

- **Camera:** Architecture correct, but native module doesn't exist
- **IMU / Compass:** Not referenced. Direction comes from phone GPS/compass.
- **Haptics:** Not exposed in the SDK. Aspirational.

---

## 5. What's Production-Ready vs. What Needs Building

### Production-Ready (JS side):
- TTS announcement logic with throttling and distance bucketing
- Connection mode management and graceful degradation
- Sign lifecycle (show/update/hide) with audio announcements
- MockDevice testing path
- Clean disconnect with resource cleanup

### Needs Fixing Before Testing:
1. **Add `react-native-tts` to package.json** — app will crash without it
2. **Update README.md** — still describes abandoned visual HUD rendering

### Needs Building from Scratch (Native Layer):

| Component | Effort | Description |
|---|---|---|
| `MetaWearablesBridgeModule.kt` | 2-3 days | Android native module |
| `MetaWearablesBridge.swift` | 2-3 days | iOS native module |
| `android/app/build.gradle` changes | 1 hour | Add Meta SDK Gradle deps |
| `ios/Podfile` changes | 1 hour | Add MetaWearablesDAT |
| `native-bridge-spec.md` | 1 day | Document interface contract |
| Meta Developer App registration | 1-2 days | Register app with Meta |
| Meta SDK access approval | Unknown | SDK is in developer preview |

### Cannot Be Built (Meta Platform Limitations):
- HUD/Display rendering — Meta has no third-party display API
- Haptic feedback — Not exposed in the SDK
- IMU/Compass from glasses — Not exposed in the SDK
- Spatial audio positioning — Not exposed (TTS fallback is correct workaround)

---

## Recommendation for the CTO

1. **Fix the `react-native-tts` dependency** (5 minutes, blocks everything)
2. **Build the Kotlin native module** wrapping `mwdat-core` + `mwdat-camera`
3. **Apply for Meta SDK developer preview access**
4. **Accept that visual AR on the glasses is not possible** through Meta's SDK. If visual AR is a hard requirement, consider Snap Spectacles (which expose a display API via Lens Studio).

The bridge is architecturally sound. The gap is entirely in the native layer and Meta platform access.

---

*Sources: Meta Wearables DAT Android repo, Meta developer documentation, UploadVR SDK coverage, Road to VR SDK coverage*
