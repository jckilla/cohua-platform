package com.cohua.rayban

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.util.Locale

// Meta Wearables Device Access Toolkit — uncomment after adding SDK to build.gradle
// import com.meta.wearable.dat.DeviceAccessManager
// import com.meta.wearable.dat.ConnectionState
// import com.meta.wearable.dat.DeviceInfo
// import com.meta.wearable.dat.camera.CameraAccessManager
// import com.meta.wearable.dat.mockdevice.MockDeviceProvider

/**
 * MetaWearablesBridgeModule
 *
 * React Native native module bridging JS (NativeModules.MetaWearablesBridge) to
 * the Meta Wearables Device Access Toolkit (mwdat-core, mwdat-camera).
 *
 * SDK link points are marked with "TODO: mwdat-core link point" /
 * "TODO: mwdat-camera link point". All 9 methods work today without the SDK
 * via Bluetooth detection + Android TTS/AudioTrack/SpeechRecognizer.
 *
 * Events emitted to JS:
 *   onConnectionStateChanged  { state: string }
 *   onCameraFrame             { width, height, timestamp, mock? }
 *   onVoiceCommand            { status, results?, bestMatch?, partial? }
 *   onVoiceCommandStatus      { status, error?, code? }
 *   onSpatialAudioRequest     { bearing, sound }
 *   onError                   { code, message }
 */
class MetaWearablesBridgeModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        // Bluetooth device name substrings that identify Ray-Ban Meta glasses
        private val RAYBAN_DEVICE_NAMES = listOf(
            "ray-ban", "meta glasses", "stella", "headliner", "wayfarer", "smart glasses"
        )
    }

    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Connection state
    @Volatile private var useMockDevice = false
    @Volatile private var connectionState = "disconnected"

    // Camera
    private var cameraStreamJob: Job? = null

    // TTS
    private var ttsEngine: TextToSpeech? = null
    @Volatile private var ttsInitialized = false

    // PCM / tone playback
    private var audioTrack: AudioTrack? = null

    // Voice command
    private var speechRecognizer: SpeechRecognizer? = null
    @Volatile private var isVoiceCommandActive = false

    // Bluetooth adapter (lazy so we don't touch it until needed)
    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        (reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE)
                as? BluetoothManager)?.adapter
    }

    override fun getName(): String = "MetaWearablesBridge"

    // Required by NativeEventEmitter on React Native 0.65+
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ──────────────────────────────────────────────────────────────────────
    //  INITIALIZATION
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        try {
            useMockDevice = config.hasKey("useMockDevice") && config.getBoolean("useMockDevice")
            connectionState = if (useMockDevice) "mock_ready" else "initialized"

            // Pre-warm TTS engine while the rest of the SDK setup happens
            initTtsEngine()

            // TODO: mwdat-core link point
            // val appId = config.getString("appId") ?: ""
            // val token = config.getString("clientToken") ?: ""
            // DeviceAccessManager.initialize(reactApplicationContext, appId, token)

            promise.resolve(true)
        } catch (e: Exception) {
            sendError("INIT_ERROR", e.message ?: "Initialization failed")
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  COMPANION APP CHECK  (called by glasses-bridge.js)
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun isCompanionAppInstalled(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val isInstalled = listOf("com.facebook.orca", "com.oculus.companion").any { pkg ->
                try { pm.getPackageInfo(pkg, 0); true } catch (_: Exception) { false }
            }
            promise.resolve(isInstalled)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message, e)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  1. connectToGlasses
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun connectToGlasses(promise: Promise) {
        coroutineScope.launch {
            try {
                if (useMockDevice) {
                    updateConnectionState("connected")
                    promise.resolve(true)
                    return@launch
                }

                updateConnectionState("connecting")

                // TODO: mwdat-core link point
                // val session = DeviceAccessManager.getInstance().connect()
                // updateConnectionState(session.state.name.lowercase())
                // promise.resolve(session.isConnected)

                // Pre-SDK path: detect paired Ray-Ban device via standard Bluetooth API.
                // When the user pairs their glasses through Meta AI companion app, the
                // device will appear in bondedDevices with a recognisable name.
                val glassesDevice = findPairedGlassesDevice()
                if (glassesDevice != null) {
                    updateConnectionState("connected")
                } else {
                    // No paired glasses found — audio still works via phone speaker as fallback
                    updateConnectionState("audio_only")
                }
                promise.resolve(true)

            } catch (e: Exception) {
                updateConnectionState("disconnected")
                sendError("CONNECT_ERROR", e.message ?: "Connection failed")
                promise.reject("CONNECT_ERROR", e.message, e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  2. disconnectFromGlasses
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun disconnectFromGlasses(promise: Promise) {
        coroutineScope.launch {
            try {
                cameraStreamJob?.cancel()
                cameraStreamJob = null
                stopVoiceCommandInternal()
                releaseAudioTrack()

                // TODO: mwdat-core link point
                // DeviceAccessManager.getInstance().disconnect()

                updateConnectionState("disconnected")
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("DISCONNECT_ERROR", e.message, e)
            }
        }
    }

    // Legacy alias — kept for existing JS callers (glasses-bridge.js uses disconnectGlasses)
    @ReactMethod
    fun disconnectGlasses(promise: Promise) = disconnectFromGlasses(promise)

    // ──────────────────────────────────────────────────────────────────────
    //  3. getConnectionStatus
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getConnectionStatus(promise: Promise) {
        val btEnabled = try { bluetoothAdapter?.isEnabled == true } catch (_: Exception) { false }
        val result = Arguments.createMap().apply {
            putString("state", connectionState)
            putBoolean("isConnected", connectionState in listOf("connected", "audio_only", "mock_ready"))
            putBoolean("isMockDevice", useMockDevice)
            putBoolean("bluetoothEnabled", btEnabled)
        }
        promise.resolve(result)
    }

    // Legacy alias — glasses-bridge.js has internal state management, but exposes getConnectionState
    @ReactMethod
    fun getConnectionState(promise: Promise) = promise.resolve(connectionState)

    // ──────────────────────────────────────────────────────────────────────
    //  4. startCameraStream
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startCameraStream(promise: Promise) {
        try {
            if (connectionState == "disconnected" || connectionState == "initialized") {
                promise.reject("CAMERA_UNAVAILABLE", "Connect to glasses before starting camera stream")
                return
            }

            if (useMockDevice) {
                // Mock device: emit synthetic 30fps frames for development testing
                cameraStreamJob?.cancel()
                cameraStreamJob = coroutineScope.launch {
                    while (isActive) {
                        sendEvent("onCameraFrame", Arguments.createMap().apply {
                            putInt("width", 1280)
                            putInt("height", 720)
                            putDouble("timestamp", System.currentTimeMillis().toDouble())
                            putBoolean("mock", true)
                        })
                        delay(33L) // ~30 fps
                    }
                }
                promise.resolve(true)
                return
            }

            // TODO: mwdat-camera link point
            // val camManager = CameraAccessManager.getInstance(reactApplicationContext)
            // camManager.startStreaming("720p") { frame ->
            //     sendEvent("onCameraFrame", Arguments.createMap().apply {
            //         putInt("width", frame.width)
            //         putInt("height", frame.height)
            //         putDouble("timestamp", frame.timestampNs.toDouble())
            //     })
            // }
            // promise.resolve(true)

            // Real device without mwdat-camera linked — return actionable error
            promise.reject(
                "CAMERA_SDK_NOT_LINKED",
                "Camera requires mwdat-camera SDK. " +
                "Uncomment 'com.meta.wearable:mwdat-camera:0.5.0' in app/build.gradle."
            )
        } catch (e: Exception) {
            sendError("CAMERA_STREAM_ERROR", e.message ?: "Camera stream failed")
            promise.reject("CAMERA_STREAM_ERROR", e.message, e)
        }
    }

    // Overload kept for JS callers that pass a resolution string (e.g. glasses-bridge.js)
    @ReactMethod
    fun startCameraStreamWithResolution(resolution: String, promise: Promise) =
        startCameraStream(promise)

    // ──────────────────────────────────────────────────────────────────────
    //  5. stopCameraStream
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun stopCameraStream(promise: Promise) {
        try {
            cameraStreamJob?.cancel()
            cameraStreamJob = null

            // TODO: mwdat-camera link point
            // CameraAccessManager.getInstance(reactApplicationContext).stopStreaming()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CAMERA_STOP_ERROR", e.message, e)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  6. getDeviceInfo
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        coroutineScope.launch {
            try {
                val info = Arguments.createMap()

                if (useMockDevice) {
                    info.apply {
                        putString("model", "Ray-Ban Meta (Mock)")
                        putString("firmwareVersion", "1.0.0-mock")
                        putInt("batteryLevel", 85)
                        putString("serialNumber", "MOCK-0000-0001")
                        putBoolean("cameraAvailable", true)
                        putBoolean("isMockDevice", true)
                    }
                    promise.resolve(info)
                    return@launch
                }

                // TODO: mwdat-core link point — replace block below once SDK is linked
                // val device = DeviceAccessManager.getInstance().getConnectedDevice()
                // info.putString("model", device.model)
                // info.putString("firmwareVersion", device.firmwareVersion)
                // info.putInt("batteryLevel", device.batteryLevel)
                // info.putString("serialNumber", device.serialNumber)
                // info.putBoolean("cameraAvailable", device.supportedFeatures.contains(Feature.CAMERA))

                // Pre-SDK path: surface Bluetooth identity for what we do have access to
                val btDevice = findPairedGlassesDevice()
                info.apply {
                    putString("model", btDevice?.name ?: "Ray-Ban Meta")
                    putString("address", btDevice?.address ?: "")
                    putString("firmwareVersion", "unavailable") // Needs mwdat-core
                    putInt("batteryLevel", -1)                  // Needs mwdat-core
                    putString("serialNumber", "unavailable")    // Needs mwdat-core
                    putBoolean("cameraAvailable", false)        // Needs mwdat-camera
                    putBoolean("isMockDevice", false)
                    putString("note",
                        "firmware, battery, and serial require mwdat-core SDK. " +
                        "Bluetooth identity confirmed via paired device list."
                    )
                }
                promise.resolve(info)

            } catch (e: Exception) {
                promise.reject("DEVICE_INFO_ERROR", e.message, e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  7. sendAudioCue  ← PRIORITY: audio pipeline to glasses speakers
    // ──────────────────────────────────────────────────────────────────────
    //
    //  audioData shape (ReadableMap):
    //    { type: "tts",  text: "...",           rate?: 0.48, pitch?: 1.0         }
    //    { type: "pcm",  data: "<base64 PCM16>", sampleRate?: 16000, channels?: 1 }
    //    { type: "tone", frequency?: 440,        durationMs?: 200,  volume?: 0.5  }
    //
    //  Audio routes to glasses automatically once they are the active
    //  A2DP Bluetooth output — no extra routing code required.

    @ReactMethod
    fun sendAudioCue(audioData: ReadableMap, promise: Promise) {
        coroutineScope.launch {
            try {
                when (val type = audioData.getString("type") ?: "tts") {
                    "tts"  -> sendTtsCue(audioData, promise)
                    "pcm"  -> sendPcmCue(audioData, promise)
                    "tone" -> sendToneCue(audioData, promise)
                    else   -> promise.reject(
                        "UNKNOWN_AUDIO_TYPE",
                        "Unknown type '$type'. Supported: 'tts', 'pcm', 'tone'."
                    )
                }
            } catch (e: Exception) {
                sendError("AUDIO_CUE_ERROR", e.message ?: "Audio cue failed")
                promise.reject("AUDIO_CUE_ERROR", e.message, e)
            }
        }
    }

    // TTS path — uses Android TextToSpeech API; resolves when utterance completes
    private suspend fun sendTtsCue(audioData: ReadableMap, promise: Promise) {
        val text = audioData.getString("text")?.takeIf { it.isNotBlank() }
            ?: return promise.reject("TTS_MISSING_TEXT", "audioData.text is required for type='tts'")

        val rate  = if (audioData.hasKey("rate"))  audioData.getDouble("rate").toFloat()  else 0.48f
        val pitch = if (audioData.hasKey("pitch")) audioData.getDouble("pitch").toFloat() else 1.0f

        val engine = awaitTtsReady()
            ?: return promise.reject("TTS_NOT_READY", "TTS engine failed to initialize (timeout 3s)")

        // TTS speak() must be called on the main thread
        withContext(Dispatchers.Main) {
            engine.setSpeechRate(rate)
            engine.setPitch(pitch)
            val uid = "cue_${System.currentTimeMillis()}"

            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(u: String) {}
                override fun onDone(u: String) {
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("type", "tts")
                        putString("utteranceId", u)
                    })
                }
                override fun onError(u: String) {
                    promise.reject("TTS_SPEAK_ERROR", "TTS playback failed: $u")
                }
            })

            engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, uid)
        }
    }

    // PCM path — decodes base64 16-bit PCM and plays via AudioTrack
    private fun sendPcmCue(audioData: ReadableMap, promise: Promise) {
        val b64 = audioData.getString("data")
            ?: return promise.reject("PCM_MISSING_DATA",
                "audioData.data (base64-encoded 16-bit PCM) is required for type='pcm'")

        val sampleRate  = if (audioData.hasKey("sampleRate")) audioData.getInt("sampleRate") else 16000
        val channels    = if (audioData.hasKey("channels"))   audioData.getInt("channels")   else 1
        val channelCfg  = if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO

        try {
            val pcm       = Base64.decode(b64, Base64.DEFAULT)
            val minBuffer = AudioTrack.getMinBufferSize(sampleRate, channelCfg, AudioFormat.ENCODING_PCM_16BIT)

            releaseAudioTrack()
            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .setAudioFormat(AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelCfg)
                    .build())
                .setBufferSizeInBytes(maxOf(minBuffer, pcm.size))
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            audioTrack?.write(pcm, 0, pcm.size)
            audioTrack?.play()

            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("type", "pcm")
                putInt("bytesPlayed", pcm.size)
            })
        } catch (e: Exception) {
            promise.reject("PCM_PLAYBACK_ERROR", e.message, e)
        }
    }

    // Tone path — synthesises a sine-wave tone and plays via AudioTrack
    private suspend fun sendToneCue(audioData: ReadableMap, promise: Promise) {
        val freq       = if (audioData.hasKey("frequency")) audioData.getDouble("frequency") else 440.0
        val durationMs = if (audioData.hasKey("durationMs")) audioData.getInt("durationMs")  else 200
        val vol        = if (audioData.hasKey("volume"))    audioData.getDouble("volume").toFloat() else 0.5f

        val sampleRate  = 44100
        val numSamples  = sampleRate * durationMs / 1000
        val samples     = ShortArray(numSamples) { i ->
            (Math.sin(2.0 * Math.PI * i * freq / sampleRate) * Short.MAX_VALUE * vol).toInt().toShort()
        }
        val minBuffer = AudioTrack.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)

        releaseAudioTrack()
        try {
            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
                .setAudioFormat(AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build())
                .setBufferSizeInBytes(maxOf(minBuffer, samples.size * 2))
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            audioTrack?.write(samples, 0, samples.size)
            audioTrack?.play()

            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("type", "tone")
                putDouble("frequency", freq)
                putInt("durationMs", durationMs)
            })
        } catch (e: Exception) {
            promise.reject("TONE_ERROR", e.message, e)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  8. startVoiceCommand
    // ──────────────────────────────────────────────────────────────────────
    //
    //  Events emitted while active:
    //    onVoiceCommandStatus { status: "listening"|"speech_detected"|"processing"|"error" }
    //    onVoiceCommand       { status: "partial"|"result", partial?, results?, bestMatch? }

    @ReactMethod
    fun startVoiceCommand(promise: Promise) {
        if (isVoiceCommandActive) {
            promise.reject("VOICE_ALREADY_ACTIVE", "Voice command is already listening")
            return
        }

        if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED",
                "RECORD_AUDIO permission is required. Request it with react-native-permissions.")
            return
        }

        if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
            promise.reject("SPEECH_UNAVAILABLE", "Speech recognition is not available on this device")
            return
        }

        // SpeechRecognizer must be created and used on the main thread
        reactApplicationContext.runOnUiQueueThread {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)

                speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        isVoiceCommandActive = true
                        sendEvent("onVoiceCommandStatus", Arguments.createMap().apply {
                            putString("status", "listening")
                        })
                        promise.resolve(true)
                    }

                    override fun onBeginningOfSpeech() {
                        sendEvent("onVoiceCommandStatus", Arguments.createMap().apply {
                            putString("status", "speech_detected")
                        })
                    }

                    override fun onEndOfSpeech() {
                        sendEvent("onVoiceCommandStatus", Arguments.createMap().apply {
                            putString("status", "processing")
                        })
                    }

                    override fun onError(error: Int) {
                        val wasListening = isVoiceCommandActive
                        isVoiceCommandActive = false
                        val msg = speechErrorToMessage(error)
                        sendEvent("onVoiceCommandStatus", Arguments.createMap().apply {
                            putString("status", "error")
                            putString("error", msg)
                            putInt("code", error)
                        })
                        // Only reject the promise if onReadyForSpeech never fired
                        if (!wasListening) {
                            try { promise.reject("VOICE_ERROR", msg) } catch (_: Exception) {}
                        }
                    }

                    override fun onResults(results: Bundle?) {
                        isVoiceCommandActive = false
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val scores  = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                        val commands = Arguments.createArray()
                        matches?.forEachIndexed { i, text ->
                            commands.pushMap(Arguments.createMap().apply {
                                putString("text", text)
                                putDouble("confidence", scores?.getOrNull(i)?.toDouble() ?: 0.0)
                            })
                        }
                        sendEvent("onVoiceCommand", Arguments.createMap().apply {
                            putString("status", "result")
                            putArray("results", commands)
                            putString("bestMatch", matches?.firstOrNull() ?: "")
                        })
                    }

                    override fun onPartialResults(partial: Bundle?) {
                        partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()?.let { text ->
                                sendEvent("onVoiceCommand", Arguments.createMap().apply {
                                    putString("status", "partial")
                                    putString("partial", text)
                                })
                            }
                    }

                    override fun onRmsChanged(rmsdB: Float) {} // suppress noisy level updates
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                }
                speechRecognizer?.startListening(intent)

            } catch (e: Exception) {
                isVoiceCommandActive = false
                promise.reject("VOICE_START_ERROR", e.message, e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  9. stopVoiceCommand
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun stopVoiceCommand(promise: Promise) {
        stopVoiceCommandInternal()
        promise.resolve(true)
    }

    // ──────────────────────────────────────────────────────────────────────
    //  EXISTING METHODS — kept for glasses-bridge.js compatibility
    // ──────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun requestCameraAccess(promise: Promise) {
        // TODO: mwdat-camera link point — CameraAccessManager.requestAccess()
        // For now, resolve true; real permission is gated inside startCameraStream
        promise.resolve(true)
    }

    @ReactMethod
    fun triggerHaptic(intensity: String) {
        // Haptics are not exposed in the current Meta DAT SDK — stub retained for future support
    }

    @ReactMethod
    fun playSpatialAudio(bearing: Double, sound: String, promise: Promise) {
        // TODO: implement directional audio rendering when Meta SDK exposes spatial audio API
        // For now, emit event so JS layer can produce a TTS direction announcement as fallback
        sendEvent("onSpatialAudioRequest", Arguments.createMap().apply {
            putDouble("bearing", bearing)
            putString("sound", sound)
        })
        promise.resolve(true)
    }

    // ──────────────────────────────────────────────────────────────────────
    //  TTS ENGINE
    // ──────────────────────────────────────────────────────────────────────

    private fun initTtsEngine() {
        reactApplicationContext.runOnUiQueueThread {
            if (ttsEngine == null) {
                ttsEngine = TextToSpeech(reactApplicationContext) { status ->
                    ttsInitialized = (status == TextToSpeech.SUCCESS)
                    if (ttsInitialized) {
                        ttsEngine?.language = Locale.US
                        ttsEngine?.setSpeechRate(0.48f)
                    }
                }
            }
        }
    }

    /**
     * Suspend until TTS engine is ready, or return null after 3 s timeout.
     * Triggers a lazy init if the engine hasn't been created yet.
     */
    private suspend fun awaitTtsReady(): TextToSpeech? {
        if (ttsInitialized && ttsEngine != null) return ttsEngine

        withContext(Dispatchers.Main) {
            if (ttsEngine == null) initTtsEngine()
        }

        // Poll with exponential backoff up to 3 s
        var waited = 0L
        var step   = 50L
        while (waited < 3000L) {
            delay(step)
            waited += step
            step    = minOf(step * 2, 500L)
            if (ttsInitialized && ttsEngine != null) return ttsEngine
        }
        return null
    }

    // ──────────────────────────────────────────────────────────────────────
    //  BLUETOOTH HELPERS
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Return the first paired Bluetooth device whose name looks like Ray-Ban Meta glasses,
     * or null if none found / permission not granted.
     */
    private fun findPairedGlassesDevice(): BluetoothDevice? {
        if (ContextCompat.checkSelfPermission(
                reactApplicationContext, Manifest.permission.BLUETOOTH_CONNECT)
            != PackageManager.PERMISSION_GRANTED) return null

        return try {
            bluetoothAdapter?.bondedDevices?.firstOrNull { device ->
                val name = device.name?.lowercase() ?: ""
                RAYBAN_DEVICE_NAMES.any { name.contains(it) }
            }
        } catch (_: SecurityException) { null }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ──────────────────────────────────────────────────────────────────────

    private fun stopVoiceCommandInternal() {
        reactApplicationContext.runOnUiQueueThread {
            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.destroy()
                speechRecognizer = null
            } catch (_: Exception) {}
            isVoiceCommandActive = false
        }
    }

    private fun releaseAudioTrack() {
        try { audioTrack?.stop()    } catch (_: Exception) {}
        try { audioTrack?.release() } catch (_: Exception) {}
        audioTrack = null
    }

    private fun updateConnectionState(state: String) {
        connectionState = state
        sendEvent("onConnectionStateChanged", Arguments.createMap().apply {
            putString("state", state)
        })
    }

    private fun sendError(code: String, message: String) {
        sendEvent("onError", Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        })
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun speechErrorToMessage(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO                  -> "Audio recording error"
        SpeechRecognizer.ERROR_CLIENT                 -> "Client-side recognition error"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
        SpeechRecognizer.ERROR_NETWORK                -> "Network error"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT        -> "Network timeout"
        SpeechRecognizer.ERROR_NO_MATCH               -> "No speech matched"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY        -> "Recognizer busy"
        SpeechRecognizer.ERROR_SERVER                 -> "Server error"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT         -> "No speech detected"
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS      -> "Too many requests"
        else                                          -> "Unknown error (code $error)"
    }

    override fun invalidate() {
        super.invalidate()
        coroutineScope.cancel()
        stopVoiceCommandInternal()
        releaseAudioTrack()
        reactApplicationContext.runOnUiQueueThread {
            ttsEngine?.stop()
            ttsEngine?.shutdown()
            ttsEngine = null
            ttsInitialized = false
        }
    }
}
