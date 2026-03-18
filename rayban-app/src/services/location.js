/**
 * location.js — COHUA GPS + Compass Service
 *
 * Uses React Native Geolocation API for GPS and device magnetometer for compass.
 * Includes the same circular low-pass filter on heading as CohuaEngine.js.
 */

import Geolocation from '@react-native-community/geolocation';
import { Config } from './config';
import { haversine } from './geo-math';

class LocationService {
  constructor() {
    this.lat = null;
    this.lon = null;
    this.accuracy = null;
    this.heading = 0;
    this.headingReliable = false;
    this.ready = false;
    this.speed = 0;

    this._watchId = null;
    this._headingSeeded = false;
    this._listeners = [];
    this._lastLat = null;
    this._lastLon = null;
  }

  /**
   * Start watching GPS position.
   */
  start() {
    Geolocation.requestAuthorization('whenInUse');

    this._watchId = Geolocation.watchPosition(
      (position) => {
        this.lat      = position.coords.latitude;
        this.lon      = position.coords.longitude;
        this.accuracy  = position.coords.accuracy;
        this.speed     = position.coords.speed || 0;
        this.ready     = true;

        // Derive heading from movement if compass unavailable
        if (!this.headingReliable && this._lastLat !== null && this.speed > 0.5) {
          const moveBearing = this._bearingFromMovement();
          if (moveBearing !== null) {
            this._applyHeading(moveBearing);
          }
        }

        this._lastLat = this.lat;
        this._lastLon = this.lon;

        // Notify listeners
        this._notify();
      },
      (error) => {
        console.warn('[COHUA] GPS error:', error.message);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 1,        // minimum meters between updates
        interval: Config.GPS_INTERVAL,
        fastestInterval: 500,
      }
    );
  }

  /**
   * Stop watching GPS.
   */
  stop() {
    if (this._watchId !== null) {
      Geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  /**
   * Update compass heading from device magnetometer.
   * Call this from the magnetometer/orientation event handler.
   */
  updateHeading(rawHeading) {
    this._applyHeading(rawHeading);
    this.headingReliable = true;
  }

  /**
   * Check if user has moved enough to warrant a re-fetch.
   */
  hasMovedEnough(fromLat, fromLon) {
    if (!this.ready || fromLat === null) return false;
    return haversine(fromLat, fromLon, this.lat, this.lon) >= Config.MIN_MOVE_M;
  }

  /**
   * Subscribe to location updates.
   */
  onUpdate(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Circular low-pass filter on heading — same as CohuaEngine.js.
   */
  _applyHeading(raw) {
    if (!this._headingSeeded) {
      this.heading = raw;
      this._headingSeeded = true;
      return;
    }
    let diff = raw - this.heading;
    if (diff > 180)  diff -= 360;
    if (diff < -180) diff += 360;
    this.heading = (this.heading + diff * Config.HEADING_ALPHA + 360) % 360;
  }

  /**
   * Derive heading from GPS movement (fallback when no compass).
   */
  _bearingFromMovement() {
    if (this._lastLat === null) return null;
    const d = haversine(this._lastLat, this._lastLon, this.lat, this.lon);
    if (d < 1.0) return null; // too close, bearing unreliable

    const DEG2RAD = Math.PI / 180;
    const dLon = (this.lon - this._lastLon) * DEG2RAD;
    const y = Math.sin(dLon) * Math.cos(this.lat * DEG2RAD);
    const x = Math.cos(this._lastLat * DEG2RAD) * Math.sin(this.lat * DEG2RAD) -
              Math.sin(this._lastLat * DEG2RAD) * Math.cos(this.lat * DEG2RAD) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  _notify() {
    for (const cb of this._listeners) {
      cb(this);
    }
  }
}

// Singleton
export const locationService = new LocationService();
