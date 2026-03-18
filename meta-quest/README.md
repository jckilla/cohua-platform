# COHUA — Meta Quest 3 WebXR Port

AR neon sign engine for Meta Quest 3 passthrough, built with Three.js + WebXR.

## Quick Start

### Desktop Testing (no headset needed)

```bash
# Serve with HTTPS (WebXR requires secure context)
npx serve --ssl .

# Open in browser with test coordinates
https://localhost:3000/?lat=33.9422&lon=-118.1361
```

The app falls back to a 3D orbit view when WebXR is unavailable.

### Meta Quest 3

1. Enable Developer Mode on your Quest 3
2. Open **Horizon Browser**
3. Navigate to `https://YOUR_HOST/?lat=33.9422&lon=-118.1361`
4. Tap **ENTER AR** to start passthrough mode
5. Neon signs appear at GPS-anchored positions around you

### GPS Note

Quest 3 has no built-in GPS. Use URL parameters to set position:

```
?lat=33.9422&lon=-118.1361    # Near Downey Post Office campaign
?lat=33.902004&lon=-118.05839 # Near Aduna Capital campaign
```

If the browser supports geolocation (Wi-Fi based), it will use that automatically.

## Architecture

```
js/
  config.js     — Constants (Supabase creds, radius, sign geometry)
  geo-math.js   — Haversine, bearing, GPS-to-world transform
  location.js   — GPS + compass via Web APIs
  fetcher.js    — Supabase campaign fetcher
  renderer.js   — Three.js NeonSign builder
  hud.js        — DOM overlay status text
  app.js        — WebXR session + render loop
```

All geo math and fetch logic is identical to the Snap Spectacles version (CohuaEngine.js). Only the rendering layer (Three.js vs Lens Studio) and bootstrap (WebXR vs Lens events) differ.

## Supabase Backend

Same backend as the Spectacles version — no changes needed.

- **URL**: `https://sgredejirqatcmstlzqi.supabase.co`
- **Table**: `campaigns` (status = 'live', latitude not null)
- **Radius**: 914m (3000 ft)
- **Poll interval**: 5 seconds

## Dependencies (loaded via CDN)

- [Three.js](https://threejs.org/) v0.170.0
- [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text) v0.52.4
