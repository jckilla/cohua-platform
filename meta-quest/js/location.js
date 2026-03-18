/**
 * location.js — COHUA GPS + Compass for WebXR / Browser
 *
 * Replaces Lens Studio's GeoLocation service with Web APIs:
 *   - navigator.geolocation.watchPosition() for GPS
 *   - DeviceOrientationEvent for compass heading
 *   - URL param override for Quest 3 (no GPS chip)
 *
 * Same circular low-pass filter on heading (alpha=0.15) as CohuaEngine.js.
 */

import Config from './config.js';
import HUD from './hud.js';

const Location = {
  lat:             null,
  lon:             null,
  heading:         0,
  headingReliable: false,
  ready:           false,

  _headingSeeded: false,
  _watchId:       null,

  init() {
    // Check for URL param override (Quest 3 fallback)
    const params = new URLSearchParams(window.location.search);
    if (params.has('lat') && params.has('lon')) {
      this.lat   = parseFloat(params.get('lat'));
      this.lon   = parseFloat(params.get('lon'));
      this.ready = true;
      HUD.status('Manual GPS: ' + this.lat.toFixed(4) + ', ' + this.lon.toFixed(4));
    }

    // Start GPS watch
    if ('geolocation' in navigator) {
      this._watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.lat   = pos.coords.latitude;
          this.lon   = pos.coords.longitude;
          this.ready = true;
          const acc  = Math.round(pos.coords.accuracy);
          HUD.status('GPS \u00b1' + acc + 'm');
        },
        (err) => {
          HUD.status('GPS error: ' + err.message);
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    } else if (!this.ready) {
      HUD.status('No GPS available — use ?lat=XX&lon=XX');
    }

    // Start compass
    this._initCompass();
  },

  _initCompass() {
    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => { if (state === 'granted') this._listenCompass(); })
        .catch(() => {});
    } else {
      this._listenCompass();
    }
  },

  _listenCompass() {
    window.addEventListener('deviceorientation', (e) => {
      let heading = null;

      // iOS: webkitCompassHeading (degrees from north, 0-360)
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading;
      }
      // Android / standard: alpha (degrees, but inverted)
      else if (e.alpha !== null && e.absolute) {
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null) {
        this._applyHeading(heading);
        this.headingReliable = true;
        HUD.debug('Heading: ' + Math.round(this.heading) + '\u00b0');
      }
    }, true);
  },

  /**
   * Update heading from XR camera orientation (used inside WebXR session).
   * Extract yaw from the XRViewerPose quaternion.
   */
  updateFromXRPose(pose) {
    if (!pose || !pose.transform) return;
    const q = pose.transform.orientation;
    // Extract yaw (rotation around Y axis) from quaternion
    const siny = 2.0 * (q.w * q.y + q.x * q.z);
    const cosy = 1.0 - 2.0 * (q.y * q.y + q.z * q.z);
    let yawDeg = Math.atan2(siny, cosy) * 180 / Math.PI;
    yawDeg = (360 - yawDeg) % 360; // Convert to compass bearing
    this._applyHeading(yawDeg);
    this.headingReliable = true;
  },

  // Circular low-pass filter — same as CohuaEngine.js
  _applyHeading(raw) {
    if (!this._headingSeeded) {
      this.heading = raw;
      this._headingSeeded = true;
      return;
    }
    let diff = raw - this.heading;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    this.heading = (this.heading + diff * Config.HEADING_ALPHA + 360) % 360;
  }
};

export default Location;
