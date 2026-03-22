/**
 * glasses-bridge.js — Meta Ray-Ban Glasses SDK Integration Layer
 *
 * AUDIO-FIRST APPROACH
 * ====================
 * The Meta Wearables SDK (Device Access Toolkit) does NOT yet provide a
 * display/HUD API for third-party apps. We CANNOT render content on the
 * Ray-Ban Display glasses screen.
 *
 * What the SDK DOES provide:
 *   - Camera: Video streaming from glasses camera (720p/30fps max)
 *   - Audio: Send audio TO glasses speakers via Bluetooth audio profiles
 *   - Connection: Pair/manage glasses via Meta AI companion app
 *
 * Our approach:
 *   - PRIMARY: When user walks near a COHUA campaign (within 50m), the
 *     glasses SPEAK the business info through the built-in speakers using
 *     React Native TTS routed over Bluetooth.
 *   - CAMERA: Stubs ready for future storefront visual detection.
 *   - DISPLAY: Stubs retained as placeholders for when Meta releases HUD APIs.
 *
 * Native Bridge Architecture:
 *   React Native JS  <-->  Native Bridge Module (Kotlin/Swift)
 *       |                         |
 *   glasses-bridge.js      MetaWearablesBridge.kt / .swift
 *       |                         |
 *   TTS + App Logic       mwdat-core / mwdat-camera SDK
 *       |                         |
 *   Bluetooth Audio       Meta AI companion app <-> Glasses
 *
 * See native-bridge-spec.md for full native module setup instructions.
 */

import Tts from 'react-native-tts';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { Config } from '../services/config';
import { pullStateMachine, OptInMethod } from '../services/pull-state-machine';

