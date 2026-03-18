package com.cohua.rayban

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
// Meta SDK imports — uncomment when SDK is added to gradle
// import com.meta.wearable.dat.DeviceAccessManager
// import com.meta.wearable.dat.ConnectionState
// import com.meta.wearable.dat.camera.CameraAccessManager
// import com.meta.wearable.dat.mockdevice.MockDeviceProvider

/**
 * MetaWearablesBridgeModule — React Native native module that bridges JS to
 * the Meta Wearables Device Access Toolkit (DAT) SDK.
 *
 * Exposed to JS as NativeModules.MetaWearablesBridge
 *
 * Methods:
 *   - initialize(config)        — Init SDK with appId, clientToken, useMockDevice
 *   - connectToGlasses()        — Connect to Ray-Ban glasses via Bluetooth
 *   - disconnectGlasses()       — Disconnect from glasses
 *   - startCameraStream(res)    — Start 720p camera streaming from glasses
 *   - stopCameraStream()        — Stop camera stream
 *   - getConnectionState()      — Get current connection state string
 *
 * Events emitted to JS via RCTDeviceEventEmitter:
 *   - onConnectionStateChanged  — { state: "connected" | "disconnected" | ... }
 *   - onCameraFrame             — { width, height, timestamp }
 *   - onError                   — { code, message }
 *
 * TTS Routing:
 *   react-native-tts automatically routes audio to the glasses speakers
 *   when the glasses are connected via Bluetooth A2DP. No special SDK call
 *   is needed — the OS handles Bluetooth audio routing.
 *
 * MockDevice Mode:
 *   When useMockDevice=true (or __DEV__), the module uses mwdat-mockdevice
 *   to simulate glasses connection and camera frames without physical hardware.
 */
class MetaWearablesBridgeModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    // Real SDK references — typed as Any? until SDK is linked
    private var deviceManager: Any? = null   // DeviceAccessManager
    private var cameraManager: Any? = null   // CameraAccessManager
    private var useMockDevice = false
    private var connectionState = "disconnected"
    private val coroutineScope = CoroutineScope(Dispatchers.IO)
    private var cameraStreamJob: Job? = null

    override fun getName(): String = "MetaWearablesBridge"

    // ── Initialize ──────────────────────────────────────────────────────────

    /**
     * Initialize the Meta Wearables SDK.
     *
     * @param config ReadableMap with:
     *   - appId: String (Meta App ID: 1913450549305971)
     *   - clientToken: String (AR|1913450549305971|...)
     *   - useMockDevice: Boolean
     */
    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        try {
            val appId = config.getString("appId") ?: ""
            val clientToken = config.getString("clientToken") ?: ""
            useMockDevice = if (config.hasKey("useMockDevice")) {
                config.getBoolean("useMockDevice")
            } else {
                false
            }

            if (useMockDevice) {
                // MockDevice mode — simulate glasses without hardware
                // Uses com.meta.wearable:mwdat-mockdevice
                //
                // val mockProvider = MockDeviceProvider.Builder()
                //     .setApplicationId(appId)
                //     .enableCamera(true)
                //     .build()
                // deviceManager = DeviceAccessManager.create(
                //     reactApplicationContext, mockProvider
                // )
                connectionState = "mock_ready"
            } else {
                // Production mode — real SDK initialization
                // Uses com.meta.wearable:mwdat-core
                //
                // deviceManager = DeviceAccessManager.create(
                //     reactApplicationContext,
                //     appId,
                //     clientToken
                // )
                connectionState = "initialized"
            }

            promise.resolve(true)
        } catch (e: Exception) {
            sendError("INIT_ERROR", e.message ?: "Initialization failed")
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    // ── Connection ───────────────────────────────────────────────────────────

    /**
     * Check if the Meta AI companion app is installed.
     * The companion app brokers the Bluetooth connection to the glasses.
     */
    @ReactMethod
    fun isCompanionAppInstalled(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            // Meta AI / companion app package name
            val metaAiPackage = "com.facebook.orca"
            val isInstalled = try {
                pm.getPackageInfo(metaAiPackage, 0)
                true
            } catch (e: Exception) {
                false
            }
            promise.resolve(isInstalled)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    /**
     * Connect to Ray-Ban glasses via Bluetooth.
     * Requires Meta AI companion app to be running.
     *
     * Emits onConnectionStateChanged events as the state progresses:
     *   connecting -> connected (or error)
     */
    @ReactMethod
    fun connectToGlasses(promise: Promise) {
        try {
            if (useMockDevice) {
                // MockDevice: simulate immediate connection
                updateConnectionState("connected")
                promise.resolve(true)
                return
            }

            updateConnectionState("connecting")

            // Real SDK connection via Kotlin Flow:
            //
            // coroutineScope.launch {
            //     try {
            //         (deviceManager as? DeviceAccessManager)
            //             ?.connectionState
            //             ?.collect { state ->
            //                 val stateStr = when (state) {
            //                     ConnectionState.CONNECTED -> "connected"
            //                     ConnectionState.CONNECTING -> "connecting"
            //                     ConnectionState.DISCONNECTED -> "disconnected"
            //                     else -> "unknown"
            //                 }
            //                 updateConnectionState(stateStr)
            //                 if (state == ConnectionState.CONNECTED) {
            //                     promise.resolve(true)
            //                 }
            //             }
            //     } catch (e: Exception) {
            //         sendError("CONNECT_ERROR", e.message ?: "Connection failed")
            //         promise.reject("CONNECT_ERROR", e.message, e)
            //     }
            // }

            // Stub: resolve immediately until SDK is linked
            updateConnectionState("connected")
            promise.resolve(true)
        } catch (e: Exception) {
            sendError("CONNECT_ERROR", e.message ?: "Connection failed")
            promise.reject("CONNECT_ERROR", e.message, e)
        }
    }

    /**
     * Disconnect from glasses.
     */
    @ReactMethod
    fun disconnectGlasses(promise: Promise) {
        try {
            // Real SDK: (deviceManager as? DeviceAccessManager)?.disconnect()
            cameraStreamJob?.cancel()
            cameraStreamJob = null
            updateConnectionState("disconnected")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message, e)
        }
    }

    /**
     * Get the current connection state.
     */
    @ReactMethod
    fun getConnectionState(promise: Promise) {
        promise.resolve(connectionState)
    }

    // ── Camera ───────────────────────────────────────────────────────────────

    /**
     * Request camera access from the glasses.
     * Must be called before startCameraStream.
     */
    @ReactMethod
    fun requestCameraAccess(promise: Promise) {
        try {
            // Real SDK:
            // cameraManager = CameraAccessManager.create(deviceManager as DeviceAccessManager)
            // val granted = cameraManager?.requestAccess()
            // promise.resolve(granted)
            promise.resolve(true)
        } catch (e: Exception) {
            sendError("CAMERA_ACCESS_ERROR", e.message ?: "Camera access denied")
            promise.reject("CAMERA_ACCESS_ERROR", e.message, e)
        }
    }

    /**
     * Start streaming video from the glasses camera.
     * Emits onCameraFrame events to JS with { width, height, timestamp }.
     *
     * The glasses camera supports 720p (1280x720) at up to 30fps.
     *
     * @param resolution — "720p" (currently the only supported resolution)
     */
    @ReactMethod
    fun startCameraStream(resolution: String, promise: Promise) {
        try {
            if (useMockDevice) {
                // MockDevice: emit simulated frames at ~30fps
                cameraStreamJob = coroutineScope.launch {
                    while (true) {
                        val params = Arguments.createMap().apply {
                            putInt("width", 1280)
                            putInt("height", 720)
                            putDouble("timestamp", System.currentTimeMillis().toDouble())
                            putBoolean("mock", true)
                        }
                        sendEvent("onCameraFrame", params)
                        kotlinx.coroutines.delay(33) // ~30fps
                    }
                }
                promise.resolve(true)
                return
            }

            // Real SDK camera streaming via Kotlin Flows:
            //
            // cameraStreamJob = coroutineScope.launch {
            //     try {
            //         (cameraManager as? CameraAccessManager)
            //             ?.videoFrames
            //             ?.collect { frame ->
            //                 val params = Arguments.createMap().apply {
            //                     putInt("width", frame.width)
            //                     putInt("height", frame.height)
            //                     putDouble("timestamp", frame.timestamp.toDouble())
            //                 }
            //                 sendEvent("onCameraFrame", params)
            //             }
            //     } catch (e: Exception) {
            //         sendError("CAMERA_STREAM_ERROR", e.message ?: "Stream failed")
            //     }
            // }

            promise.resolve(true)
        } catch (e: Exception) {
            sendError("CAMERA_STREAM_ERROR", e.message ?: "Camera stream failed")
            promise.reject("CAMERA_STREAM_ERROR", e.message, e)
        }
    }

    /**
     * Stop the camera stream.
     */
    @ReactMethod
    fun stopCameraStream(promise: Promise) {
        try {
            cameraStreamJob?.cancel()
            cameraStreamJob = null
            // Real SDK: (cameraManager as? CameraAccessManager)?.stopStreaming()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CAMERA_STOP_ERROR", e.message, e)
        }
    }

    // ── Haptics & Audio ──────────────────────────────────────────────────────

    /**
     * Trigger haptic feedback on the glasses.
     */
    @ReactMethod
    fun triggerHaptic(intensity: String) {
        // Real SDK: (deviceManager as? DeviceAccessManager)?.haptics?.tap(intensity)
    }

    /**
     * Play spatial audio through the glasses speakers.
     * @param bearing — compass bearing to the sound source
     * @param sound — sound identifier string
     */
    @ReactMethod
    fun playSpatialAudio(bearing: Double, sound: String, promise: Promise) {
        try {
            // Real SDK: (deviceManager as? DeviceAccessManager)?.audio?.playSpatial(sound, bearing)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUDIO_ERROR", e.message, e)
        }
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private fun updateConnectionState(state: String) {
        connectionState = state
        val params = Arguments.createMap().apply {
            putString("state", state)
        }
        sendEvent("onConnectionStateChanged", params)
    }

    private fun sendError(code: String, message: String) {
        val params = Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        }
        sendEvent("onError", params)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
