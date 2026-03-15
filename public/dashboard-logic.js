// COHUA Dashboard Logic v3 - client_id fixes + AR Demo Launcher
// Loaded by dashboard.html via <script src>

const SUPABASE_URL = 'https://sgredejirqatcmstlzqi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA';
let supabaseClient = null;
if (typeof window !== 'undefined' && window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toast(msg, type = 'info', duration = 3500) {
  const icons = { success: '\u2713', error: '\u2715', info: '\u2139', warning: '\u26a0' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'\u2139'}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-container').appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, duration);
}

let _confirmCb = null;
function confirmAction(title, message, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  _confirmCb = cb;
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmAccept() { document.getElementById('confirm-overlay').classList.remove('open'); if (_confirmCb) { _confirmCb(); _confirmCb = null; } }
function confirmReject() { document.getElementById('confirm-overlay').classList.remove('open'); _confirmCb = null; }
function confirmSignOut() { confirmAction('Sign out?', 'You will be redirected to the login page.', signOut); }

function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
  if (id === 'modal-campaign' || id === 'modal-location') populateClientDropdowns();
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; }
async function populateClientDropdowns() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.from('clients').select('id, name').order('name');
    const clients = data || [];
    const opts = clients.length ? clients.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('') : '<option value="" disabled>No clients yet \u2014 add one first</option>';
    ['camp-client','loc-client'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<option value="">Select client\u2026</option>' + opts; });
  } catch(e) { console.error('Failed to load clients for dropdown', e); }
}

const pageTitles = {
  overview: ['Overview', 'COHUA Admin Command Center'],
  campaigns: ['AR Campaigns', 'Manage all AR experiences'],
  clients: ['Clients', 'Manage registered businesses'],
  locations: ['Locations', 'GPS-anchored AR spots'],
  analytics: ['Analytics', 'Performance & telemetry data'],
  'ar-demo': ['AR Demo Launcher', 'Test AR ads without client accounts'],
  'neon-store': ['Neon Store', 'AR product catalog & configuration'],
  settings: ['Settings', 'Platform configuration & integrations']
};
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => { l.classList.remove('active'); l.classList.add('text-gray-400'); });
  const section = document.getElementById(`section-${name}`);
  if (section) section.classList.add('active');
  const nav = document.getElementById(`nav-${name}`);
  if (nav) { nav.classList.add('active'); nav.classList.remove('text-gray-400'); }
  const [title, sub] = pageTitles[name] || [name, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = sub;
  if (name === 'campaigns') loadCampaigns();
  if (name === 'clients') loadClients();
  if (name === 'locations') loadLocations();
  if (name === 'ar-demo') loadDemos();
  if (name === 'settings') {
    const email = document.getElementById('user-email').textContent;
    document.getElementById('settings-email').textContent = email;
    document.getElementById('settings-avatar').textContent = email.charAt(0).toUpperCase();
  }
}

async function checkAuth() {
  if (!supabaseClient) { window.location.href = '/login'; return; }
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    const email = session.user.email;
    document.getElementById('user-email').textContent = email;
    document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
    loadStats();
    loadOverviewCampaigns();
  } catch { window.location.href = '/login'; }
}
async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  window.location.href = '/login';
}

async function loadStats() {
  if (!supabaseClient) return;
  try {
    const [c1, c2, c3] = await Promise.all([
      supabaseClient.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'live'),
      supabaseClient.from('clients').select('*', { count: 'exact', head: true }),
      supabaseClient.from('campaigns').select('*', { count: 'exact', head: true }).not('latitude', 'is', null)
    ]);
    document.getElementById('stat-campaigns').textContent = c1.count ?? 0;
    document.getElementById('stat-clients').textContent = c2.count ?? 0;
    document.getElementById('stat-locations').textContent = c3.count ?? 0;
    document.getElementById('stat-revenue').textContent = '$' + ((c2.count ?? 0) * 100).toLocaleString();
  } catch(e) {
    console.error('Stats error:', e);
    ['stat-campaigns','stat-clients','stat-locations'].forEach(id => document.getElementById(id).textContent = '0');
    document.getElementById('stat-revenue').textContent = '$0';
  }
}

