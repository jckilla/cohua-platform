/**
 * gaze-detector.js — COHUA IMU-Based Gaze Detection (v1)
 *
 * Detects whether the user is "gazing at" a target by checking that their
 * compass heading stays within a 15-degree cone of the target bearing for a
 * sustained 1.5 seconds.
 *
 * This is a heading-stability proxy for eye tracking — v1 uses the phone/glasses
 * IMU (magnetometer + accelerometer) rather than a camera-based gaze model.
 * The assumption is that the user's head direction reliably predicts gaze direction
 * when the target is a building or large signage at street level.
 *
 * Pull model role:
 *   Step 2: IMU heading within cone — the gaze detector starts counting when in-cone.
 *   Step 3: Sustained 1.5s — fires onGazeConfirmed callback when threshold is met.
 *
 * Usage:
 *   gazeDetector.startWatching(campaignId, targetBearing, onGazeConfirmed);
 *   gazeDetector.stopWatching(campaignId);  // on geofence exit
 */

import { headingWithinCone } from './geo-math';
import { locationService } from './location';

const GAZE_DURATION_MS = 1500;  // sustained heading required (ms)
const GAZE_CONE_DEG    = 15;    // half-angle of detection cone (degrees)
const TICK_INTERVAL_MS = 100;   // poll rate for heading check (ms)

class GazeDetector {
  constructor() {
    // { [campaignId]: { bearing, gazeStartTime, onGazeConfirmed, fired } }
    this._targets = {};
    this._tickInterval = null;
  }

  /**
   * Begin watching for a sustained gaze toward targetBearing.
   * Fires onGazeConfirmed(campaignId) once when 1.5s in-cone is reached.
   *
   * Calling startWatching again for the same campaignId resets the watch
   * (e.g., if the bearing changed due to movement).
   *
   * @param {string}   campaignId      — campaign being watched
   * @param {number}   targetBearing   — compass bearing from user to campaign (0–360)
   * @param {function} onGazeConfirmed — called with campaignId when gaze confirmed
   */
  startWatching(campaignId, targetBearing, onGazeConfirmed) {
    this._targets[campaignId] = {
      bearing:          targetBearing,
      gazeStartTime:    null,   // null = currently outside cone
      onGazeConfirmed,
      fired:            false,  // prevent double-firing
    };

    if (!this._tickInterval) {
      this._tickInterval = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    }

    console.log(
      `[COHUA-GAZE] Watching ${campaignId} — bearing ${Math.round(targetBearing)}° ` +
      `(±${GAZE_CONE_DEG}° cone, ${GAZE_DURATION_MS}ms required)`
    );
  }

  /**
   * Stop watching a campaign (e.g., on geofence exit or state reset).
   */
  stopWatching(campaignId) {
    delete this._targets[campaignId];

    if (Object.keys(this._targets).length === 0) {
      this._clearTick();
    }
  }

  /**
   * Stop watching all campaigns and clear the poll interval.
   */
  stopAll() {
    this._targets = {};
    this._clearTick();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _tick() {
    const userHeading = locationService.heading;
    if (userHeading == null) return;  // compass not yet ready

    const now = Date.now();

    for (const [id, target] of Object.entries(this._targets)) {
      if (target.fired) continue;

      const inCone = headingWithinCone(userHeading, target.bearing, GAZE_CONE_DEG);

      if (inCone) {
        if (target.gazeStartTime === null) {
          // Just entered cone — start the clock
          target.gazeStartTime = now;
          console.log(`[COHUA-GAZE] ${id} — entered cone (heading ${Math.round(userHeading)}°)`);
        } else if ((now - target.gazeStartTime) >= GAZE_DURATION_MS) {
          // Sustained gaze confirmed
          target.fired = true;
          const dwellMs = now - target.gazeStartTime;
          console.log(`[COHUA-GAZE] ${id} — GAZE CONFIRMED (${dwellMs}ms in cone)`);
          target.onGazeConfirmed(id);
        }
      } else {
        if (target.gazeStartTime !== null) {
          // Looked away — reset the clock
          const dwellMs = now - target.gazeStartTime;
          console.log(
            `[COHUA-GAZE] ${id} — left cone after ${dwellMs}ms ` +
            `(needed ${GAZE_DURATION_MS}ms) — resetting`
          );
          target.gazeStartTime = null;
        }
      }
    }
  }

  _clearTick() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }
}

// Singleton
export const gazeDetector = new GazeDetector();
