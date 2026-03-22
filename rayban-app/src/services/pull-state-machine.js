/**
 * pull-state-machine.js — COHUA Pull Model State Machine
 *
 * Implements the 3-state pull model for AR advertising:
 *
 *   IDLE ──(geofence + gaze)──▶ DISCOVERY_READY ──(opt-in)──▶ ACTIVE_AR
 *
 * 6 sequential gates (one per campaign):
 *
 *   1. Geofence entry   — user within campaign's trigger_distance_m
 *   2. Heading cone     — IMU heading within 15° of target bearing
 *   3. Sustained gaze   — heading stays in cone for 1.5s  (GazeDetector)
 *      ──────────────── DISCOVERY_READY reached ────────────────────────
 *   4. Audio cue        — TTS fires NOW (not on proximity enter)
 *   5. Opt-in gesture   — GESTURE_TAP or VOICE_COMMAND_SHOW
 *      ──────────────── ACTIVE_AR reached ──────────────────────────────
 *   6. ARCore VPS       — session starts after opt-in
 *
 * Per-campaign state is tracked independently so multiple campaigns in range
 * don't interfere with each other.
 *
 * Events emitted via on(event, callback):
 *   'state_change'  — { campaignId, from, to, campaign?, method? }
 *   'play_audio_cue'— { campaignId, campaign }   fired on DISCOVERY_READY entry
 *   'start_vps'     — { campaignId, campaign }   fired on ACTIVE_AR entry
 */

import { bearing as calcBearing } from './geo-math';
import { gazeDetector } from './gaze-detector';
import { Config } from './config';

// ─── Public state enum ────────────────────────────────────────────────────────

export const PullState = {
  IDLE:             'IDLE',
  DISCOVERY_READY:  'DISCOVERY_READY',
  ACTIVE_AR:        'ACTIVE_AR',
};

// ─── Opt-in method identifiers ────────────────────────────────────────────────

export const OptInMethod = {
  GESTURE_TAP:       'GESTURE_TAP',
  VOICE_COMMAND_SHOW:'VOICE_COMMAND_SHOW',
};

// ─── State machine ────────────────────────────────────────────────────────────

