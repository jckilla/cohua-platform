/**
 * GeoUtils.js
 * Geographic math utilities for COHUA AR Lens
 * Haversine distance, bearing calculation, GPS -> world-space offset
 */

// Earth radius in meters
const EARTH_RADIUS_M = 6371000;

/**
 * Haversine distance between two GPS points (meters)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bearing from point 1 to point 2 (degrees, 0=North clockwise)
 */
function bearing(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const y = Math.sin(dLon) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) -
    Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Convert GPS offset to local 3D world-space position (meters).
 * Returns {x, z} in Lens Studio's coordinate system:
 *   +X = East
 *   -X = West
 *   +Z = South  (Lens Studio Z is flipped from OpenGL)
 *   -Z = North
 *
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @param {number} targetLat - Target latitude
 * @param {number} targetLon - Target longitude
 * @param {number} headingDeg - User's compass heading (0=North, 90=East)
 * @returns {{x: number, y: number, z: number}} World offset in meters
 */
function gpsToWorldOffset(userLat, userLon, targetLat, targetLon, headingDeg) {
  // Distance and bearing to target
  const dist = haversineDistance(userLat, userLon, targetLat, targetLon);
  const brg = bearing(userLat, userLon, targetLat, targetLon);

  // Convert bearing to radians (bearing is clockwise from north)
  const brgRad = brg * Math.PI / 180;

  // World space offset (East/North in meters, before heading rotation)
  const eastOffset = dist * Math.sin(brgRad);
  const northOffset = dist * Math.cos(brgRad);

  // In Lens Studio world space:
  // User faces -Z direction when heading = 0 (North)
  // X is East, Z is flipped (South = +Z)
  // We rotate the offset by the user's heading to get local coords
  const headingRad = headingDeg * Math.PI / 180;
  const cosH = Math.cos(-headingRad);
  const sinH = Math.sin(-headingRad);

  // Local X and Z (relative to user's facing direction)
  const localX = eastOffset * cosH - northOffset * sinH;
  const localZ = -(eastOffset * sinH + northOffset * cosH);

  return { x: localX, y: 0, z: localZ };
}

/**
 * Convert degrees to feet (approx display)
 */
function metersToFeet(m) {
  return Math.round(m * 3.28084);
}

/**
 * Parse neon color from deploy_payload JSON string
 */
function getNeonColor(deployPayloadStr) {
  try {
    var payload = JSON.parse(deployPayloadStr || '{}');
    return payload.neon_color || '#ff00ff';
  } catch (e) {
    return '#ff00ff';
  }
}

/**
 * Parse hex color string to {r, g, b} (0-1 range)
 */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  return { r: r, g: g, b: b };
}

// Export for use by other scripts
if (typeof module !== 'undefined') {
  module.exports = { haversineDistance, bearing, gpsToWorldOffset, metersToFeet, getNeonColor, hexToRgb };
}
