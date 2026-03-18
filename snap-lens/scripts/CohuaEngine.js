/**
 * CohuaEngine.js  —  COHUA AR Engine  (Lens Studio 5.7+, Spectacles)
 *
 * A clean, modular refactor of CohuaMain.js with clear separation of concerns:
 *
 *   Section 1 – CONFIG          Tunable constants and Supabase credentials
 *   Section 2 – LOCATION         GPS + compass via RawLocationModule
 *   Section 3 – FETCHER          Supabase REST campaign fetcher
 *   Section 4 – RENDERER         NeonSign 3D object lifecycle
 *   Section 5 – HUD              Status and debug text helpers
 *   Section 6 – MATH             Haversine, bearing, hex-to-RGB
 *   Section 7 – BOOTSTRAP        OnStart wiring + UpdateEvent loop
 *
 * Scene setup (wire in Lens Studio Inspector):
 *   //@input Asset.InternetModule internetModule
 *   //@input SceneObject signsContainer
 *   //@input Component.Text statusText
 *   //@input Component.Text debugText
 *
 * IMPORTANT:
 *   - Project Settings > Experimental API must be checked.
 *   - Extended Permissions must be enabled on the Spectacles device.
 *   - Requires RawLocationModule in the project.
 */

require('LensStudio:RawLocationModule');

// ─────────────────────────────────────────────────────────────────────────────
//  INPUTS  (wire these in the Lens Studio Inspector)
// ─────────────────────────────────────────────────────────────────────────────
//@input Asset.InternetModule internetModule
//@input SceneObject signsContainer
//@input Component.Text statusText
//@input Component.Text debugText


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — CONFIG
// ═════════════════════════════════════════════════════════════════════════════

