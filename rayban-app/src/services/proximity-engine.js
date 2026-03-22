/**
 * proximity-engine.js — COHUA Proximity Detection Engine
 *
 * Orchestrates GPS polling, campaign fetching, and the pull model state machine.
 *
 * Pull model flow (per campaign):
 *
 *   Geofence enter
 *       │
 *       ▼
 *   PullStateMachine.onGeofenceEnter()
 *       │  (GazeDetector watches heading — 15° cone, 1.5s sustained)
 *       ▼
 *   DISCOVERY_READY  →  'play_audio_cue'  →  MetaGlassesSDK.showSign()
 *       │
 *       │  (user taps or says "show")
 *       ▼
 *   ACTIVE_AR  →  'start_vps'  →  ARCore VPS session
 *
 * Audio fires ONLY after gaze confirmation (DISCOVERY_READY), not on
 * proximity enter. Geofence entry is silent — it just starts gaze watching.
 */

import { Config } from './config';
import { locationService } from './location';
import { campaignFetcher } from './fetcher';
import { bearing, relativeDirection } from './geo-math';
import { MetaGlassesSDK } from '../meta-sdk/glasses-bridge';
import { pullStateMachine, PullState } from './pull-state-machine';

class ProximityEngine {
  constructor() {
    this._running        = false;
    this._pollInterval   = null;
    this._statusListeners = [];
  }

  /**
   * Start the engine — begins GPS tracking and campaign polling.
   */
  start() {
    if (this._running) return;
    this._running = true;

    console.log('[COHUA] Proximity engine starting...');
    this._emitStatus('Starting GPS...');

    // Start GPS
    locationService.start();

    // ── State machine event handlers ──────────────────────────────────────

    // Step 4: Audio cue — fires after gaze confirmation (DISCOVERY_READY)
    pullStateMachine.on('play_audio_cue', ({ campaignId, campaign }) => {
      this._onGazeConfirmed(campaign);
    });

    // Step 6: ARCore VPS — fires after opt-in (ACTIVE_AR)
    pullStateMachine.on('start_vps', ({ campaignId, campaign, method }) => {
      this._onActiveAR(campaignId, campaign, method);
    });

    // ── Proximity event handlers ──────────────────────────────────────────

    // Step 1: Geofence enter — start gaze watching (silent)
    campaignFetcher.onProximityEvent((event) => {
      if (event.type === 'enter') {
        this._onGeofenceEnter(event.campaign);
      } else if (event.type === 'exit') {
        this._onGeofenceExit(event.campaignId);
      }
    });

    // Poll loop
    this._pollInterval = setInterval(() => {
      if (campaignFetcher.shouldFetch()) {
        campaignFetcher.fetch();
        this._updateStatus();
      }
    }, Config.GPS_INTERVAL);

    // Initial fetch once GPS is ready
    locationService.onUpdate(() => {
      if (locationService.ready && campaignFetcher.campaigns.length === 0) {
        campaignFetcher.fetch();
      }
    });
  }

  /**
   * Stop the engine and reset all pull model state.
   */
  stop() {
    this._running = false;
    locationService.stop();
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    pullStateMachine.resetAll();
    MetaGlassesSDK.clearAllSigns();
    this._emitStatus('Stopped');
  }

  /**
   * Subscribe to status updates for the UI.
   */
  onStatus(callback) {
    this._statusListeners.push(callback);
    return () => {
      this._statusListeners = this._statusListeners.filter(cb => cb !== callback);
    };
  }

  // ── Proximity Event Handlers ──────────────────────────────────────────────

  /**
   * Step 1: User entered geofence — hand off to state machine.
   * No audio here. GazeDetector silently starts watching.
   */
  _onGeofenceEnter(campaign) {
    console.log(
      `[COHUA] GEOFENCE ENTER: ${campaign.name}` +
      ` (${campaign._distanceFt} ft | trigger ${campaign.trigger_distance_m || Config.TRIGGER_M}m)`
    );

    pullStateMachine.onGeofenceEnter(
      campaign,
      locationService.lat,
      locationService.lon,
    );

    this._emitStatus(`Geofence: ${campaign.name} — watching for gaze...`);
  }

  /**
   * User left the geofence — reset state machine and hide any active sign.
   */
  _onGeofenceExit(campaignId) {
    console.log(`[COHUA] GEOFENCE EXIT: ${campaignId}`);
    pullStateMachine.onGeofenceExit(campaignId);
    MetaGlassesSDK.hideSign(campaignId);
  }

  // ── State Machine Event Handlers ──────────────────────────────────────────

  /**
   * Step 4: Gaze confirmed → DISCOVERY_READY.
   * Audio cue fires now. Builds signData and calls MetaGlassesSDK.showSign().
   */
  _onGazeConfirmed(campaign) {
    if (!campaign) return;

    console.log(`[COHUA] GAZE CONFIRMED → DISCOVERY_READY: ${campaign.name}`);

    const brg       = bearing(
      locationService.lat, locationService.lon,
      campaign.latitude,   campaign.longitude,
    );
    const direction = relativeDirection(locationService.heading, brg);

    const signData = {
      id:        campaign.id,
      name:      campaign.name,
      type:      Config.ASSET_LABELS[campaign.asset_type] || 'AR AD',
      distance:  campaign._distanceFt,
      direction,
      neonColor: campaign._neonColor,
      location:  campaign.location_label || '',
      altitude:  campaign.altitude_m     || Config.DEFAULT_ALT_M,
    };

    // Step 4: TTS fires HERE — not on proximity enter
    MetaGlassesSDK.showSign(signData);

    this._emitStatus(
      `DISCOVERY_READY: ${campaign.name} — tap or say "show" to activate AR`
    );
  }

  /**
   * Step 6: ACTIVE_AR — user opted in.
   * Fires the ARCore VPS session stub.
   */
  _onActiveAR(campaignId, campaign, method) {
    console.log(
      `[COHUA] ACTIVE_AR: ${campaign?.name || campaignId} via ${method}`
    );

    // ARCore VPS session — stub until ARCore is integrated
    // When ARCore is available this call will anchor a world-locked AR overlay
    // at the campaign's latitude/longitude/altitude.
    MetaGlassesSDK.startVPSSession(campaignId, campaign);

    this._emitStatus(
      `ACTIVE AR: ${campaign?.name || campaignId} — VPS session started`
    );
  }

  // ── Status ────────────────────────────────────────────────────────────────

  _updateStatus() {
    if (!locationService.ready) {
      this._emitStatus('Waiting for GPS...');
      return;
    }
    const count   = campaignFetcher.campaigns.length;
    const nearby  = campaignFetcher.nearbyCampaigns.length;
    const acc     = Math.round(locationService.accuracy || 0);
    this._emitStatus(
      `GPS ±${acc}m | ${count} ad${count !== 1 ? 's' : ''} in range | ${nearby} nearby`
    );
  }

  _emitStatus(msg) {
    for (const cb of this._statusListeners) cb(msg);
  }
}

// Singleton
export const proximityEngine = new ProximityEngine();
