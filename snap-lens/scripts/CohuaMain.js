/**
 * CohuaMain.js  —  COHUA AR Snap Lens  (Lens Studio 5.7+, Spectacles)
 *
 * Wires together:
 *  1. LocationService (GPS + compass heading)
 *  2. CampaignFetcher (Supabase REST API via InternetModule)
 *  3. NeonSignRenderer (3D sign SceneObjects)
 *
 * Scene setup:
 *   //@input Asset.InternetModule internetModule
 *   //@input SceneObject signsContainer
 *   //@input Component.Text statusText
 *   //@input Component.Text debugText
 *
 * IMPORTANT: Project Settings > Experimental API must be checked.
 * Extended Permissions must be enabled on Spectacles device.
 */

require('LensStudio:RawLocationModule');

// ── Inputs (wire in Lens Studio Inspector) ───────────────────────────────────
//@input Asset.InternetModule internetModule
//@input SceneObject signsContainer
//@input Component.Text statusText
//@input Component.Text debugText

// ── Config ────────────────────────────────────────────────────────────────────
var SUPABASE_URL  = 'https://sgredejirqatcmstlzqi.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA';
var RADIUS_M      = 914;   // 3000 feet
var FETCH_EVERY_S = 5.0;   // re-fetch campaigns every 5 seconds
var MIN_MOVE_M    = 2.0;   // only re-position signs if moved 2+ meters

// ── State ─────────────────────────────────────────────────────────────────────
var locationService   = null;
var currentLat        = null;
var currentLon        = null;
var currentHeading    = 0;     // degrees, 0=North
var headingAccurate   = false;
var campaigns         = [];    // latest fetched array
var signs             = {};    // {id: {root, nameText, distText}}
var lastFetchTime     = 0;
var fetchTimer        = null;
var lastUserLat       = null;
var lastUserLon       = null;

// ── Startup ───────────────────────────────────────────────────────────────────
script.createEvent('OnStartEvent').bind(function() {
  setStatus('Initializing...');

  if (!script.internetModule) {
    setStatus('ERROR: InternetModule not connected!');
    return;
  }

  // 1. Create location service
  locationService = GeoLocation.createLocationService();
  locationService.accuracy = GeoLocationAccuracy.Navigation;

  // 2. Subscribe to compass heading (north-aligned orientation)
  locationService.onNorthAlignedOrientationUpdate.add(function(northAlignedOrientation, accuracy) {
    var heading = GeoLocation.getNorthAlignedHeading(northAlignedOrientation);
    // Smooth heading with a simple low-pass filter
    if (currentHeading === 0 && !headingAccurate) {
      currentHeading = heading;
    } else {
      // Circular lerp
      var diff = heading - currentHeading;
      if (diff >  180) diff -= 360;
      if (diff < -180) diff += 360;
      currentHeading = (currentHeading + diff * 0.15 + 360) % 360;
    }
    headingAccurate = (accuracy === CompassTrackingData.Accuracy.High ||
                       accuracy === CompassTrackingData.Accuracy.Medium);
    setDebug('Heading: ' + Math.round(currentHeading) + '\u00b0 ' +
             (headingAccurate ? '(good)' : '(calibrating)'));
  });

  // 3. Start GPS polling loop
  var gpsLoop = script.createEvent('DelayedCallbackEvent');
  gpsLoop.bind(function() {
    locationService.getCurrentPosition(
      function(geoPosition) {
        currentLat = geoPosition.latitude;
        currentLon = geoPosition.longitude;
        var acc = Math.round(geoPosition.horizontalAccuracy);
        setStatus('GPS \u00b1' + acc + 'm | ' + campaigns.length + ' ad' +
                  (campaigns.length !== 1 ? 's' : '') + ' nearby');

        // Trigger a re-fetch if user has moved enough OR timer expired
        var movedEnough = (lastUserLat !== null &&
          haversine(lastUserLat, lastUserLon, currentLat, currentLon) >= MIN_MOVE_M);
        var timerExpired = (getTime() - lastFetchTime) >= FETCH_EVERY_S;

        if (movedEnough || timerExpired || campaigns.length === 0) {
          fetchCampaigns();
        }
      },
      function(err) {
        setStatus('GPS error: ' + err);
      }
    );
    gpsLoop.reset(1.0); // poll every second
  });
  gpsLoop.reset(0.0); // start immediately

  // 4. Update loop — billboard signs to camera each frame
  script.createEvent('UpdateEvent').bind(function() {
    if (Object.keys(signs).length === 0) return;
    var camTransform = scene.getCameraObject().getTransform();
    billboardSigns(camTransform);
  });

  setStatus('Waiting for GPS...');
});