// ═══════════════════════════════════════════════════════════════════════════
//  META SDK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const META_CONFIG = {
  appId: '1913450549305971',
  clientToken: 'AR|1913450549305971|b1182207ff01e49a1215b8d6552213fb',

  // Native module names (must match Kotlin/Swift bridge registration)
  nativeModule: 'MetaWearablesBridge',

  // Meta SDK packages (Android Gradle / iOS CocoaPods)
  // Android: com.meta.wearable:mwdat-core, com.meta.wearable:mwdat-camera
  // iOS: MetaWearablesDAT (via SPM or CocoaPods)
  sdkPackages: {
    core: 'com.meta.wearable.mwdat-core',
    camera: 'com.meta.wearable.mwdat-camera',
    mockDevice: 'com.meta.wearable.mwdat-mockdevice',
  },

  // GitHub repos for reference
  sdkRepos: {
    android: 'facebook/meta-wearables-dat-android',
    ios: 'facebook/meta-wearables-dat-ios',
  },

  // Required Android permissions
  requiredPermissions: [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.INTERNET',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIO CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const AUDIO_CONFIG = {
  // TTS settings — values come from config.js (single source of truth)
  get ttsRate()             { return Config.TTS_RATE; },
  get ttsPitch()            { return Config.TTS_PITCH; },
  get ttsLanguage()         { return Config.TTS_LANGUAGE; },

  // Re-announce thresholds — avoid spamming the user
  get distanceThresholdFt() { return Config.TTS_DISTANCE_BUCKET_FT; },
  get minAnnouncementGapMs(){ return Config.TTS_THROTTLE_MS; },

  // Announcement templates
  templates: {
    enter: (name, distance, direction) =>
      `COHUA sign ahead: ${name}, ${distance} feet ${direction}`,
    update: (name, distance, direction) =>
      `${name} now ${distance} feet ${direction}`,
    leave: (name) =>
      `Leaving ${name} zone`,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTION MODES
// ═══════════════════════════════════════════════════════════════════════════

const ConnectionMode = {
  DISCONNECTED: 'disconnected',
  AUDIO_ONLY: 'audio_only',       // TTS through glasses speakers (primary)
  AUDIO_AND_CAMERA: 'audio_camera', // Audio + camera streaming
  MOCK_DEVICE: 'mock_device',      // Testing without physical glasses
};


class MetaGlassesBridge {
  constructor() {
    this._connected = false;
    this._connectionMode = ConnectionMode.DISCONNECTED;
    this._activeSigns = {};           // { campaignId: signData }
    this._lastAnnouncement = {};      // { campaignId: timestamp }
    this._lastAnnouncedBucket = {};   // { campaignId: distance_bucket }
    this._connectionListeners = [];
    this._cameraStreamActive = false;
    this._nativeBridge = null;
    this._nativeEvents = null;
    this._ttsInitialized = false;
    this._useMockDevice = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONNECTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize connection to Ray-Ban glasses.
   *
   * Connection flow:
   *   1. Check for Meta AI companion app on the phone
   *   2. Initialize the native bridge module (mwdat-core)
   *   3. Request camera permission via the SDK
   *   4. If camera unavailable, fall back to audio-only mode
   *   5. Initialize TTS engine for audio output
   *
   * @param {Object} options
   * @param {boolean} options.useMockDevice — Use MockDevice for testing
   * @returns {Promise<string>} — The connection mode achieved
   */
  async connect(options = {}) {
    const { useMockDevice = __DEV__ } = options;
    this._useMockDevice = useMockDevice;

    console.log('[COHUA-GLASSES] Initiating connection...');
    console.log(`[COHUA-GLASSES] Meta App ID: ${META_CONFIG.appId}`);
    console.log(`[COHUA-GLASSES] Mode: ${useMockDevice ? 'MockDevice (dev)' : 'Production'}`);

    try {
      // Step 1: Initialize TTS (works independently of glasses connection)
      await this._initTts();

      // Step 2: Initialize native bridge
      await this._initNativeBridge(useMockDevice);

      // Step 3: Check for Meta AI companion app
      const companionAppAvailable = await this._checkCompanionApp();
      if (!companionAppAvailable && !useMockDevice) {
        console.warn('[COHUA-GLASSES] Meta AI companion app not found.');
        console.warn('[COHUA-GLASSES] Install Meta AI from app store to connect glasses.');
        // Still connect in audio-only mode — TTS works via phone speaker as fallback
        this._connected = true;
        this._connectionMode = ConnectionMode.AUDIO_ONLY;
        this._notifyConnection(true);
        return this._connectionMode;
      }

      // Step 4: Connect to glasses via native SDK
      if (useMockDevice) {
        console.log('[COHUA-GLASSES] Using MockDevice for development');
        this._connectionMode = ConnectionMode.MOCK_DEVICE;
      } else {
        await this._connectViaSDK();
      }

      // Step 5: Try to get camera access
      const cameraAvailable = await this._requestCameraAccess();
      if (cameraAvailable && this._connectionMode !== ConnectionMode.MOCK_DEVICE) {
        this._connectionMode = ConnectionMode.AUDIO_AND_CAMERA;
      } else if (this._connectionMode !== ConnectionMode.MOCK_DEVICE) {
        this._connectionMode = ConnectionMode.AUDIO_ONLY;
      }

      this._connected = true;
      console.log(`[COHUA-GLASSES] Connected — mode: ${this._connectionMode}`);
      this._notifyConnection(true);
      return this._connectionMode;

    } catch (error) {
      console.error('[COHUA-GLASSES] Connection failed:', error.message);
      // Degrade gracefully — TTS through phone speaker still works
      this._connected = true;
      this._connectionMode = ConnectionMode.AUDIO_ONLY;
      this._notifyConnection(true);
      return this._connectionMode;
    }
  }

  /**
   * Disconnect from glasses and clean up resources.
   */
  async disconnect() {
    if (this._cameraStreamActive) {
      await this.stopCameraStream();
    }

    // Stop any in-progress TTS
    try {
      Tts.stop();
    } catch (_) {}

    // Disconnect native bridge
    if (this._nativeBridge && !this._useMockDevice) {
      try {
        await this._nativeBridge.disconnectGlasses();
      } catch (error) {
        console.warn('[COHUA-GLASSES] Native disconnect error:', error.message);
      }
    }

    this._connected = false;
    this._connectionMode = ConnectionMode.DISCONNECTED;
    this._activeSigns = {};
    this._lastAnnouncement = {};
    this._lastAnnouncedBucket = {};
    this._cameraStreamActive = false;

    console.log('[COHUA-GLASSES] Disconnected');
    this._notifyConnection(false);
  }

  /**
   * Check if glasses are connected.
   */
  isConnected() {
    return this._connected;
  }

  /**
   * Get current connection mode.
   */
  getConnectionMode() {
    return this._connectionMode;
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionChange(callback) {
    this._connectionListeners.push(callback);
    return () => {
      this._connectionListeners = this._connectionListeners.filter(cb => cb !== callback);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AUDIO OUTPUT — PRIMARY MODE (TTS through glasses speakers)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show a sign — speaks the sign info through the glasses speakers via TTS.
   *
   * Called by ProximityEngine ONLY after gaze confirmation (DISCOVERY_READY),
   * NOT on proximity enter. This is step 4 of the pull model.
   *
   * @param {Object} signData
   * @param {string} signData.id         — Campaign UUID
   * @param {string} signData.name       — Business name
   * @param {string} signData.type       — 'NEON LOGO', 'NEON MENU', etc.
   * @param {number} signData.distance   — Distance in feet
   * @param {string} signData.direction  — 'ahead', 'left', 'right', 'behind'
   * @param {string} signData.neonColor  — Hex color (retained for future display)
   * @param {string} signData.location   — Location label
   */
  async showSign(signData) {
    this._activeSigns[signData.id] = signData;

    console.log(
      `[COHUA-GLASSES] SHOW SIGN: ${signData.name}` +
      ` | ${signData.distance} FT ${signData.direction}` +
      ` | Mode: AUDIO`
    );

    // PRIMARY: Speak through glasses speakers
    const announcement = AUDIO_CONFIG.templates.enter(
      signData.name,
      Math.round(signData.distance),
      signData.direction
    );
    await this._speak(announcement);

    // Track announcement state for throttling
    this._lastAnnouncement[signData.id] = Date.now();
    this._lastAnnouncedBucket[signData.id] = this._distanceBucket(signData.distance);

    // FUTURE — DISPLAY (awaiting Meta HUD API)
    // When Meta releases the display API, add HUD rendering here:
    // if (this._connectionMode === ConnectionMode.AUDIO_AND_DISPLAY) {
    //   MetaWearables.display.showCard({
    //     id:       signData.id,
    //     title:    signData.name,
    //     subtitle: `${signData.type}  ·  ${signData.distance} FT`,
    //     body:     `${signData.direction.toUpperCase()} — ${signData.location}`,
    //     icon:     this._directionIcon(signData.direction),
    //     color:    signData.neonColor,
    //     duration: 'persistent',
    //   });
    // }
  }

  /**
   * Update an existing sign. Only re-announces if the distance crossed
   * a significant threshold (every 100ft) to avoid spamming audio.
   *
   * @param {Object} signData — Same shape as showSign
   */
  async updateSign(signData) {
    if (!this._activeSigns[signData.id]) return;

    const prevData = this._activeSigns[signData.id];
    this._activeSigns[signData.id] = signData;

    // Check if we should re-announce
    const newBucket = this._distanceBucket(signData.distance);
    const prevBucket = this._lastAnnouncedBucket[signData.id];
    const timeSinceLastAnnouncement = Date.now() - (this._lastAnnouncement[signData.id] || 0);

    const bucketChanged = newBucket !== prevBucket;
    const enoughTimePassed = timeSinceLastAnnouncement >= AUDIO_CONFIG.minAnnouncementGapMs;

    if (bucketChanged && enoughTimePassed) {
      const announcement = AUDIO_CONFIG.templates.update(
        signData.name,
        Math.round(signData.distance),
        signData.direction
      );
      await this._speak(announcement);

      this._lastAnnouncement[signData.id] = Date.now();
      this._lastAnnouncedBucket[signData.id] = newBucket;
    }

    console.log(
      `[COHUA-GLASSES] UPDATE: ${signData.name}` +
      ` — ${signData.distance} FT ${signData.direction}` +
      ` | Announced: ${bucketChanged && enoughTimePassed ? 'yes' : 'throttled'}`
    );

    // FUTURE — DISPLAY (awaiting Meta HUD API)
    // MetaWearables.display.updateCard(signData.id, { ... });
  }

  /**
   * Hide a sign (user left proximity zone).
   * Announces departure through glasses speakers.
   *
   * @param {string} campaignId
   */
  async hideSign(campaignId) {
    const signData = this._activeSigns[campaignId];
    const name = signData?.name || 'business';

    delete this._activeSigns[campaignId];
    delete this._lastAnnouncement[campaignId];
    delete this._lastAnnouncedBucket[campaignId];

    console.log(`[COHUA-GLASSES] HIDE SIGN: ${campaignId}`);

    // Announce departure
    const announcement = AUDIO_CONFIG.templates.leave(name);
    await this._speak(announcement);

    // FUTURE — DISPLAY (awaiting Meta HUD API)
    // MetaWearables.display.dismissCard(campaignId);
  }

  /**
   * Clear all signs.
   */
  clearAllSigns() {
    this._activeSigns = {};
    this._lastAnnouncement = {};
    this._lastAnnouncedBucket = {};
    console.log('[COHUA-GLASSES] Cleared all signs');

    try {
      Tts.stop();
    } catch (_) {}

    // FUTURE — DISPLAY (awaiting Meta HUD API)
    // MetaWearables.display.dismissAll();
  }

  /**
   * Get currently active signs.
   */
  getActiveSigns() {
    return Object.values(this._activeSigns);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PULL MODEL — OPT-IN HANDLERS (Step 5)
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  These are called when the user performs the opt-in gesture or voice
  //  command to transition from DISCOVERY_READY → ACTIVE_AR.
  //
  //  The native bridge fires a tap event when the user touches the glasses
  //  touchpad. Voice commands come from the glasses mic via Meta's voice
  //  recognition pipeline (both route through the native bridge module).

  /**
   * Handle a tap gesture on the glasses touchpad.
   * Transitions the nearest DISCOVERY_READY campaign to ACTIVE_AR.
   *
   * Called by the native bridge when a single tap is detected:
   *   Android: MetaWearablesBridgeModule emits 'onGestureTap'
   *   iOS:     MetaWearablesBridge fires gestureEvent({ type: 'tap' })
   *
   * @param {string} campaignId — ID of the campaign to opt into
   */
  handleTapOptIn(campaignId) {
    console.log(`[COHUA-GLASSES] TAP OPT-IN: ${campaignId}`);
    pullStateMachine.onOptIn(campaignId, OptInMethod.GESTURE_TAP);
  }

  /**
   * Handle a "show" voice command from the glasses microphone.
   * Transitions the campaign to ACTIVE_AR via voice opt-in.
   *
   * Called by the native bridge when the voice pipeline recognises the
   * trigger phrase (e.g. "Hey Meta, show" / "show sign"):
   *   Android/iOS: MetaWearablesBridgeModule emits 'onVoiceCommand'
   *
   * @param {string} campaignId — ID of the campaign to activate
   */
  handleVoiceOptIn(campaignId) {
    console.log(`[COHUA-GLASSES] VOICE OPT-IN: ${campaignId}`);
    pullStateMachine.onOptIn(campaignId, OptInMethod.VOICE_COMMAND_SHOW);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PULL MODEL — ARCore VPS SESSION (Step 6)
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  ARCore Visual Positioning System anchors the AR overlay to a real-world
  //  location with sub-meter accuracy. This fires ONLY after the user has
  //  opted in (ACTIVE_AR state). It never runs speculatively.
  //
  //  Current status: STUB — ARCore VPS integration not yet implemented.
  //  When implemented, this will:
  //    1. Call ARCoreSession.configure({ mode: VPS })
  //    2. Resolve the campaign's lat/lon to a VPS waypoint
  //    3. Place a world-locked AR anchor at campaign.latitude/longitude/altitude_m
  //    4. Render the campaign asset (neon logo / menu / 3D model) at that anchor

  /**
   * Start an ARCore VPS session for the given campaign.
   * Called automatically by ProximityEngine when ACTIVE_AR is reached.
   *
   * @param {string} campaignId
   * @param {Object} campaign — full campaign object (latitude, longitude, altitude_m, etc.)
   */
  startVPSSession(campaignId, campaign) {
    console.log(
      `[COHUA-GLASSES] VPS SESSION START: ${campaign?.name || campaignId}` +
      ` @ ${campaign?.latitude},${campaign?.longitude} alt=${campaign?.altitude_m}m`
    );
    console.log('[COHUA-GLASSES] ARCore VPS not yet integrated — stub fires here.');

    // FUTURE — ARCore VPS integration:
    // const session = await ARCoreSession.create({ mode: 'VPS' });
    // const waypoint = await session.resolveWaypoint(campaign.latitude, campaign.longitude);
    // const anchor = await session.createAnchor(waypoint, campaign.altitude_m);
    // ARRenderer.placeAsset(anchor, { type: campaign.asset_type, payload: campaign._payload });

    // Trigger haptic to confirm AR activation
    this.triggerHaptic('medium');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HAPTIC / AUDIO FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Trigger a subtle haptic tap when entering a campaign zone.
   *
   * NOTE: Haptics may not be available via the current SDK.
   * This is a best-effort call through the native bridge.
   */
  triggerHaptic(intensity = 'light') {
    console.log(`[COHUA-GLASSES] HAPTIC: ${intensity}`);
    if (this._nativeBridge) {
      try {
        this._nativeBridge.triggerHaptic(intensity);
      } catch (_) {
        console.log('[COHUA-GLASSES] Haptic not available on this device');
      }
    }
  }

  /**
   * Play a spatial audio cue from the direction of the sign.
   * Uses TTS positioned announcement as a fallback since true
   * spatial audio requires native SDK support.
   *
   * @param {number} bearing — Compass bearing to the sign
   * @param {string} sound — Sound identifier
   */
  async playSpatialAudio(bearing, sound = 'ping') {
    console.log(`[COHUA-GLASSES] AUDIO: ${sound} at bearing ${bearing}°`);

    // Try native spatial audio if available
    if (this._nativeBridge) {
      try {
        await this._nativeBridge.playSpatialAudio(bearing, sound);
        return;
      } catch (_) {
        // Fall through to TTS fallback
      }
    }

    // Fallback: simple direction-based TTS cue
    const direction = this._bearingToDirection(bearing);
    await this._speak(`${sound} ${direction}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CAMERA — Stubs using real Meta SDK module names
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  Camera access uses com.meta.wearable:mwdat-camera
  //  The camera provides 720p/30fps video streaming from the glasses.
  //  Future use: storefront detection, visual campaign matching.
  //
  //  Native interface required:
  //    Android: com.meta.wearable.dat.camera.CameraAccessManager
  //    iOS:     MWDATCamera framework
  //
  //  See native-bridge-spec.md for implementation details.

  /**
   * Start streaming video from the glasses camera.
   * Requires AUDIO_AND_CAMERA connection mode.
   *
   * @param {Object} options
   * @param {function} options.onFrame — Callback receiving video frames
   * @param {string} options.resolution — '720p' (only option currently)
   * @returns {Promise<boolean>}
   */
  async startCameraStream(options = {}) {
    if (this._connectionMode !== ConnectionMode.AUDIO_AND_CAMERA &&
        this._connectionMode !== ConnectionMode.MOCK_DEVICE) {
      console.warn('[COHUA-GLASSES] Camera not available in current mode:', this._connectionMode);
      return false;
    }

    console.log('[COHUA-GLASSES] Starting camera stream...');

    if (this._useMockDevice) {
      // MockDevice: simulate camera frames for testing
      console.log('[COHUA-GLASSES] MockDevice camera — sending test frames');
      this._cameraStreamActive = true;
      this._mockCameraInterval = setInterval(() => {
        if (options.onFrame) {
          options.onFrame({ width: 1280, height: 720, timestamp: Date.now(), mock: true });
        }
      }, 33); // ~30fps
      return true;
    }

    // Real SDK camera access via native bridge
    // Native module calls: CameraAccessManager.startStreaming()
    if (this._nativeBridge) {
      try {
        await this._nativeBridge.startCameraStream(options.resolution || '720p');
        this._cameraStreamActive = true;

        // Listen for frames from native module
        if (this._nativeEvents && options.onFrame) {
          this._cameraFrameSubscription = this._nativeEvents.addListener(
            'onCameraFrame',
            options.onFrame
          );
        }
        return true;
      } catch (error) {
        console.error('[COHUA-GLASSES] Camera stream failed:', error.message);
        return false;
      }
    }

    return false;
  }

  /**
   * Stop the camera stream.
   */
  async stopCameraStream() {
    if (this._mockCameraInterval) {
      clearInterval(this._mockCameraInterval);
      this._mockCameraInterval = null;
    }

    if (this._cameraFrameSubscription) {
      this._cameraFrameSubscription.remove();
      this._cameraFrameSubscription = null;
    }

    if (this._nativeBridge && this._cameraStreamActive) {
      try {
        await this._nativeBridge.stopCameraStream();
      } catch (_) {}
    }

    this._cameraStreamActive = false;
    console.log('[COHUA-GLASSES] Camera stream stopped');
  }

  /**
   * Check if camera is currently streaming.
   */
  isCameraStreaming() {
    return this._cameraStreamActive;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FUTURE — DISPLAY (awaiting Meta HUD API)
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  The methods below are PLACEHOLDERS for when Meta releases a
  //  third-party display/HUD API for Ray-Ban glasses.
  //
  //  Current status (as of 2026): NO display API exists.
  //  Meta has not announced a timeline for third-party HUD access.
  //
  //  When available, these would call:
  //    MetaWearables.display.showCard({ ... })
  //    MetaWearables.display.showAROverlay({ ... })
  //    MetaWearables.display.dismissCard(id)
  //    MetaWearables.display.dismissAll()

  /**
   * FUTURE: Show a card on the glasses HUD.
   * @stub
   */
  _displayShowCard(cardData) {
    console.log('[COHUA-GLASSES] DISPLAY STUB: showCard —', cardData.title);
    console.log('[COHUA-GLASSES] Display API not yet available from Meta.');
    // FUTURE: MetaWearables.display.showCard(cardData);
  }

  /**
   * FUTURE: Show an AR overlay with directional guidance.
   * @stub
   */
  _displayShowAROverlay(overlayData) {
    console.log('[COHUA-GLASSES] DISPLAY STUB: showAROverlay');
    console.log('[COHUA-GLASSES] AR overlay API not yet available from Meta.');
    // FUTURE: MetaWearables.display.showAROverlay(overlayData);
  }

  /**
   * FUTURE: Dismiss a specific card from the HUD.
   * @stub
   */
  _displayDismissCard(cardId) {
    console.log('[COHUA-GLASSES] DISPLAY STUB: dismissCard —', cardId);
    // FUTURE: MetaWearables.display.dismissCard(cardId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL — TTS Engine
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the TTS engine for audio announcements.
   */
  async _initTts() {
    if (this._ttsInitialized) return;

    try {
      Tts.setDefaultRate(AUDIO_CONFIG.ttsRate);
      Tts.setDefaultPitch(AUDIO_CONFIG.ttsPitch);
      Tts.setDefaultLanguage(AUDIO_CONFIG.ttsLanguage);

      // When glasses are connected via Bluetooth, TTS audio
      // routes through the Bluetooth audio profile to the
      // glasses speakers automatically.
      Tts.addEventListener('tts-start', () => {});
      Tts.addEventListener('tts-finish', () => {});
      Tts.addEventListener('tts-error', (err) => {
        console.warn('[COHUA-GLASSES] TTS error:', err);
      });

      this._ttsInitialized = true;
      console.log('[COHUA-GLASSES] TTS initialized');
    } catch (error) {
      console.error('[COHUA-GLASSES] TTS init failed:', error.message);
    }
  }

  /**
   * Speak text through the glasses speakers (or phone speaker as fallback).
   * Audio routes to glasses automatically when connected via Bluetooth.
   */
  async _speak(text) {
    try {
      // Stop any current speech before new announcement
      Tts.stop();
      Tts.speak(text);
      console.log(`[COHUA-GLASSES] TTS: "${text}"`);
    } catch (error) {
      console.warn('[COHUA-GLASSES] TTS speak failed:', error.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL — Native Bridge
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the React Native native bridge to the Meta SDK.
   *
   * The native module (MetaWearablesBridge) must be registered in:
   *   - Android: MetaWearablesBridgeModule.kt
   *   - iOS: MetaWearablesBridge.swift
   *
   * See native-bridge-spec.md for implementation.
   */
  async _initNativeBridge(useMockDevice) {
    try {
      const bridge = NativeModules[META_CONFIG.nativeModule];

      if (!bridge) {
        console.warn(
          `[COHUA-GLASSES] Native module '${META_CONFIG.nativeModule}' not found.`,
          'Run: npx react-native link or check native module registration.'
        );
        return;
      }

      this._nativeBridge = bridge;
      this._nativeEvents = new NativeEventEmitter(bridge);

      // Initialize the native SDK
      await bridge.initialize({
        appId: META_CONFIG.appId,
        clientToken: META_CONFIG.clientToken,
        useMockDevice: useMockDevice,
      });

      console.log('[COHUA-GLASSES] Native bridge initialized');
    } catch (error) {
      console.warn('[COHUA-GLASSES] Native bridge init failed:', error.message);
      console.warn('[COHUA-GLASSES] Falling back to audio-only (TTS via phone speaker)');
      this._nativeBridge = null;
    }
  }

  /**
   * Check if the Meta AI companion app is installed.
   * The companion app is required to bridge communication to the glasses.
   */
  async _checkCompanionApp() {
    if (this._useMockDevice) return true;

    if (this._nativeBridge) {
      try {
        return await this._nativeBridge.isCompanionAppInstalled();
      } catch (_) {
        return false;
      }
    }
    // Without native bridge, assume not available
    return false;
  }

  /**
   * Connect to glasses via the native SDK.
   * Requires Meta AI companion app to be running.
   */
  async _connectViaSDK() {
    if (!this._nativeBridge) {
      throw new Error('Native bridge not available');
    }

    // Native call: DeviceAccessManager.connect()
    // This triggers Bluetooth pairing flow via Meta AI app
    await this._nativeBridge.connectToGlasses();
    console.log('[COHUA-GLASSES] Connected to glasses via Meta SDK');
  }

  /**
   * Request camera access through the Meta SDK.
   * Returns true if camera permission was granted.
   */
  async _requestCameraAccess() {
    if (this._useMockDevice) return true;

    if (this._nativeBridge) {
      try {
        return await this._nativeBridge.requestCameraAccess();
      } catch (error) {
        console.log('[COHUA-GLASSES] Camera access denied:', error.message);
        return false;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL — Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Convert distance to a bucket for throttling announcements.
   * Bucket boundaries: 0, 100, 200, 300, ... feet
   */
  _distanceBucket(distanceFt) {
    return Math.floor(distanceFt / AUDIO_CONFIG.distanceThresholdFt);
  }

  /**
   * Convert compass bearing to human-readable direction.
   */
  _bearingToDirection(bearing) {
    if (bearing >= 315 || bearing < 45) return 'ahead';
    if (bearing >= 45 && bearing < 135) return 'to your right';
    if (bearing >= 135 && bearing < 225) return 'behind you';
    return 'to your left';
  }

  /**
   * Legacy direction icon helper (retained for future display use).
   */
  _directionIcon(direction) {
    const icons = {
      ahead:  'arrow_up',
      left:   'arrow_left',
      right:  'arrow_right',
      behind: 'arrow_down',
    };
    return icons[direction] || 'location';
  }

  _notifyConnection(connected) {
    for (const cb of this._connectionListeners) cb(connected);
  }
}

// Singleton — same export interface as before
export const MetaGlassesSDK = new MetaGlassesBridge();
