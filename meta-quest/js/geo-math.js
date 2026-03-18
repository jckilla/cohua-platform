/**
 * geo-math.js — COHUA Geo Math Utilities
 *
 * Pure math — no platform dependencies. Direct port from CohuaEngine.js Section 6.
 * Works identically in Lens Studio, browser, and WebXR.
 */

const GeoMath = {
  DEG2RAD: Math.PI / 180,
  EARTH_R: 6371000,

  /**
   * Haversine distance in meters between two lat/lon pairs.
   */
  haversine(lat1, lon1, lat2, lon2) {
    const r    = this.DEG2RAD;
    const dLat = (lat2 - lat1) * r;
    const dLon = (lon2 - lon1) * r;
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(lat1 * r) * Math.cos(lat2 * r) *
                 Math.sin(dLon / 2) ** 2;
    return this.EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /**
   * Initial bearing (forward azimuth) in degrees from point 1 to point 2.
   */
  bearing(lat1, lon1, lat2, lon2) {
    const r    = this.DEG2RAD;
    const dLon = (lon2 - lon1) * r;
    const y    = Math.sin(dLon) * Math.cos(lat2 * r);
    const x    = Math.cos(lat1 * r) * Math.sin(lat2 * r) -
                 Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  },

  /**
   * Convert a GPS target to world-space offset relative to user position + heading.
   * Returns { x, y, z } — same coordinate convention as Three.js (Y-up, -Z forward).
   */
  gpsToWorld(userLat, userLon, targetLat, targetLon, headingDeg) {
    const dist   = this.haversine(userLat, userLon, targetLat, targetLon);
    const brg    = this.bearing(userLat, userLon, targetLat, targetLon);
    const brgRad = brg * this.DEG2RAD;
    const east   = dist * Math.sin(brgRad);
    const north  = dist * Math.cos(brgRad);

    // Rotate by negative heading so GPS north aligns with camera forward
    const hR = headingDeg * this.DEG2RAD;
    const cH = Math.cos(-hR);
    const sH = Math.sin(-hR);

    return {
      x:  east * cH - north * sH,
      y:  0,
      z: -(east * sH + north * cH)
    };
  },

  /**
   * Parse hex color (#RRGGBB or #RGB) to { r, g, b } in 0–1 range.
   */
  hexToRgb(hex) {
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

export default GeoMath;
