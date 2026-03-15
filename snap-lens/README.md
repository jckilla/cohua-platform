# COHUA AR Snap Lens

This is the Snap Lens Studio project for COHUA's AR advertisement platform.
It renders neon signs anchored to real-world GPS coordinates on Snap Spectacles.

## Requirements
- Lens Studio 5.7.0 or later
- Spectacles OS v5.60.000 or later
- Extended Permissions enabled on Spectacles (for GPS + Internet combined)

## Setup
1. Open Lens Studio 5.7+
2. File > New Project
3. Copy the scripts from `scripts/` into your project's Assets panel
4. Follow SCENE_SETUP.md to configure the scene hierarchy

## Project Structure
```
snap-lens/
  scripts/
    CampaignFetcher.js     # Fetches live campaigns from Supabase
    NeonSignRenderer.js    # Creates/updates 3D neon signs
    GeoUtils.js            # Haversine, bearing, GPS->world-coords
    CohuaMain.js           # Main controller, wires everything together
  SCENE_SETUP.md           # Step-by-step Lens Studio scene configuration
  PERMISSIONS.md           # Extended permissions setup guide
```

## How It Works
1. Lens starts, requests GPS + heading from Spectacles
2. Fetches all `status: live` campaigns from Supabase within 914m (3000ft)
3. For each campaign, calculates 3D world position relative to user
4. Creates a neon sign SceneObject at the correct position/height/rotation
5. Signs update every 5 seconds as user moves
6. Each sign reads `deploy_payload` for neon color, height, heading offset

## Supabase Integration
The lens calls:
```
GET https://sgredejirqatcmstlzqi.supabase.co/rest/v1/campaigns
  ?status=eq.live
  &latitude=not.is.null
  &select=id,name,asset_type,latitude,longitude,altitude_m,model_scale,deploy_payload,location_label
```
With headers: `apikey` and `Authorization: Bearer <anon_key>`
