/**
 * renderer.js — COHUA Three.js NeonSign Renderer
 *
 * Translates Lens Studio scene graph to Three.js:
 *   SceneObject     → THREE.Group
 *   QuadMesh        → THREE.PlaneGeometry
 *   CylinderMesh    → THREE.CylinderGeometry
 *   Material(Unlit) → THREE.MeshBasicMaterial
 *   Component.Text  → troika-three-text Text
 *
 * Each sign = Group{ panel, topBar, bottomBar, nameText, distText, pole }
 */

import * as THREE from 'three';
import { Text }   from 'troika-three-text';
import Config     from './config.js';
import GeoMath    from './geo-math.js';
import Location   from './location.js';

const Renderer = {
  _signs:     {},    // { campaignId: { group, nameText, distText } }
  _container: null,  // THREE.Group parent for all signs

  init(scene) {
    this._container = new THREE.Group();
    this._container.name = 'SignsContainer';
    scene.add(this._container);
  },

  /**
   * Synchronize visible signs with campaign array.
   * Creates new signs, updates positions/labels, removes stale ones.
   */
  sync(campaigns) {
    if (!Location.ready) return;

    const seen = {};

    for (const c of campaigns) {
      seen[c.id] = true;

      // Parse deploy_payload (typeof-safe, matches bug fix from CohuaEngine.js)
      let payload = {};
      try {
        payload = (typeof c.deploy_payload === 'string')
          ? JSON.parse(c.deploy_payload)
          : (c.deploy_payload || {});
      } catch (e) { /* noop */ }

      const neonHex = payload.neon_color || Config.DEFAULT_NEON;
      const altM    = parseFloat(c.altitude_m)  || Config.DEFAULT_ALT_M;
      const scl     = parseFloat(c.model_scale) || Config.DEFAULT_SCALE;
      const offsetM = parseFloat(payload.offset_m) || 0.0;
      const rgb     = GeoMath.hexToRgb(neonHex);

      // GPS → world-space offset
      const off = GeoMath.gpsToWorld(
        Location.lat, Location.lon,
        c.latitude, c.longitude,
        Location.heading
      );

      // Create sign if first time
      if (!this._signs[c.id]) {
        this._signs[c.id] = this._createSign(c, rgb, altM, scl);
      }

      // Update position
      const group = this._signs[c.id].group;
      group.position.set(off.x + offsetM, altM, off.z);

      // Update labels
      const label   = this._trimLabel(c.name);
      const typeStr = this._assetLabel(c.asset_type);
      this._signs[c.id].nameText.text = label;
      this._signs[c.id].distText.text = typeStr + '  \u00b7  ' + c._distanceFt + ' FT';
    }

    // Destroy out-of-range signs
    for (const id of Object.keys(this._signs)) {
      if (!seen[id]) {
        this._container.remove(this._signs[id].group);
        this._disposeGroup(this._signs[id].group);
        delete this._signs[id];
      }
    }
  },

  /**
   * Billboard all signs toward camera (Y-axis constrained).
   */
  billboard(camera) {
    for (const id of Object.keys(this._signs)) {
      const group = this._signs[id].group;
      // LookAt camera but lock Y rotation only
      group.lookAt(camera.position.x, group.position.y, camera.position.z);
    }
  },

  hasActiveSigns() {
    return Object.keys(this._signs).length > 0;
  },

  // ── Internal: build NeonSign Three.js group ────────────────────────────────────

  _createSign(campaign, rgb, altM, scl) {
    const label    = this._trimLabel(campaign.name);
    const neonColor = new THREE.Color(rgb.r, rgb.g, rgb.b);
    const neonHex   = '#' + neonColor.getHexString();

    const group = new THREE.Group();
    group.name  = 'Sign_' + campaign.id;

    // 1. Dark translucent panel
    const panelGeo = new THREE.PlaneGeometry(
      Config.PANEL_WIDTH * scl,
      Config.PANEL_HEIGHT * scl
    );
    const panelMat = new THREE.MeshBasicMaterial({
      color:       0x050505,
      transparent: true,
      opacity:     Config.PANEL_OPACITY,
      side:        THREE.DoubleSide
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    group.add(panel);

    // 2. Top neon bar
    this._createBar(group, neonColor, scl, +Config.BAR_Y_OFFSET);

    // 3. Bottom neon bar
    this._createBar(group, neonColor, scl, -Config.BAR_Y_OFFSET);

    // 4. Campaign name text (troika-three-text)
    const nameText = new Text();
    nameText.text           = label;
    nameText.fontSize       = Config.NAME_SIZE * scl;
    nameText.color          = neonHex;
    nameText.anchorX        = 'center';
    nameText.anchorY        = 'middle';
    nameText.position.set(0, 0.16 * scl, 0.04);
    nameText.font           = undefined; // use default
    nameText.sync();
    group.add(nameText);

    // 5. Distance / type text
    const distText = new Text();
    distText.text           = (campaign._distanceFt || 0) + ' FT';
    distText.fontSize       = Config.DIST_SIZE * scl;
    distText.color          = '#999999';
    distText.anchorX        = 'center';
    distText.anchorY        = 'middle';
    distText.position.set(0, -0.22 * scl, 0.04);
    distText.sync();
    group.add(distText);

    // 6. Vertical pole from sign down to ground
    const poleHeight = altM;
    const poleGeo    = new THREE.CylinderGeometry(
      Config.POLE_RADIUS, Config.POLE_RADIUS, poleHeight, Config.POLE_SEGMENTS
    );
    const poleMat = new THREE.MeshBasicMaterial({
      color:       new THREE.Color(rgb.r * 0.5, rgb.g * 0.5, rgb.b * 0.5),
      transparent: true,
      opacity:     Config.POLE_OPACITY
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, -poleHeight / 2, 0);
    group.add(pole);

    this._container.add(group);

    return { group, nameText, distText };
  },

  _createBar(parent, color, scl, yOffset) {
    const geo = new THREE.PlaneGeometry(
      Config.PANEL_WIDTH * scl,
      Config.BAR_THICKNESS * scl
    );
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      side:  THREE.DoubleSide
    });
    const bar = new THREE.Mesh(geo, mat);
    bar.position.set(0, yOffset * scl, 0.02);
    parent.add(bar);
  },

  _trimLabel(name) {
    let label = (name || '').replace('[DEMO] ', '').trim();
    if (label.length > Config.MAX_LABEL_LEN) {
      label = label.substring(0, Config.MAX_LABEL_LEN) + '\u2026';
    }
    return label;
  },

  _assetLabel(type) {
    const map = {
      neon_logo:  'NEON LOGO',
      neon_menu:  'NEON MENU',
      neon_image: 'NEON IMAGE',
      custom_3d:  '3D AD'
    };
    return map[type] || 'AR AD';
  },

  _disposeGroup(group) {
    group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child.dispose) child.dispose(); // troika text cleanup
    });
  }
};

export default Renderer;