let allCampaigns = [];
async function loadOverviewCampaigns() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.from('campaigns').select('*').order('created_at', { ascending: false }).limit(5);
    allCampaigns = data || [];
    const empty = document.getElementById('overview-campaigns-empty');
    const list = document.getElementById('overview-campaigns-list');
    if (!allCampaigns.length) { empty.classList.remove('hidden'); list.classList.add('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    document.getElementById('overview-campaigns-tbody').innerHTML = allCampaigns.map(c => `<tr><td class="pr-4 font-medium">${escHtml(c.name||'Untitled')}</td><td class="pr-4 text-gray-400">${fmtType(c.asset_type||c.type)}</td><td class="pr-4"><span class="text-xs px-2.5 py-1 rounded-full badge-${c.status||'draft'}">${c.status||'draft'}</span></td><td class="text-xs text-gray-500">${fmtDate(c.created_at)}</td></tr>`).join('');
  } catch(e) { console.error(e); }
}

async function loadCampaigns() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.from('campaigns').select('*').order('created_at', { ascending: false });
    allCampaigns = data || [];
    renderCampaigns(allCampaigns);
  } catch(e) { toast('Failed to load campaigns', 'error'); }
}
function renderCampaigns(list) {
  const empty = document.getElementById('campaigns-empty');
  const table = document.getElementById('campaigns-table');
  if (!list || !list.length) { empty.classList.remove('hidden'); table.classList.add('hidden'); return; }
  empty.classList.add('hidden'); table.classList.remove('hidden');
  document.getElementById('campaigns-tbody').innerHTML = list.map(c => `<tr class="group"><td class="pr-4 font-medium">${escHtml(c.name||'Untitled')}</td><td class="pr-4">${fmtType(c.asset_type||c.type)}</td><td class="pr-4"><span class="text-xs px-2.5 py-1 rounded-full badge-${c.status||'draft'}">${c.status||'draft'}</span></td><td class="pr-4 text-xs text-gray-400">${escHtml(c.location_label||c.location||'\u2014')}</td><td class="pr-4 text-xs text-gray-500">${fmtDate(c.created_at)}</td><td><button onclick="deleteCampaign('${c.id}','${escHtml(c.name||'this campaign')}')" class="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all text-xs px-2 py-1 rounded hover:bg-red-400/10">Delete</button></td></tr>`).join('');
}
function filterCampaigns(filter) {
  document.querySelectorAll('[id^="filter-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${filter}`).classList.add('active');
  renderCampaigns(filter === 'all' ? allCampaigns : allCampaigns.filter(c => c.status === filter));
}
async function createCampaign() {
  const name = document.getElementById('camp-name').value.trim();
  const clientId = document.getElementById('camp-client').value;
  const type = document.getElementById('camp-type').value;
  const status = document.getElementById('camp-status').value;
  const lat = document.getElementById('camp-lat').value;
  const lng = document.getElementById('camp-lng').value;
  const location = document.getElementById('camp-location').value.trim();
  const budget = document.getElementById('camp-budget').value;
  const notes = document.getElementById('camp-notes').value.trim();
  if (!name) { toast('Campaign name is required', 'error'); return; }
  if (!clientId) { toast('Please select a client', 'error'); return; }
  if (!type) { toast('Please select an asset type', 'error'); return; }
  if (!lat || !lng) { toast('Latitude and longitude are required', 'error'); return; }
  if (!supabaseClient) { toast('Database not connected', 'error'); return; }
  const btn = document.getElementById('btn-create-campaign');
  btn.textContent = 'Creating\u2026'; btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('campaigns').insert({ name, client_id: clientId, asset_type: type, status, location_label: location||null, latitude: parseFloat(lat), longitude: parseFloat(lng), budget: budget ? parseFloat(budget) : null, notes: notes||null });
    if (error) throw error;
    closeModal('modal-campaign');
    ['camp-name','camp-lat','camp-lng','camp-location','camp-budget','camp-notes'].forEach(id => document.getElementById(id).value='');
    document.getElementById('camp-type').value=''; document.getElementById('camp-client').value=''; document.getElementById('camp-status').value='draft';
    toast(`"${name}" campaign created!`, 'success');
    loadStats(); loadOverviewCampaigns();
    if (document.getElementById('section-campaigns').classList.contains('active')) loadCampaigns();
  } catch(e) { toast(e.message||'Failed to create campaign', 'error'); }
  finally { btn.textContent='Create Campaign'; btn.disabled=false; }
}
async function deleteCampaign(id, name) {
  confirmAction(`Delete "${name}"?`, 'This campaign will be permanently removed.', async () => {
    try {
      const { error } = await supabaseClient.from('campaigns').delete().eq('id', id);
      if (error) throw error;
      toast('Campaign deleted', 'success');
      loadStats(); loadCampaigns(); loadOverviewCampaigns();
    } catch(e) { toast('Failed to delete', 'error'); }
  });
}