class PullStateMachine {
  constructor() {
    // { [campaignId]: PullState }
    this._states = {};

    // { [campaignId]: campaign }  — cached campaign objects for event payloads
    this._campaigns = {};

    // Registered event listeners: [{ event: string, callback: Function }]
    this._listeners = [];
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the current PullState for a campaign. Defaults to IDLE.
   */
  getState(campaignId) {
    return this._states[campaignId] || PullState.IDLE;
  }

  /**
   * Step 1: Geofence entered — user is within the campaign's trigger distance.
   * Computes bearing to target and begins gaze detection (steps 2 + 3).
   *
   * Safe to call multiple times — ignored if campaign is already past IDLE.
   *
   * @param {Object} campaign    — full campaign object from fetcher
   * @param {number} userLat
   * @param {number} userLon
   */
  onGeofenceEnter(campaign, userLat, userLon) {
    if (this._states[campaign.id] && this._states[campaign.id] !== PullState.IDLE) return;

    this._campaigns[campaign.id] = campaign;
    this._states[campaign.id]    = PullState.IDLE;

    // Compute fixed bearing from current user position to campaign
    const targetBearing = calcBearing(userLat, userLon, campaign.latitude, campaign.longitude);

    console.log(
      `[COHUA-SM] GEOFENCE ENTER: ${campaign.name}` +
      ` | bearing ${Math.round(targetBearing)}° | dist ${Math.round(campaign._distanceM)}m`
    );

    this._postTelemetry('geofence_enter', campaign.id, {
      distance_m:      campaign._distanceM,
      target_bearing:  targetBearing,
    });

    // Steps 2 + 3: Begin sustained heading-cone watch (GazeDetector)
    // Callback fires when user holds heading within 15° cone for 1.5s
    gazeDetector.startWatching(campaign.id, targetBearing, (id) => {
      this._onGazeConfirmed(id);
    });
  }

  /**
   * Geofence exited — reset this campaign back to IDLE and stop gaze watch.
   */
  onGeofenceExit(campaignId) {
    const prev = this._states[campaignId] || PullState.IDLE;

    gazeDetector.stopWatching(campaignId);
    this._states[campaignId] = PullState.IDLE;

    console.log(`[COHUA-SM] GEOFENCE EXIT: ${campaignId} (was ${prev})`);

    if (prev !== PullState.IDLE) {
      this._emit('state_change', {
        campaignId,
        from: prev,
        to:   PullState.IDLE,
      });
    }
  }

  /**
   * Step 5: User opted in via tap gesture or voice command.
   * Transitions DISCOVERY_READY → ACTIVE_AR and fires the VPS session.
   *
   * Ignored if campaign is not in DISCOVERY_READY state.
   *
   * @param {string} campaignId
   * @param {string} method — OptInMethod.*
   */
  onOptIn(campaignId, method = OptInMethod.GESTURE_TAP) {
    if (this._states[campaignId] !== PullState.DISCOVERY_READY) {
      console.log(
        `[COHUA-SM] Opt-in ignored for ${campaignId} — state is ` +
        `${this._states[campaignId] || PullState.IDLE}`
      );
      return;
    }

    this._states[campaignId] = PullState.ACTIVE_AR;

    console.log(`[COHUA-SM] OPT-IN: ${campaignId} via ${method} → ACTIVE_AR`);

    this._postTelemetry('pull', campaignId, { opt_in_method: method });

    this._emit('state_change', {
      campaignId,
      from:     PullState.DISCOVERY_READY,
      to:       PullState.ACTIVE_AR,
      campaign: this._campaigns[campaignId],
      method,
    });

    // Step 6: Trigger ARCore VPS session
    this._emit('start_vps', {
      campaignId,
      campaign: this._campaigns[campaignId],
      method,
    });

    // Telemetry: impression recorded when VPS fires (user is in AR)
    this._postTelemetry('impression', campaignId, { opt_in_method: method });
  }

  /**
   * Manually reset a campaign to IDLE (e.g., user dismisses AR or times out).
   */
  reset(campaignId) {
    const prev = this._states[campaignId];
    gazeDetector.stopWatching(campaignId);
    delete this._states[campaignId];
    delete this._campaigns[campaignId];

    if (prev && prev !== PullState.IDLE) {
      this._emit('state_change', {
        campaignId,
        from: prev,
        to:   PullState.IDLE,
      });
    }
  }

  /**
   * Reset all campaigns (called on engine stop).
   */
  resetAll() {
    gazeDetector.stopAll();
    this._states    = {};
    this._campaigns = {};
  }

  /**
   * Subscribe to state machine events.
   * Returns an unsubscribe function.
   *
   * Events:
   *   'state_change'   — any state transition
   *   'play_audio_cue' — DISCOVERY_READY reached; play TTS now
   *   'start_vps'      — ACTIVE_AR reached; start ARCore VPS
   *
   * @param {string}   event
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  on(event, callback) {
    this._listeners.push({ event, callback });
    return () => {
      this._listeners = this._listeners.filter(l => l.callback !== callback);
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /**
   * Steps 2 + 3 complete: GazeDetector confirmed sustained heading in cone.
   * Transition IDLE → DISCOVERY_READY and emit audio cue event (step 4).
   */
  _onGazeConfirmed(campaignId) {
    // Guard: could have exited geofence while gaze was counting
    if (this._states[campaignId] !== PullState.IDLE) return;

    this._states[campaignId] = PullState.DISCOVERY_READY;

    const campaign = this._campaigns[campaignId];
    console.log(`[COHUA-SM] GAZE CONFIRMED: ${campaign?.name || campaignId} → DISCOVERY_READY`);

    this._postTelemetry('gaze_trigger', campaignId, {});

    this._emit('state_change', {
      campaignId,
      from:     PullState.IDLE,
      to:       PullState.DISCOVERY_READY,
      campaign,
    });

    // Step 4: Audio cue fires HERE — only after gaze, not on proximity enter
    this._emit('play_audio_cue', { campaignId, campaign });
  }

  _emit(event, data) {
    for (const l of this._listeners) {
      if (l.event === event) {
        try {
          l.callback(data);
        } catch (e) {
          console.warn(`[COHUA-SM] Listener error on '${event}':`, e.message);
        }
      }
    }
  }

  /**
   * POST a telemetry event to the telemetry_events Supabase table.
   * Fire-and-forget — errors are logged but never rethrow.
   *
   * @param {string} eventType — 'geofence_enter' | 'gaze_trigger' | 'pull' | 'impression'
   * @param {string} campaignId
   * @param {Object} extra     — additional columns to include
   */
  async _postTelemetry(eventType, campaignId, extra = {}) {
    try {
      const response = await fetch(`${Config.SUPABASE_URL}/rest/v1/telemetry_events`, {
        method:  'POST',
        headers: {
          'apikey':        Config.SUPABASE_ANON,
          'Authorization': `Bearer ${Config.SUPABASE_ANON}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          event_type:   eventType,
          campaign_id:  campaignId,
          occurred_at:  new Date().toISOString(),
          platform:     'rayban',
          ...extra,
        }),
      });

      if (!response.ok) {
        console.warn(`[COHUA-SM] Telemetry HTTP ${response.status} for '${eventType}'`);
      }
    } catch (e) {
      console.warn(`[COHUA-SM] Telemetry error ('${eventType}'):`, e.message);
    }
  }
}

// Singleton
export const pullStateMachine = new PullStateMachine();
