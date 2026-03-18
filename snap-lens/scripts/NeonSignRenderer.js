/**
 * NeonSignRenderer.js
 * Creates and manages 3D neon sign SceneObjects in Lens Studio.
 *
 * Each sign consists of:
 *  - A thin flat plane (sign backing)
 *  - Two emissive bar meshes (top/bottom neon bars)
 *  - A ScreenText or 3D Text showing business name + distance
 *  - A thin cylinder (pole) from ground to sign height
 *  - Glow rendered via emissive material color
 *
 * All dimensions are in Lens Studio units (1 unit ≈ 1 meter at normal scale)
 */

/**
 * @param {SceneObject} container - Parent SceneObject for all signs
 */
function NeonSignRenderer(container) {
  this.container = container;
  this.signs     = {}; // keyed by campaign id
}

/**
 * Create or update all signs from the campaign list.
 * @param {Array}  campaigns - from CampaignFetcher
 * @param {object} userPos   - {lat, lon, headingDeg}
 */
NeonSignRenderer.prototype.updateSigns = function(campaigns, userPos) {
  var self = this;
  var seen = {};

  campaigns.forEach(function(c) {
    seen[c.id] = true;

    // Parse placement from deploy_payload
    var payload = {};
    try {
      payload = (typeof c.deploy_payload === 'string')
        ? JSON.parse(c.deploy_payload)
        : (c.deploy_payload || {});
    } catch(e) {}

    var neonHex    = payload.neon_color   || '#ff00ff';
    var altitudeM  = parseFloat(c.altitude_m)   || 7.0;  // height above ground
    var scale      = parseFloat(c.model_scale)  || 1.0;
    var headingOff = parseFloat(payload.heading)|| 0.0;  // sign facing
    var offsetM    = parseFloat(payload.offset_m)|| 0.0; // horiz offset
    var neonRgb    = hexToRgb(neonHex);

    // World offset from user to this campaign
    var worldOff = gpsToWorldOffset(
      userPos.lat, userPos.lon,
      c.latitude,  c.longitude,
      userPos.headingDeg
    );

    if (!self.signs[c.id]) {
      // ── Create new sign ──────────────────────────────────────────────────
      self.signs[c.id] = self._createSign(c, neonRgb, altitudeM, scale);
    }

    // ── Update position ──────────────────────────────────────────────────────
    var signObj = self.signs[c.id].root;
    var pos = signObj.getTransform().getLocalPosition();
    pos.x = worldOff.x + offsetM;
    pos.y = altitudeM;
    pos.z = worldOff.z;
    signObj.getTransform().setLocalPosition(pos);

    // Update distance label
    if (self.signs[c.id].distText) {
      var label = c.name.replace('[DEMO] ', '').trim();
      if (label.length > 20) label = label.substring(0, 20) + '\u2026';
      var typeStr = {
        neon_logo: 'NEON LOGO', neon_menu: 'NEON MENU',
        neon_image: 'NEON IMAGE', custom_3d: '3D AD'
      }[c.asset_type] || 'AR AD';
      self.signs[c.id].nameText.text = label;
      self.signs[c.id].distText.text = typeStr + '  \u00b7  ' + c._distanceFt + ' FT';
    }
  });

  // Remove signs no longer in range
  Object.keys(self.signs).forEach(function(id) {
    if (!seen[id]) {
      self.signs[id].root.destroy();
      delete self.signs[id];
    }
  });
};

/**
 * Create a new neon sign SceneObject hierarchy.
 * Returns {root, nameText, distText}
 */
