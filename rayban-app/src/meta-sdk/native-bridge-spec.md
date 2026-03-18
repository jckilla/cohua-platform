# Native Bridge Specification — Meta Wearables SDK Integration

This document describes the native modules required to bridge React Native to the Meta Wearables Device Access Toolkit (DAT) for COHUA's Ray-Ban glasses integration.

## Architecture Overview

```
React Native (JS)              Native (Kotlin / Swift)
─────────────────              ──────────────────────
glasses-bridge.js   ───────►   MetaWearablesBridge module
      │                              │
      ├── TTS (react-native-tts)     ├── mwdat-core (connection)
      ├── NativeModules              ├── mwdat-camera (video)
      └── NativeEventEmitter         ├── mwdat-mockdevice (testing)
                                     └── Bluetooth audio profile
                                           │
                                     Meta AI companion app
                                           │
                                     Ray-Ban glasses (BT)
```

## Meta SDK Credentials

```
Meta App ID:     1913450549305971
Client Token:    AR|1913450549305971|b1182207ff01e49a1215b8d6552213fb
```

Register at: https://developers.meta.com/wearables

SDK GitHub repos:
- Android: https://github.com/facebook/meta-wearables-dat-android
- iOS: https://github.com/facebook/meta-wearables-dat-ios

---

## Android Native Module (Kotlin)

### 1. Gradle Dependencies

```kotlin
// android/app/build.gradle
dependencies {
    implementation 'com.meta.wearable:mwdat-core:+'
    implementation 'com.meta.wearable:mwdat-camera:+'
    implementation 'com.meta.wearable:mwdat-mockdevice:+'
}
```

### 2. AndroidManifest Permissions

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
```

### 3. Native Module: MetaWearablesBridgeModule.kt

```kotlin
package com.cohua.rayban.metasdk

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
// Meta SDK imports
// import com.meta.wearable.dat.DeviceAccessManager
// import com.meta.wearable.dat.camera.CameraAccessManager
// import com.meta.wearable.dat.mockdevice.MockDeviceProvider

class MetaWearablesBridgeModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    private var deviceManager: Any? = null  // DeviceAccessManager
    private var cameraManager: Any? = null  // CameraAccessManager
    private var useMockDevice = false

    override fun getName() = "MetaWearablesBridge"

    /**
     * Initialize the Meta Wearables SDK.
     *
     * @param config ReadableMap with:
     *   - appId: String (Meta App ID)
     *   - clientToken: String (Client token)
     *   - useMockDevice: Boolean (use mock for testing)
     */
    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        try {
            val appId = config.getString("appId") ?: ""
            val clientToken = config.getString("clientToken") ?: ""
            useMockDevice = config.getBoolean("useMockDevice")

            // TODO: Replace with actual SDK initialization
            // if (useMockDevice) {
            //     val mockProvider = MockDeviceProvider.Builder()
            //         .setApplicationId(appId)
            //         .build()
            //     deviceManager = DeviceAccessManager.create(
            //         reactApplicationContext, mockProvider
            //     )
            // } else {
            //     deviceManager = DeviceAccessManager.create(
            //         reactApplicationContext,
            //         appId,
            //         clientToken
            //     )
            // }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message)
        }
    }

    /**
     * Check if the Meta AI companion app is installed.
     */
    @ReactMethod
    fun isCompanionAppInstalled(promise: Promise) {
        try {
            // Check for Meta AI app package
            val pm = reactApplicationContext.packageManager
            val metaAiPackage = "com.facebook.orca" // Meta AI / Messenger
            val isInstalled = try {
                pm.getPackageInfo(metaAiPackage, 0)
                true
            } catch (e: Exception) {
                false
            }
            promise.resolve(isInstalled)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message)
        }
    }

    /**
     * Connect to Ray-Ban glasses via Bluetooth.
     * Requires Meta AI companion app to be running.
     *
     * Real SDK call:
     *   deviceManager.connect()
     *       .collect { connectionState ->
     *           // ConnectionState.CONNECTED
     *       }
     */
    @ReactMethod
    fun connectToGlasses(promise: Promise) {
        try {
            // TODO: Real SDK connection via Kotlin Flow
            // CoroutineScope(Dispatchers.IO).launch {
            //     deviceManager?.connectionState
            //         ?.collect { state ->
            //             if (state == ConnectionState.CONNECTED) {
            //                 promise.resolve(true)
            //             }
            //         }
            // }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message)
        }
    }

    /**
     * Disconnect from glasses.
     */
    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            // TODO: deviceManager?.disconnect()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message)
        }
    }

    /**
     * Request camera access from the glasses.
     *
     * Real SDK call:
     *   CameraAccessManager.requestAccess(deviceManager)
     */
    @ReactMethod
    fun requestCameraAccess(promise: Promise) {
        try {
            // TODO:
            // cameraManager = CameraAccessManager.create(deviceManager)
            // val granted = cameraManager?.requestAccess()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CAMERA_ACCESS_ERROR", e.message)
        }
    }

    /**
     * Start streaming video from the glasses camera.
     * Emits 'MetaWearablesCameraFrame' events to JS.
     *
     * Real SDK call:
     *   cameraManager?.startStreaming(resolution)
     *       ?.collect { frame ->
     *           sendEvent("MetaWearablesCameraFrame", frameData)
     *       }
     */
    @ReactMethod
    fun startCameraStream(resolution: String, promise: Promise) {
        try {
            // TODO: Start camera stream via SDK
            // The SDK uses Kotlin Flows for reactive streaming:
            //
            // CoroutineScope(Dispatchers.IO).launch {
            //     cameraManager?.videoFrames
            //         ?.collect { frame ->
            //             val params = Arguments.createMap().apply {
            //                 putInt("width", frame.width)
            //                 putInt("height", frame.height)
            //                 putDouble("timestamp", frame.timestamp.toDouble())
            //             }
            //             sendEvent("MetaWearablesCameraFrame", params)
            //         }
            // }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CAMERA_STREAM_ERROR", e.message)
        }
    }

    /**
     * Stop the camera stream.
     */
    @ReactMethod
    fun stopCameraStream(promise: Promise) {
        try {
            // TODO: cameraManager?.stopStreaming()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CAMERA_STOP_ERROR", e.message)
        }
    }

    /**
     * Trigger haptic feedback on the glasses.
     */
    @ReactMethod
    fun triggerHaptic(intensity: String) {
        // TODO: deviceManager?.haptics?.tap(intensity)
    }

    /**
     * Play spatial audio through the glasses speakers.
     */
    @ReactMethod
    fun playSpatialAudio(bearing: Double, sound: String, promise: Promise) {
        try {
            // TODO: deviceManager?.audio?.playSpatial(sound, bearing)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUDIO_ERROR", e.message)
        }
    }

    // Send events to React Native JS
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
```

### 4. Package Registration: MetaWearablesPackage.kt

```kotlin
package com.cohua.rayban.metasdk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MetaWearablesPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(MetaWearablesBridgeModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
```

### 5. Register in MainApplication.kt

```kotlin
// In getPackages():
override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    packages.add(MetaWearablesPackage())
    return packages
}
```

---

## iOS Native Module (Swift)

### 1. Swift Package Manager / CocoaPods

```ruby
# ios/Podfile
pod 'MetaWearablesDAT', :git => 'https://github.com/facebook/meta-wearables-dat-ios.git'
```

Or via SPM in Xcode: Add package dependency for the Meta Wearables DAT repo.

### 2. Info.plist Permissions

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>COHUA needs Bluetooth to connect to your Ray-Ban glasses</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>COHUA needs Bluetooth to connect to your Ray-Ban glasses</string>
<key>NSCameraUsageDescription</key>
<string>COHUA uses the glasses camera for storefront detection</string>
```

### 3. Native Module: MetaWearablesBridge.swift

```swift
import Foundation
import React
// import MWDATCore
// import MWDATCamera
// import MWDATMockDevice

@objc(MetaWearablesBridge)
class MetaWearablesBridge: RCTEventEmitter {

    // private var deviceManager: DeviceAccessManager?
    // private var cameraManager: CameraAccessManager?
    private var useMockDevice = false

    override func supportedEvents() -> [String]! {
        return ["MetaWearablesCameraFrame"]
    }

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func initialize(
        _ config: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let appId = config["appId"] as? String ?? ""
        let clientToken = config["clientToken"] as? String ?? ""
        useMockDevice = config["useMockDevice"] as? Bool ?? false

        // TODO: Initialize Meta SDK
        // if useMockDevice {
        //     let mockConfig = MockDeviceConfiguration(applicationId: appId)
        //     deviceManager = DeviceAccessManager(mockConfiguration: mockConfig)
        // } else {
        //     deviceManager = DeviceAccessManager(
        //         applicationId: appId,
        //         clientToken: clientToken
        //     )
        // }

        resolve(true)
    }

    @objc
    func isCompanionAppInstalled(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Check for Meta AI app via URL scheme
        let metaAIURL = URL(string: "fb-messenger://")!
        let isInstalled = UIApplication.shared.canOpenURL(metaAIURL)
        resolve(isInstalled)
    }

    @objc
    func connectToGlasses(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: deviceManager?.connect { result in ... }
        resolve(true)
    }

    @objc
    func disconnect(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: deviceManager?.disconnect()
        resolve(true)
    }

    @objc
    func requestCameraAccess(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: CameraAccessManager.requestAccess(deviceManager) { granted in ... }
        resolve(true)
    }

    @objc
    func startCameraStream(
        _ resolution: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: Stream frames and emit events
        // cameraManager?.startStreaming { [weak self] frame in
        //     self?.sendEvent(withName: "MetaWearablesCameraFrame", body: [
        //         "width": frame.width,
        //         "height": frame.height,
        //         "timestamp": frame.timestamp
        //     ])
        // }
        resolve(true)
    }

    @objc
    func stopCameraStream(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: cameraManager?.stopStreaming()
        resolve(true)
    }

    @objc
    func triggerHaptic(_ intensity: String) {
        // TODO: deviceManager?.haptics?.tap(intensity: intensity)
    }

    @objc
    func playSpatialAudio(
        _ bearing: Double,
        sound: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // TODO: deviceManager?.audio?.playSpatial(sound, bearing: bearing)
        resolve(true)
    }
}
```