async function loadClients() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.from('clients').select('*').order('created_at', { ascending: false });
    const list = data || [];
    document.getElementById('clients-count').textContent = `${list.length} client${list.length!==1?'s':''} registered`;
    const empty = document.getElementById('clients-empty');
    const table = document.getElementById('clients-table');
    if (!list.length) { empty.classList.remove('hidden'); table.classList.add('hidden'); return; }
    empty.classList.add('hidden'); table.classList.remove('hidden');
    document.getElementById('clients-tbody').innerHTML = list.map(c => `<tr class="group"><td class="pr-4 font-medium">${escHtml(c.name||'Unnamed')}</td><td class="pr-4 text-sm text-gray-400">${fmtIndustry(c.industry)}</td><td class="pr-4"><span class="text-xs px-2.5 py-1 rounded-full badge-client">${c.plan||'monthly'}</span></td><td class="pr-4 text-xs text-gray-400">${escHtml(c.contact_email||c.email||'\u2014')}</td><td class="pr-4 text-xs text-gray-400">${escHtml(c.city||'\u2014')}</td><td class="pr-4 text-xs text-gray-500">${fmtDate(c.created_at)}</td><td><button onclick="deleteClient('${c.id}','${escHtml(c.name||'client')}')" class="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all text-xs px-2 py-1 rounded hover:bg-red-400/10">Remove</button></td></tr>`).join('');
  } catch(e) { toast('Failed to load clients', 'error'); console.error(e); }
}
async function createClient() {
  const name = document.getElementById('client-name').value.trim();
  const industry = document.getElementById('client-industry').value;
  const plan = document.getElementById('client-plan').value;
  const email = document.getElementById('client-email').value.trim();
  const contact = document.getElementById('client-contact').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const city = document.getElementById('client-city').value.trim();
  if (!name) { toast('Business name is required', 'error'); return; }
  if (!email) { toast('Contact email is required', 'error'); return; }
  if (!supabaseClient) { toast('Database not connected', 'error'); return; }
  const btn = document.getElementById('btn-create-client');
  btn.textContent = 'Adding\u2026'; btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('clients').insert({ name, industry:industry||null, plan, contact_email:email, contact_name:contact||null, phone:phone||null, city:city||null });
    if (error) throw error;
    closeModal('modal-client');
    ['client-name','client-email','client-contact','client-phone','client-city'].forEach(id => document.getElementById(id).value='');
    document.getElementById('client-industry').value='';
    toast(`Client "${name}" added!`, 'success');
    loadStats(); loadClients();
  } catch(e) { toast(e.message||'Failed to add client', 'error'); }
  finally { btn.textContent='Add Client'; btn.disabled=false; }
}
async function deleteClient(id, name) {
  confirmAction(`Remove "${name}"?`, 'This client will be permanently removed.', async () => {
    try {
      const { error } = await supabaseClient.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast('Client removed', 'success');
      loadStats(); loadClients();
    } catch(e) { toast('Failed to remove client', 'error'); }
  });
}

