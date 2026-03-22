/**
 * fetcher.js — COHUA Supabase Campaign Fetcher
 *
 * Fetches live campaigns and filters by radius. Same logic as CohuaEngine.js
 * but uses standard fetch() and adds proximity event detection for glasses.
 */

import { Config } from './config';
import { haversine } from './geo-math';
import { locationService } from './location';

class CampaignFetcher {
  constructor() {
    this.campaigns = [];         // all campaigns within RADIUS_M
    this.nearbyCampaigns = [];   // campaigns within TRIGGER_M (for glasses display)
    this.lastFetchLat = null;
    this.lastFetchLon = null;
    this._lastFetchTime = 0;
    this._listeners = [];
    this._proximityListeners = [];
    this._seenProximity = new Set(); // track which campaigns already triggered
  }

  /**
   * Should we fetch new data? Same logic as CohuaEngine.js.
   */
  shouldFetch() {
    if (!locationService.ready) return false;

    const now = Date.now();
    const timerExpired = (now - this._lastFetchTime) >= Config.FETCH_INTERVAL;
    const movedEnough = locationService.hasMovedEnough(
      this.lastFetchLat, this.lastFetchLon
    );

    return movedEnough || timerExpired || this.campaigns.length === 0;
  }

  /**
   * Fetch live campaigns from Supabase.
   */
  async fetch() {
    if (!locationService.ready) return;

    this._lastFetchTime = Date.now();
    this.lastFetchLat = locationService.lat;
    this.lastFetchLon = locationService.lon;

    const cols = [
      'id', 'name', 'asset_type', 'latitude', 'longitude',
      'altitude_m', 'model_scale', 'deploy_payload', 'location_label',
      'trigger_distance_m', 'opt_in_required', 'model_url',
    ].join(',');

    const url = `${Config.SUPABASE_URL}/rest/v1/campaigns`
      + `?status=eq.live`
      + `&latitude=not.is.null`
      + `&select=${encodeURIComponent(cols)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey':        Config.SUPABASE_ANON,
          'Authorization': `Bearer ${Config.SUPABASE_ANON}`,
          'Content-Type':  'application/json',
        },
      });

      if (!response.ok) {
        console.error('[COHUA] API error:', response.status);
        return;
      }

      const all = await response.json();

      // Filter to radius and annotate
      const nearby = [];
      for (const c of all) {
        if (!c.latitude || !c.longitude) continue;
        const d = haversine(
          locationService.lat, locationService.lon,
          c.latitude, c.longitude
        );
        if (d > Config.RADIUS_M) continue;

        // Parse deploy_payload safely (typeof check — same bug fix as CohuaEngine.js)
        let payload = {};
        try {
          payload = (typeof c.deploy_payload === 'string')
            ? JSON.parse(c.deploy_payload)
            : (c.deploy_payload || {});
        } catch (e) { /* noop */ }

        c._distanceM  = d;
        c._distanceFt = Math.round(d * 3.28084);
        c._neonColor  = payload.neon_color || Config.DEFAULT_NEON;
        c._payload    = payload;
        nearby.push(c);
      }

      nearby.sort((a, b) => a._distanceM - b._distanceM);
      this.campaigns = nearby;

      console.log(`[COHUA] ${nearby.length} campaign(s) in range`);

      // Check proximity triggers for glasses
      this._checkProximity();

      // Notify campaign update listeners
      for (const cb of this._listeners) cb(this.campaigns);

    } catch (e) {
      console.error('[COHUA] Fetch exception:', e);
    }
  }

  /**
   * Check which campaigns are within their trigger distance and fire proximity events.
   * Uses campaign's trigger_distance_m if present, falls back to Config.TRIGGER_M.
   */
  _checkProximity() {
    const newNearby = [];

    for (const c of this.campaigns) {
      const triggerM = c.trigger_distance_m || Config.TRIGGER_M;
      if (c._distanceM <= triggerM) {
        newNearby.push(c);

        // Fire enter event if this is a new proximity trigger
        if (!this._seenProximity.has(c.id)) {
          this._seenProximity.add(c.id);
          for (const cb of this._proximityListeners) {
            cb({ type: 'enter', campaign: c });
          }
        }
      }
    }

    // Fire exit events for campaigns that left proximity
    for (const id of this._seenProximity) {
      const stillNearby = newNearby.find(c => c.id === id);
      if (!stillNearby) {
        this._seenProximity.delete(id);
        for (const cb of this._proximityListeners) {
          cb({ type: 'exit', campaignId: id });
        }
      }
    }

    this.nearbyCampaigns = newNearby;
  }

  /**
   * Subscribe to campaign list updates.
   */
  onCampaignsUpdate(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Subscribe to proximity enter/exit events (for glasses display).
   */
  onProximityEvent(callback) {
    this._proximityListeners.push(callback);
    return () => {
      this._proximityListeners = this._proximityListeners.filter(cb => cb !== callback);
    };
  }
}

// Singleton
export const campaignFetcher = new CampaignFetcher();