### 4. Objective-C Bridge: MetaWearablesBridge.m

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MetaWearablesBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(initialize:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isCompanionAppInstalled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(connectToGlasses:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(disconnect:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestCameraAccess:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startCameraStream:(NSString *)resolution
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopCameraStream:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(triggerHaptic:(NSString *)intensity)

RCT_EXTERN_METHOD(playSpatialAudio:(double)bearing
                  sound:(NSString *)sound
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

---

## Audio Output — How TTS Routes to Glasses Speakers

The Ray-Ban glasses connect to the phone as a standard Bluetooth audio device. When paired:

1. **React Native TTS** (`react-native-tts`) generates speech on the phone
2. The phone's audio system routes output through the **active Bluetooth audio profile** (A2DP)
3. Audio plays through the **glasses' open-ear speakers**

No special Meta SDK call is needed for basic TTS audio. The Bluetooth audio routing is handled by the OS.

For spatial audio or custom audio effects, the native bridge would need to use the Meta SDK's audio APIs (when available).

### TTS Setup

```bash
npm install react-native-tts
cd ios && pod install
```

```javascript
import Tts from 'react-native-tts';

Tts.setDefaultRate(0.48);      // Slightly slow for clarity
Tts.setDefaultPitch(1.0);
Tts.setDefaultLanguage('en-US');

// Audio automatically routes to glasses when BT connected
Tts.speak('COHUA sign ahead: Pizza Palace, 120 feet ahead');
```

---

## Camera Streaming Setup

The Meta Wearables SDK provides camera access through `mwdat-camera`. The glasses camera supports:
- Resolution: 720p (1280x720)
- Frame rate: 30fps max
- Format: Video frames via SDK callback/Flow

### Android (Kotlin Flow pattern)

```kotlin
// The Meta SDK uses Kotlin Flows for reactive data streaming
val cameraManager = CameraAccessManager.create(deviceManager)

// Request access
val granted = cameraManager.requestAccess()

// Stream frames
coroutineScope.launch {
    cameraManager.videoFrames.collect { frame ->
        // frame.width, frame.height, frame.data, frame.timestamp
        // Process frame or send to React Native via event
    }
}
```

### iOS (Async callback pattern)

```swift
let cameraManager = CameraAccessManager(deviceManager: deviceManager)

// Request access
cameraManager.requestAccess { granted in
    guard granted else { return }

    // Stream frames
    cameraManager.startStreaming { frame in
        // frame.width, frame.height, frame.data, frame.timestamp
    }
}
```

### MockDevice for Testing

The `mwdat-mockdevice` module provides simulated camera frames for development without physical glasses:

```kotlin
// Android
val mockProvider = MockDeviceProvider.Builder()
    .setApplicationId(appId)
    .enableCamera(true)  // Simulate camera frames
    .build()

val deviceManager = DeviceAccessManager.create(context, mockProvider)
```

---

## React Native Bridge Setup Checklist

### Android
- [ ] Add mwdat dependencies to `android/app/build.gradle`
- [ ] Add permissions to `AndroidManifest.xml`
- [ ] Create `MetaWearablesBridgeModule.kt` in the app's Java/Kotlin source
- [ ] Create `MetaWearablesPackage.kt`
- [ ] Register package in `MainApplication.kt`
- [ ] Sync Gradle and rebuild

### iOS
- [ ] Add MetaWearablesDAT pod or SPM dependency
- [ ] Add permissions to `Info.plist`
- [ ] Create `MetaWearablesBridge.swift`
- [ ] Create `MetaWearablesBridge.m` (ObjC bridge header)
- [ ] Run `pod install` and rebuild

### JavaScript
- [ ] Install `react-native-tts`: `npm install react-native-tts`
- [ ] iOS: `cd ios && pod install`
- [ ] Import and use `MetaGlassesSDK` from `glasses-bridge.js`
- [ ] Call `MetaGlassesSDK.connect()` at app startup
- [ ] The proximity engine calls `showSign()` / `updateSign()` / `hideSign()` as before
