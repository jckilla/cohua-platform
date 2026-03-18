/**
 * mock-test.js — MockDevice integration test for the COHUA glasses bridge.
 *
 * Validates the full sign lifecycle flow without physical Ray-Ban glasses:
 *   connect() -> showSign() -> updateSign() (distance decreasing) -> hideSign()
 *
 * Simulates walking near DOWNEY POST OFFICE (33.9422, -118.1361)
 * with a live campaign, logging all TTS output that would route to
 * the glasses speakers via Bluetooth A2DP.
 *
 * Usage:
 *   node mock-test.js            (standalone — uses console stubs)
 *   import from React Native     (uses real TTS + native bridge)
 */

import { MetaGlassesSDK } from './glasses-bridge.js';

// ── Test Configuration ───────────────────────────────────────────────────────

const TEST_CAMPAIGN = {
  id: 'test-downey-post-office-001',
  name: 'Downey Post Office',
  type: 'NEON LOGO',
  neonColor: '#00ffcc',
  location: '8111 E Firestone Blvd, Downey, CA 90241',
  lat: 33.9422,
  lon: -118.1361,
};

// Simulated walk path — approaching and then leaving
const WALK_STEPS = [
  { distance: 450, direction: 'ahead',  label: 'Entering zone (~450 ft)' },
  { distance: 320, direction: 'ahead',  label: 'Approaching (~320 ft)' },
  { distance: 200, direction: 'ahead',  label: 'Getting closer (~200 ft)' },
  { distance: 95,  direction: 'ahead',  label: 'Almost there (~95 ft)' },
  { distance: 30,  direction: 'right',  label: 'Right next to it (~30 ft)' },
  { distance: 80,  direction: 'behind', label: 'Walking past (~80 ft)' },
  { distance: 250, direction: 'behind', label: 'Moving away (~250 ft)' },
];

// ── TTS Logger ───────────────────────────────────────────────────────────────

const ttsLog = [];

function logTTS(text) {
  const entry = {
    timestamp: new Date().toISOString(),
    text: text,
    output: 'glasses_speakers (Bluetooth A2DP)',
  };
  ttsLog.push(entry);
  console.log(`  🔊 TTS -> Glasses: "${text}"`);
}

// ── Main Test ────────────────────────────────────────────────────────────────

async function runMockTest() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  COHUA MockDevice Integration Test');
  console.log('  Location: DOWNEY POST OFFICE (33.9422, -118.1361)');
  console.log('══════════════════════════════════════════════════════════\n');

  // Step 1: Connect in MockDevice mode
  console.log('[1/5] Connecting in MockDevice mode...');
  try {
    const mode = await MetaGlassesSDK.connect({ useMockDevice: true });
    console.log(`  Connected — mode: ${mode}`);
    console.log(`  isConnected: ${MetaGlassesSDK.isConnected()}`);
  } catch (err) {
    console.error('  Connection failed:', err.message);
    return;
  }

  // Step 2: Show sign (entering proximity zone)
  console.log('\n[2/5] Entering campaign zone — showSign()...');
  const firstStep = WALK_STEPS[0];
  await MetaGlassesSDK.showSign({
    id: TEST_CAMPAIGN.id,
    name: TEST_CAMPAIGN.name,
    type: TEST_CAMPAIGN.type,
    distance: firstStep.distance,
    direction: firstStep.direction,
    neonColor: TEST_CAMPAIGN.neonColor,
    location: TEST_CAMPAIGN.location,
  });
  logTTS(`COHUA sign ahead: ${TEST_CAMPAIGN.name}, ${firstStep.distance} feet ${firstStep.direction}`);

  // Step 3: Update sign as user walks closer
  console.log('\n[3/5] Walking closer — updateSign() with decreasing distance...');
  for (let i = 1; i < WALK_STEPS.length - 1; i++) {
    const step = WALK_STEPS[i];
    console.log(`\n  Step ${i + 1}: ${step.label}`);

    await MetaGlassesSDK.updateSign({
      id: TEST_CAMPAIGN.id,
      name: TEST_CAMPAIGN.name,
      type: TEST_CAMPAIGN.type,
      distance: step.distance,
      direction: step.direction,
      neonColor: TEST_CAMPAIGN.neonColor,
      location: TEST_CAMPAIGN.location,
    });

    // Log what TTS would say (updateSign throttles re-announcements
    // to every 100ft bucket change with 8s minimum gap)
    const bucket = Math.floor(step.distance / 100);
    const prevBucket = Math.floor(WALK_STEPS[i - 1].distance / 100);
    if (bucket !== prevBucket) {
      logTTS(`${TEST_CAMPAIGN.name} now ${step.distance} feet ${step.direction}`);
    } else {
      console.log(`  (throttled — same 100ft bucket)`);
    }

    // Simulate walking delay
    await sleep(500);
  }

  // Step 4: Hide sign (leaving proximity zone)
  console.log('\n[4/5] Leaving zone — hideSign()...');
  await MetaGlassesSDK.hideSign(TEST_CAMPAIGN.id);
  logTTS(`Leaving ${TEST_CAMPAIGN.name} zone`);

  // Step 5: Verify state and disconnect
  console.log('\n[5/5] Verifying state and disconnecting...');
  const activeSigns = MetaGlassesSDK.getActiveSigns();
  console.log(`  Active signs after hide: ${activeSigns.length} (expected: 0)`);

  await MetaGlassesSDK.disconnect();
  console.log(`  isConnected after disconnect: ${MetaGlassesSDK.isConnected()} (expected: false)`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Test Complete — TTS Output Log');
  console.log('══════════════════════════════════════════════════════════');
  ttsLog.forEach((entry, i) => {
    console.log(`  ${i + 1}. [${entry.output}] "${entry.text}"`);
  });
  console.log(`\n  Total TTS announcements: ${ttsLog.length}`);
  console.log('  All audio routes to glasses speakers when BT A2DP connected.');
  console.log('══════════════════════════════════════════════════════════\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Run ─────────────────────────────────────────────────────────────────────

runMockTest().catch(err => {
  console.error('MockDevice test failed:', err);
  process.exit(1);
});
