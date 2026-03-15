/**
 * CampaignFetcher.js
 * Fetches live COHUA campaigns from Supabase REST API
 * Requires: InternetModule, Extended Permissions (GPS + Internet)
 *
 * Usage:
 *   //@input Asset.InternetModule internetModule
 *   var fetcher = new CampaignFetcher(script.internetModule);
 *   fetcher.fetchNearby(userLat, userLon, 914, function(campaigns) { ... });
 */

// ── Supabase config ─────────────────────────────────────────────────────────
var SUPABASE_URL  = 'https://sgredejirqatcmstlzqi.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA';

// Columns to fetch — includes placement data
var SELECT_COLS = 'id,name,asset_type,latitude,longitude,altitude_m,model_scale,deploy_payload,location_label,status';

function CampaignFetcher(internetModule) {
  this.internetModule = internetModule;
  this.lastFetchTime  = 0;
  this.cachedData     = [];
}

/**
 * Fetch all live campaigns within radiusM meters of (userLat, userLon)
 * Results are client-side filtered (Supabase free tier doesn't have geo queries)
 * @param {number} userLat
 * @param {number} userLon
 * @param {number} radiusM  - trigger radius in meters (default 914 = 3000ft)
 * @param {function} onSuccess - callback(campaigns: Array)
 * @param {function} onError   - callback(errorMsg: string)
 */
CampaignFetcher.prototype.fetchNearby = async function(userLat, userLon, radiusM, onSuccess, onError) {
  try {
    var url = SUPABASE_URL
      + '/rest/v1/campaigns'
      + '?status=eq.live'
      + '&latitude=not.is.null'
      + '&select=' + encodeURIComponent(SELECT_COLS);

    var request = new Request(url, {
      method: 'GET',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type':  'application/json'
      }
    });

    var response = await this.internetModule.fetch(request);

    if (response.status !== 200) {
      var errText = await response.text();
      if (onError) onError('HTTP ' + response.status + ': ' + errText);
      return;
    }

    var text = await response.text();
    var all  = JSON.parse(text);

    // Client-side distance filter
    var nearby = all.filter(function(c) {
      if (!c.latitude || !c.longitude) return false;
      var d = haversineDistance(userLat, userLon, c.latitude, c.longitude);
      c._distanceM = d;
      c._distanceFt = Math.round(d * 3.28084);
      return d <= radiusM;
    });

    // Sort by distance
    nearby.sort(function(a, b) { return a._distanceM - b._distanceM; });

    this.cachedData = nearby;
    print('[COHUA] Fetched ' + nearby.length + ' nearby campaigns (of ' + all.length + ' total live)');
    if (onSuccess) onSuccess(nearby);

  } catch(e) {
    print('[COHUA] Fetch error: ' + e);
    if (onError) onError('' + e);
  }
};

/**
 * Simple haversine (duplicated here so CampaignFetcher is self-contained)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371000, r = Math.PI / 180;
  var dLat = (lat2 - lat1) * r;
  var dLon = (lon2 - lon1) * r;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