var Config = {
  // Supabase project
  SUPABASE_URL:   'https://sgredejirqatcmstlzqi.supabase.co',
  SUPABASE_ANON:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA',

  // Spatial thresholds
  RADIUS_M:       914,     // 3 000 ft — only show campaigns within this range
  MIN_MOVE_M:     2.0,     // re-position signs only after 2+ meters of movement

  // Timing
  FETCH_INTERVAL: 5.0,     // seconds between Supabase re-fetches
  GPS_POLL_S:     1.0,     // seconds between GPS position reads

  // Heading filter
  HEADING_ALPHA:  0.15,    // low-pass filter weight for compass smoothing

  // Visual defaults
  DEFAULT_ALT_M:  7.0,     // default sign altitude when campaign has none
  DEFAULT_SCALE:  1.0,     // default model_scale
  DEFAULT_NEON:   '#ff00ff',

  // Sign geometry
  PANEL_WIDTH:    3.5,
  PANEL_HEIGHT:   1.4,
  BAR_THICKNESS:  0.08,
  BAR_Y_OFFSET:   0.76,
  NAME_SIZE:      0.26,
  DIST_SIZE:      0.14,
  POLE_SEGMENTS:  8,
  POLE_RADIUS:    0.04,
  PANEL_OPACITY:  0.88,
  POLE_OPACITY:   0.6,
  MAX_LABEL_LEN:  22
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — LOCATION SERVICE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Manages GPS position and compass heading via RawLocationModule.
 *
 * Public state:
 *   Location.lat / Location.lon      — latest GPS coordinates (null until fix)
 *   Location.heading                 — smoothed compass heading in degrees
 *   Location.headingReliable         — true when accuracy is Medium or High
 *   Location.ready                   — true once first GPS fix arrives
 */
var Location = {
  lat:              null,
  lon:              null,
  heading:          0,
  headingReliable:  false,
  ready:            false,
  _service:         null,
  _headingSeeded:   false,

  /** Create the GeoLocation service and subscribe to heading updates. */
  init: function () {
    this._service = GeoLocation.createLocationService();
    this._service.accuracy = GeoLocationAccuracy.Navigation;

    var self = this;
    this._service.onNorthAlignedOrientationUpdate.add(
      function (northOrientation, accuracy) {
        var raw = GeoLocation.getNorthAlignedHeading(northOrientation);
        self._applyHeading(raw);
        self.headingReliable =
          accuracy === CompassTrackingData.Accuracy.High ||
          accuracy === CompassTrackingData.Accuracy.Medium;
        HUD.debug(
          'Heading: ' + Math.round(self.heading) + '\u00b0 ' +
          (self.headingReliable ? '(good)' : '(calibrating)')
        );
      }
    );
  },

  /**
   * Request a single GPS position reading.
   * Returns a Promise-like callback pattern (success, error).
   */
  poll: function (onSuccess, onError) {
    if (!this._service) return;
    var self = this;
    this._service.getCurrentPosition(
      function (geoPos) {
        self.lat   = geoPos.latitude;
        self.lon   = geoPos.longitude;
        self.ready = true;
        if (onSuccess) onSuccess(geoPos);
      },
      function (err) {
        if (onError) onError(err);
      }
    );
  },

  // ── Internal: circular low-pass filter on heading ──────────────────────
  _applyHeading: function (raw) {
    if (!this._headingSeeded) {
      this.heading = raw;
      this._headingSeeded = true;
      return;
    }
    var diff = raw - this.heading;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    this.heading = (this.heading + diff * Config.HEADING_ALPHA + 360) % 360;
  }
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — CAMPAIGN FETCHER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fetches live campaigns from the Supabase REST API and filters to the
 * configured radius using Haversine distance.
 *
 * Public state:
 *   Fetcher.campaigns   — array of campaign objects currently in range
 *   Fetcher.lastLat / lastLon — user position at time of last fetch
 */
var Fetcher = {
  campaigns: [],
  lastLat:   null,
  lastLon:   null,
  _lastTime: 0,

  /** True when enough time or movement has passed to justify a new fetch. */
  shouldFetch: function () {
    if (!Location.ready) return false;

    var timerExpired = (getTime() - this._lastTime) >= Config.FETCH_INTERVAL;
    var movedEnough  = false;
    if (this.lastLat !== null) {
      movedEnough = GeoMath.haversine(
        this.lastLat, this.lastLon,
        Location.lat, Location.lon
      ) >= Config.MIN_MOVE_M;
    }
    return movedEnough || timerExpired || this.campaigns.length === 0;
  },

  /** Perform the HTTP fetch, parse, filter, and hand off to Renderer. */
  fetch: async function () {
    if (!Location.ready) return;

    this._lastTime = getTime();
    this.lastLat   = Location.lat;
    this.lastLon   = Location.lon;

    var cols = [
      'id', 'name', 'asset_type', 'latitude', 'longitude',
      'altitude_m', 'model_scale', 'deploy_payload', 'location_label'
    ].join(',');

    var url = Config.SUPABASE_URL
      + '/rest/v1/campaigns'
      + '?status=eq.live'
      + '&latitude=not.is.null'
      + '&select=' + encodeURIComponent(cols);

    try {
      var req = new Request(url, {
        method:  'GET',
        headers: {
          'apikey':        Config.SUPABASE_ANON,
          'Authorization': 'Bearer ' + Config.SUPABASE_ANON,
          'Content-Type':  'application/json'
        }
      });

      var response = await script.internetModule.fetch(req);

      if (response.status !== 200) {
        var errBody = await response.text();
        HUD.status('API error ' + response.status);
        print('[COHUA] API error: ' + errBody);
        return;
      }

      var body = await response.text();
      var all  = JSON.parse(body);

      // Attach distance and filter to radius
      var nearby = [];
      for (var i = 0; i < all.length; i++) {
        var c = all[i];
        if (!c.latitude || !c.longitude) continue;
        var d = GeoMath.haversine(Location.lat, Location.lon, c.latitude, c.longitude);
        if (d > Config.RADIUS_M) continue;
        c._distanceM  = d;
        c._distanceFt = Math.round(d * 3.28084);
        nearby.push(c);
      }
      nearby.sort(function (a, b) { return a._distanceM - b._distanceM; });

      this.campaigns = nearby;
      print('[COHUA] ' + nearby.length + ' campaign(s) in range');

      // Hand off to renderer
      Renderer.sync(this.campaigns);

    } catch (e) {
      print('[COHUA] Fetch exception: ' + e);
      HUD.status('Network error');
    }
  }
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — NEON SIGN RENDERER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates, positions, updates, and destroys NeonSign SceneObjects.
 *
 * Each sign is a dark semi-transparent panel with emissive neon bars on top
 * and bottom, plus text labels for name and distance. A thin pole extends
 * from the sign down to ground level.
 */
var Renderer = {
  _signs: {},   // { campaignId: { root, nameText, distText } }

  /**
   * Synchronize the visible signs with the given campaign array.
   * Creates new signs, updates positions/labels, removes stale ones.
   */
  sync: function (campaigns) {
    if (!Location.ready) return;

    var seen = {};

    for (var i = 0; i < campaigns.length; i++) {
      var c = campaigns[i];
      seen[c.id] = true;

      // Parse deploy_payload — may be a pre-parsed object (Supabase JSONB)
      var payload = {};
      try {
        payload = (typeof c.deploy_payload === 'string')
          ? JSON.parse(c.deploy_payload)
          : (c.deploy_payload || {});
      } catch (e) { /* noop */ }

      var neonHex = payload.neon_color || Config.DEFAULT_NEON;
      var altM    = parseFloat(c.altitude_m)  || Config.DEFAULT_ALT_M;
      var scl     = parseFloat(c.model_scale) || Config.DEFAULT_SCALE;
      var offsetM = parseFloat(payload.offset_m) || 0.0;
      var rgb     = GeoMath.hexToRgb(neonHex);

      // GPS to world-space offset
      var off = GeoMath.gpsToWorld(
        Location.lat, Location.lon,
        c.latitude, c.longitude,
        Location.heading
      );

      // Create sign if first time
      if (!this._signs[c.id]) {
        this._signs[c.id] = this._createSign(c, rgb, altM, scl);
      }

      // Update position
      var t = this._signs[c.id].root.getTransform();
      t.setLocalPosition(new vec3(off.x + offsetM, altM, off.z));

      // Update label text
      var label = this._trimLabel(c.name);
      var typeStr = this._assetLabel(c.asset_type);
      this._signs[c.id].nameText.text = label;
      this._signs[c.id].distText.text = typeStr + '  \u00b7  ' + c._distanceFt + ' FT';
    }

    // Destroy signs that are no longer in the campaign set
    var ids = Object.keys(this._signs);
    for (var j = 0; j < ids.length; j++) {
      if (!seen[ids[j]]) {
        this._signs[ids[j]].root.destroy();
        delete this._signs[ids[j]];
      }
    }
  },

  /**
   * Billboard every sign toward the camera. Call once per frame.
   */
  billboard: function (camTransform) {
    var camPos = camTransform.getWorldPosition();
    var ids = Object.keys(this._signs);
    for (var i = 0; i < ids.length; i++) {
      var sign = this._signs[ids[i]];
      var sp   = sign.root.getTransform().getWorldPosition();
      var dir  = new vec3(camPos.x - sp.x, 0, camPos.z - sp.z);
      if (dir.length > 0.1) {
        sign.root.getTransform().setWorldRotation(
          quat.lookAt(dir.normalize(), vec3.up())
        );
      }
    }
  },

  /** Returns true when at least one sign exists in the scene. */
  hasActiveSigns: function () {
    return Object.keys(this._signs).length > 0;
  },

  // ── Internal: build the NeonSign scene graph ───────────────────────────

  _createSign: function (campaign, rgb, altM, scl) {
    var label = this._trimLabel(campaign.name);

    // Root
    var root = scene.createSceneObject('Sign_' + campaign.id);
    root.setParent(script.signsContainer);

    // Dark translucent panel
    var panel     = scene.createSceneObject('Panel');
    panel.setParent(root);
    var panelMesh = panel.createComponent('Component.MeshVisual');
    panelMesh.mesh = ProceduralMeshes.createQuadMesh();
    var panelMat  = Material.create('Standard1Side');
    panelMat.mainPass.baseColor = new vec4(0.02, 0.02, 0.02, Config.PANEL_OPACITY);
    panelMesh.setMaterial(0, panelMat);
    panel.getTransform().setLocalScale(
      new vec3(Config.PANEL_WIDTH * scl, Config.PANEL_HEIGHT * scl, 1)
    );

    // Top and bottom neon bars
    this._createBar(root, rgb, scl, +Config.BAR_Y_OFFSET);
    this._createBar(root, rgb, scl, -Config.BAR_Y_OFFSET);

    // Campaign name text
    var nObj = scene.createSceneObject('NameTxt');
    nObj.setParent(root);
    var nTxt = nObj.createComponent('Component.Text');
    nTxt.text = label;
    nTxt.size = Config.NAME_SIZE * scl;
    nTxt.horizontalAlignment = HorizontalAlignment.Center;
    if (nTxt.textFill) {
      nTxt.textFill.color = new vec4(rgb.r, rgb.g, rgb.b, 1);
    }
    nObj.getTransform().setLocalPosition(new vec3(0, 0.16 * scl, 0.04));

    // Distance / type subtitle text
    var dObj = scene.createSceneObject('DistTxt');
    dObj.setParent(root);
    var dTxt = dObj.createComponent('Component.Text');
    dTxt.text = campaign._distanceFt + ' FT';
    dTxt.size = Config.DIST_SIZE * scl;
    dTxt.horizontalAlignment = HorizontalAlignment.Center;
    if (dTxt.textFill) {
      dTxt.textFill.color = new vec4(0.6, 0.6, 0.6, 1);
    }
    dObj.getTransform().setLocalPosition(new vec3(0, -0.22 * scl, 0.04));

    // Vertical pole from sign down to ground
    var poleObj  = scene.createSceneObject('Pole');
    poleObj.setParent(root);
    var poleMesh = poleObj.createComponent('Component.MeshVisual');
    poleMesh.mesh = ProceduralMeshes.createCylinderMesh(Config.POLE_SEGMENTS);
    var poleMat  = Material.create('Unlit');
    poleMat.mainPass.baseColor = new vec4(
      rgb.r * 0.5, rgb.g * 0.5, rgb.b * 0.5, Config.POLE_OPACITY
    );
    poleMesh.setMaterial(0, poleMat);
    poleObj.getTransform().setLocalScale(
      new vec3(Config.POLE_RADIUS, altM * 0.5, Config.POLE_RADIUS)
    );
    poleObj.getTransform().setLocalPosition(new vec3(0, -altM * 0.5, 0));

    return { root: root, nameText: nTxt, distText: dTxt };
  },

  _createBar: function (parent, rgb, scl, yOffset) {
    var obj = scene.createSceneObject('Bar');
    obj.setParent(parent);
    var mv  = obj.createComponent('Component.MeshVisual');
    mv.mesh = ProceduralMeshes.createQuadMesh();
    var mat = Material.create('Unlit');
    mat.mainPass.baseColor = new vec4(rgb.r, rgb.g, rgb.b, 1);
    mv.setMaterial(0, mat);
    obj.getTransform().setLocalScale(
      new vec3(Config.PANEL_WIDTH * scl, Config.BAR_THICKNESS * scl, 1)
    );
    obj.getTransform().setLocalPosition(
      new vec3(0, yOffset * scl, 0.02)
    );
  },

  _trimLabel: function (name) {
    var label = (name || '').replace('[DEMO] ', '').trim();
    if (label.length > Config.MAX_LABEL_LEN) {
      label = label.substring(0, Config.MAX_LABEL_LEN) + '\u2026';
    }
    return label;
  },

  _assetLabel: function (type) {
    var map = {
      neon_logo:  'NEON LOGO',
      neon_menu:  'NEON MENU',
      neon_image: 'NEON IMAGE',
      custom_3d:  '3D AD'
    };
    return map[type] || 'AR AD';
  }
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — HUD (status / debug text)
// ═════════════════════════════════════════════════════════════════════════════

var HUD = {
  status: function (msg) {
    print('[COHUA] ' + msg);
    if (script.statusText) script.statusText.text = 'COHUA  |  ' + msg;
  },

  debug: function (msg) {
    if (script.debugText) script.debugText.text = msg;
  }
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — GEO-MATH UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

var GeoMath = {
  DEG2RAD: Math.PI / 180,
  EARTH_R: 6371000,

  /**
   * Haversine distance in meters between two lat/lon pairs.
   */
  haversine: function (lat1, lon1, lat2, lon2) {
    var r  = this.DEG2RAD;
    var dLat = (lat2 - lat1) * r;
    var dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return this.EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /**
   * Initial bearing (forward azimuth) in degrees from (lat1,lon1) to (lat2,lon2).
   */
  bearing: function (lat1, lon1, lat2, lon2) {
    var r    = this.DEG2RAD;
    var dLon = (lon2 - lon1) * r;
    var y    = Math.sin(dLon) * Math.cos(lat2 * r);
    var x    = Math.cos(lat1 * r) * Math.sin(lat2 * r) -
               Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  },

  /**
   * Convert a GPS target position to a Spectacles world-space offset
   * relative to the user's current position and compass heading.
   *
   * Returns { x, y, z } where:
   *   x = right,  y = up (always 0 here),  z = forward (negative = into screen)
   */
  gpsToWorld: function (userLat, userLon, targetLat, targetLon, headingDeg) {
    var dist = this.haversine(userLat, userLon, targetLat, targetLon);
    var brg  = this.bearing(userLat, userLon, targetLat, targetLon);

    var brgRad = brg * this.DEG2RAD;
    var east   = dist * Math.sin(brgRad);
    var north  = dist * Math.cos(brgRad);

    // Rotate by negative heading so north in GPS aligns with camera forward
    var hR = headingDeg * this.DEG2RAD;
    var cH = Math.cos(-hR);
    var sH = Math.sin(-hR);

    return {
      x: east * cH - north * sH,
      y: 0,
      z: -(east * sH + north * cH)
    };
  },

  /**
   * Parse a hex colour string (#RRGGBB or #RGB) to { r, g, b } in 0-1 range.
   */
  hexToRgb: function (hex) {
    hex = (hex || '#ff00ff').replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
      r: parseInt(hex.substring(0, 2), 16) / 255,
      g: parseInt(hex.substring(2, 4), 16) / 255,
      b: parseInt(hex.substring(4, 6), 16) / 255
    };
  }
};


// ═════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — BOOTSTRAP
// ═════════════════════════════════════════════════════════════════════════════

script.createEvent('OnStartEvent').bind(function () {
  HUD.status('Initializing...');

  // Guard: InternetModule must be wired
  if (!script.internetModule) {
    HUD.status('ERROR: InternetModule not connected!');
    return;
  }

  // Initialize location service (GPS + compass)
  Location.init();

  // ── GPS polling loop (fires every GPS_POLL_S seconds) ──────────────────
  var gpsLoop = script.createEvent('DelayedCallbackEvent');
  gpsLoop.bind(function () {
    Location.poll(
      function (geoPos) {
        var acc = Math.round(geoPos.horizontalAccuracy);
        HUD.status(
          'GPS \u00b1' + acc + 'm | ' +
          Fetcher.campaigns.length + ' ad' +
          (Fetcher.campaigns.length !== 1 ? 's' : '') + ' nearby'
        );

        // Fetch when movement or timer threshold is met
        if (Fetcher.shouldFetch()) {
          Fetcher.fetch();
        }
      },
      function (err) {
        HUD.status('GPS error: ' + err);
      }
    );
    gpsLoop.reset(Config.GPS_POLL_S);
  });
  gpsLoop.reset(0.0); // fire immediately

  // ── Frame update — billboard signs toward camera ───────────────────────
  script.createEvent('UpdateEvent').bind(function () {
    if (!Renderer.hasActiveSigns()) return;
    var camTransform = scene.getCameraObject().getTransform();
    Renderer.billboard(camTransform);
  });

  HUD.status('Waiting for GPS...');
});