async function loadLocations() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient.from('campaigns').select('id,name,location_label,latitude,longitude,created_at').not('latitude','is',null).order('created_at',{ascending:false});
    const list = data || [];
    document.getElementById('locations-count').textContent = `${list.length} GPS location${list.length!==1?'s':''} pinned`;
    const empty = document.getElementById('locations-empty');
    const grid = document.getElementById('locations-grid');
    if (!list.length) { empty.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden');
    grid.innerHTML = list.map(l => `<div class="glass rounded-xl p-4 hover:border-neon-green/30 transition-all"><div class="w-8 h-8 rounded-lg bg-neon-green/10 flex items-center justify-center mb-3"><svg class="w-4 h-4 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div><p class="font-medium text-sm mb-1">${escHtml(l.location_label||l.name||'Unnamed')}</p><p class="text-xs text-gray-500 font-mono">${l.latitude}, ${l.longitude}</p><p class="text-xs text-gray-600 mt-2">${fmtDate(l.created_at)}</p></div>`).join('');
  } catch(e) { toast('Failed to load locations', 'error'); }
}
async function createLocation() {
  const name = document.getElementById('loc-name').value.trim();
  const clientId = document.getElementById('loc-client').value;
  const lat = document.getElementById('loc-lat').value;
  const lng = document.getElementById('loc-lng').value;
  const address = document.getElementById('loc-address').value.trim();
  const radius = document.getElementById('loc-radius').value;
  if (!name) { toast('Location name required', 'error'); return; }
  if (!clientId) { toast('Please select a client', 'error'); return; }
  if (!lat || !lng) { toast('Latitude and longitude required', 'error'); return; }
  const btn = document.getElementById('btn-create-location');
  btn.textContent='Saving\u2026'; btn.disabled=true;
  try {
    const { error } = await supabaseClient.from('campaigns').insert({ name, client_id: clientId, location_label:address||name, latitude:parseFloat(lat), longitude:parseFloat(lng), asset_type:'location', status:'live', notes:radius?`Radius: ${radius}m`:null });
    if (error) throw error;
    closeModal('modal-location');
    ['loc-name','loc-lat','loc-lng','loc-address','loc-radius'].forEach(id => document.getElementById(id).value='');
    document.getElementById('loc-client').value='';
    toast(`Location "${name}" pinned!`, 'success');
    loadStats(); loadLocations();
  } catch(e) { toast(e.message||'Failed to save location', 'error'); }
  finally { btn.textContent='Save Location'; btn.disabled=false; }
}

// ============================================================
// AR DEMO LAUNCHER
// ============================================================
const DEMO_DURATIONS = [
  { label: '1 Day',    days: 1 },
  { label: '3 Days',   days: 3 },
  { label: '1 Week',   days: 7 },
  { label: '2 Weeks',  days: 14 },
  { label: '3 Weeks',  days: 21 },
  { label: '1 Month',  days: 30 },
  { label: '2 Months', days: 60 },
  { label: '3 Months', days: 90 },
];
let selectedDemoDuration = 1; // days
let demoNeonColor = '#00f3ff';
const NEON_PRESETS = ['#00f3ff','#ff00ff','#00ff66','#ffd700','#ff4466','#ff6600','#ffffff','#7b2fff'];

function initDemoSection() {
  // Duration buttons
  const grid = document.getElementById('demo-duration-grid');
  if (!grid || grid.dataset.init) return;
  grid.dataset.init = '1';
  grid.innerHTML = DEMO_DURATIONS.map((d,i) => `
    <button onclick="selectDemoDuration(${d.days}, this)"
      class="demo-dur-btn text-center py-3 px-2 rounded-xl border transition-all text-sm font-medium
             ${i===0 ? 'border-neon-blue/60 bg-neon-blue/10 text-neon-blue' : 'border-white/10 bg-white/4 text-gray-400 hover:border-white/20 hover:text-white'}">
      ${d.label}
    </button>`).join('');

  // Neon color swatches
  const swatches = document.getElementById('demo-color-swatches');
  if (swatches) {
    swatches.innerHTML = NEON_PRESETS.map(c => `
      <button onclick="selectDemoColor('${c}', this)"
        style="background:${c}; box-shadow: 0 0 8px ${c}60"
        class="demo-swatch w-8 h-8 rounded-full border-2 transition-all
               ${c===demoNeonColor ? 'border-white scale-110' : 'border-transparent hover:scale-105'}">
      </button>`).join('');
  }
}

