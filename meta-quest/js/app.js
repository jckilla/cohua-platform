/**
 * app.js — COHUA WebXR Bootstrap
 *
 * Wires together Location, Fetcher, Renderer, and HUD.
 * Supports two modes:
 *   1. WebXR immersive-ar (Quest 3 passthrough)
 *   2. Fallback 3D scene (desktop / non-XR browsers)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Config   from './config.js';
import GeoMath  from './geo-math.js';
import Location from './location.js';
import Fetcher  from './fetcher.js';
import Renderer from './renderer.js';
import HUD      from './hud.js';

let scene, camera, renderer, controls;
let xrSession    = null;
let xrRefSpace   = null;
let lastFetchCheck = 0;

// ── Initialize ────────────────────────────────────────────────────────────────────────────

export function init() {
  HUD.init();
  HUD.status('Initializing...');

  // Three.js scene
  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 1.6, 0); // eye height

  // Renderer
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Ambient light (so meshes are visible)
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  // Initialize modules
  Renderer.init(scene);
  Location.init();

  // Check WebXR support
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      const btn = document.getElementById('enter-ar');
      if (supported) {
        btn.style.display = 'block';
        btn.addEventListener('click', startXR);
        HUD.status('Quest 3 ready — tap Enter AR');
      } else {
        startFallback();
      }
    });
  } else {
    startFallback();
  }

  window.addEventListener('resize', onResize);
}

// ── WebXR Mode (Quest 3 Passthrough) ────────────────────────────────────────

async function startXR() {
  try {
    const overlay = document.getElementById('hud-overlay');

    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay }
    });

    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(xrSession);

    xrRefSpace = await xrSession.requestReferenceSpace('local-floor');

    document.getElementById('enter-ar').style.display = 'none';
    HUD.status('AR session active');

    renderer.setAnimationLoop(onXRFrame);

  } catch (e) {
    console.error('[COHUA] XR session failed:', e);
    HUD.status('XR error: ' + e.message);
    startFallback();
  }
}

function onXRFrame(time, frame) {
  if (frame) {
    const pose = frame.getViewerPose(xrRefSpace);
    if (pose) {
      Location.updateFromXRPose(pose);
    }
  }

  updateLoop();
  renderer.render(scene, camera);
}

// ── Fallback Mode (Desktop / Non-XR) ───────────────────────────────────────

function startFallback() {
  HUD.status('No XR — using desktop 3D view');

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 5, -20);
  controls.update();

  // Add ground grid for orientation
  const grid = new THREE.GridHelper(200, 50, 0x00f3ff, 0x111111);
  grid.material.opacity = 0.3;
  grid.material.transparent = true;
  scene.add(grid);

  renderer.setAnimationLoop(onFallbackFrame);
}

function onFallbackFrame() {
  if (controls) controls.update();
  updateLoop();
  renderer.render(scene, camera);
}

// ── Shared Update Loop ──────────────────────────────────────────────────────

function updateLoop() {
  const now = performance.now() / 1000;

  // Check for campaign fetch
  if (now - lastFetchCheck >= Config.GPS_POLL_S) {
    lastFetchCheck = now;

    if (Fetcher.shouldFetch()) {
      Fetcher.fetch((campaigns) => {
        Renderer.sync(campaigns);
      });
    }
  }

  // Billboard signs toward camera
  if (Renderer.hasActiveSigns()) {
    Renderer.billboard(camera);
  }
}

// ── Resize Handler ──────────────────────────────────────────────────────────

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── Auto-start ──────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