// ── Fetch campaigns from Supabase ─────────────────────────────────────────────
async function fetchCampaigns() {
  if (!currentLat || !currentLon) return;
  lastFetchTime = getTime();
  lastUserLat   = currentLat;
  lastUserLon   = currentLon;

  var cols = 'id,name,asset_type,latitude,longitude,altitude_m,model_scale,deploy_payload,location_label';
  var url  = SUPABASE_URL
    + '/rest/v1/campaigns'
    + '?status=eq.live'
    + '&latitude=not.is.null'
    + '&select=' + encodeURIComponent(cols);

  try {
    var req = new Request(url, {
      method: 'GET',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type':  'application/json'
      }
    });

    var response = await script.internetModule.fetch(req);

    if (response.status !== 200) {
      var errText = await response.text();
      setStatus('API error ' + response.status);
      print('[COHUA] API error: ' + errText);
      return;
    }

    var text = await response.text();
    var all  = JSON.parse(text);

    // Filter to within radius
    var nearby = all.filter(function(c) {
      if (!c.latitude || !c.longitude) return false;
      var d = haversine(currentLat, currentLon, c.latitude, c.longitude);
      c._distanceM  = d;
      c._distanceFt = Math.round(d * 3.28084);
      return d <= RADIUS_M;
    });
    nearby.sort(function(a, b) { return a._distanceM - b._distanceM; });

    campaigns = nearby;
    print('[COHUA] ' + nearby.length + ' campaigns in range');

    // Update signs
    updateSigns();

  } catch(e) {
    print('[COHUA] Fetch exception: ' + e);
    setStatus('Network error');
  }
}

// ── Create / update 3D signs ──────────────────────────────────────────────────
function updateSigns() {
  if (!currentLat || !currentLon) return;

  var seen = {};

  campaigns.forEach(function(c) {
    seen[c.id] = true;

    // Parse placement
    var payload = {};
    try { payload = JSON.parse(c.deploy_payload || '{}'); } catch(e) {}

    var neonHex   = payload.neon_color  || '#ff00ff';
    var altM      = parseFloat(c.altitude_m)  || 7.0;
    var scl       = parseFloat(c.model_scale) || 1.0;
    var offsetM   = parseFloat(payload.offset_m) || 0.0;
    var neonRgb   = hexToRgb(neonHex);

    // World-space offset
    var off = gpsToWorldOffset(currentLat, currentLon, c.latitude, c.longitude, currentHeading);

    if (!signs[c.id]) {
      signs[c.id] = createSign(c, neonRgb, altM, scl);
    }

    // Position
    var t = signs[c.id].root.getTransform();
    t.setLocalPosition(new vec3(off.x + offsetM, altM, off.z));

    // Update text
    var label = c.name.replace('[DEMO] ', '').trim();
    if (label.length > 22) label = label.substring(0, 22) + '\u2026';
    var typeStr = {
      neon_logo:'NEON LOGO', neon_menu:'NEON MENU',
      neon_image:'NEON IMAGE', custom_3d:'3D AD'
    }[c.asset_type] || 'AR AD';
    signs[c.id].nameText.text = label;
    signs[c.id].distText.text = typeStr + '  \u00b7  ' + c._distanceFt + ' FT';
  });

  // Remove out-of-range signs
  Object.keys(signs).forEach(function(id) {
    if (!seen[id]) {
      signs[id].root.destroy();
      delete signs[id];
    }
  });
}