function selectDemoDuration(days, btn) {
  selectedDemoDuration = days;
  document.querySelectorAll('.demo-dur-btn').forEach(b => {
    b.className = b.className.replace(/border-neon-blue\/60|bg-neon-blue\/10|text-neon-blue/g, '');
    b.classList.add('border-white/10','bg-white/4','text-gray-400');
    b.classList.remove('border-neon-blue/60','bg-neon-blue/10','text-neon-blue');
  });
  btn.classList.remove('border-white/10','bg-white/4','text-gray-400');
  btn.classList.add('border-neon-blue/60','bg-neon-blue/10','text-neon-blue');
}

function selectDemoColor(color, btn) {
  demoNeonColor = color;
  document.querySelectorAll('.demo-swatch').forEach(b => b.classList.remove('border-white','scale-110'));
  btn.classList.add('border-white','scale-110');
  const preview = document.getElementById('demo-color-preview');
  if (preview) { preview.style.background = color; preview.style.boxShadow = `0 0 16px ${color}80`; }
  const custom = document.getElementById('demo-color-custom');
  if (custom) custom.value = color;
}

function syncCustomColor(val) {
  demoNeonColor = val;
  document.querySelectorAll('.demo-swatch').forEach(b => b.classList.remove('border-white','scale-110'));
  const preview = document.getElementById('demo-color-preview');
  if (preview) { preview.style.background = val; preview.style.boxShadow = `0 0 16px ${val}80`; }
}

async function launchDemo() {
  const name = document.getElementById('demo-name').value.trim();
  const adType = document.getElementById('demo-ad-type').value;
  const lat = document.getElementById('demo-lat').value;
  const lng = document.getElementById('demo-lng').value;
  const locationLabel = document.getElementById('demo-location-label').value.trim();
  const logoUrl = document.getElementById('demo-logo-url').value.trim();
  const notes = document.getElementById('demo-notes').value.trim();

  if (!name) { toast('Ad name is required', 'error'); return; }
  if (!lat || !lng) { toast('GPS coordinates are required', 'error'); return; }
  if (!supabaseClient) { toast('Database not connected', 'error'); return; }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + selectedDemoDuration * 24 * 60 * 60 * 1000);
  const demoLabel = DEMO_DURATIONS.find(d => d.days === selectedDemoDuration)?.label || `${selectedDemoDuration}d`;

  const btn = document.getElementById('btn-launch-demo');
  btn.textContent = 'Launching\u2026'; btn.disabled = true;

  try {
    const payload = {
      name: `[DEMO] ${name}`,
      asset_type: adType || 'neon_logo',
      status: 'live',
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      location_label: locationLabel || null,
      notes: [
        `DEMO MODE \u2014 expires ${expiresAt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`,
        `Duration: ${demoLabel}`,
        `Neon color: ${demoNeonColor}`,
        logoUrl ? `Logo URL: ${logoUrl}` : null,
        notes || null
      ].filter(Boolean).join(' | '),
      deploy_payload: JSON.stringify({
        demo: true,
        neon_color: demoNeonColor,
        logo_url: logoUrl || null,
        expires_at: expiresAt.toISOString(),
        duration_days: selectedDemoDuration
      })
    };

    // Try with a demo client_id placeholder or without if nullable
    const { data: demoClient } = await supabaseClient
      .from('clients').select('id').limit(1).maybeSingle();

    if (demoClient) payload.client_id = demoClient.id;
    // If no clients exist at all, the insert may fail on client_id constraint.
    // In that case we still try and surface the error.

    const { error } = await supabaseClient.from('campaigns').insert(payload);
    if (error) throw error;

    toast(`\u26a1 "${name}" demo launched for ${demoLabel}!`, 'success', 5000);
    document.getElementById('demo-name').value = '';
    document.getElementById('demo-lat').value = '';
    document.getElementById('demo-lng').value = '';
    document.getElementById('demo-location-label').value = '';
    document.getElementById('demo-logo-url').value = '';
    document.getElementById('demo-notes').value = '';
    loadDemos();
    loadStats();
  } catch(e) {
    if (e.message && e.message.includes('client_id')) {
      toast('You need at least one client in the system to launch demos. Add a dummy client first.', 'warning', 6000);
    } else {
      toast(e.message || 'Failed to launch demo', 'error');
    }
  }
  finally { btn.textContent = 'Launch Demo'; btn.disabled = false; }
}

