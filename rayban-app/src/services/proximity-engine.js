/**
 * proximity-engine.js — COHUA Proximity Detection Engine
 *
 * Orchestrates GPS polling, campaign fetching, and proximity triggers.
 * When a user walks within TRIGGER_M of a campaign, fires an event
 * that the Meta SDK layer uses to display the neon sign on Ray-Ban glasses.
 */

import { Config } from './config';
import { locationService } from './location';
import { campaignFetcher } from './fetcher';
import { bearing, relativeDirection } from './geo-math';
import { MetaGlassesSDK } from '../meta-sdk/glasses-bridge';

class ProximityEngine {
  constructor() {
    this._running = false;
    this._pollInterval = null;
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

    // Listen for proximity events → send to glasses
    campaignFetcher.onProximityEvent((event) => {
      if (event.type === 'enter') {
        this._onCampaignEnter(event.campaign);
      } else if (event.type === 'exit') {
        this._onCampaignExit(event.campaignId);
      }
    });

    // Poll loop: check if we should fetch, then fetch
    this._pollInterval = setInterval(() => {
      if (campaignFetcher.shouldFetch()) {
        campaignFetcher.fetch();
        this._updateStatus();
      }
    }, Config.GPS_INTERVAL);

    // Initial fetch
    locationService.onUpdate(() => {
      if (locationService.ready && campaignFetcher.campaigns.length === 0) {
        campaignFetcher.fetch();
      }
    });
  }

  /**
   * Stop the engine.
   */
  stop() {
    this._running = false;
    locationService.stop();
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
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

  // ── Proximity Event Handlers ──────────────────────────────────────────

  /**
   * User entered proximity of a campaign — send sign to glasses.
   */
  _onCampaignEnter(campaign) {
    console.log(`[COHUA] PROXIMITY ENTER: ${campaign.name} (${campaign._distanceFt} ft)`);

    // Calculate direction from user to sign
    const brg = bearing(
      locationService.lat, locationService.lon,
      campaign.latitude, campaign.longitude
    );
    const direction = relativeDirection(locationService.heading, brg);

    // Build the sign data for the glasses display
    const signData = {
      id:         campaign.id,
      name:       campaign.name,
      type:       Config.ASSET_LABELS[campaign.asset_type] || 'AR AD',
      distance:   campaign._distanceFt,
      direction:  direction,
      neonColor:  campaign._neonColor,
      location:   campaign.location_label || '',
      altitude:   campaign.altitude_m || Config.DEFAULT_ALT_M,
    };

    // Send to Meta Ray-Ban Display via SDK bridge
    MetaGlassesSDK.showSign(signData);

    this._emitStatus(`Showing: ${campaign.name} — ${campaign._distanceFt} ft ${direction}`);
  }

  /**
   * User left proximity of a campaign — remove sign from glasses.
   */
  _onCampaignExit(campaignId) {
    console.log(`[COHUA] PROXIMITY EXIT: ${campaignId}`);
    MetaGlassesSDK.hideSign(campaignId);
  }

  _updateStatus() {
    if (!locationService.ready) {
      this._emitStatus('Waiting for GPS...');
      return;
    }
    const count = campaignFetcher.campaigns.length;
    const nearby = campaignFetcher.nearbyCampaigns.length;
    const acc = Math.round(locationService.accuracy || 0);
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
