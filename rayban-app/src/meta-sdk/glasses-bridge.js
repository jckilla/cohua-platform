/**
 * glasses-bridge.js — Meta Ray-Ban Display SDK Integration Layer
 *
 * STUB — Ready to wire into the Meta Wearables Device Access Toolkit
 * once developer access is granted at developers.meta.com/wearables.
 *
 * This bridge handles all communication between the COHUA companion app
 * and the Ray-Ban Display glasses. When the real SDK is available:
 *   1. Replace the stub methods with actual SDK calls
 *   2. The rest of the app (proximity engine, fetcher, etc.) stays unchanged
 *
 * The glasses display shows neon sign information when the user is within
 * TRIGGER_M (50m) of an active COHUA campaign. The display includes:
 *   - Business name in the campaign's neon color
 *   - Distance and direction (e.g., "120 FT — ahead")
 *   - Sign type (NEON LOGO, NEON MENU, etc.)
 *   - Directional arrow guiding the user toward the business
 */

class MetaGlassesBridge {
  constructor() {
    this._connected = false;
    this._activeSigns = {};  // { campaignId: signData }
    this._connectionListeners = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONNECTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize connection to Ray-Ban glasses via Bluetooth.
   *
   * STUB: When Meta SDK is available, this will call:
   *   MetaWearables.initialize({ appId: 'com.cohua.rayban' })
   *   MetaWearables.connectToGlasses()
   */
  async connect() {
    console.log('[COHUA-GLASSES] Connecting to Ray-Ban Display...');

    // TODO: Replace with actual Meta Wearables SDK initialization
    // const session = await MetaWearables.initialize({
    //   appId: 'com.cohua.rayban',
    //   permissions: ['display', 'location', 'sensors'],
    // });
    // await session.connectToGlasses();

    // Stub: simulate connection
    this._connected = true;
    console.log('[COHUA-GLASSES] Connected (stub mode)');
    this._notifyConnection(true);
    return true;
  }

  /**
   * Disconnect from glasses.
   */
  async disconnect() {
    // TODO: MetaWearables.disconnect();
    this._connected = false;
    this._activeSigns = {};
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
   * Subscribe to connection state changes.
   */
  onConnectionChange(callback) {
    this._connectionListeners.push(callback);
    return () => {
      this._connectionListeners = this._connectionListeners.filter(cb => cb !== callback);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DISPLAY COMMANDS — Neon Sign Rendering on Glasses
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show a neon sign on the glasses display.
   *
   * @param {Object} signData
   * @param {string} signData.id         — Campaign UUID
   * @param {string} signData.name       — Business name
   * @param {string} signData.type       — 'NEON LOGO', 'NEON MENU', etc.
   * @param {number} signData.distance   — Distance in feet
   * @param {string} signData.direction  — 'ahead', 'left', 'right', 'behind'
   * @param {string} signData.neonColor  — Hex color (e.g., '#FFD700')
   * @param {string} signData.location   — Location label
   *
   * STUB: When Meta SDK is available, this will call:
   *   MetaWearables.display.showCard({
   *     title: signData.name,
   *     subtitle: `${signData.distance} FT — ${signData.direction}`,
   *     icon: 'navigation_arrow',
   *     color: signData.neonColor,
   *     duration: 'persistent',
   *     id: signData.id,
   *   });
   *
   * Or for a richer AR overlay:
   *   MetaWearables.display.showAROverlay({
   *     type: 'directional',
   *     bearing: targetBearing,
   *     content: { ... },
   *   });
   */
  showSign(signData) {
    this._activeSigns[signData.id] = signData;

    console.log(
      `[COHUA-GLASSES] SHOW SIGN: ${signData.name}` +
      ` | ${signData.distance} FT ${signData.direction}` +
      ` | Color: ${signData.neonColor}`
    );

    // TODO: Replace with actual Meta Wearables display call
    // if (this._connected) {
    //   MetaWearables.display.showCard({
    //     id:       signData.id,
    //     title:    signData.name,
    //     subtitle: `${signData.type}  ·  ${signData.distance} FT`,
    //     body:     `${signData.direction.toUpperCase()} — ${signData.location}`,
    //     icon:     this._directionIcon(signData.direction),
    //     color:    signData.neonColor,
    //     duration: 'persistent',  // stay until user leaves proximity
    //   });
    // }
  }

  /**
   * Update an existing sign on the glasses (distance/direction changed).
   */
  updateSign(signData) {
    if (!this._activeSigns[signData.id]) return;
    this._activeSigns[signData.id] = signData;

    // TODO: MetaWearables.display.updateCard(signData.id, { ... });

    console.log(
      `[COHUA-GLASSES] UPDATE: ${signData.name} — ${signData.distance} FT ${signData.direction}`
    );
  }

  /**
   * Hide a sign from the glasses display (user left proximity).
   */
  hideSign(campaignId) {
    delete this._activeSigns[campaignId];

    console.log(`[COHUA-GLASSES] HIDE SIGN: ${campaignId}`);

    // TODO: MetaWearables.display.dismissCard(campaignId);
  }

  /**
   * Clear all signs from glasses display.
   */
  clearAllSigns() {
    this._activeSigns = {};
    console.log('[COHUA-GLASSES] Cleared all signs');

    // TODO: MetaWearables.display.dismissAll();
  }

  /**
   * Get currently displayed signs.
   */
  getActiveSigns() {
    return Object.values(this._activeSigns);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HAPTIC / AUDIO FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Trigger a subtle haptic tap when entering a campaign zone.
   *
   * STUB: MetaWearables.haptics.tap('light');
   */
  triggerHaptic(intensity = 'light') {
    console.log(`[COHUA-GLASSES] HAPTIC: ${intensity}`);
    // TODO: MetaWearables.haptics.tap(intensity);
  }

  /**
   * Play a spatial audio cue from the direction of the sign.
   *
   * STUB: MetaWearables.audio.playSpatial('ping', { bearing });
   */
  playSpatialAudio(bearing, sound = 'ping') {
    console.log(`[COHUA-GLASSES] AUDIO: ${sound} at bearing ${bearing}°`);
    // TODO: MetaWearables.audio.playSpatial(sound, { bearing, volume: 0.3 });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL
  // ═══════════════════════════════════════════════════════════════════════

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

// Singleton
export const MetaGlassesSDK = new MetaGlassesBridge();