NeonSignRenderer.prototype._createSign = function(campaign, neonRgb, altitudeM, scale) {
  var self = this;
  var name = campaign.name.replace('[DEMO] ', '').trim();

  // Root SceneObject (position updated each frame)
  var root = scene.createSceneObject('Sign_' + campaign.id);
  root.setParent(self.container);

  // ── Sign backing plane ───────────────────────────────────────────────────
  var panel = scene.createSceneObject('Panel');
  panel.setParent(root);
  var meshVis = panel.createComponent('Component.MeshVisual');
  meshVis.mesh = ProceduralMeshes.createQuadMesh();

  // Emissive material for the panel (dark background)
  var panelMat = Material.create('Standard1Side');
  panelMat.mainPass.baseColor = new vec4(0.02, 0.02, 0.02, 0.9);
  panelMat.mainPass.emissive = new vec3(0, 0, 0);
  meshVis.setMaterial(0, panelMat);

  var pt = panel.getTransform();
  pt.setLocalScale(new vec3(3.5 * scale, 1.4 * scale, 1.0));
  pt.setLocalPosition(new vec3(0, 0, 0.01));

  // ── Top neon bar ─────────────────────────────────────────────────────────
  var topBar = scene.createSceneObject('TopBar');
  topBar.setParent(root);
  var topMesh = topBar.createComponent('Component.MeshVisual');
  topMesh.mesh = ProceduralMeshes.createQuadMesh();
  var barMat = Material.create('Unlit');
  barMat.mainPass.baseColor = new vec4(neonRgb.r, neonRgb.g, neonRgb.b, 1.0);
  topMesh.setMaterial(0, barMat);
  var tbt = topBar.getTransform();
  tbt.setLocalScale(new vec3(3.5 * scale, 0.08 * scale, 1.0));
  tbt.setLocalPosition(new vec3(0, 0.76 * scale, 0.02));

  // ── Bottom neon bar ───────────────────────────────────────────────────────
  var botBar = scene.createSceneObject('BotBar');
  botBar.setParent(root);
  var botMesh = botBar.createComponent('Component.MeshVisual');
  botMesh.mesh = ProceduralMeshes.createQuadMesh();
  var botMat = Material.create('Unlit');
  botMat.mainPass.baseColor = new vec4(neonRgb.r, neonRgb.g, neonRgb.b, 1.0);
  botMesh.setMaterial(0, botMat);
  var bbt = botBar.getTransform();
  bbt.setLocalScale(new vec3(3.5 * scale, 0.08 * scale, 1.0));
  bbt.setLocalPosition(new vec3(0, -0.76 * scale, 0.02));

  // ── Business name text ────────────────────────────────────────────────────
  var nameObj = scene.createSceneObject('Name');
  nameObj.setParent(root);
  var nameTxt = nameObj.createComponent('Component.Text');
  nameTxt.text = name.length > 20 ? name.substring(0, 20) + '\u2026' : name;
  nameTxt.size = 0.28 * scale;
  nameTxt.horizontalAlignment = HorizontalAlignment.Center;
  nameTxt.verticalAlignment   = VerticalAlignment.Center;

  // Text color matching neon
  var textStyle = nameTxt.textFill;
  if (textStyle && textStyle.color) {
    textStyle.color = new vec4(neonRgb.r, neonRgb.g, neonRgb.b, 1.0);
  }
  nameObj.getTransform().setLocalPosition(new vec3(0, 0.18 * scale, 0.03));

  // ── Distance / type text ──────────────────────────────────────────────────
  var distObj = scene.createSceneObject('Dist');
  distObj.setParent(root);
  var distTxt = distObj.createComponent('Component.Text');
  distTxt.text = campaign._distanceFt + ' FT';
  distTxt.size = 0.16 * scale;
  distTxt.horizontalAlignment = HorizontalAlignment.Center;
  distTxt.verticalAlignment   = VerticalAlignment.Center;
  var distStyle = distTxt.textFill;
  if (distStyle && distStyle.color) {
    distStyle.color = new vec4(0.7, 0.7, 0.7, 1.0);
  }
  distObj.getTransform().setLocalPosition(new vec3(0, -0.22 * scale, 0.03));

  // ── Vertical pole ─────────────────────────────────────────────────────────
  var pole = scene.createSceneObject('Pole');
  pole.setParent(root);
  var poleMesh = pole.createComponent('Component.MeshVisual');
  poleMesh.mesh = ProceduralMeshes.createCylinderMesh(8);
  var poleMat = Material.create('Unlit');
  poleMat.mainPass.baseColor = new vec4(neonRgb.r * 0.6, neonRgb.g * 0.6, neonRgb.b * 0.6, 0.6);
  poleMesh.setMaterial(0, poleMat);
  var polT = pole.getTransform();
  // Pole goes from ground (y=0) to sign center (y=altitudeM)
  polT.setLocalScale(new vec3(0.04, altitudeM / 2, 0.04));
  polT.setLocalPosition(new vec3(0, -altitudeM / 2, 0));

  // ── Billboard: always face user ───────────────────────────────────────────
  // This is handled by updating sign rotation in CohuaMain each frame

  return {
    root:     root,
    nameText: nameTxt,
    distText: distTxt,
    color:    neonRgb
  };
};

/**
 * Make all signs billboard-face the camera each frame.
 * Call from UpdateEvent.
 * @param {Transform} cameraTransform
 */
NeonSignRenderer.prototype.billboardToCamera = function(cameraTransform) {
  var camPos = cameraTransform.getWorldPosition();
  Object.values(this.signs).forEach(function(sign) {
    var signPos = sign.root.getTransform().getWorldPosition();
    // Look at camera position but only rotate Y axis (stay vertical)
    var dir = new vec3(camPos.x - signPos.x, 0, camPos.z - signPos.z);
    if (dir.length > 0.01) {
      sign.root.getTransform().setWorldRotation(
        quat.lookAt(dir.normalize(), vec3.up())
      );
    }
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = (hex || '#ff00ff').replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255
  };
}

function gpsToWorldOffset(userLat, userLon, targetLat, targetLon, headingDeg) {
  var R = 6371000, r = Math.PI / 180;
  var dLat = (targetLat - userLat) * r;
  var dLon = (targetLon - userLon) * r;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(userLat*r)*Math.cos(targetLat*r)*Math.sin(dLon/2)*Math.sin(dLon/2);
  var dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var brg  = (Math.atan2(
    Math.sin(dLon)*Math.cos(targetLat*r),
    Math.cos(userLat*r)*Math.sin(targetLat*r) - Math.sin(userLat*r)*Math.cos(targetLat*r)*Math.cos(dLon)
  ) * 180 / Math.PI + 360) % 360;
  var brgR = brg * Math.PI / 180;
  var east = dist * Math.sin(brgR);
  var north = dist * Math.cos(brgR);
  var hR = headingDeg * Math.PI / 180;
  var cosH = Math.cos(-hR), sinH = Math.sin(-hR);
  return {
    x: east * cosH - north * sinH,
    y: 0,
    z: -(east * sinH + north * cosH)
  };
}
