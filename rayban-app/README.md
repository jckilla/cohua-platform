# COHUA — Meta Ray-Ban Display Companion App

React Native mobile app that serves as the companion for Meta Ray-Ban Display glasses. Detects nearby COHUA campaigns via GPS and sends neon sign data to the glasses display.

## Architecture

```
Phone (React Native App)
  ├── GPS tracking (locationService)
  ├── Supabase campaign fetching (campaignFetcher)
  ├── Proximity detection engine (proximityEngine)
  │     └── When user is within 50m of a campaign:
  │           └── Sends sign data to glasses via Meta SDK
  └── glasses-bridge.js (Meta Wearables SDK stub)
        └── showSign() / hideSign() / haptic / audio
              └── → Ray-Ban Display right-eye HUD
```

## How It Works

1. **Phone GPS** tracks user position continuously
2. **Supabase API** fetches live campaigns every 5s or when user moves 2m+
3. **Proximity engine** filters campaigns within 914m and detects when user enters 50m trigger zone
4. **Glasses bridge** sends sign data (name, color, distance, direction) to Ray-Ban Display
5. **User sees** business name + neon color + direction arrow on right-eye display

## Setup

```bash
# Install dependencies
npm install

# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

## Project Structure

```
src/
  App.js                        — Root component
  screens/
    HomeScreen.js               — Main dashboard (GPS status, campaigns, controls)
  services/
    config.js                   — Constants (Supabase, radius, thresholds)
    geo-math.js                 — Haversine, bearing, direction utilities
    location.js                 — GPS + compass service
    fetcher.js                  — Supabase campaign fetcher with proximity events
    proximity-engine.js         — Orchestrator: GPS → fetch → proximity → glasses
  meta-sdk/
    glasses-bridge.js           — Meta Wearables SDK stub (ready for real SDK)
```

## Meta SDK Integration

The `meta-sdk/glasses-bridge.js` file is a **stub** — all methods log to console instead of calling the real SDK. When you get Meta Wearables Device Access Toolkit access:

1. Install the Meta SDK package
2. Replace the stubbed methods in `glasses-bridge.js` with real SDK calls
3. The rest of the app (proximity engine, fetcher, location) stays unchanged

Key methods to replace:
- `connect()` — Initialize Bluetooth connection to glasses
- `showSign()` — Render neon sign card on right-eye display
- `hideSign()` — Dismiss sign when user leaves proximity
- `triggerHaptic()` — Subtle tap when entering a campaign zone
- `playSpatialAudio()` — Directional audio ping from sign direction

## Supabase Backend

Same backend as Snap Spectacles version — no changes needed.

- **URL**: `https://sgredejirqatcmstlzqi.supabase.co`
- **Table**: `campaigns` (status = 'live', latitude not null)
- **Detection radius**: 914m (3000 ft)
- **Glasses trigger**: 50m
- **Poll interval**: 5 seconds