function createSign(campaign, rgb, altM, scl) {
  var name = campaign.name.replace('[DEMO] ', '').trim();
  if (name.length > 22) name = name.substring(0, 22) + '\u2026';

  var root = scene.createSceneObject('Sign_' + campaign.id);
  root.setParent(script.signsContainer);

  // Panel (dark backing)
  var panel = scene.createSceneObject('Panel');
  panel.setParent(root);
  var pMesh = panel.createComponent('Component.MeshVisual');
  pMesh.mesh = ProceduralMeshes.createQuadMesh();
  var pMat  = Material.create('Standard1Side');
  pMat.mainPass.baseColor = new vec4(0.02, 0.02, 0.02, 0.88);
  pMesh.setMaterial(0, pMat);
  panel.getTransform().setLocalScale(new vec3(3.5 * scl, 1.4 * scl, 1));

  // Top neon bar
  _bar(root, rgb, scl, +0.76);
  // Bottom neon bar
  _bar(root, rgb, scl, -0.76);

  // Name text
  var nObj = scene.createSceneObject('NameTxt');
  nObj.setParent(root);
  var nTxt = nObj.createComponent('Component.Text');
  nTxt.text = name;
  nTxt.size = 0.26 * scl;
  nTxt.horizontalAlignment = HorizontalAlignment.Center;
  if (nTxt.textFill) nTxt.textFill.color = new vec4(rgb.r, rgb.g, rgb.b, 1);
  nObj.getTransform().setLocalPosition(new vec3(0, 0.16 * scl, 0.04));

  // Distance text
  var dObj = scene.createSceneObject('DistTxt');
  dObj.setParent(root);
  var dTxt = dObj.createComponent('Component.Text');
  dTxt.text = campaign._distanceFt + ' FT';
  dTxt.size = 0.14 * scl;
  dTxt.horizontalAlignment = HorizontalAlignment.Center;
  if (dTxt.textFill) dTxt.textFill.color = new vec4(0.6, 0.6, 0.6, 1);
  dObj.getTransform().setLocalPosition(new vec3(0, -0.22 * scl, 0.04));

  // Pole
  var poleObj = scene.createSceneObject('Pole');
  poleObj.setParent(root);
  var poleMesh = poleObj.createComponent('Component.MeshVisual');
  poleMesh.mesh = ProceduralMeshes.createCylinderMesh(8);
  var poleMat = Material.create('Unlit');
  poleMat.mainPass.baseColor = new vec4(rgb.r*0.5, rgb.g*0.5, rgb.b*0.5, 0.6);
  poleMesh.setMaterial(0, poleMat);
  poleObj.getTransform().setLocalScale(new vec3(0.04, altM * 0.5, 0.04));
  poleObj.getTransform().setLocalPosition(new vec3(0, -altM * 0.5, 0));

  return { root: root, nameText: nTxt, distText: dTxt };
}

function _bar(parent, rgb, scl, yOffset) {
  var obj = scene.createSceneObject('Bar');
  obj.setParent(parent);
  var mv  = obj.createComponent('Component.MeshVisual');
  mv.mesh = ProceduralMeshes.createQuadMesh();
  var mat = Material.create('Unlit');
  mat.mainPass.baseColor = new vec4(rgb.r, rgb.g, rgb.b, 1);
  mv.setMaterial(0, mat);
  obj.getTransform().setLocalScale(new vec3(3.5 * scl, 0.08 * scl, 1));
  obj.getTransform().setLocalPosition(new vec3(0, yOffset * scl, 0.02));
}

// ── Billboard signs to camera ─────────────────────────────────────────────────
function billboardSigns(camTransform) {
  var camPos = camTransform.getWorldPosition();
  Object.values(signs).forEach(function(sign) {
    var sp = sign.root.getTransform().getWorldPosition();
    var dir = new vec3(camPos.x - sp.x, 0, camPos.z - sp.z);
    if (dir.length > 0.1) {
      sign.root.getTransform().setWorldRotation(quat.lookAt(dir.normalize(), vec3.up()));
    }
  });
}

// ── GPS math helpers ──────────────────────────────────────────────────────────
function haversine(a1, o1, a2, o2) {
  var R = 6371000, r = Math.PI/180;
  var da = (a2-a1)*r, doo = (o2-o1)*r;
  var s = Math.sin(da/2)*Math.sin(da/2) +
    Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(doo/2)*Math.sin(doo/2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function gpsToWorldOffset(uLat, uLon, tLat, tLon, headingDeg) {
  var R = 6371000, r = Math.PI/180;
  var dLat = (tLat-uLat)*r, dLon = (tLon-uLon)*r;
  var s = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(uLat*r)*Math.cos(tLat*r)*Math.sin(dLon/2)*Math.sin(dLon/2);
  var dist = R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  var brg  = (Math.atan2(
    Math.sin(dLon)*Math.cos(tLat*r),
    Math.cos(uLat*r)*Math.sin(tLat*r) - Math.sin(uLat*r)*Math.cos(tLat*r)*Math.cos(dLon)
  ) * 180/Math.PI + 360) % 360;
  var bR = brg * Math.PI/180;
  var east = dist * Math.sin(bR), north = dist * Math.cos(bR);
  var hR = headingDeg * Math.PI/180;
  var cH = Math.cos(-hR), sH = Math.sin(-hR);
  return { x: east*cH - north*sH, y: 0, z: -(east*sH + north*cH) };
}

function hexToRgb(hex) {
  hex = (hex || '#ff00ff').replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return {
    r: parseInt(hex.substring(0,2),16)/255,
    g: parseInt(hex.substring(2,4),16)/255,
    b: parseInt(hex.substring(4,6),16)/255
  };
}

// ── HUD helpers ───────────────────────────────────────────────────────────────
function setStatus(msg) {
  print('[COHUA] ' + msg);
  if (script.statusText) script.statusText.text = 'COHUA  |  ' + msg;
}
function setDebug(msg) {
  if (script.debugText) script.debugText.text = msg;
}