async function loadDemos() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient
      .from('campaigns')
      .select('id,name,status,location_label,latitude,longitude,created_at,notes,deploy_payload')
      .like('name', '[DEMO]%')
      .order('created_at', { ascending: false })
      .limit(20);
    const list = data || [];
    const empty = document.getElementById('demos-empty');
    const grid = document.getElementById('demos-grid');
    if (!list.length) { empty.classList.remove('hidden'); grid.classList.add('hidden'); return; }
    empty.classList.add('hidden'); grid.classList.remove('hidden');

    grid.innerHTML = list.map(d => {
      let payload = {};
      try { payload = JSON.parse(d.deploy_payload || '{}'); } catch {}
      const color = payload.neon_color || '#00f3ff';
      const expires = payload.expires_at ? new Date(payload.expires_at) : null;
      const now = new Date();
      const expired = expires && expires < now;
      const daysLeft = expires ? Math.ceil((expires - now) / (1000*60*60*24)) : null;
      return `
      <div class="glass rounded-xl p-4 border hover:opacity-90 transition-all" style="border-color: ${color}40">
        <div class="flex items-start justify-between mb-3">
          <div>
            <p class="font-semibold text-sm">${escHtml(d.name.replace('[DEMO] ',''))}</p>
            <p class="text-xs text-gray-500 mt-0.5">${escHtml(d.location_label || `${d.latitude}, ${d.longitude}`)}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${color}20; color:${color}; border: 1px solid ${color}40">
              ${expired ? 'Expired' : daysLeft !== null ? `${daysLeft}d left` : 'Live'}
            </span>
            <button onclick="endDemo('${d.id}')" class="text-xs text-red-400/60 hover:text-red-400 transition-colors">End</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:${color}; box-shadow: 0 0 6px ${color}"></div>
          <p class="text-xs text-gray-500">${escHtml(d.notes ? d.notes.split(' | ')[0] : 'Demo AR experience')}</p>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error('loadDemos error', e); }
}

async function endDemo(id) {
  confirmAction('End this demo?', 'The AR experience will be set to ended.', async () => {
    try {
      const { error } = await supabaseClient.from('campaigns').update({ status: 'ended' }).eq('id', id);
      if (error) throw error;
      toast('Demo ended', 'info');
      loadDemos(); loadStats();
    } catch(e) { toast('Failed to end demo', 'error'); }
  });
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d) { if (!d) return '\u2014'; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch { return '\u2014'; } }
function fmtType(t) { return {neon_logo:'Neon Logo',neon_menu:'Neon Menu',neon_image:'Neon Image',custom_3d:'Custom 3D',location:'Location'}[t]||t||'\u2014'; }
function fmtIndustry(i) { return {retail:'Retail',restaurant:'Restaurant',real_estate:'Real Estate',construction:'Construction',hospitality:'Hospitality',tech:'Technology',finance:'Finance',other:'Other'}[i]||i||'\u2014'; }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id)); confirmReject(); }
  });
  checkAuth();
});
