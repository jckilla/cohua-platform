/**
 * hud.js — COHUA DOM Overlay HUD
 *
 * Renders status and debug text as HTML overlays (replaces Lens Studio Component.Text).
 * Works with WebXR dom-overlay feature.
 */

const HUD = {
  _statusEl: null,
  _debugEl:  null,

  init() {
    this._statusEl = document.getElementById('hud-status');
    this._debugEl  = document.getElementById('hud-debug');
  },

  status(msg) {
    console.log('[COHUA] ' + msg);
    if (this._statusEl) this._statusEl.textContent = 'COHUA  |  ' + msg;
  },

  debug(msg) {
    if (this._debugEl) this._debugEl.textContent = msg;
  }
};

export default HUD;
