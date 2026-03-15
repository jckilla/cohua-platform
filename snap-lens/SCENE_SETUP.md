# Lens Studio Scene Setup Guide

## Step 1 — Project Settings
1. Open Lens Studio 5.7+
2. Create a new empty project
3. Go to **Project Settings** (gear icon)
4. Check **Experimental API** (required for GPS + Internet together)
5. Under **Lens Hints**, add: `location`, `internet`

## Step 2 — Import Required Modules
In the **Asset Browser**, click **+** and add these services:
- `InternetModule` (search "Internet Module" in Asset Library)
- World tracking is built-in via Device Tracking component

## Step 3 — Scene Hierarchy
Build this hierarchy in the **Scene Hierarchy** panel:

```
Scene
├── [Camera] (Main Camera)
│   └── Device Tracking (World mode, Use Native AR: ON)
├── CohuaController [SceneObject]
│   └── Script Component: CohuaMain.js
│       @input internetModule → drag InternetModule asset here
├── SignsContainer [SceneObject]
│   (signs are spawned here at runtime)
└── UI_Canvas [SceneObject]
    ├── StatusText [ScreenText]
    └── DebugText [ScreenText]
```

## Step 4 — Device Tracking Setup
1. Select the **Camera** object
2. In the Inspector, click **Add Component** > **Device Tracking**
3. Set **Tracking Mode** to `World`
4. Enable **Use Native AR**: ON
5. This gives you 6DoF world tracking

## Step 5 — Script Wiring
1. Create a new SceneObject called `CohuaController`
2. Add a **Script Component** and assign `CohuaMain.js`
3. In the Inspector inputs for CohuaMain:
   - `internetModule` → drag the InternetModule asset
   - `signsContainer` → drag the SignsContainer object
   - `statusText` → drag the StatusText component
   - `debugText` → drag the DebugText component

## Step 6 — Push to Spectacles
1. Connect Spectacles via USB or Wi-Fi pairing
2. Click the **Spectacles** device button in top toolbar
3. Click **Push to Device**
4. On Spectacles, find the Lens in **Drafts** in Lens Explorer

## Notes
- Extended Permissions must also be enabled ON the Spectacles device:
  Settings > Lenses > Extended Permissions > Enable
- The Lens will appear in Drafts only, not publicly visible
- GPS + compass improves accuracy after walking ~20 seconds
