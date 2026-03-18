/**
 * fetcher.js — COHUA Supabase Campaign Fetcher
 *
 * Simplified from CohuaEngine.js Section 3 — uses standard window.fetch()
 * instead of Lens Studio's InternetModule.
 */

import Config   from './config.js';
import GeoMath  from './geo-math.js';
import Location from './location.js';
import HUD      from './hud.js';

const Fetcher = {
  campaigns: [],
  lastLat:   null,
  lastLon:   null,
  _lastTime: 0,

  shouldFetch() {
    if (!Location.ready) return false;

    const now          = performance.now() / 1000;
    const timerExpired = (now - this._lastTime) >= Config.FETCH_INTERVAL;
    let   movedEnough  = false;

    if (this.lastLat !== null) {
      movedEnough = GeoMath.haversine(
        this.lastLat, this.lastLon,
        Location.lat, Location.lon
      ) >= Config.MIN_MOVE_M;
    }

    return movedEnough || timerExpired || this.campaigns.length === 0;
  },

  async fetch(onUpdate) {
    if (!Location.ready) return;

    this._lastTime = performance.now() / 1000;
    this.lastLat   = Location.lat;
    this.lastLon   = Location.lon;

    const cols = [
      'id', 'name', 'asset_type', 'latitude', 'longitude',
      'altitude_m', 'model_scale', 'deploy_payload', 'location_label'
    ].join(',');

    const url = Config.SUPABASE_URL
      + '/rest/v1/campaigns'
      + '?status=eq.live'
      + '&latitude=not.is.null'
      + '&select=' + encodeURIComponent(cols);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey':        Config.SUPABASE_ANON,
          'Authorization': 'Bearer ' + Config.SUPABASE_ANON,
          'Content-Type':  'application/json'
        }
      });

      if (!response.ok) {
        HUD.status('API error ' + response.status);
        console.error('[COHUA] API error:', await response.text());
        return;
      }

      const all = await response.json();

      // Filter to radius and annotate with distance
      const nearby = [];
      for (const c of all) {
        if (!c.latitude || !c.longitude) continue;
        const d = GeoMath.haversine(Location.lat, Location.lon, c.latitude, c.longitude);
        if (d > Config.RADIUS_M) continue;
        c._distanceM  = d;
        c._distanceFt = Math.round(d * 3.28084);
        nearby.push(c);
      }
      nearby.sort((a, b) => a._distanceM - b._distanceM);

      this.campaigns = nearby;
      console.log('[COHUA] ' + nearby.length + ' campaign(s) in range');
      HUD.status(nearby.length + ' ad' + (nearby.length !== 1 ? 's' : '') + ' nearby');

      if (onUpdate) onUpdate(nearby);

    } catch (e) {
      console.error('[COHUA] Fetch exception:', e);
      HUD.status('Network error');
    }
  }
};

export default Fetcher;
