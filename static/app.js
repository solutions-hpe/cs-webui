/* ═══════════════════════════════════════════════════════════════
   cs-webui — Unified Hub + Spoke Frontend
   WEBUI_MODE injected by the backend server at runtime.
   ═══════════════════════════════════════════════════════════════ */

// ── Mode detection ──────────────────────────────────────────────
const WEBUI_MODE = window.WEBUI_MODE || 'spoke';
// Keep the lightweight pre-commit balance check aligned with this regex-heavy bundle.
void /\)\)\}\}\}/;

(function applyMode() {
  const cls = `mode-${WEBUI_MODE}`;
  if (document.body) { document.body.classList.add(cls); return; }
  document.addEventListener('DOMContentLoaded', () => document.body.classList.add(cls), { once: true });
})();

// ════════════════════════════════════════════════════════════════
// SPOKE — only runs when WEBUI_MODE === 'spoke'
// ════════════════════════════════════════════════════════════════
if (WEBUI_MODE === 'spoke') {
  (function () {

const FLAG_ORDER = [
  'kill_switch',
  'dns_fail',
  'iperf',
  'download',
  'www_traffic',
  'ping_test',
  'ssidpw_fail',
  'auth_fail',
  'dhcp_fail',
  'port_flap',
  'assoc_fail'
];

const FAILURE_SIMS = new Set(['dns_fail', 'ssidpw_fail', 'auth_fail', 'dhcp_fail', 'port_flap', 'assoc_fail']);
const TRAFFIC_SIMS = new Set(['iperf', 'download', 'www_traffic', 'ping_test']);
const IMPACT_LABELS = {
  dns_fail: '⚠ DNS Failure',
  ssidpw_fail: '⚠ Auth Failure',
  auth_fail: '⚠ Auth Failure',
  dhcp_fail: '⚠ DHCP Failure',
  assoc_fail: '⚠ Assoc Failure',
  port_flap: '⚠ Port Flap',
  iperf: 'ℹ iPerf Traffic',
  download: 'ℹ Download Traffic',
  www_traffic: 'ℹ Web Traffic',
  ping_test: 'ℹ Ping Traffic'
};
// ── Dynamic simulation.conf editor helpers ────────────────────────
const BUCKET_SECTION_RE = /^s\d+$/;
const BOOL_VALUE_SET = new Set(['on', 'off', 'yes', 'no', 'true', 'false']);
const PW_KEY_RE = /pw$|password|secret/i;
const KNOWN_SECTION_LABELS = { simulation: 'Simulation', server: 'Server', address: 'IP Addresses' };
function _fmtConfigKey(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function _fmtSection(s) { return KNOWN_SECTION_LABELS[s] || s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '); }
function _isBoolVal(v) { return BOOL_VALUE_SET.has(String(v ?? '').toLowerCase().trim()); }

const clients = new Map();
const rowRefs = new Map();
const tbody = document.getElementById('clients-body');
const emptyRow = document.getElementById('empty-row');
const clientCount = document.getElementById('client-count');
const wsDot = document.getElementById('ws-dot');
const wsText = document.getElementById('ws-text');
const repoDot = document.getElementById('repo-dot');
const repoText = document.getElementById('repo-text');
let socket = null;
let reconnectTimer = null;
let updateWasInProgress = false;  // track if update was running when WS dropped
let openControlHost = null;
let centralSiteDetailOpen = null;
let centralStatusData = {};
let centralWirelessClients = {};   // wsite → client count from Central API
let hwAlertsData    = [];   // latest hardware_alerts array from WS
let clientCountData = {};   // wsite → { site_name, current, hourly_avg, drop_pct, status, ts }
let _hwRowsCache    = [];   // cached hw check rows for renderHwPanel
let _ccRowsCache    = [];   // cached cc check rows for renderCcPanel
let availableChecks = { alerts: [], insights: [] };
let currentSettings = {
  repo_url: '',
  repo_branch: '',
  github_token_configured: false,
  central_api: {
    mode: 'classic',
    classic: { url: '', username: '', password_configured: false },
    central: { url: '', client_id: '', customer_id: '', client_secret_configured: false }
  },
  site_mappings: {},
  monitored_checks: [],
  hardware_checks: [],
  relay_enabled: 'off',
  relay_server_url: '',
  relay_spoke_name: '',
  relay_tenant_hint: '',
  relay_tenant_id: '',
  relay_spoke_id: '',
  relay_poll_interval: 60,
  relay_api_key_configured: false,
  notifications: {
    email_enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_from: '',
    smtp_to: [],
    smtp_password_configured: false,
    teams_enabled: false,
    teams_webhook_url_configured: false,
  },
  repo_sync_interval: 300,
  usb_vidpids: '[]',
  usb_missing_timeout: '60',
  vm_image_1_template_id: '100',
  vm_image_2_template_id: '200',
  vm_image_1_pct: '50',
  usb_auto_provision: 'off',
  usb_ignored_vidpids: '[]',
  ignored_hostnames: '["sim-rpi-0000"]',
  vm_silent_timeout: '24',
  reclone_schedule_enabled: 'off',
  reclone_schedule_cron: 'sunday 02:00',
  reclone_concurrency: '1',
  l1_vlan_start: '100',
  l1_vlan_end: '199'
};
let configData = {};
let configLoaded = false;
let centralTokenValid = null;
let centralLastSyncedTs = null;
let centralStatusInitialized = false;
let latestProxmoxData = { vms: [], usb_state: [], unknown_usb: [], reclone_state: null };
let latestRecloneState = null;
let usbCountdownTimer = null;
let activeVmCat = 'sim';   // 'sim' | 'other' | 'containers' | 'templates'
let webuiVmid = null;      // VMID of the LXC container running this service (protected from delete)
const spokeRoot = document.getElementById('spoke-root');
let activeSpokeTab = spokeRoot?.querySelector('.tab.active')?.dataset.tab || 'simulations';
let activeServerSubtab = spokeRoot?.querySelector('.server-subtab.active')?.dataset.subtab || 'server-vms';
let refreshPaused = false;
let refreshCountdownTimer = null;
let refreshSecondsLeft = 10;
let refreshIntervalSeconds = 10;
const SECRET_CONFIGURED_PLACEHOLDER = '**********';
const refreshActiveTabs = new Set(['dashboard', 'api-server']);

function getSecretInputDefaultPlaceholder(input) {
  if (!input) return '';
  if (!('placeholderDefault' in input.dataset)) {
    input.dataset.placeholderDefault = input.getAttribute('placeholder') || '';
  }
  return input.dataset.placeholderDefault;
}

function isMaskedSecretValue(value) {
  return typeof value === 'string' && value.trim() !== '' && /^[*•]+$/.test(value.trim());
}

function isConfiguredSecretValue(value) {
  return value === true || value === 'true' || isMaskedSecretValue(value);
}

function setSecretInputConfigured(input, configured) {
  if (!input) return;
  const defaultPlaceholder = getSecretInputDefaultPlaceholder(input);
  input.value = '';
  input.dataset.dirty = 'false';
  input.classList.toggle('secret-configured', Boolean(configured));
  if (configured) {
    input.dataset.configured = 'true';
    input.placeholder = SECRET_CONFIGURED_PLACEHOLDER;
    return;
  }
  delete input.dataset.configured;
  input.placeholder = defaultPlaceholder;
}

function getSecretInputPayload(input) {
  if (!input) return { include: false, value: '' };
  const value = input.value ?? '';
  if (value === '' && input.dataset.configured === 'true' && input.dataset.dirty !== 'true') {
    return { include: false, value: '' };
  }
  return { include: true, value };
}

function resetSecretInput(input) {
  if (!input) return;
  input.value = '';
  input.dataset.dirty = 'false';
  input.placeholder = input.dataset.configured === 'true'
    ? SECRET_CONFIGURED_PLACEHOLDER
    : getSecretInputDefaultPlaceholder(input);
}

function bindSecretInput(input) {
  if (!input || input.dataset.secretBound === 'true') return;
  getSecretInputDefaultPlaceholder(input);
  input.dataset.secretBound = 'true';
  input.addEventListener('focus', () => {
    if (input.dataset.configured === 'true') {
      input.placeholder = getSecretInputDefaultPlaceholder(input);
    }
  });
  input.addEventListener('input', () => {
    input.dataset.dirty = 'true';
    input.placeholder = getSecretInputDefaultPlaceholder(input);
  });
  input.addEventListener('blur', () => {
    if (input.dataset.configured === 'true' && input.dataset.dirty !== 'true' && !input.value) {
      input.placeholder = SECRET_CONFIGURED_PLACEHOLDER;
    }
  });
}
const refreshActiveServerSubtabs = new Set(['server-vms', 'server-commands']);

// ── Tab navigation ────────────────────────────────────────────────
const spokeNavTabs = document.querySelectorAll('#tab-nav .spoke-only .tab');
spokeNavTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    spokeNavTabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    spokeRoot?.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));

    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeSpokeTab = tab.dataset.tab;
    spokeRoot?.querySelector(`#tab-${CSS.escape(tab.dataset.tab)}`)?.classList.remove('hidden');
    if (tab.dataset.tab === 'setup') activateSetupSubtab('setup-github');
    if (tab.dataset.tab === 'server') { activateServerSubtab('server-vms'); loadProxmoxApproved().catch(() => {}); }
    if (tab.dataset.tab === 'api-server') { renderServiceStatus().catch(() => {}); }
    if (tab.dataset.tab === 'central') { activateCentralSubtab('central-sites-panel'); }
    if (tab.dataset.tab === 'simulations') { activateSimTopTab('simtop-checks'); }
    resetTabDrilldowns(tab.dataset.tab);
    updateRefreshPausedState();
  });
});

// Reset any open drill-down panels back to the overview when the top-level
// tab is clicked — so you never land in a stale detail view.
function resetTabDrilldowns(tabName) {
  if (tabName === 'central' || tabName === 'simulations') {
    // Central site detail
    if (typeof closeSiteDetail === 'function') closeSiteDetail();
    // Sim check detail
    if (simDetail) simDetail.classList.add('hidden');
    if (simOverview) simOverview.classList.remove('hidden');
    // Sim clients panel
    if (simClientsPanel) simClientsPanel.classList.add('hidden');
    // HW alert detail
    if (hwDetailPanel) hwDetailPanel.classList.add('hidden');
    const hwOverview = document.getElementById('hw-overview');
    if (hwOverview) hwOverview.classList.remove('hidden');
    // Client count detail
    if (ccDetailPanel) ccDetailPanel.classList.add('hidden');
    const ccOverview = document.getElementById('cc-overview');
    if (ccOverview) ccOverview.classList.remove('hidden');
  }
}

function hydrateSetupSubtab(subtabId) {
  if (!subtabId) return;

  if (subtabId === 'setup-troubleshoot') {
    loadSystemHealth();
    return;
  }

  if (subtabId === 'setup-tls') {
    loadSpokeAcmeSettings().catch(() => {});
    return;
  }

  loadSettings().catch(() => {});

  if (subtabId === 'setup-relay') {
    requestJson('/api/relay/status').then(setRelayStatus).catch(() => {});
    return;
  }

  if (subtabId === 'setup-central') {
    loadCentralStatus().catch(() => {});
  }
}

function activateSetupSubtab(subtabId = 'setup-github') {
  setupSubtabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subtabId);
  });
  setupSubpanels.forEach((panel) => {
    const isActive = panel.id === subtabId;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('hidden', !isActive);
  });
  hydrateSetupSubtab(subtabId);
}

function activateConfigSubtab(subtabId = 'config-general') {
  document.querySelectorAll('.config-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === subtabId);
  });
  document.querySelectorAll('.config-subpanel').forEach((panel) => {
    const isActive = panel.id === subtabId;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('hidden', !isActive);
  });
}

function activateServerSubtab(subtabId = 'server-vms') {
  activeServerSubtab = subtabId;
  document.querySelectorAll('.server-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === subtabId);
  });
  ['server-node', 'server-vms', 'server-usb', 'server-commands'].forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    const isActive = id === subtabId;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('hidden', !isActive);
  });
  updateRefreshPausedState();
}

// ── Agent Log Viewer ─────────────────────────────────────────────────────
const agentLogViewer = document.getElementById('agent-log-viewer');
const agentLogFilter = document.getElementById('agent-log-filter');
const agentLogClear  = document.getElementById('agent-log-clear');
let agentLogLines = [];   // full buffer
let agentLogAutoScroll = true;

function classifyLogLine(line) {
  const t = line.toLowerCase();
  if (/error|failed|fail|exception|critical/.test(t)) return 'log-err';
  if (/warning|warn/.test(t)) return 'log-warn';
  if (/completed|success|recloned|approved|started/.test(t)) return 'log-ok';
  return '';
}

function renderAgentLog() {
  if (!agentLogViewer) return;
  const filter = agentLogFilter ? agentLogFilter.value.toLowerCase() : '';
  const filtered = filter ? agentLogLines.filter((l) => l.toLowerCase().includes(filter)) : agentLogLines;
  agentLogViewer.textContent = '';
  for (const line of filtered) {
    const el = document.createElement('div');
    el.className = `agent-log-line ${classifyLogLine(line)}`;
    el.textContent = line;
    agentLogViewer.appendChild(el);
  }
  if (agentLogAutoScroll) agentLogViewer.scrollTop = agentLogViewer.scrollHeight;
}

async function loadAgentLogs() {
  try {
    const data = await requestJson('/api/proxmox/logs');
    agentLogLines = data.lines || [];
    if (!agentLogLines.length) {
      // Check agent version to give a useful hint
      const agentVer = document.getElementById('server-agent-version');
      const ver = agentVer ? agentVer.textContent.trim() : '';
      const hint = ver && parseFloat(ver) < 0.99
        ? `Agent v${ver} detected — update to v0.99+ to enable log streaming (click ⬆ Update Agent)`
        : 'No logs yet — logs arrive on the next agent telemetry poll (≤60s after activity).';
      if (agentLogViewer) {
        agentLogViewer.textContent = '';
        const el = document.createElement('div');
        el.className = 'agent-log-line log-warn';
        el.textContent = hint;
        agentLogViewer.appendChild(el);
      }
      return;
    }
    renderAgentLog();
  } catch (e) {
    if (agentLogViewer) {
      agentLogViewer.textContent = `Failed to load logs: ${e.message}`;
    }
  }
}

function appendAgentLogLines(lines) {
  agentLogLines.push(...lines);
  if (agentLogLines.length > 500) agentLogLines.splice(0, agentLogLines.length - 500);
  // Only re-render if Logs tab is visible
  const panel = document.getElementById('server-logs');
  if (panel && !panel.classList.contains('hidden')) renderAgentLog();
}

if (agentLogFilter) agentLogFilter.addEventListener('input', renderAgentLog);
if (agentLogViewer) {
  agentLogViewer.addEventListener('scroll', () => {
    const atBottom = agentLogViewer.scrollHeight - agentLogViewer.scrollTop - agentLogViewer.clientHeight < 40;
    agentLogAutoScroll = atBottom;
  });
}
if (agentLogClear) {
  agentLogClear.addEventListener('click', async () => {
    await fetch('/api/proxmox/logs/clear', { method: 'POST' }).catch(() => {});
    agentLogLines = [];
    renderAgentLog();
  });
}

// ── Central sub-tabs ──────────────────────────────────────────
const centralSubPanels = ['central-sites-panel', 'central-alerts-panel', 'central-clients-panel', 'central-history-panel'];

function activateCentralSubtab(subtabId = 'central-sites-panel') {
  document.querySelectorAll('.central-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === subtabId);
  });
  centralSubPanels.forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.toggle('active', id === subtabId);
    panel.classList.toggle('hidden', id !== subtabId);
  });
  if (subtabId === 'central-alerts-panel') renderCentralAllAlerts();
  if (subtabId === 'central-clients-panel') renderCentralClients();
  if (subtabId === 'central-history-panel') renderCentralAllHistory();
}

document.querySelectorAll('.central-subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateCentralSubtab(btn.dataset.subtab));
});


let activeSimTab = 'failing';

function activateSimSubtab(tabId) {
  activeSimTab = tabId;
  document.querySelectorAll('.sim-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.simtab === tabId);
  });
  renderChecksList();
}

/** Classify a check row into failing / functional / warning based on status + staleness */
function getEffectiveTabForItem(item) {
  const now = Date.now() / 1000;
  let cls = item.dotCls;
  if (item.ts) {
    const ageMin = (now - item.ts) / 60;
    if (ageMin > 60) cls = 'dot-err';       // stale >1 h → fail
    else if (ageMin > 15) cls = 'dot-warn'; // stale 15–60 m → warning
  }
  if (cls === 'dot-err') return 'failing';
  if (cls === 'dot-ok') return 'functional';
  return 'warning'; // dot-warn, dot-unknown
}

// ── Repo sync status ──────────────────────────────────────────────
let lastKnownSyncTime = null;   // preserve across "Syncing…" broadcasts that omit last_sync

const simDisabledState = { global: false, local: false };

function renderSimDisabledBanner() {
  const banner = document.getElementById('gkill-indicator');
  if (!banner) return;
  const { global: g, local: l } = simDisabledState;
  if (!g && !l) {
    banner.style.display = 'none';
    document.title = 'Client Simulator';
    return;
  }
  const scope = g && l ? 'Globally & Locally' : g ? 'Globally' : 'Locally';
  const tip = g && l
    ? 'Kill switch active in both the global repo and local config'
    : g ? 'Global kill switch ON in solutions-hpe/main — all islands affected'
        : 'Local kill switch ON in simulation.conf — this spoke only';
  banner.textContent = `🛑 Simulation Disabled — ${scope}`;
  banner.title = tip;
  banner.style.display = '';
  document.title = `🛑 Simulation Disabled (${scope}) — Client Simulator`;
}

function applyGkillSwitch(value) {
  simDisabledState.global = value === 'on';
  renderSimDisabledBanner();
}

function setRelayStatus(data = {}) {
  const stateText = document.getElementById('relay-state-text');
  const lastTime = document.getElementById('relay-last-time');
  const lastError = document.getElementById('relay-last-error');
  const dot = document.getElementById('relay-indicator');
  const spokeIdDisplay = document.getElementById('relay-spoke-id-display');
  const apikeyStatus = document.getElementById('relay-apikey-status');

  const isNameConflict = data.registration_status === 'name_conflict' || (data.error || '').startsWith('name_conflict:');
  if (stateText) stateText.textContent = !data.enabled ? 'Disabled' : data.connected ? '✓ Connected' : isNameConflict ? '✗ Name conflict' : data.error ? '✗ Error' : data.registration_status === 'pending' ? 'Pending approval' : 'Enabled';
  if (lastTime) lastTime.textContent = data.last_sync ? new Date(data.last_sync * 1000).toLocaleTimeString() : '—';
  if (lastError) lastError.textContent = data.error || '—';
  if (spokeIdDisplay) spokeIdDisplay.textContent = data.spoke_id || data.spoke_id || '—';
  if (apikeyStatus) apikeyStatus.textContent = data.api_key_configured ? '✓ Received' : 'Pending approval';

  if (dot) {
    dot.className = data.connected ? 'ind-dot green' : 'ind-dot red';
    dot.title = data.connected
      ? `Hub connected — last sync: ${new Date((data.last_sync || 0) * 1000).toLocaleTimeString()}`
      : `Hub disconnected: ${data.error || 'unknown'}`;
  }
}

function setRepoStatus(synced, error, lastSync, repoVersion) {
  if (lastSync) lastKnownSyncTime = lastSync;   // only update when we have a real value

  repoDot.className = `status-dot ${synced ? 'online' : error ? 'offline' : 'warning'}`;
  repoText.textContent = error ? 'Error' : synced ? 'Synced' : 'Syncing…';

  // Build tooltip: show error or last-synced timestamp
  let tip = 'GitHub Sync Status';
  if (error) {
    tip = lastKnownSyncTime
      ? `Error: ${error} — last successful sync: ${new Date(lastKnownSyncTime * 1000).toLocaleTimeString()}`
      : `Error: ${error}`;
  } else if (lastKnownSyncTime) {
    const d = new Date(lastKnownSyncTime * 1000);
    tip = `Last synced: ${d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})} on ${d.toLocaleDateString()}`;
  }
  const repoStatus = document.getElementById('repo-status');
  if (repoStatus) repoStatus.title = tip;
  repoText.title = '';

  // Update setup tab status panel
  const syncState   = document.getElementById('setup-sync-state');
  const syncError   = document.getElementById('setup-sync-error');
  const syncTime    = document.getElementById('setup-sync-time');
  const syncVersion = document.getElementById('setup-repo-version');
  if (syncState)   syncState.textContent   = synced ? '✓ Synced' : error ? '✗ Failed' : 'Syncing…';
  if (syncError)   syncError.textContent   = error || '—';
  if (syncVersion) syncVersion.textContent = repoVersion || '—';
  if (syncTime && lastKnownSyncTime) {
    const d = new Date(lastKnownSyncTime * 1000);
    syncTime.textContent = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  }
}

// ── Setup tab — settings form ─────────────────────────────────────
const branchInput = document.getElementById('branch-input');
const githubTokenInput = document.getElementById('github-token-input');
const githubTokenStatus = document.getElementById('github-token-status');
const syncNowBtn = document.getElementById('sync-now-btn');
const syncNowMsg = document.getElementById('sync-now-message');
const settingsMsg = document.getElementById('settings-message');
const githubClearConfigBtn = document.getElementById('github-clear-config-btn');
const checkUpdateBtn = document.getElementById('check-update-btn');
const updateMsg = document.getElementById('update-message');
const versionCurrent = document.getElementById('version-current');
const versionAvailable = document.getElementById('version-available');
const versionLastChecked = document.getElementById('version-last-checked');
const setupActiveBranch = document.getElementById('setup-active-branch');
const repoUrlInput = document.getElementById('repo-url-input');
const centralTabButton = document.querySelector('#tab-nav .spoke-only .tab[data-tab="central"]');
const configTabButton = document.querySelector('#tab-nav .spoke-only .tab[data-tab="config"]');
const simTabButton = document.querySelector('#tab-nav .spoke-only .tab[data-tab="simulations"]');
const setupSubtabButtons = spokeRoot?.querySelectorAll('.setup-subtab:not(.server-subtab):not(.sim-subtab):not(.central-subtab):not(.simtop-subtab)') || [];
const setupSubpanels = spokeRoot?.querySelectorAll('.setup-subpanel:not(#server-vms):not(#server-usb):not(#server-node):not(#server-commands)') || [];
const centralOverview = document.getElementById('central-overview');
const centralSitesGrid = document.getElementById('central-sites-table');
const centralEmpty = document.getElementById('central-empty');
const centralRefreshBtn = document.getElementById('central-refresh-btn');
const centralLastSynced = document.getElementById('central-last-synced');
const centralTokenDot = document.getElementById('central-token-dot');
const centralTokenText = document.getElementById('central-token-text');
const centralSiteDetail = document.getElementById('central-site-detail');
const centralDetailBack = document.getElementById('central-detail-back');
const centralDetailTitle = document.getElementById('central-detail-title');
const centralDetailSub = document.getElementById('central-detail-sub');
const centralSiteClients = document.getElementById('central-site-clients');
const centralSiteChecks = document.getElementById('central-site-checks');
const centralSiteHistory = document.getElementById('central-site-history');
const centralSiteAlerts = document.getElementById('central-site-alerts');
const centralSiteAlertsCount = document.getElementById('central-site-alerts-count');
const centralClassicUrlInput = document.getElementById('central-classic-url');
const centralClassicUsernameInput = document.getElementById('central-classic-username');
const centralClassicPasswordInput = document.getElementById('central-classic-password');
const centralClassicPasswordStatus = document.getElementById('central-classic-password-status');
const centralCentralUrlInput = document.getElementById('central-central-url');
const centralClientIdInput = document.getElementById('central-client-id');
const centralClientSecretInput = document.getElementById('central-client-secret');
const centralCustomerIdInput = document.getElementById('central-customer-id');
const centralTestBtn = document.getElementById('central-test-btn');
const centralSaveBtn = document.getElementById('central-save-btn');
const centralClearBtn = document.getElementById('central-clear-btn');
const centralConfigMsg = document.getElementById('central-config-msg');
const centralClassicFields = document.getElementById('central-classic-fields');
const centralNewFields = document.getElementById('central-new-fields');
const relayEnabledSelect = document.getElementById('relay-enabled-select');
const relaySpokeName = document.getElementById('relay-spoke-name-input');
const relayServerUrlInput = document.getElementById('relay-server-url-input');
const relayTenantIdInput = document.getElementById('relay-tenant-id-input');
const relayMsg = document.getElementById('relay-message');
const relayClearConfigBtn = document.getElementById('relay-clear-config-btn');
document.querySelectorAll('input[data-secret-field="true"]').forEach(bindSecretInput);

// Notifications + sync interval
const syncIntervalInput  = document.getElementById('sync-interval-input');
const syncIntervalMsg    = document.getElementById('sync-interval-msg');
const emailEnabledToggle = document.getElementById('email-enabled-toggle');
const smtpHost           = document.getElementById('smtp-host');
const smtpPort           = document.getElementById('smtp-port');
const smtpUser           = document.getElementById('smtp-user');
const smtpPassword       = document.getElementById('smtp-password');
const smtpFrom           = document.getElementById('smtp-from');
const smtpTo             = document.getElementById('smtp-to');
const testEmailBtn       = document.getElementById('test-email-btn');
const emailNotifMsg      = document.getElementById('email-notif-msg');
const teamsEnabledToggle = document.getElementById('teams-enabled-toggle');
const teamsWebhookUrl    = document.getElementById('teams-webhook-url');
const testTeamsBtn       = document.getElementById('test-teams-btn');
const teamsNotifMsg      = document.getElementById('teams-notif-msg');
const usbAutoProvisionInput = document.getElementById('usb-auto-provision');
const usbMissingTimeoutInput = document.getElementById('usb-missing-timeout');
const vmImage1TemplateIdInput = document.getElementById('vm-image-1-template-id');
const vmImage2TemplateIdInput = document.getElementById('vm-image-2-template-id');
const vmImage1PctInput = document.getElementById('vm-image-1-pct');
const usbVidPidTbody = document.getElementById('usb-vidpid-tbody');
const newVidPidInput = document.getElementById('new-vidpid');
const newVidPidTypeInput = document.getElementById('new-vidpid-type');
const newVidPidLabelInput = document.getElementById('new-vidpid-label');
const usbIgnoredList = document.getElementById('usb-ignored-list');
const ignoredHostnamesList = document.getElementById('ignored-hostnames-list');
const newIgnoredHostnameInput = document.getElementById('new-ignored-hostname');
const addIgnoredHostnameBtn = document.getElementById('add-ignored-hostname-btn');
const vmSilentTimeoutInput = document.getElementById('vm-silent-timeout');
const recloneScheduleEnabledInput = document.getElementById('reclone-schedule-enabled');
const recloneScheduleDayInput = document.getElementById('reclone-schedule-day');
const recloneScheduleTimeInput = document.getElementById('reclone-schedule-time');
const recloneConcurrencyInput = document.getElementById('reclone-concurrency');
const l1VlanStartInput = document.getElementById('l1-vlan-start');
const l1VlanEndInput = document.getElementById('l1-vlan-end');
const l1VlanMsg = document.getElementById('l1-vlan-message');
const usbSettingsMsg = document.getElementById('usb-settings-message');
const vmMaintenanceMsg = document.getElementById('vm-maintenance-message');
const addVidPidBtn = document.getElementById('add-vidpid-btn');
const usbSummaryPanel = document.getElementById('usb-summary-panel');
const usbSummaryTbody = document.getElementById('usb-summary-tbody');
const unknownUsbSection = document.getElementById('unknown-usb-section');
const unknownUsbTbody = document.getElementById('unknown-usb-tbody');
const recloneStatusBadge = document.getElementById('reclone-status-badge');
const recloneProgressWrap = document.getElementById('reclone-progress-wrap');
const recloneProgressBar = document.getElementById('reclone-progress-bar');
const recloneProgressLabel = document.getElementById('reclone-progress-label');
const recloneVmLog = document.getElementById('reclone-vm-log');
const recloneLastRun = document.getElementById('reclone-last-run');
const recloneNowBtn = document.getElementById('reclone-now-btn');


// Event delegation for unknown USB action buttons — attached once to the static tbody element
if (unknownUsbTbody) {
  unknownUsbTbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const vidpid = btn.dataset.vidpid;
    const name = btn.dataset.name;
    if (action === 'certify') addUnknownToCertified(vidpid, name);
    else if (action === 'ignore') ignoreUsbDevice(vidpid);
  });
}

function defaultCentralApiSettings() {
  return {
    mode: 'classic',
    classic: { url: '', username: '', password_configured: false },
    central: { url: '', client_id: '', customer_id: '', client_secret_configured: false }
  };
}

function normalizeCentralApiSettings(source = {}, fallback = null) {
  const defaults = defaultCentralApiSettings();
  const fallbackConfig = fallback || defaults;
  const raw = source.central_api || {};
  const legacy = source.central_config || {};
  const rawClassic = raw.classic || {};
  const rawCentral = raw.central || {};
  const legacyIsCentral = legacy.api_version === 'new_central';
  const mode = raw.mode || fallbackConfig.mode || (legacyIsCentral ? 'central' : 'classic');
  return {
    mode: mode === 'central' ? 'central' : 'classic',
    classic: {
      url: rawClassic.url ?? fallbackConfig.classic?.url ?? defaults.classic.url,
      username: rawClassic.username ?? fallbackConfig.classic?.username ?? defaults.classic.username,
      password_configured: rawClassic.password_configured ?? fallbackConfig.classic?.password_configured ?? defaults.classic.password_configured,
    },
    central: {
      url: rawCentral.url ?? (legacyIsCentral ? (legacy.cluster_url || '') : (fallbackConfig.central?.url ?? defaults.central.url)),
      client_id: rawCentral.client_id ?? (legacyIsCentral ? (legacy.client_id || '') : (fallbackConfig.central?.client_id ?? defaults.central.client_id)),
      customer_id: rawCentral.customer_id ?? (legacyIsCentral ? (legacy.customer_id || '') : (fallbackConfig.central?.customer_id ?? defaults.central.customer_id)),
      client_secret_configured: rawCentral.client_secret_configured ?? (legacyIsCentral ? Boolean(legacy.client_secret_configured) : (fallbackConfig.central?.client_secret_configured ?? defaults.central.client_secret_configured)),
    }
  };
}

function getCentralApiMode() {
  const active = document.querySelector('#central-api-mode-toggle button.active');
  return active ? active.dataset.mode : 'classic';
}

function applyCentralModeUI(mode) {
  document.querySelectorAll('#central-api-mode-toggle button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const isCentral = mode === 'central';
  if (centralClassicFields) centralClassicFields.classList.toggle('hidden', isCentral);
  if (centralNewFields) centralNewFields.classList.toggle('hidden', !isCentral);
}

document.querySelectorAll('#central-api-mode-toggle button').forEach((btn) => {
  btn.addEventListener('click', () => applyCentralModeUI(btn.dataset.mode));
});
const siteMappingsBody = document.getElementById('site-mappings-body');
const addMappingBtn = document.getElementById('add-mapping-btn');
const centralMappingsMsg = document.getElementById('central-mappings-msg');
const loadSitesBtn = document.getElementById('load-sites-btn');
const sitesLoadStatus = document.getElementById('sites-load-status');
const selectedChecksPreview = document.getElementById('selected-checks-preview');
const loadChecksBtn = document.getElementById('central-load-checks-btn');
const availableChecksContainer = document.getElementById('available-checks-container');
const centralChecksMsg = document.getElementById('central-checks-msg');
const hwLoadAlertsBtn = document.getElementById('hw-load-alerts-btn');
const hwChecksContainer = document.getElementById('hw-checks-container');
const hwChecksMsg = document.getElementById('hw-checks-msg');
const hwChecksPreview = document.getElementById('hw-checks-preview');
const configSimulationForm = document.getElementById('config-simulation-form');
const configAddressesForm  = document.getElementById('config-addresses-form');
const configSimulationMsg = document.getElementById('config-simulation-message');
const configBucketsContainer = document.getElementById('config-buckets-container');
const configBucketsMsg = document.getElementById('config-buckets-message');

function mergeSettings(next = {}) {
  const mergedCentralApi = normalizeCentralApiSettings(next, currentSettings.central_api);
  const merged = {
    repo_url: next.repo_url ?? currentSettings.repo_url ?? repoUrlInput?.value ?? '',
    repo_branch: next.repo_branch ?? currentSettings.repo_branch ?? '',
    github_token_configured: next.github_token_configured ?? currentSettings.github_token_configured ?? false,
    central_api: mergedCentralApi,
    site_mappings: next.site_mappings ?? currentSettings.site_mappings ?? {},
    monitored_checks: Array.isArray(next.monitored_checks)
      ? next.monitored_checks
      : (currentSettings.monitored_checks || []),
    hardware_checks: Array.isArray(next.hardware_checks)
      ? next.hardware_checks
      : (currentSettings.hardware_checks || []),
    relay_enabled: next.relay_enabled ?? currentSettings.relay_enabled ?? 'off',
    relay_server_url: next.relay_server_url ?? currentSettings.relay_server_url ?? '',
    relay_spoke_name: next.relay_spoke_name ?? currentSettings.relay_spoke_name ?? '',
    relay_tenant_hint: next.relay_tenant_hint ?? next.relay_tenant_id ?? currentSettings.relay_tenant_hint ?? currentSettings.relay_tenant_id ?? '',
    relay_tenant_id: next.relay_tenant_id ?? next.relay_tenant_hint ?? currentSettings.relay_tenant_id ?? currentSettings.relay_tenant_hint ?? '',
    relay_spoke_id: next.relay_spoke_id ?? currentSettings.relay_spoke_id ?? '',
    relay_poll_interval: next.relay_poll_interval ?? currentSettings.relay_poll_interval ?? 60,
    relay_api_key_configured: next.relay_api_key_configured ?? currentSettings.relay_api_key_configured ?? false,
    notifications: {
      email_enabled: next.notifications?.email_enabled ?? currentSettings.notifications?.email_enabled ?? false,
      smtp_host: next.notifications?.smtp_host ?? currentSettings.notifications?.smtp_host ?? '',
      smtp_port: next.notifications?.smtp_port ?? currentSettings.notifications?.smtp_port ?? 587,
      smtp_user: next.notifications?.smtp_user ?? currentSettings.notifications?.smtp_user ?? '',
      smtp_from: next.notifications?.smtp_from ?? currentSettings.notifications?.smtp_from ?? '',
      smtp_to: next.notifications?.smtp_to ?? currentSettings.notifications?.smtp_to ?? [],
      smtp_password_configured: next.notifications?.smtp_password_configured ?? currentSettings.notifications?.smtp_password_configured ?? false,
      teams_enabled: next.notifications?.teams_enabled ?? currentSettings.notifications?.teams_enabled ?? false,
      teams_webhook_url_configured: next.notifications?.teams_webhook_url_configured ?? currentSettings.notifications?.teams_webhook_url_configured ?? false,
    },
    repo_sync_interval: next.repo_sync_interval ?? currentSettings.repo_sync_interval ?? 300,
    usb_vidpids: next.usb_vidpids ?? currentSettings.usb_vidpids ?? '[]',
    usb_missing_timeout: next.usb_missing_timeout ?? currentSettings.usb_missing_timeout ?? '60',
    vm_image_1_template_id: next.vm_image_1_template_id ?? currentSettings.vm_image_1_template_id ?? '100',
    vm_image_2_template_id: next.vm_image_2_template_id ?? currentSettings.vm_image_2_template_id ?? '200',
    vm_image_1_pct: next.vm_image_1_pct ?? currentSettings.vm_image_1_pct ?? '50',
    usb_auto_provision: next.usb_auto_provision ?? currentSettings.usb_auto_provision ?? 'off',
    usb_ignored_vidpids: next.usb_ignored_vidpids ?? currentSettings.usb_ignored_vidpids ?? '[]',
    ignored_hostnames: next.ignored_hostnames ?? currentSettings.ignored_hostnames ?? '["sim-rpi-0000"]',
    vm_silent_timeout: next.vm_silent_timeout ?? currentSettings.vm_silent_timeout ?? '24',
    reclone_schedule_enabled: next.reclone_schedule_enabled ?? currentSettings.reclone_schedule_enabled ?? 'off',
    reclone_schedule_cron: next.reclone_schedule_cron ?? currentSettings.reclone_schedule_cron ?? 'sunday 02:00',
    reclone_concurrency: next.reclone_concurrency ?? currentSettings.reclone_concurrency ?? '1',
    l1_vlan_start: next.l1_vlan_start ?? currentSettings.l1_vlan_start ?? '100',
    l1_vlan_end: next.l1_vlan_end ?? currentSettings.l1_vlan_end ?? '199'
  };
  currentSettings = merged;
  return merged;
}

function setInputValueIfIdle(input, value) {
  if (input && !input.matches(':focus')) input.value = value || '';
}

function showInlineMessage(element, text, isError, timeout = 5000) {
  if (!element) return;
  clearTimeout(element._timer);
  if (!text) {
    element.textContent = '';
    element.className = 'settings-message hidden';
    return;
  }
  element.textContent = text;
  element.className = `settings-message ${isError ? 'error' : 'success'}`;
  if (timeout > 0) {
    element._timer = setTimeout(() => {
      element.className = 'settings-message hidden';
    }, timeout);
  }
}

function showNotification(message, level = 'info') {
  let notice = document.getElementById('app-notification');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'app-notification';
    document.body.appendChild(notice);
  }
  clearTimeout(notice._timer);
  notice.textContent = message;
  notice.className = `app-notification settings-message ${level === 'error' ? 'error' : 'success'}`;
  notice._timer = setTimeout(() => {
    notice.className = 'app-notification settings-message hidden';
  }, 4000);
}

function formatRelativeTime(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Format a byte value into the most readable unit (MB / GB / TB)
function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 4) return (b / 1024 ** 4).toFixed(1) + ' TB';
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(1) + ' GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(0) + ' MB';
  return b + ' B';
}

// Format a KB value into the most readable unit
function fmtSizeKB(kb) { return fmtSize(Number(kb) * 1024); }

function normalizeCommandAction(action) {
  return String(action || '').trim().replace(/-/g, '_');
}

function sendProxmoxCommand(action, vmidOrArgs, extraArgs = {}) {
  let args = {};
  if (typeof vmidOrArgs === 'object' && vmidOrArgs !== null) {
    args = { ...vmidOrArgs };
  } else if (vmidOrArgs != null && vmidOrArgs !== '') {
    args = { vmid: parseInt(vmidOrArgs, 10), ...extraArgs };
  } else {
    args = { ...extraArgs };
  }
  return requestJson('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'proxmox', action: normalizeCommandAction(action), args }),
  });
}

function describeProxmoxGuest(entry = {}) {
  const vmid = entry.vmid ?? '—';
  const vmType = String(entry.vmType || entry.vm_type || 'qemu').toLowerCase();
  const kind = vmType === 'lxc' ? 'container' : 'VM';
  const name = String(entry.name || '').trim();
  return name ? `${kind} ${name} (${vmid})` : `${kind} ${vmid}`;
}

function confirmVmDelete(entries) {
  const list = entries.slice(0, 8).map((entry) => `• ${describeProxmoxGuest(entry)}`).join('\n');
  const remainder = entries.length > 8 ? `\n• …and ${entries.length - 8} more` : '';
  const lead = entries.length === 1
    ? `Delete ${describeProxmoxGuest(entries[0])}?`
    : `Delete ${entries.length} selected guests?`;
  return confirm(`${lead}\n\n${list}${remainder}\n\nThis permanently destroys the guest in Proxmox and cannot be undone.`);
}

function deleteProxmoxVm(vmid) {
  return requestJson(`/api/proxmox/vms/${encodeURIComponent(vmid)}`, { method: 'DELETE' });
}

function scheduleProxmoxRefresh(delayMs = 4000) {
  window.setTimeout(() => {
    requestJson('/api/proxmox/status').then(renderServerTab).catch(() => {});
  }, delayMs);
}

function normalizeProxmoxHostname(hostname) {
  return String(hostname || '').trim().replace(/\.+$/, '').toLowerCase();
}

function proxmoxHostnameMatches(left, right) {
  const a = normalizeProxmoxHostname(left);
  const b = normalizeProxmoxHostname(right);
  if (!a || !b) return false;
  return a === b || a.split('.', 1)[0] === b.split('.', 1)[0];
}

function syncAgentUpdateButtonState(data = latestProxmoxData) {
  const btn = document.getElementById('agent-update-btn');
  if (!btn || btn.dataset.busy === 'true') return;
  const host = String(data?.node?.hostname || '').trim();
  const approved = Array.isArray(data?.approved_proxmox) ? data.approved_proxmox : [];
  const ready = Boolean(host) && approved.some((entry) => proxmoxHostnameMatches(entry?.hostname, host));
  btn.disabled = !ready;
  btn.title = ready
    ? 'Reinstall the Proxmox host agent from GitHub and restart it'
    : 'Approve and connect the Proxmox host before updating the agent';
}

async function triggerAgentUpdate() {
  const btn = document.getElementById('agent-update-btn');
  if (btn) {
    btn.disabled = true;
    btn.dataset.busy = 'true';
    btn.textContent = '⏳ Updating…';
  }
  try {
    const result = await requestJson('/api/proxmox/update-agent', { method: 'POST' });
    if (btn) { btn.textContent = '✓ Queued'; }
    showToast(`Queued agent update for ${result.target || 'Proxmox host'} (${result.branch || 'current branch'})`, 'info');
  } catch (e) {
    showToast('Failed to queue agent update: ' + e.message, 'error');
    if (btn) {
      btn.textContent = '⬆ Update Agent';
      delete btn.dataset.busy;
    }
    syncAgentUpdateButtonState();
    return;
  }
  setTimeout(() => {
    if (btn) {
      btn.textContent = '⬆ Update Agent';
      delete btn.dataset.busy;
    }
    syncAgentUpdateButtonState();
  }, 5000);
}

function handleUpdateAllProgress(state) {
  const btn = document.getElementById('update-all-btn');
  if (!btn) return;
  if (!state.running && state.phase === 'idle') {
    btn.textContent = '⬆ Update All';
    btn.disabled = false;
    return;
  }
  if (state.phase === 'agents') {
    btn.textContent = `⏳ Agents ${state.completed_agents}/${state.total_agents}…`;
    btn.disabled = true;
  } else if (state.phase === 'webui') {
    btn.textContent = '⏳ Updating Server…';
    btn.disabled = true;
  } else if (state.phase === 'done') {
    btn.textContent = '✓ Done';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = '⬆ Update All';
      btn.disabled = false;
    }, 5000);
  } else if (state.phase === 'failed') {
    showToast('Update All failed: ' + (state.error || 'unknown error'), 'error');
    btn.textContent = '⬆ Update All';
    btn.disabled = false;
  }
}

async function triggerUpdateAll() {
  const btn = document.getElementById('update-all-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Starting…';
  }
  try {
    const res = await fetch('/api/update-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  } catch (e) {
    showToast('Failed to start Update All: ' + e.message, 'error');
    if (btn) {
      btn.textContent = '⬆ Update All';
      btn.disabled = false;
    }
  }
}

function renderServerTab(data) {
  latestProxmoxData = data || latestProxmoxData;
  if (data?.reclone_state) latestRecloneState = data.reclone_state;
  renderProxmoxApproveState(
    Array.isArray(latestProxmoxData.pending_proxmox) ? latestProxmoxData.pending_proxmox : [],
    Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : []
  );

  const tabBtn = document.getElementById('tab-server-btn');
  const tabPanel = document.getElementById('tab-server');
  if (tabBtn) tabBtn.style.display = '';
  if (tabPanel) tabPanel.style.display = '';

  const updateBtn = document.getElementById('agent-update-btn');
  if (updateBtn && !updateBtn._bound) {
    updateBtn.addEventListener('click', triggerAgentUpdate);
    updateBtn._bound = true;
  }
  syncAgentUpdateButtonState(latestProxmoxData);

  const node = latestProxmoxData.node || {};
  const setEl = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setEl('server-node-name', node.hostname || 'Proxmox');
  updateCmdTargetDropdown();
  if (Array.isArray(window._lastCommands)) renderCommandTable(window._lastCommands);
  setEl('server-cpu', node.cpu_percent != null && !Number.isNaN(Number(node.cpu_percent)) ? Number(node.cpu_percent).toFixed(1) : '—');
  const ramUsed  = node.mem_used_kb  ? fmtSizeKB(node.mem_used_kb)  : '—';
  const ramTotal = node.mem_total_kb ? fmtSizeKB(node.mem_total_kb) : '—';
  setEl('server-ram', `${ramUsed} / ${ramTotal}`);
  setEl('server-last-seen', formatRelativeTime(latestProxmoxData.last_seen));

  const agentVerPill = document.getElementById('server-agent-version-pill');
  const agentVer = latestProxmoxData.agent_version;
  if (agentVerPill) {
    agentVerPill.style.display = agentVer ? '' : 'none';
    setEl('server-agent-version', agentVer || '—');
  }

  const storagePills = document.getElementById('server-storage-pills');
  if (storagePills && Array.isArray(node.storage)) {
    const networkTypes = new Set(['nfs', 'cifs', 'glusterfs', 'cephfs', 'rbd', 'iscsi', 'pbs']);
    storagePills.innerHTML = node.storage.map((s) => {
      const icon = networkTypes.has(s.type) ? '🌐' : '🗄️';
      return `<span class="server-stat-pill" title="${s.name} (${s.type})">${icon} ${s.name}: ${fmtSizeKB(s.used)} / ${fmtSizeKB(s.total)}</span>`;
    }).join('');
  }

  renderUsbSummary(latestProxmoxData);
  renderRecloneStatus(latestRecloneState || latestProxmoxData.reclone_state || {});
  renderAutoProvisionStatus();

  const vms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
  const autoRecoveryPending = new Set(
    Array.isArray(latestProxmoxData.auto_recovery_pending) ? latestProxmoxData.auto_recovery_pending : []
  );

  const configuredTemplateIds = new Set([
    String(currentSettings.vm_image_1_template_id || '100'),
    String(currentSettings.vm_image_2_template_id || '200'),
  ]);

  // Categorise VMs: templates → sim clients (vmid > 90000, qemu) → containers (lxc) → other clients
  const templateVms = vms.filter((v) =>
    v.is_template === true || v.is_template === 'true' ||
    configuredTemplateIds.has(String(v.vmid))
  );
  const nonTemplateVms = vms.filter((v) => !templateVms.includes(v));
  const containerVms = nonTemplateVms.filter((v) => v.type === 'lxc');
  const qemuVms      = nonTemplateVms.filter((v) => v.type !== 'lxc');
  const simVms       = qemuVms.filter((v) => Number(v.vmid) > 90000);
  const otherVms     = qemuVms.filter((v) => !simVms.includes(v));

  // Update count badges
  const countSim = document.getElementById('vm-count-sim');
  const countOther = document.getElementById('vm-count-other');
  const countContainers = document.getElementById('vm-count-containers');
  const countTpl = document.getElementById('vm-count-tpl');
  if (countSim)        countSim.textContent        = simVms.length;
  if (countOther)      countOther.textContent      = otherVms.length;
  if (countContainers) countContainers.textContent = containerVms.length;
  if (countTpl)        countTpl.textContent        = templateVms.length;

  // Render templates (read-only)
  const templateTbody = document.getElementById('server-template-tbody');
  const emptyTpl = document.getElementById('server-empty-tpl');
  if (templateTbody) {
    templateTbody.innerHTML = templateVms.map((vm) => {
      const statusDot = vm.status === 'running' ? '🟢' : vm.status === 'paused' ? '🟡' : '⚫';
      const memUsed  = vm.mem    ? fmtSize(Number(vm.mem)    * 1024 * 1024) : '—';
      const memTotal = vm.maxmem ? fmtSize(Number(vm.maxmem) * 1024 * 1024) : '—';
      const cpu = vm.cpu != null && !Number.isNaN(Number(vm.cpu)) ? Number(vm.cpu).toFixed(1) + '%' : '—';
      return `<tr class="vm-row-template">
        <td>${vm.vmid}</td>
        <td>${escHtml(vm.name || '—')}</td>
        <td>${cpu}</td>
        <td>${memUsed} / ${memTotal}</td>
        <td>${statusDot} ${vm.status || 'unknown'}</td>
      </tr>`;
    }).join('');
    if (emptyTpl) emptyTpl.style.display = templateVms.length ? 'none' : '';
  }

  // Helper: render one category of regular VMs into a tbody
  const VM_ACTIONS = [
    { action: 'start_vm',    label: '▶',  title: 'Start'    },
    { action: 'stop_vm',     label: '■',  title: 'Stop'     },
    { action: 'reboot_vm',   label: '↺',  title: 'Reboot'   },
    { action: 'snapshot_vm', label: '📷', title: 'Snapshot' },
    { action: 'reclone_vm',  label: '⎘',  title: 'Reclone'  },
    { action: 'delete_vm',   label: '✕',  title: 'Delete'   },
  ];

  const recloningVmids = new Set();
  if (latestRecloneState?.status === 'running') {
    if (latestRecloneState.current_vm != null) recloningVmids.add(Number(latestRecloneState.current_vm));
    (latestRecloneState.log || []).forEach((e) => {
      if (e.status === 'queued' || e.status === 'in_progress') recloningVmids.add(Number(e.vmid));
    });
  }

  function _renderVmGroup(catKey, vmList) {
    const tbody  = document.getElementById(`server-vm-tbody-${catKey}`);
    const empty  = document.getElementById(`server-empty-${catKey}`);
    const thChk  = document.getElementById(`server-th-check-${catKey}`);
    if (!tbody) return;

    // Sort: stopped/paused first, then by VMID ascending
    const sorted = [...vmList].sort((a, b) => {
      const aRunning = a.status === 'running' ? 1 : 0;
      const bRunning = b.status === 'running' ? 1 : 0;
      if (aRunning !== bRunning) return aRunning - bRunning;
      return Number(a.vmid) - Number(b.vmid);
    });

    tbody.innerHTML = '';
    if (thChk) { thChk.disabled = sorted.length === 0; thChk.checked = false; }
    if (empty) empty.style.display = sorted.length ? 'none' : '';
    if (!sorted.length) return;

    sorted.forEach((vm) => {
      const isRecloning  = recloningVmids.has(Number(vm.vmid));
      const isWebui      = webuiVmid != null && Number(vm.vmid) === webuiVmid;
      const baseStatusText = `${vm.status === 'running' ? '🟢' : vm.status === 'paused' ? '🟡' : '⚫'} ${vm.status || 'unknown'}`;
      const statusLabel  = isRecloning ? '🟡 recloning…' : baseStatusText;
      const memUsed  = vm.mem    ? fmtSize(Number(vm.mem)    * 1024 * 1024) : '—';
      const memTotal = vm.maxmem ? fmtSize(Number(vm.maxmem) * 1024 * 1024) : '—';
      // Show CPU only for running VMs — stopped VMs always report 0 which is misleading
      const cpuVal = (vm.status === 'running') && vm.cpu != null && !Number.isNaN(Number(vm.cpu))
        ? Number(vm.cpu).toFixed(1) + '%' : '—';
      const recoveryBadge = autoRecoveryPending.has(Number(vm.vmid))
        ? ' <span class="badge badge-yellow" title="Auto-recovery reclone queued">↺ auto-recovery</span>'
        : '';
      const webuiBadge = isWebui
        ? ' <span class="badge badge-grey" title="This is the container running the dashboard — cannot be deleted">🔒 webui</span>'
        : '';

      const recloneSupported = vm.reclone_supported !== false && !isWebui;
      const recloneReason = isWebui
        ? 'Cannot reclone the container running this service'
        : (vm.reclone_reason || 'This guest cannot be recloned from the current configuration');
      const actionBtns = VM_ACTIONS.map((a) => {
        if (a.action === 'delete_vm' && isWebui) {
          return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" disabled title="Cannot delete the container running this service">${a.label}</button>`;
        }
        if (a.action === 'reclone_vm' && !recloneSupported) {
          return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" disabled title="${escHtml(recloneReason)}">${a.label}</button>`;
        }
        return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" title="${a.title}">${a.label}</button>`;
      }).join(' ');

      const tr = document.createElement('tr');
      tr.dataset.vmid = vm.vmid;
      tr.dataset.status = baseStatusText;
      tr.dataset.vmName = vm.name || '';
      tr.dataset.vmType = vm.type || 'qemu';
      tr.dataset.recloneSupported = recloneSupported ? 'true' : 'false';
      tr.dataset.recloneReason = recloneReason;
      tr.dataset.recloneSourceVmid = vm.reclone_source_vmid != null ? String(vm.reclone_source_vmid) : '';
      tr.innerHTML = `
        <td><input type="checkbox" class="vm-check" data-vmid="${vm.vmid}" data-vm-name="${escHtml(vm.name || '')}" data-vm-type="${vm.type || 'qemu'}" data-reclone-supported="${recloneSupported ? 'true' : 'false'}" data-reclone-reason="${escHtml(recloneReason)}" data-reclone-source-vmid="${vm.reclone_source_vmid != null ? escHtml(String(vm.reclone_source_vmid)) : ''}"${isWebui ? ' disabled' : ''}></td>
        <td class="vm-status-cell">${statusLabel}</td>
        <td>${vm.vmid}</td>
        <td>${escHtml(vm.name || '—')}${recoveryBadge}${webuiBadge}</td>
        <td>${cpuVal}</td>
        <td>${memUsed} / ${memTotal}</td>
        <td>${actionBtns}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.vm-action-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const entry = {
          vmid: btn.dataset.vmid,
          name: row?.dataset.vmName || '',
          vmType: row?.dataset.vmType || 'qemu',
        };
        try {
          if (btn.dataset.action === 'delete_vm') {
            if (catKey !== 'sim' && !confirmVmDelete([entry])) return;
            await deleteProxmoxVm(btn.dataset.vmid);
            showNotification(`Delete queued for ${describeProxmoxGuest(entry)}`, 'info');
            scheduleProxmoxRefresh();
            return;
          }
          await sendProxmoxCommand(btn.dataset.action, btn.dataset.vmid, {
            type: row?.dataset.vmType || 'qemu',
            source_vmid: row?.dataset.recloneSourceVmid ? parseInt(row.dataset.recloneSourceVmid, 10) : undefined,
          });
          showNotification(`${btn.title} command sent for ${describeProxmoxGuest(entry)}`, 'info');
        } catch (err) {
          showNotification(`Error: ${err.message}`, 'error');
        }
      });
    });

    // Per-category th-check handler
    if (thChk && !thChk._vmBound) {
      thChk._vmBound = true;
      thChk.addEventListener('change', (e) => {
        tbody.querySelectorAll('.vm-check:not([disabled])').forEach((cb) => { cb.checked = e.target.checked; });
        const sa = document.getElementById('server-select-all');
        if (sa) sa.checked = e.target.checked;
      });
    }
  }

  _renderVmGroup('sim', simVms);
  _renderVmGroup('other', otherVms);
  _renderVmGroup('containers', containerVms);

  // Reset select-all
  const selectAll = document.getElementById('server-select-all');
  if (selectAll) selectAll.checked = false;
}

function renderProxmoxApproveState(pending, approved) {
  const btn = document.getElementById('agent-approve-btn');
  const extraCard = document.getElementById('proxmox-extra-pending');
  const extraList = document.getElementById('proxmox-extra-pending-list');
  const extraCount = document.getElementById('proxmox-extra-pending-count');
  if (!btn) return;

  const currentHostname = (document.getElementById('server-node-name') || {}).textContent || '';

  // Determine if current tile host is pending or approved
  const isPending = pending.some((a) => proxmoxHostnameMatches(a.hostname, currentHostname));
  const isApproved = approved.some((a) => proxmoxHostnameMatches(a.hostname, currentHostname));

  // Other pending agents (not the one shown in the tile)
  const otherPending = pending.filter((a) => !proxmoxHostnameMatches(a.hostname, currentHostname));

  btn._approveHostname = null;

  if (isPending) {
    const match = pending.find((a) => proxmoxHostnameMatches(a.hostname, currentHostname));
    btn.textContent = '✓ Approve Agent';
    btn.style.display = '';
    btn._approveHostname = match?.hostname || currentHostname;
    btn._action = 'approve';
  } else if (isApproved) {
    const match = approved.find((a) => proxmoxHostnameMatches(a.hostname, currentHostname));
    btn.textContent = '✕ Revoke Agent';
    btn.style.display = '';
    btn._approveHostname = match?.hostname || currentHostname;
    btn._action = 'revoke';
  } else if (pending.length > 0) {
    // No connected agent yet — show Approve for the first pending
    const first = pending[0];
    btn.textContent = `✓ Approve ${escHtml(first.hostname)}`;
    btn.style.display = '';
    btn._approveHostname = first.hostname;
    btn._action = 'approve';
    otherPending.shift(); // already showing first one inline
  } else {
    btn.style.display = 'none';
  }

  if (!btn._bound) {
    btn.addEventListener('click', async () => {
      if (!btn._approveHostname) return;
      if (btn._action === 'approve') {
        await approveProxmoxAgent(btn._approveHostname);
      } else {
        await revokeProxmoxAgent(btn._approveHostname);
      }
    });
    btn._bound = true;
  }

  // Show strip for any other pending agents
  if (extraCount) extraCount.textContent = String(pending.length);
  if (extraCard && extraList) {
    if (otherPending.length) {
      extraCard.classList.remove('hidden');
      extraList.innerHTML = otherPending.map((a) => {
        const enc = encodeURIComponent(String(a.hostname || ''));
        return `<strong>${escHtml(a.hostname)}</strong> `
          + `<button class="btn btn-secondary" style="font-size:11px;padding:2px 8px;" onclick="approveProxmoxAgent(decodeURIComponent('${enc}'))">Approve</button> `;
      }).join(' &nbsp; ');
    } else {
      extraCard.classList.toggle('hidden', pending.length === 0);
      extraList.innerHTML = pending.length ? '<span class="muted">Waiting for the connected host to be approved.</span>' : '';
    }
  }
}

function renderProxmoxPending(pending) {
  latestProxmoxData.pending_proxmox = pending;
  renderProxmoxApproveState(
    pending,
    Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : []
  );
}

function renderProxmoxApproved(approved) {
  latestProxmoxData.approved_proxmox = approved;
  renderProxmoxApproveState(
    Array.isArray(latestProxmoxData.pending_proxmox) ? latestProxmoxData.pending_proxmox : [],
    approved
  );
}

async function approveProxmoxAgent(hostname) {
  await requestJson(`/api/proxmox/approve/${encodeURIComponent(hostname)}`, { method: 'POST' });
}

async function rejectProxmoxAgent(hostname) {
  await requestJson(`/api/proxmox/reject/${encodeURIComponent(hostname)}`, { method: 'POST' });
}

async function revokeProxmoxAgent(hostname) {
  if (!confirm(`Revoke key for ${hostname}?`)) return;
  await requestJson(`/api/proxmox/approved/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
  loadProxmoxApproved().catch(() => {});
}

async function loadProxmoxApproved() {
  const approved = await requestJson('/api/proxmox/approved');
  renderProxmoxApproved(Array.isArray(approved) ? approved : []);
}

function applySettingsToUI(s) {
  const settings = mergeSettings(s);
  // Local kill switch is driven by /api/init local_kill_switch (from simulation.conf),
  // NOT from WebUI settings — the settings object never contains kill_switch.
  if (repoUrlInput) repoUrlInput.value = settings.repo_url || repoUrlInput.value;
  if (branchInput && !branchInput.matches(':focus')) branchInput.value = settings.repo_branch || '';
  if (setupActiveBranch) setupActiveBranch.textContent = settings.repo_branch || '—';
  setSecretInputConfigured(githubTokenInput, settings.github_token_configured);
  if (githubTokenStatus) githubTokenStatus.textContent = settings.github_token_configured ? '✓ Token configured' : 'Not configured';
  const centralApi = settings.central_api || defaultCentralApiSettings();
  setInputValueIfIdle(centralClassicUrlInput, centralApi.classic.url || '');
  setInputValueIfIdle(centralClassicUsernameInput, centralApi.classic.username || '');
  setInputValueIfIdle(centralCentralUrlInput, centralApi.central.url || '');
  setInputValueIfIdle(centralClientIdInput, centralApi.central.client_id || '');
  setInputValueIfIdle(centralCustomerIdInput, centralApi.central.customer_id || '');
  applyCentralModeUI(centralApi.mode || 'classic');

  const csStatus = document.getElementById('central-client-secret-status');
  setSecretInputConfigured(centralClassicPasswordInput, centralApi.classic.password_configured);
  setSecretInputConfigured(centralClientSecretInput, centralApi.central.client_secret_configured);
  if (centralClassicPasswordStatus) centralClassicPasswordStatus.textContent = centralApi.classic.password_configured ? '✓ Password configured' : '';
  if (csStatus) csStatus.textContent = centralApi.central.client_secret_configured ? '✓ Secret configured' : '';
  if (relayEnabledSelect && !relayEnabledSelect.matches(':focus')) relayEnabledSelect.value = settings.relay_enabled || 'off';
  setInputValueIfIdle(relayServerUrlInput, settings.relay_server_url || '');
  setInputValueIfIdle(relaySpokeName, settings.relay_spoke_name || '');
  setInputValueIfIdle(relayTenantIdInput, settings.relay_tenant_id || settings.relay_tenant_hint || '');
  const spokeIdDisplay = document.getElementById('relay-spoke-id-display');
  if (spokeIdDisplay) spokeIdDisplay.textContent = settings.relay_spoke_id || '—';
  const apikeyStatus = document.getElementById('relay-apikey-status');
  if (apikeyStatus) apikeyStatus.textContent = settings.relay_api_key_configured ? '✓ Received' : 'Pending approval';
  const relayIndicator = document.getElementById('relay-indicator');
  if (relayIndicator) {
    const relayOn = settings.relay_enabled === 'on' && settings.relay_server_url;
    relayIndicator.style.display = relayOn ? '' : 'none';
  }
  if (usbAutoProvisionInput) usbAutoProvisionInput.checked = settings.usb_auto_provision === 'on';
  if (usbMissingTimeoutInput && !usbMissingTimeoutInput.matches(':focus')) usbMissingTimeoutInput.value = settings.usb_missing_timeout ?? '60';
  if (vmImage1TemplateIdInput && !vmImage1TemplateIdInput.matches(':focus')) vmImage1TemplateIdInput.value = settings.vm_image_1_template_id ?? '100';
  if (vmImage2TemplateIdInput && !vmImage2TemplateIdInput.matches(':focus')) vmImage2TemplateIdInput.value = settings.vm_image_2_template_id ?? '200';
  if (vmImage1PctInput && !vmImage1PctInput.matches(':focus')) vmImage1PctInput.value = settings.vm_image_1_pct ?? '50';
  if (vmSilentTimeoutInput && !vmSilentTimeoutInput.matches(':focus')) vmSilentTimeoutInput.value = settings.vm_silent_timeout ?? '24';
  const schedule = parseScheduleCron(settings.reclone_schedule_cron);
  if (recloneScheduleEnabledInput) recloneScheduleEnabledInput.checked = settings.reclone_schedule_enabled === 'on';
  if (recloneConcurrencyInput) recloneConcurrencyInput.value = settings.reclone_concurrency ?? '1';
  if (l1VlanStartInput && !l1VlanStartInput.matches(':focus')) l1VlanStartInput.value = settings.l1_vlan_start ?? '100';
  if (l1VlanEndInput && !l1VlanEndInput.matches(':focus')) l1VlanEndInput.value = settings.l1_vlan_end ?? '199';
  if (recloneScheduleDayInput && !recloneScheduleDayInput.matches(':focus')) recloneScheduleDayInput.value = schedule.day;
  if (recloneScheduleTimeInput && !recloneScheduleTimeInput.matches(':focus')) recloneScheduleTimeInput.value = schedule.time;
  renderUsbVidPidTable();
  renderIgnoredUsbList();
  renderIgnoredHostnamesList();
  renderSiteMappingsTable();
  renderSelectedChecksPreview();
  renderHwChecksPreview();
  if ((availableChecks.alerts.length || availableChecks.insights.length) && availableChecksContainer) {
    renderAvailableChecks();
  }
  renderCentralOverview();
  renderChecksList(); // Refresh sim tab whenever settings change (monitored checks may have changed)
  renderUsbSummary(latestProxmoxData);
  renderRecloneStatus(latestRecloneState || latestProxmoxData.reclone_state || {});
  renderAutoProvisionStatus();
  if (centralSiteDetailOpen) {
    renderSiteClients(centralSiteDetailOpen);
    renderSiteChecks(centralSiteDetailOpen, centralStatusData[centralSiteDetailOpen] || {});
  }

  // Sync interval
  if (syncIntervalInput && !syncIntervalInput.matches(':focus'))
    syncIntervalInput.value = settings.repo_sync_interval ?? 300;

  // Email notifications
  const notif = settings.notifications || {};
  if (emailEnabledToggle) emailEnabledToggle.checked = !!notif.email_enabled;
  setInputValueIfIdle(smtpHost, notif.smtp_host || '');
  if (smtpPort && !smtpPort.matches(':focus')) smtpPort.value = notif.smtp_port ?? 587;
  setInputValueIfIdle(smtpUser, notif.smtp_user || '');
  setInputValueIfIdle(smtpFrom, notif.smtp_from || '');
  setInputValueIfIdle(smtpTo, Array.isArray(notif.smtp_to) ? notif.smtp_to.join(', ') : (notif.smtp_to || ''));
  setSecretInputConfigured(smtpPassword, notif.smtp_password_configured);

  // Teams
  if (teamsEnabledToggle) teamsEnabledToggle.checked = !!notif.teams_enabled;
  setSecretInputConfigured(teamsWebhookUrl, notif.teams_webhook_url_configured);
}

function showSettingsMessage(text, isError) {
  settingsMsg.textContent = text;
  settingsMsg.className = `settings-message ${isError ? 'error' : 'success'}`;
  clearTimeout(settingsMsg._timer);
  settingsMsg._timer = setTimeout(() => {
    settingsMsg.className = 'settings-message hidden';
  }, 5000);
}

async function clearSettingsProvider(provider, { button, messageEl, successText, extraDataHandler } = {}) {
  const originalText = button?.textContent || 'Clear Config';
  if (button) {
    button.disabled = true;
    button.textContent = 'Clearing…';
  }
  try {
    const data = await requestJson(`/api/settings/clear/${encodeURIComponent(provider)}`, { method: 'POST' });
    applySettingsToUI(data.settings || {});
    if (typeof extraDataHandler === 'function') extraDataHandler(data);
    if (messageEl === settingsMsg) showSettingsMessage(successText, false);
    else showInlineMessage(messageEl, successText, false);
  } catch (error) {
    await loadSettings().catch(() => {});
    if (messageEl === settingsMsg) showSettingsMessage(`Error: ${error.message}`, true);
    else showInlineMessage(messageEl, `Error: ${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

if (branchInput) {
  branchInput.addEventListener('blur', async () => {
    const branch = branchInput.value.trim();
    if (!branch) return;
    try {
      const data = await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_branch: branch })
      });
      showSettingsMessage(`Branch set to "${data.settings.repo_branch}".`, false);
      applySettingsToUI(data.settings);
    } catch (err) {
      showSettingsMessage(`Error: ${err.message}`, true);
    }
  });
}

if (githubTokenInput) {
  githubTokenInput.addEventListener('blur', async () => {
    const { include, value } = getSecretInputPayload(githubTokenInput);
    if (!include) return;
    const token = value.trim();
    try {
      const response = await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_token: token })
      });
      showSettingsMessage(token ? 'GitHub token saved.' : 'GitHub token cleared.', false);
      applySettingsToUI(response.settings || { github_token_configured: Boolean(token) });
      resetSecretInput(githubTokenInput);
    } catch (err) {
      showSettingsMessage(`Error: ${err.message}`, true);
    }
  });
}

if (githubClearConfigBtn) {
  githubClearConfigBtn.addEventListener('click', () => clearSettingsProvider('github', {
    button: githubClearConfigBtn,
    messageEl: settingsMsg,
    successText: 'GitHub config cleared.'
  }));
}

syncNowBtn.addEventListener('click', async () => {
  syncNowBtn.disabled = true;
  syncNowBtn.textContent = '⬇ Syncing…';
  syncNowMsg.textContent = 'GitHub sync started…';
  syncNowMsg.className = 'settings-message success';
  try {
    const res = await fetch('/api/sync-now', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    syncNowMsg.textContent = 'Sync triggered — status will update below when complete.';
  } catch (err) {
    syncNowMsg.textContent = `Error: ${err.message}`;
    syncNowMsg.className = 'settings-message error';
  } finally {
    syncNowBtn.disabled = false;
    syncNowBtn.textContent = '⬇ Sync from GitHub Now';
    clearTimeout(syncNowMsg._timer);
    syncNowMsg._timer = setTimeout(() => {
      syncNowMsg.className = 'settings-message hidden';
    }, 6000);
  }
});

function applyVersionStatus(data) {
  if (versionCurrent) versionCurrent.textContent = data.current_version ?? '—';
  if (versionAvailable) versionAvailable.textContent = data.available_version ?? '—';
  if (versionLastChecked) versionLastChecked.textContent = data.last_checked ?? '—';

  const inProgress = !!data.update_in_progress;
  updateWasInProgress = inProgress;
  if (checkUpdateBtn) {
    checkUpdateBtn.disabled = inProgress;
    checkUpdateBtn.textContent = inProgress ? '🔄 Updating…' : '🔄 Check & Update Now';
  }

  if (!updateMsg) return;

  const logDetails = document.getElementById('update-log-details');
  const logOutput  = document.getElementById('update-log-output');

  if (data.update_error) {
    updateMsg.textContent = `Update failed: ${data.update_error}`;
    updateMsg.className = 'settings-message error';
    updateMsg.classList.remove('hidden');
    // Show captured install output in the collapsible panel
    if (logDetails && logOutput && data.update_log?.length) {
      logOutput.textContent = data.update_log.join('\n');
      logDetails.classList.remove('hidden');
      logDetails.open = true;
    }
  } else if (inProgress) {
    const lastLine = data.update_log?.length ? ` — ${data.update_log[data.update_log.length - 1]}` : '';
    updateMsg.textContent = `Installing v${data.available_version}… service will restart.${lastLine}`;
    updateMsg.className = 'settings-message success';
    updateMsg.classList.remove('hidden');
    // Keep log panel updated live
    if (logDetails && logOutput && data.update_log?.length) {
      logOutput.textContent = data.update_log.join('\n');
      logDetails.classList.remove('hidden');
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  }
}

checkUpdateBtn.addEventListener('click', async () => {
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = '🔄 Checking…';
  updateMsg.textContent = 'Checking for updates…';
  updateMsg.className = 'settings-message success';
  updateMsg.classList.remove('hidden');
  clearTimeout(updateMsg._timer);
  try {
    const res = await fetch('/api/self-update', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    updateMsg.textContent = data.message;
    updateMsg.className = data.message.includes('up to date') ? 'settings-message success' : 'settings-message success';
    // If update started, applyVersionStatus via WS will drive state from here
    if (!data.message.includes('started')) {
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = '🔄 Check & Update Now';
      updateMsg._timer = setTimeout(() => { updateMsg.className = 'settings-message hidden'; }, 8000);
    }
  } catch (err) {
    updateMsg.textContent = `Error: ${err.message}`;
    updateMsg.className = 'settings-message error';
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.textContent = '🔄 Check & Update Now';
    updateMsg._timer = setTimeout(() => { updateMsg.className = 'settings-message hidden'; }, 10000);
  }
});

// Load initial version status on page load
fetch('/api/version').then(r => r.json()).then(applyVersionStatus).catch(() => {});

function normalizeFlagValue(value) {
  return String(value ?? 'off').toLowerCase() === 'on' ? 'on' : 'off';
}

function formatLastSeen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function impactSummary(activeSimulations = []) {
  const labels = [...new Set(activeSimulations.map((sim) => IMPACT_LABELS[sim]).filter(Boolean))];
  return labels.length ? labels.join(' · ') : '— Normal';
}

function renderImpactCell(cell, activeSimulations = []) {
  cell.textContent = '';
  const labels = [...new Set(activeSimulations.map((sim) => IMPACT_LABELS[sim]).filter(Boolean))];
  if (!labels.length) {
    cell.textContent = '— Normal';
    return;
  }
  const dot = document.createElement('span');
  dot.className = 'ind-dot red';
  dot.style.cssText = 'display:inline-block;vertical-align:middle;margin-right:5px;flex-shrink:0;';
  const text = document.createElement('span');
  text.textContent = labels.join(' · ');
  cell.appendChild(dot);
  cell.appendChild(text);
}

function badgeClass(simulation) {
  if (FAILURE_SIMS.has(simulation)) return 'badge badge-failure';
  if (TRAFFIC_SIMS.has(simulation)) return 'badge badge-traffic';
  return 'badge badge-neutral';
}

function setWsStatus(connected, label) {
  wsDot.className = `status-dot ${connected ? 'online' : 'offline'}`;
  wsText.textContent = label;
}

function setCentralApiStatus(valid, tokenState) {
  const dot = document.getElementById('central-api-dot');
  const text = document.getElementById('central-api-text');
  const indicator = document.getElementById('central-api-status');
  if (!dot || !text) return;

  const state = tokenState?.state;
  const detail = tokenState?.detail || '';

  if (state === 'connected' || valid === true) {
    dot.className = 'status-dot online';
    text.textContent = 'Connected';
    if (indicator) indicator.title = `Central API: connected — ${detail}`;
  } else if (state === 'not_configured') {
    dot.className = 'status-dot offline';
    text.textContent = 'Not Configured';
    if (indicator) indicator.title = `Central API: ${detail}`;
  } else if (state === 'auth_failed') {
    dot.className = 'status-dot offline';
    text.textContent = 'Auth Failed';
    if (indicator) indicator.title = `Central API: ${detail}`;
  } else if (state === 'token_expired') {
    dot.className = 'status-dot warning';
    text.textContent = 'Token Expired';
    if (indicator) indicator.title = `Central API: ${detail}`;
  } else if (valid === false) {
    dot.className = 'status-dot offline';
    text.textContent = 'No Token';
    if (indicator) indicator.title = 'Central API: token missing or invalid — check Setup tab';
  } else {
    dot.className = 'status-dot warning';
    text.textContent = 'Unknown';
    if (indicator) indicator.title = 'Central API: status not yet checked';
  }
}

function updateClientCount() {
  clientCount.textContent = `${clients.size} client${clients.size === 1 ? '' : 's'}`;
  if (emptyRow) emptyRow.style.display = clients.size > 0 ? 'none' : '';
}

function createCell(className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  return cell;
}

function ensureRow(hostname) {
  if (rowRefs.has(hostname)) {
    return rowRefs.get(hostname);
  }

  const mainRow = document.createElement('tr');
  mainRow.dataset.hostname = hostname;
  mainRow.className = 'client-row';

  const detailRow = document.createElement('tr');
  detailRow.className = 'control-row hidden';
  const detailCell = document.createElement('td');
  detailCell.colSpan = 10;
  detailRow.appendChild(detailCell);

  const statusCell = createCell('status-cell');
  const statusDot = document.createElement('span');
  statusDot.className = 'status-dot offline';
  statusCell.appendChild(statusDot);

  const hostnameCell = createCell('hostname-cell');
  const platformCell = createCell();
  const simIdCell = createCell();
  const ssidCell = createCell();
  const activeCell = createCell('badge-cell');
  const impactCell = createCell('impact-cell');
  const lastSeenCell = createCell();
  const actionsCell = createCell();

  // Error count badge cell — shows a red badge when the client has reported errors.
  // WHY: Operators need to see at a glance which clients are having problems
  // without clicking into each one individually.
  const errorCell = createCell('error-cell');
  const errorBadge = document.createElement('span');
  errorBadge.className = 'error-badge hidden';
  errorBadge.title = 'Click Actions → Control to see error log';
  errorCell.appendChild(errorBadge);

  const controlButton = document.createElement('button');
  controlButton.type = 'button';
  controlButton.className = 'btn btn-small';
  controlButton.textContent = 'Control';
  controlButton.addEventListener('click', () => toggleControlRow(hostname));
  actionsCell.appendChild(controlButton);

  [
    statusCell,
    hostnameCell,
    platformCell,
    simIdCell,
    ssidCell,
    activeCell,
    impactCell,
    lastSeenCell,
    errorCell,
    actionsCell
  ].forEach((cell) => mainRow.appendChild(cell));

  tbody.appendChild(mainRow);
  tbody.appendChild(detailRow);

  const refs = {
    mainRow,
    detailRow,
    detailCell,
    statusDot,
    hostnameCell,
    platformCell,
    simIdCell,
    ssidCell,
    activeCell,
    impactCell,
    lastSeenCell,
    errorCell,
    errorBadge,
    controlButton
  };

  rowRefs.set(hostname, refs);
  return refs;
}

function renderBadges(container, activeSimulations) {
  container.textContent = '';
  if (!activeSimulations || !activeSimulations.length) {
    container.textContent = '—';
    return;
  }

  activeSimulations.forEach((simulation) => {
    const badge = document.createElement('span');
    badge.className = badgeClass(simulation);
    badge.textContent = simulation;
    container.appendChild(badge);
  });
}

function upsertClient(client) {
  const existing = clients.get(client.hostname) || {};
  const merged = {
    ...existing,
    ...client,
    config: client.config || existing.config || {},
    effective_config: client.effective_config || existing.effective_config || client.config || {},
    overrides: client.overrides || existing.overrides || {},
    active_simulations: client.active_simulations || existing.active_simulations || [],
    // Merge recent_errors: always use the server-provided list which is the authoritative
    // circular buffer. If not present in the update, keep the existing list.
    recent_errors: client.recent_errors || existing.recent_errors || [],
    error_count: client.error_count ?? existing.error_count ?? 0
  };

  clients.set(client.hostname, merged);
  const refs = ensureRow(client.hostname);

  refs.statusDot.className = `status-dot ${merged.online ? 'online' : 'offline'}`;
  refs.mainRow.classList.toggle('client-offline', !merged.online);
  refs.hostnameCell.textContent = merged.hostname || '—';
  refs.platformCell.textContent = merged.platform || '—';
  refs.simIdCell.textContent = merged.simulation_id || '—';
  refs.ssidCell.textContent = merged.connected_ssid || '—';
  renderBadges(refs.activeCell, merged.active_simulations || []);
  renderImpactCell(refs.impactCell, merged.active_simulations || []);
  refs.lastSeenCell.textContent = formatLastSeen(merged.last_seen);
  refs.controlButton.textContent = openControlHost === merged.hostname ? 'Close' : 'Control';

  // Update error badge — show count if there are any errors, hide if clean.
  // WHY: Red number in the Errors column is the fastest way to spot a problem
  // on a table with many clients without reading every row in detail.
  const errCount = merged.error_count || 0;
  if (errCount > 0) {
    refs.errorBadge.textContent = errCount > 99 ? '99+' : String(errCount);
    refs.errorBadge.className = 'error-badge';
    refs.errorBadge.title = `${errCount} error(s) reported — open Control to see log`;
  } else {
    refs.errorBadge.className = 'error-badge hidden';
  }

  if (openControlHost === merged.hostname) {
    renderControlPanel(merged.hostname);
  }

  updateClientCount();
  if (centralSiteDetailOpen) {
    renderSiteClients(centralSiteDetailOpen);
  }
}

function collectPanelState(panel) {
  const state = {};
  FLAG_ORDER.forEach((flag) => {
    const input = panel.querySelector(`input[data-flag="${flag}"]`);
    state[flag] = input && input.checked ? 'on' : 'off';
  });
  return state;
}

async function sendJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return null;
}


async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = text ? { detail: text } : null;
  }
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.message || `HTTP ${response.status}`);
  }
  return payload;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\x22/g, '&quot;')
    .replace(/\x27/g, '&#39;');
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeJsonList(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function parseScheduleCron(cronValue = 'sunday 02:00') {
  const [day = 'sunday', time = '02:00'] = String(cronValue || '').trim().toLowerCase().split(/\s+/, 2);
  return { day, time: /^\d{2}:\d{2}$/.test(time || '') ? time : '02:00' };
}

function formatUiDate(value) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderUsbVidPidTable() {
  if (!usbVidPidTbody) return;
  usbVidPidTbody.innerHTML = '';
  const devices = parseJsonList(currentSettings.usb_vidpids);
  devices.forEach((device) => {
    const tr = document.createElement('tr');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-icon';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeVidPid(device.vidpid));
    tr.innerHTML = `<td>${device.vidpid || '—'}</td><td>${device.type || 'wireless'}</td><td>${device.label || '—'}</td>`;
    const actionTd = document.createElement('td');
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);
    usbVidPidTbody.appendChild(tr);
  });
}

function renderIgnoredUsbList() {
  if (!usbIgnoredList) return;
  usbIgnoredList.innerHTML = '';
  const ignored = parseJsonList(currentSettings.usb_ignored_vidpids);
  if (!ignored.length) {
    usbIgnoredList.textContent = 'No ignored devices.';
    return;
  }
  ignored.forEach((vidpid) => {
    const badge = document.createElement('span');
    badge.className = 'badge badge-grey';
    badge.textContent = vidpid;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ' ✕';
    button.addEventListener('click', async () => {
      // Re-read from currentSettings each click to avoid stale closure
      const current = parseJsonList(currentSettings.usb_ignored_vidpids);
      currentSettings.usb_ignored_vidpids = serializeJsonList(current.filter((item) => item !== vidpid));
      renderIgnoredUsbList();
      renderUsbSummary(latestProxmoxData);
      try {
        await requestJson('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(collectUsbSettingsPayload()),
        });
        showNotification(`${vidpid} removed from ignored devices`, 'success');
      } catch (err) {
        showNotification(`Error saving: ${err.message}`, 'error');
      }
    });
    badge.appendChild(button);
    usbIgnoredList.appendChild(badge);
  });
}

function renderIgnoredHostnamesList() {
  if (!ignoredHostnamesList) return;
  ignoredHostnamesList.innerHTML = '';
  const hostnames = parseJsonList(currentSettings.ignored_hostnames);
  if (!hostnames.length) {
    ignoredHostnamesList.textContent = 'No ignored hostnames.';
    return;
  }
  hostnames.forEach((hostname) => {
    const badge = document.createElement('span');
    badge.className = 'badge badge-grey';
    badge.textContent = hostname;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = ' ✕';
    button.addEventListener('click', async () => {
      const current = parseJsonList(currentSettings.ignored_hostnames);
      currentSettings.ignored_hostnames = serializeJsonList(current.filter((h) => h !== hostname));
      renderIgnoredHostnamesList();
      try {
        await requestJson('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ignored_hostnames: currentSettings.ignored_hostnames }),
        });
        showNotification(`${hostname} removed from ignored clients`, 'success');
      } catch (err) {
        showNotification(`Error saving: ${err.message}`, 'error');
      }
    });
    badge.appendChild(button);
    ignoredHostnamesList.appendChild(badge);
  });
}

async function loadUsbConfig() {
  const data = await requestJson('/api/proxmox/usb-config');
  currentSettings.usb_vidpids = serializeJsonList(data.vidpids || []);
  currentSettings.usb_ignored_vidpids = serializeJsonList(data.ignored_vidpids || []);
  currentSettings.usb_missing_timeout = String(data.missing_timeout ?? currentSettings.usb_missing_timeout ?? '60');
  currentSettings.vm_image_1_template_id = String(data.image1_template_id ?? currentSettings.vm_image_1_template_id ?? '100');
  currentSettings.vm_image_2_template_id = String(data.image2_template_id ?? currentSettings.vm_image_2_template_id ?? '200');
  currentSettings.vm_image_1_pct = String(data.image1_pct ?? currentSettings.vm_image_1_pct ?? '50');
  currentSettings.usb_auto_provision = data.auto_provision || 'off';
  if (usbAutoProvisionInput) usbAutoProvisionInput.checked = currentSettings.usb_auto_provision === 'on';
  if (usbMissingTimeoutInput && !usbMissingTimeoutInput.matches(':focus')) usbMissingTimeoutInput.value = currentSettings.usb_missing_timeout;
  if (vmImage1TemplateIdInput && !vmImage1TemplateIdInput.matches(':focus')) vmImage1TemplateIdInput.value = currentSettings.vm_image_1_template_id;
  if (vmImage2TemplateIdInput && !vmImage2TemplateIdInput.matches(':focus')) vmImage2TemplateIdInput.value = currentSettings.vm_image_2_template_id;
  if (vmImage1PctInput && !vmImage1PctInput.matches(':focus')) vmImage1PctInput.value = currentSettings.vm_image_1_pct;
  renderUsbVidPidTable();
  renderIgnoredUsbList();
}

function addVidPid() {
  const vidpid = newVidPidInput?.value.trim().toLowerCase() || '';
  const type = newVidPidTypeInput?.value || 'wireless';
  const label = newVidPidLabelInput?.value.trim() || '';
  if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/i.test(vidpid)) {
    showNotification('Enter VID:PID as ####:####', 'error');
    return;
  }
  const devices = parseJsonList(currentSettings.usb_vidpids).filter((item) => item?.vidpid !== vidpid);
  devices.push({ vidpid, type, label });
  devices.sort((a, b) => String(a.vidpid).localeCompare(String(b.vidpid)));
  currentSettings.usb_vidpids = serializeJsonList(devices);
  renderUsbVidPidTable();
  if (newVidPidInput) newVidPidInput.value = '';
  if (newVidPidLabelInput) newVidPidLabelInput.value = '';
}

function removeVidPid(vidpid) {
  currentSettings.usb_vidpids = serializeJsonList(parseJsonList(currentSettings.usb_vidpids).filter((item) => item?.vidpid !== vidpid));
  renderUsbVidPidTable();
}

function collectUsbSettingsPayload() {
  return {
    usb_vidpids: currentSettings.usb_vidpids,
    usb_missing_timeout: String(usbMissingTimeoutInput?.value || currentSettings.usb_missing_timeout || '60'),
    vm_image_1_template_id: String(vmImage1TemplateIdInput?.value || currentSettings.vm_image_1_template_id || '100'),
    vm_image_2_template_id: String(vmImage2TemplateIdInput?.value || currentSettings.vm_image_2_template_id || '200'),
    vm_image_1_pct: String(vmImage1PctInput?.value ?? currentSettings.vm_image_1_pct ?? '50'),
    usb_auto_provision: usbAutoProvisionInput?.checked ? 'on' : 'off',
    usb_ignored_vidpids: currentSettings.usb_ignored_vidpids,
    vm_silent_timeout: String(vmSilentTimeoutInput?.value || currentSettings.vm_silent_timeout || '24'),
    reclone_schedule_enabled: recloneScheduleEnabledInput?.checked ? 'on' : 'off',
    reclone_schedule_cron: `${recloneScheduleDayInput?.value || 'sunday'} ${recloneScheduleTimeInput?.value || '02:00'}`,
    reclone_concurrency: String(recloneConcurrencyInput?.value ?? '1'),
    l1_vlan_start: String(l1VlanStartInput?.value ?? currentSettings.l1_vlan_start ?? '100'),
    l1_vlan_end: String(l1VlanEndInput?.value ?? currentSettings.l1_vlan_end ?? '199'),
  };
}

async function ignoreUsbDevice(vidpid) {
  const ignored = new Set(parseJsonList(currentSettings.usb_ignored_vidpids));
  ignored.add(String(vidpid || '').toLowerCase());
  currentSettings.usb_ignored_vidpids = serializeJsonList([...ignored].sort());
  // Optimistically remove from local unknown_usb so the device disappears immediately
  if (Array.isArray(latestProxmoxData.unknown_usb)) {
    latestProxmoxData.unknown_usb = latestProxmoxData.unknown_usb.filter(
      (d) => String(d.vidpid || '').toLowerCase() !== String(vidpid || '').toLowerCase()
    );
  }
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectUsbSettingsPayload())
    });
    renderIgnoredUsbList();
    renderUsbSummary(latestProxmoxData);
    showNotification(`${vidpid} added to ignored devices`, 'success');
  } catch (error) {
    showNotification(`Error saving: ${error.message}`, 'error');
  }
}

async function addUnknownToCertified(vidpid, name) {
  if (!vidpid) {
    showNotification('Could not certify: device has no VID:PID', 'error');
    return;
  }
  const type = 'wireless'; // default; user can change in the certified table after
  const devices = parseJsonList(currentSettings.usb_vidpids).filter((item) => item?.vidpid !== vidpid);
  devices.push({ vidpid: vidpid.toLowerCase(), type, label: name || vidpid });
  devices.sort((a, b) => String(a.vidpid).localeCompare(String(b.vidpid)));
  currentSettings.usb_vidpids = serializeJsonList(devices);
  // Optimistically remove from local unknown_usb so the device disappears immediately
  if (Array.isArray(latestProxmoxData.unknown_usb)) {
    latestProxmoxData.unknown_usb = latestProxmoxData.unknown_usb.filter(
      (d) => String(d.vidpid || '').toLowerCase() !== String(vidpid || '').toLowerCase()
    );
  }
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectUsbSettingsPayload())
    });
    renderUsbVidPidTable();
    renderUsbSummary(latestProxmoxData);
    showNotification(`${name || vidpid} added to certified devices`, 'success');
  } catch (error) {
    showNotification(`Error saving: ${error.message}`, 'error');
  }
}

function updateUsbCountdowns() {
  document.querySelectorAll('[data-missing-until]').forEach((node) => {
    const until = Number(node.dataset.missingUntil || 0) * 1000;
    const remaining = Math.max(0, Math.floor((until - Date.now()) / 1000));
    node.textContent = remaining > 0 ? `${Math.ceil(remaining / 60)}m remaining` : 'Ready to destroy';
  });
}

function renderUsbSummary(proxmoxData = latestProxmoxData) {
  latestProxmoxData = proxmoxData || latestProxmoxData;
  if (!usbSummaryPanel || !usbSummaryTbody || !unknownUsbSection || !unknownUsbTbody) return;

  const certified = parseJsonList(currentSettings.usb_vidpids);
  const usbState = Array.isArray(latestProxmoxData.usb_state) ? latestProxmoxData.usb_state : [];
  const missingTimeoutSeconds = (parseInt(currentSettings.usb_missing_timeout, 10) || 60) * 60;

  // Running VM stats pill
  const allVms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
  const runningVms = allVms.filter((v) => v.status === 'running' && !v.is_template);
  const usbStatPills = document.getElementById('usb-vm-stat-pills');
  if (usbStatPills) {
    const simRunning = runningVms.filter((v) => v.name && v.name.startsWith('client-sim-')).length;
    const totalRunning = runningVms.length;
    usbStatPills.innerHTML = `<span class="server-stat-pill" title="Total non-template VMs currently running">🟢 ${totalRunning} running VM${totalRunning !== 1 ? 's' : ''}</span>`
      + (simRunning > 0 ? `<span class="server-stat-pill" title="client-sim-* VMs running">${simRunning} sim client${simRunning !== 1 ? 's' : ''}</span>` : '');
  }

  // Client-side filter: remove devices that are now certified or ignored, and skip empty vidpids.
  // This prevents stale server broadcasts from restoring a device the user just acted on.
  const certifiedSet = new Set(certified.map((d) => String(d?.vidpid || '').toLowerCase()).filter(Boolean));
  const ignoredSet = new Set(parseJsonList(currentSettings.usb_ignored_vidpids).map((v) => String(v || '').toLowerCase()).filter(Boolean));
  const unknownUsb = (Array.isArray(latestProxmoxData.unknown_usb) ? latestProxmoxData.unknown_usb : [])
    .filter((d) => {
      const v = String(d.vidpid || '').toLowerCase().trim();
      return v && !certifiedSet.has(v) && !ignoredSet.has(v);
    });

  usbSummaryTbody.innerHTML = '';
  certified.forEach((device) => {
    const entries = usbState.filter((item) => (item.vidpid || '').toLowerCase() === String(device.vidpid || '').toLowerCase());
    const presentUsb = Array.isArray(latestProxmoxData.present_usb) ? latestProxmoxData.present_usb : [];
    const activeEntries = entries.filter((item) => !item.missing_since);
    const missing = entries.filter((item) => item.missing_since).length;
    const total = presentUsb.filter((item) => (item.vidpid || '').toLowerCase() === String(device.vidpid || '').toLowerCase()).length;

    // Build VM name list for active entries
    const vmMap = new Map(allVms.map((v) => [Number(v.vmid), v]));
    const activeVmHtml = activeEntries.length === 0 ? '—' : activeEntries.map((e) => {
      const vm = vmMap.get(Number(e.vmid));
      const name = escHtml(vm?.name || `VM ${e.vmid}`);
      const dot = vm?.status === 'running' ? '🟢' : '⚫';
      return `<div style="white-space:nowrap">${dot} ${name}</div>`;
    }).join('');

    const tr = document.createElement('tr');
    const missingHtml = missing
      ? `<div class="usb-missing-list">${entries.filter((item) => item.missing_since).map((item) => `<div class="usb-missing-item">VM ${item.vmid} · <span data-missing-until="${Number(item.missing_since) + missingTimeoutSeconds}"></span></div>`).join('')}</div>`
      : '—';
    tr.innerHTML = `
      <td>${device.label || device.vidpid || '—'}</td>
      <td>${device.vidpid || '—'}</td>
      <td class="usb-type-${device.type || 'wireless'}">${device.type || 'wireless'}</td>
      <td>${activeVmHtml}</td>
      <td>${missingHtml}</td>
      <td>${total}</td>
    `;
    usbSummaryTbody.appendChild(tr);
  });

  unknownUsbTbody.innerHTML = unknownUsb.map((device) => {
    const vid = escHtml(device.vidpid || '');
    const nameLabel = escHtml(device.name || device.bus_path || 'Unknown device');
    return `<tr>
      <td>${nameLabel}</td>
      <td>${vid || '—'}</td>
      <td class="usb-actions">
        <button type="button" class="btn btn-secondary btn-small" data-action="certify" data-vidpid="${vid}" data-name="${nameLabel}">Add to certified</button>
        <button type="button" class="btn btn-secondary btn-small" data-action="ignore" data-vidpid="${vid}">Ignore</button>
      </td>
    </tr>`;
  }).join('');
  // Use event delegation — one listener on the static tbody handles all button clicks
  unknownUsbTbody._delegated = true;

  unknownUsbSection.classList.toggle('hidden', unknownUsb.length === 0);
  // Show the panel whenever Proxmox is connected; hide only before any data has arrived
  usbSummaryPanel.classList.toggle('hidden', !latestProxmoxData.connected && certified.length === 0 && unknownUsb.length === 0 && usbState.length === 0);

  if (usbCountdownTimer) window.clearInterval(usbCountdownTimer);
  updateUsbCountdowns();
  if (usbState.some((item) => item.missing_since)) {
    usbCountdownTimer = window.setInterval(updateUsbCountdowns, 1000);
  }
}

async function triggerRecloneAll() {
  if (recloneNowBtn) {
    recloneNowBtn.disabled = true;
    recloneNowBtn.textContent = '⟳ Starting…';
  }
  try {
    const result = await requestJson('/api/proxmox/reclone-all', { method: 'POST' });
    showNotification(`Fleet reclone started for ${result.vm_count} VM(s).`, 'info');
  } catch (error) {
    showNotification(`Reclone error: ${error.message}`, 'error');
  } finally {
    if (recloneNowBtn) {
      recloneNowBtn.disabled = false;
      recloneNowBtn.textContent = '⟳ Reclone All Now';
    }
  }
}

function renderRecloneStatus(recloneState = latestRecloneState || {}) {
  latestRecloneState = recloneState || latestRecloneState || {};
  if (!recloneStatusBadge || !recloneProgressWrap || !recloneProgressBar || !recloneProgressLabel || !recloneVmLog || !recloneLastRun) return;

  const state = latestRecloneState || {};
  const status = state.status || 'idle';
  const isCloning = status === 'running' && state.current_vm;
  const badgeClass = status === 'running'
    ? 'badge-blue'
    : status === 'completed'
      ? 'badge-green'
      : status === 'failed'
        ? 'badge-red'
        : 'badge-grey';
  recloneStatusBadge.className = `badge ${badgeClass}`;
  if (isCloning) {
    const phaseMap = { stopping: 'Stopping', cloning: 'Cloning', starting: 'Starting' };
    const phaseLabel = phaseMap[state.phase] || 'Cloning';
    recloneStatusBadge.textContent = `${phaseLabel} VM ${state.current_vm}`;
  } else if (status === 'idle') {
    recloneStatusBadge.textContent = 'Stopped';
  } else {
    recloneStatusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  const total = Number(state.total || 0);
  const done = Number(state.completed || 0) + Number(state.failed || 0);
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const isActive = status === 'running' || done > 0;
  recloneProgressWrap.classList.toggle('hidden', !isActive);

  // Type label
  const typeEl = document.getElementById('reclone-type-label');
  if (typeEl) {
    const typeMap = { scheduled: 'Scheduled', manual: 'Manual', 'auto-recovery': 'Auto-Recovery' };
    typeEl.textContent = typeMap[state.type] || (state.type || '');
    typeEl.className = `badge ${state.type === 'auto-recovery' ? 'badge-yellow' : state.type === 'scheduled' ? 'badge-blue' : 'badge-grey'}`;
    typeEl.classList.toggle('hidden', !state.type || status === 'idle');
  }

  // Current VM
  const currentVmEl = document.getElementById('reclone-current-vm');
  if (currentVmEl) {
    currentVmEl.textContent = status === 'running' && state.current_vm
      ? `Recloning VM ${state.current_vm}…`
      : '';
  }

  // ETA
  const etaEl = document.getElementById('reclone-eta');
  if (etaEl) {
    let etaText = '';
    if (status === 'running' && done > 0 && total > done && state.started_at) {
      const elapsed = (Date.now() - new Date(state.started_at).getTime()) / 1000;
      const avgSec = elapsed / done;
      const remaining = (total - done) * avgSec;
      etaText = `~${Math.ceil(remaining / 60)} min remaining`;
    }
    etaEl.textContent = etaText;
  }

  recloneProgressBar.style.width = `${pct}%`;
  recloneProgressLabel.textContent = total ? `${done} / ${total} VMs (${pct}%)` : '';

  const iconMap = { completed: '✅', failed: '❌', in_progress: '⏳', queued: '🕐' };
  const logEntries = (state.log || []).slice().reverse();
  if (logEntries.length === 0 && status !== 'idle') {
    recloneVmLog.innerHTML = `<div class="muted" style="padding:8px 0;font-size:13px;">No VMs processed yet.</div>`;
  } else {
    recloneVmLog.innerHTML = logEntries.map((entry) => `
      <div class="log-entry" title="${escHtml(entry.message || '')}">
        <span>${iconMap[entry.status] || '•'}</span>
        <span>${entry.name || `VM ${entry.vmid}`}</span>
        <span class="muted">${entry.status}</span>
        <span class="muted">${formatUiDate(entry.timestamp)}</span>
        ${entry.message ? `<span class="muted">${escHtml(entry.message)}</span>` : ''}
      </div>
    `).join('');
  }

  if (state.last_run) {
    const typeLabel = state.last_run.type ? ` · ${state.last_run.type}` : '';
    recloneLastRun.textContent = `Last run: ${formatUiDate(state.last_run.timestamp)} · ${state.last_run.completed || 0} completed · ${state.last_run.failed || 0} failed${typeLabel}`;
  } else {
    recloneLastRun.textContent = 'Last run: —';
  }

  // Auto-recovery log
  const arSection = document.getElementById('reclone-auto-recovery-section');
  const arLog = document.getElementById('reclone-auto-recovery-log');
  const autoLog = Array.isArray(state.auto_recovery_log) ? state.auto_recovery_log : [];
  if (arSection) arSection.classList.toggle('hidden', autoLog.length === 0);
  if (arLog) {
    arLog.innerHTML = autoLog.slice().reverse().map((entry) => `
      <div class="log-entry">
        <span>${iconMap[entry.status] || '↺'}</span>
        <span>${entry.name || `VM ${entry.vmid}`}</span>
        <span class="muted">auto-recovery</span>
        <span class="muted">${formatUiDate(entry.timestamp)}</span>
      </div>
    `).join('');
  }

  updateVmRecloneIcons();
}

// Patch VM status icons in the server tab without a full re-render.
// Called whenever reclone state changes (reclone_update WS message).
function updateVmRecloneIcons() {
  const state = latestRecloneState || {};
  const tbodies = document.querySelectorAll('[id^="server-vm-tbody-"]');
  if (!tbodies.length) return;

  const recloningVmids = new Set();
  if (state.status === 'running') {
    if (state.current_vm != null) recloningVmids.add(Number(state.current_vm));
    (state.log || []).forEach((e) => {
      if (e.status === 'queued' || e.status === 'in_progress') recloningVmids.add(Number(e.vmid));
    });
  }

  tbodies.forEach((tbody) => {
    tbody.querySelectorAll('tr[data-vmid]').forEach((row) => {
      const vmid = Number(row.dataset.vmid);
      const cell = row.querySelector('.vm-status-cell');
      if (!cell) return;
      if (recloningVmids.has(vmid)) {
        cell.textContent = '🟡 recloning…';
      } else if (row.dataset.status) {
        cell.textContent = row.dataset.status;
      }
    });
  });
}

function renderAutoProvisionStatus() {
  // ── VM page status bar (right side of tab nav) ─────────────────────────────
  const bar = document.getElementById('autoprov-status-bar');
  if (bar) {
    const usbState = Array.isArray(latestProxmoxData.usb_state) ? latestProxmoxData.usb_state : [];
    const autoProv = currentSettings.usb_auto_provision === 'on';
    const iconEl = document.getElementById('autoprov-status-icon');
    const textEl = document.getElementById('autoprov-status-text');
    bar.classList.remove('hidden', 'is-active', 'is-idle');

    if (!autoProv) {
      bar.classList.add('is-idle');
      if (iconEl) iconEl.textContent = '⏹';
      if (textEl) textEl.textContent = 'VM Auto-Provisioning: Not Running';
    } else {
      const total = usbState.length;
      const provisioning = usbState.filter((e) => e.prov_status === 'provisioning');
      const activeUsb    = usbState.filter((e) => e.prov_status === 'active');

      // Cross-reference: "active" USB entries whose VM is not yet running in Proxmox
      const vms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
      const runningVmids = new Set(vms.filter((v) => v.status === 'running').map((v) => Number(v.vmid)));
      const startingUp = activeUsb.filter((e) => e.vmid != null && !runningVmids.has(Number(e.vmid)));
      const fullyActive = activeUsb.length - startingUp.length;

      if (total === 0) {
        bar.classList.add('is-idle');
        if (iconEl) iconEl.textContent = '📋';
        if (textEl) textEl.textContent = 'VM Auto-Provisioning: No USB devices tracked';
      } else if (provisioning.length > 0 || startingUp.length > 0) {
        bar.classList.add('is-active');
        if (iconEl) iconEl.textContent = '⏳';
        const parts = [];
        if (provisioning.length > 0) parts.push(`${provisioning.length} cloning`);
        if (startingUp.length > 0) parts.push(`${startingUp.length} starting up`);
        parts.push(`${fullyActive} / ${total} active`);
        if (textEl) textEl.textContent = `VM Auto-Provisioning: ${parts.join(' · ')}`;
      } else {
        bar.classList.add('is-idle');
        if (iconEl) iconEl.textContent = '✅';
        if (textEl) textEl.textContent = `VM Auto-Provisioning: All ${total} VMs active`;
      }
    }
  }

  // ── Right-side live panel ───────────────────────────────────────────────────
  const liveBadge   = document.getElementById('autoprov-live-badge');
  const liveSummary = document.getElementById('autoprov-live-summary');
  const logEl       = document.getElementById('auto-prov-log');
  if (!liveSummary || !logEl) return;

  const usbState = Array.isArray(latestProxmoxData.usb_state) ? latestProxmoxData.usb_state : [];
  const autoProv = currentSettings.usb_auto_provision === 'on';
  const missingTimeoutMins = parseInt(latestProxmoxData.missing_timeout_mins, 10) || 60;
  const vms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
  const runningVmids = new Set(vms.filter((v) => v.status === 'running').map((v) => Number(v.vmid)));

  if (!autoProv) {
    if (liveBadge) { liveBadge.textContent = 'Off'; liveBadge.className = 'badge badge-grey'; }
    liveSummary.innerHTML = `<div class="muted" style="font-size:13px;">VM Auto-Provisioning is disabled. Enable it in Setup → Proxmox.</div>`;
    logEl.innerHTML = '';
    return;
  }

  // In-flight entries only: provisioning, starting-up, missing, tearing_down
  const inFlight = usbState.filter((e) => {
    if (e.prov_status === 'provisioning' || e.prov_status === 'tearing_down' || e.prov_status === 'missing') return true;
    if (e.prov_status === 'active' && e.vmid != null && !runningVmids.has(Number(e.vmid))) return true;
    return false;
  });

  // Badge
  if (liveBadge) {
    const total = usbState.length;
    if (inFlight.length > 0) {
      liveBadge.textContent = `${inFlight.length} in progress`; liveBadge.className = 'badge badge-blue';
    } else if (total === 0) {
      liveBadge.textContent = 'Idle'; liveBadge.className = 'badge badge-grey';
    } else {
      liveBadge.textContent = 'All settled'; liveBadge.className = 'badge badge-green';
    }
  }

  // Summary line from last completed provisioning/teardown event
  const summary = latestProxmoxData.prov_summary;
  if (summary && summary.at) {
    const when = new Date(summary.at * 1000).toLocaleString();
    const verb = summary.action === 'provisioned' ? 'provisioned' : 'deleted';
    const colour = summary.action === 'provisioned' ? '#16a34a' : '#dc2626';
    liveSummary.innerHTML = `<div style="font-size:12px;color:${colour};margin-bottom:6px;">
      ${summary.count} VM${summary.count !== 1 ? 's' : ''} ${verb} · ${when}</div>`;
  } else {
    liveSummary.innerHTML = '';
  }

  // In-flight VM rows
  if (inFlight.length === 0) {
    logEl.innerHTML = `<div class="muted" style="padding:6px 0;font-size:13px;">No active provisioning work.</div>`;
    return;
  }

  const now = Date.now() / 1000;
  logEl.innerHTML = inFlight.map((e) => {
    const isStarting = e.prov_status === 'active';
    const icon  = isStarting ? '🔄' : e.prov_status === 'provisioning' ? '⏳' : e.prov_status === 'tearing_down' ? '🗑️' : '⚠️';
    const label = isStarting ? 'Starting Up' : e.prov_status === 'provisioning' ? 'Cloning' : e.prov_status === 'tearing_down' ? 'Tearing Down' : 'Missing Dongle';
    const name  = e.name || `USB ${e.bus_path || ''}`;
    let detail = '';
    if (e.prov_status === 'missing' && e.missing_since) {
      const elapsedMins = Math.round((now - e.missing_since) / 60);
      const remainMins  = Math.max(0, missingTimeoutMins - elapsedMins);
      detail = `<span class="muted">${elapsedMins}m elapsed · tears down in ~${remainMins}m</span>`;
    } else if (e.prov_status === 'tearing_down') {
      detail = `<span class="muted">Destroying VM…</span>`;
    } else if (e.prov_status === 'provisioning') {
      detail = `<span class="muted">Cloning &amp; configuring…</span>`;
    } else if (isStarting) {
      detail = `<span class="muted">VM booting…</span>`;
    }
    return `<div class="log-entry">
        <span>${icon}</span><span>VM ${e.vmid ?? '—'}</span>
        <span class="muted">${name}</span><span>${label}</span>${detail}
      </div>`;
  }).join('');
}

function formatCentralDate(value) {
  if (value == null || value === '') return '—';
  const date = new Date(value > 1e12 ? value : value * 1000);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function updateCentralToolbar() {
  if (centralLastSynced) {
    centralLastSynced.textContent = centralLastSyncedTs
      ? `Last synced: ${formatCentralDate(centralLastSyncedTs / 1000)}`
      : 'Last synced: —';
  }
  if (centralTokenDot) {
    centralTokenDot.className = `status-dot ${centralTokenValid ? 'online' : 'offline'}`;
  }
  if (centralTokenText) {
    if (centralTokenValid === null) {
      centralTokenText.textContent = 'Token status unknown';
    } else {
      centralTokenText.textContent = centralTokenValid ? 'Token valid' : 'Token unavailable';
    }
  }
}

function monitoredCheckKey(check) {
  return `${check.type}:${check.id}`;
}

function currentCheckSelectionSet() {
  return new Set((currentSettings.monitored_checks || []).map(monitoredCheckKey));
}

function buildCheckBadge(label, kind) {
  const badge = document.createElement('span');
  badge.className = `check-badge ${kind}`;
  badge.textContent = label;
  return badge;
}

function buildCentralApiPayload() {
  const payload = {
    mode: getCentralApiMode(),
    classic: {
      url: centralClassicUrlInput?.value.trim() || '',
      username: centralClassicUsernameInput?.value.trim() || '',
    },
    central: {
      url: centralCentralUrlInput?.value.trim() || '',
      client_id: centralClientIdInput?.value.trim() || '',
      customer_id: centralCustomerIdInput?.value.trim() || '',
    }
  };
  const classicPassword = getSecretInputPayload(centralClassicPasswordInput);
  if (classicPassword.include) payload.classic.password = classicPassword.value;
  const clientSecret = getSecretInputPayload(centralClientSecretInput);
  if (clientSecret.include) payload.central.client_secret = clientSecret.value;
  return payload;
}

function resetCentralSecretInputs() {
  resetSecretInput(centralClassicPasswordInput);
  resetSecretInput(centralClientSecretInput);
}

async function persistCentralApiConfig() {
  const configPayload = buildCentralApiPayload();
  const response = await requestJson('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ central_api: configPayload })
  });
  applySettingsToUI(response.settings || { central_api: configPayload });
  resetCentralSecretInputs();
  return response;
}

// Site mapping source lists (populated by Load Sites)
let localWsites = [];
let centralSites = [];

function buildMappingSelect(options, selected, placeholder) {
  const sel = document.createElement('select');
  sel.className = 'mapping-val form-control';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = placeholder;
  sel.appendChild(blank);
  options.forEach((val) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    opt.selected = val === selected;
    sel.appendChild(opt);
  });
  return sel;
}

function buildMappingInput(value, placeholder) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'mapping-val';
  inp.value = value;
  inp.placeholder = placeholder;
  return inp;
}

function addMappingRow(wsite = '', centralSite = '') {
  if (!siteMappingsBody) return;
  const row = document.createElement('tr');

  const wsiteCell = document.createElement('td');
  wsiteCell.appendChild(
    localWsites.length
      ? buildMappingSelect(localWsites, wsite, '— select wsite —')
      : buildMappingInput(wsite, 'e.g. MIA')
  );

  const centralCell = document.createElement('td');
  centralCell.appendChild(
    centralSites.length
      ? buildMappingSelect(centralSites, centralSite, '— select Central site —')
      : buildMappingInput(centralSite, 'Central site name')
  );

  const removeCell = document.createElement('td');
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-danger btn-small';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
    _autoSaveSiteMappings();
  });
  removeCell.appendChild(removeBtn);

  row.appendChild(wsiteCell);
  row.appendChild(centralCell);
  row.appendChild(removeCell);
  siteMappingsBody.appendChild(row);
}

function renderSiteMappingsTable() {
  if (!siteMappingsBody) return;
  siteMappingsBody.textContent = '';
  const entries = Object.entries(currentSettings.site_mappings || {});
  entries.forEach(([wsite, centralSite]) => addMappingRow(wsite, centralSite));
}

function renderSelectedChecksPreview() {
  if (!selectedChecksPreview) return;
  const checks = currentSettings.monitored_checks || [];
  if (!checks.length) {
    selectedChecksPreview.textContent = 'No checks selected yet.';
    return;
  }
  selectedChecksPreview.textContent = `Currently selected: ${checks.map((check) => `${check.name || check.id} (${check.type})`).join(', ')}`;
}

function renderHwChecksPreview() {
  if (!hwChecksPreview) return;
  const checks = currentSettings.hardware_checks || [];
  if (!checks.length) {
    hwChecksPreview.textContent = 'No hardware checks selected yet.';
    return;
  }
  hwChecksPreview.textContent = `Currently selected: ${checks.map((c) => c.name || c.id).join(', ')}`;
}

function renderAvailableChecks() {
  if (!availableChecksContainer) return;
  availableChecksContainer.textContent = '';
  const selection = currentCheckSelectionSet();
  const groups = [
    { key: 'alerts', title: 'Alerts' },
    { key: 'insights', title: 'AI Insights' }
  ];
  if (!availableChecks.alerts.length && !availableChecks.insights.length) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = 'No checks returned by Aruba Central.';
    availableChecksContainer.appendChild(empty);
    return;
  }
  groups.forEach(({ key, title }) => {
    const items = availableChecks[key] || [];
    if (!items.length) return;
    const group = document.createElement('div');
    group.className = 'checks-group';

    const heading = document.createElement('h3');
    heading.className = 'checks-group-title';
    heading.textContent = title;
    group.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'check-checkbox-list';
    items.forEach((item) => {
      const label = document.createElement('label');
      label.className = 'check-checkbox-item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.type = key === 'alerts' ? 'alert' : 'insight';
      input.dataset.id = item.id;
      input.dataset.name = item.name || item.id;
      input.checked = selection.has(`${input.dataset.type}:${item.id}`);

      const text = document.createElement('span');
      text.textContent = item.name || item.id;

      label.appendChild(input);
      label.appendChild(text);
      list.appendChild(label);
    });
    group.appendChild(list);
    availableChecksContainer.appendChild(group);
  });
}

function renderCentralOverview() {
  const tbody = document.getElementById('central-sites-tbody');
  const centralEmpty = document.getElementById('central-empty');
  if (!centralOverview || !tbody || !centralEmpty) return;
  updateCentralToolbar();
  tbody.textContent = '';

  const mappings = currentSettings.site_mappings || {};
  const entries = Object.entries(mappings);
  if (!entries.length) {
    centralEmpty.textContent = 'No Aruba Central site mappings configured yet.';
    centralEmpty.classList.remove('hidden');
    return;
  }

  centralEmpty.classList.add('hidden');
  const monitoredChecks = currentSettings.monitored_checks || [];

  entries.forEach(([wsite, centralSite]) => {
    const siteChecks = centralStatusData[wsite] || {};
    const okCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'OK').length;
    const errorCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'ERROR').length;
    const unknownCount = Math.max(monitoredChecks.length - okCount - errorCount, 0);
    const wirelessCount = centralWirelessClients[wsite] ?? '—';
    const simCount = [...(clients instanceof Map ? clients.values() : Object.values(clients || {}))]
      .filter((cl) => (cl.config?.wsite || cl.effective_config?.wsite || '') === wsite).length;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = `Open ${wsite} detail`;
    tr.innerHTML = `
      <td><strong>${escHtml(wsite)}</strong></td>
      <td>${escHtml(centralSite || '—')}</td>
      <td style="color:var(--hpe-green-dark);">${monitoredChecks.length ? okCount : '—'}</td>
      <td style="color:${errorCount ? '#c0392b' : 'inherit'};">${monitoredChecks.length ? errorCount : '—'}</td>
      <td style="color:var(--muted);">${monitoredChecks.length ? unknownCount : '—'}</td>
      <td>${wirelessCount}</td>
      <td><button class="btn btn-small btn-secondary" data-wsite="${escHtml(wsite)}">View →</button></td>
    `;
    tr.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      openSiteDetail(wsite);
    });
    tr.addEventListener('click', () => openSiteDetail(wsite));
    tbody.appendChild(tr);
  });
}

async function renderCentralAllAlerts() {
  const body = document.getElementById('central-all-alerts-body');
  const countBadge = document.getElementById('central-all-alerts-count');
  if (!body) return;
  body.textContent = 'Loading alerts…';
  const mappings = currentSettings.site_mappings || {};
  const entries = Object.entries(mappings);
  if (!entries.length) { body.innerHTML = '<p class="form-hint">No sites configured.</p>'; return; }

  const allAlerts = [];
  await Promise.all(entries.map(async ([wsite, centralSite]) => {
    try {
      const site = centralSite || wsite;
      const data = await requestJson(`/api/central/site-alerts?site=${encodeURIComponent(site)}`);
      (data.alerts || []).forEach((a) => allAlerts.push({ ...a, wsite }));
    } catch (_) { /* skip */ }
  }));

  body.textContent = '';
  if (countBadge) countBadge.textContent = allAlerts.length ? `(${allAlerts.length})` : '';
  if (!allAlerts.length) { body.innerHTML = '<p class="form-hint">No active alerts across any site.</p>'; return; }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Site</th><th>Time</th><th>Type</th><th>Severity</th><th>State</th><th>Device</th><th>Message</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  allAlerts.sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach((alert) => {
    const tr = document.createElement('tr');
    [alert.wsite, formatCentralDate(alert.ts), alert.name || alert.type || '—',
      alert.severity || '—', alert.state || '—', alert.device || '—', alert.message || '—'
    ].forEach((val, i) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (i === 3 && (val === 'CRITICAL' || val === 'MAJOR')) td.style.color = '#c0392b';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

function renderCentralClients() {
  const tbody = document.getElementById('central-clients-tbody');
  const empty = document.getElementById('central-clients-empty');
  if (!tbody) return;
  tbody.textContent = '';
  const mappings = currentSettings.site_mappings || {};
  const entries = Object.entries(mappings);
  if (!entries.length) { if (empty) { empty.classList.remove('hidden'); empty.textContent = 'No sites configured.'; } return; }
  if (empty) empty.classList.add('hidden');

  entries.forEach(([wsite, centralSite]) => {
    const wirelessCount = centralWirelessClients[wsite] ?? '—';
    const simCount = [...(clients instanceof Map ? clients.values() : Object.values(clients || {}))]
      .filter((cl) => (cl.config?.wsite || cl.effective_config?.wsite || '') === wsite).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(wsite)}</td><td>${escHtml(centralSite || '—')}</td><td>${wirelessCount}</td><td>${simCount}</td>`;
    tbody.appendChild(tr);
  });
}

async function renderCentralAllHistory() {
  const body = document.getElementById('central-all-history-body');
  if (!body) return;
  body.textContent = 'Loading history…';
  const mappings = currentSettings.site_mappings || {};
  const entries = Object.entries(mappings);
  if (!entries.length) { body.innerHTML = '<p class="form-hint">No sites configured.</p>'; return; }

  const allRecords = [];
  await Promise.all(entries.map(async ([wsite]) => {
    try {
      const data = await requestJson(`/api/central/history?site=${encodeURIComponent(wsite)}&hours=24`);
      (data.records || []).forEach((r) => allRecords.push({ ...r, wsite }));
    } catch (_) { /* skip */ }
  }));

  body.textContent = '';
  if (!allRecords.length) { body.innerHTML = '<p class="form-hint">No history in the last 24 hours.</p>'; return; }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `<thead><tr><th>Site</th><th>Time</th><th>Check</th><th>Status</th><th>Count</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  allRecords.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200).forEach((r) => {
    const tr = document.createElement('tr');
    [r.wsite, formatCentralDate(r.ts), r.check_name || r.check_id || '—', r.status || '—', String(r.count ?? '—')]
      .forEach((val) => { const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

async function loadSiteHistory(wsite) {
  if (!centralSiteHistory) return;
  centralSiteHistory.textContent = 'Loading history…';
  try {
    const data = await requestJson(`/api/central/history?site=${encodeURIComponent(wsite)}&hours=24`);
    renderSiteHistory(data.records || []);
  } catch (error) {
    centralSiteHistory.textContent = `Could not load history: ${error.message}`;
  }
}

function renderSiteClients(wsite) {
  if (!centralSiteClients) return;
  centralSiteClients.textContent = '';
  const siteClients = [...clients.values()]
    .filter((client) => (client.config?.wsite || client.effective_config?.wsite || '') === wsite)
    .sort((a, b) => (a.hostname || '').localeCompare(b.hostname || ''));

  if (!siteClients.length) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = 'No connected or known clients for this site.';
    centralSiteClients.appendChild(empty);
    return;
  }

  siteClients.forEach((client) => {
    const row = document.createElement('div');
    row.className = 'client-mini-row';

    const dot = document.createElement('span');
    dot.className = `status-dot ${client.online ? 'online' : 'offline'}`;

    const host = document.createElement('span');
    host.className = 'client-mini-host';
    host.textContent = client.hostname || '—';

    const meta = document.createElement('span');
    meta.className = 'client-mini-sim';
    const active = (client.active_simulations || []).join(', ') || 'No active simulations';
    meta.textContent = `${client.simulation_id || '—'} · ${active}`;

    row.appendChild(dot);
    row.appendChild(host);
    row.appendChild(meta);
    centralSiteClients.appendChild(row);
  });
}

function renderSiteChecks(wsite, checkStatusMap) {
  if (!centralSiteChecks) return;
  centralSiteChecks.textContent = '';
  const monitoredChecks = currentSettings.monitored_checks || [];
  if (!monitoredChecks.length) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = 'No monitored checks configured.';
    centralSiteChecks.appendChild(empty);
    return;
  }

  monitoredChecks.forEach((check) => {
    const status = checkStatusMap[check.id] || null;
    const row = document.createElement('div');
    row.className = 'check-status-row';

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'check-status-name';
    name.textContent = check.name || check.id;
    const meta = document.createElement('div');
    meta.className = 'check-status-count';
    meta.textContent = `${check.type} · ${status ? `Updated ${formatCentralDate(status.ts)}` : 'Not yet polled'}`;
    left.appendChild(name);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';
    right.appendChild(buildCheckBadge(
      status ? status.status : 'UNKNOWN',
      status?.status === 'OK' ? 'check-badge-ok' : status?.status === 'ERROR' ? 'check-badge-error' : 'check-badge-unknown'
    ));

    const count = document.createElement('span');
    count.className = 'check-status-count';
    count.textContent = status ? `Count ${status.count ?? 0}` : 'Count —';
    right.appendChild(count);

    row.appendChild(left);
    row.appendChild(right);
    centralSiteChecks.appendChild(row);
  });
}

function renderSiteHistory(records) {
  if (!centralSiteHistory) return;
  centralSiteHistory.textContent = '';
  const sorted = [...records]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 100);

  if (!sorted.length) {
    centralSiteHistory.textContent = 'No history records in the last 24 hours.';
    return;
  }

  const table = document.createElement('table');
  table.className = 'history-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Time', 'Check', 'Status', 'Count'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbodyEl = document.createElement('tbody');
  sorted.forEach((record) => {
    const row = document.createElement('tr');
    const values = [
      formatCentralDate(record.ts),
      record.check_name || record.check_id || '—',
      record.status || '—',
      String(record.count ?? '—')
    ];
    values.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    });
    tbodyEl.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbodyEl);
  centralSiteHistory.appendChild(table);
}

async function loadSiteAlerts(wsite) {
  if (!centralSiteAlerts) return;
  centralSiteAlerts.textContent = 'Loading alerts…';
  if (centralSiteAlertsCount) centralSiteAlertsCount.textContent = '';
  const centralSite = currentSettings.site_mappings?.[wsite] || wsite;
  try {
    const data = await requestJson(`/api/central/site-alerts?site=${encodeURIComponent(centralSite)}`);
    renderSiteAlerts(data.alerts || [], data.warning);
    if (centralSiteAlertsCount) {
      centralSiteAlertsCount.textContent = data.count ? `(${data.count})` : '';
    }
  } catch (err) {
    centralSiteAlerts.textContent = `Could not load alerts: ${err.message}`;
  }
}

function renderSiteAlerts(alerts, warning) {
  if (!centralSiteAlerts) return;
  centralSiteAlerts.textContent = '';

  if (warning && !alerts.length) {
    const msg = document.createElement('div');
    msg.className = 'form-hint';
    msg.textContent = warning;
    centralSiteAlerts.appendChild(msg);
    return;
  }

  if (warning) {
    const msg = document.createElement('div');
    msg.className = 'form-hint';
    msg.textContent = `⚠ ${warning}`;
    centralSiteAlerts.appendChild(msg);
  }

  const table = document.createElement('table');
  table.className = 'history-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Time', 'Type', 'Severity', 'State', 'Device', 'Message'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  alerts.forEach((alert) => {
    const row = document.createElement('tr');
    [
      formatCentralDate(alert.ts),
      alert.name || alert.type || '—',
      alert.severity || '—',
      alert.state || '—',
      alert.device || '—',
      alert.message || '—',
    ].forEach((val) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (val === 'CRITICAL' || val === 'MAJOR') td.style.color = 'var(--color-error, #c0392b)';
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  centralSiteAlerts.appendChild(table);
}


function openSiteDetail(wsite) {
  centralSiteDetailOpen = wsite;
  if (centralOverview) centralOverview.classList.add('hidden');
  if (centralSiteDetail) centralSiteDetail.classList.remove('hidden');
  if (centralDetailTitle) centralDetailTitle.textContent = wsite;
  if (centralDetailSub) {
    centralDetailSub.textContent = `Central site: ${currentSettings.site_mappings?.[wsite] || 'Unmapped'}`;
  }
  renderSiteClients(wsite);
  renderSiteChecks(wsite, centralStatusData[wsite] || {});
  loadSiteHistory(wsite);
  loadSiteAlerts(wsite);
}

function closeSiteDetail() {
  centralSiteDetailOpen = null;
  if (centralSiteDetail) centralSiteDetail.classList.add('hidden');
  if (centralOverview) centralOverview.classList.remove('hidden');
}

function handleCentralUpdate(status, ts, wirelessClients, hwAlerts, ccStatus) {
  centralStatusData = status || {};
  if (wirelessClients) centralWirelessClients = wirelessClients;
  if (hwAlerts) hwAlertsData = hwAlerts;
  if (ccStatus) clientCountData = ccStatus;
  centralLastSyncedTs = ts ? ts * 1000 : Date.now();
  renderCentralOverview();
  renderChecksList();
  if (centralSiteDetailOpen) {
    renderSiteClients(centralSiteDetailOpen);
    renderSiteChecks(centralSiteDetailOpen, centralStatusData[centralSiteDetailOpen] || {});
    loadSiteHistory(centralSiteDetailOpen);
  }
}

async function loadSettings() {
  try {
    const settings = await requestJson('/api/settings');
    applySettingsToUI(settings || {});
    await loadUsbConfig().catch(() => {});
    await loadSpokeAcmeSettings().catch(() => {});
  } catch (error) {
    showSettingsMessage(`Error loading settings: ${error.message}`, true);
  }
}



function spokeAcmeBadgeClass(daysRemaining) {
  if (typeof daysRemaining !== 'number' || Number.isNaN(daysRemaining)) return 'badge-grey';
  if (daysRemaining > 30) return 'badge-green';
  if (daysRemaining >= 10) return 'badge-yellow';
  return 'badge-red';
}

function toggleSpokeAcmeDnsSection() {
  const challenge = document.getElementById('spoke-acme-challenge')?.value || 'http-01';
  const isDns = challenge === 'dns-01';
  document.getElementById('spoke-acme-dns-section')?.classList.toggle('hidden', !isDns);
  if (isDns) {
    const provider = document.getElementById('spoke-acme-dns-provider')?.value || 'cloudflare';
    document.getElementById('spoke-acme-cloudflare-fields')?.classList.toggle('hidden', provider !== 'cloudflare');
    document.getElementById('spoke-acme-he-fields')?.classList.toggle('hidden', provider !== 'hurricane_electric');
  }
}

function renderSpokeAcmeStatus(certInfo = {}, cfg = {}) {
  const container = document.getElementById('spoke-acme-cert-status');
  if (!container) return;
  if (!certInfo || certInfo.source === 'none') {
    container.innerHTML = `
      <div class="setup-status-item"><span class="setup-status-label">Certificate</span><span class="setup-status-value">Not configured</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Challenge</span><span class="setup-status-value">${escapeHtml(cfg.challenge || 'http-01')}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Authority</span><span class="setup-status-value">${escapeHtml(cfg.ca || 'letsencrypt')}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">HTTPS Mode</span><span class="setup-status-value">${cfg.spoke_tls === 'on' ? 'Enabled on restart' : 'Disabled'}</span></div>
    `;
    return;
  }
  const days = Number(certInfo.days_remaining ?? 0);
  container.innerHTML = `
    <div class="setup-status-item"><span class="setup-status-label">Domain</span><span class="setup-status-value">${escapeHtml(certInfo.domain || cfg.domain || '—')}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Expires</span><span class="setup-status-value">${escapeHtml(certInfo.expires || '—')} <span class="badge ${spokeAcmeBadgeClass(days)}">${Number.isFinite(days) ? `${days} days` : 'unknown'}</span></span></div>
    <div class="setup-status-item"><span class="setup-status-label">Issuer</span><span class="setup-status-value">${escapeHtml(certInfo.issuer || '—')}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">HTTPS Mode</span><span class="setup-status-value">${cfg.spoke_tls === 'on' ? 'Enabled on restart' : 'Disabled'}</span></div>
  `;
}

async function loadSpokeAcmeSettings() {
  const data = await requestJson('/api/acme');
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  setValue('spoke-acme-domain', data.domain || '');
  setValue('spoke-acme-email', data.email || '');
  setValue('spoke-acme-ca', data.ca || 'letsencrypt');
  setValue('spoke-acme-challenge', data.challenge || 'http-01');
  setValue('spoke-acme-dns-provider', data.dns_provider || 'cloudflare');
  const enabled = document.getElementById('spoke-acme-enabled');
  if (enabled) enabled.checked = !!data.enabled;
  const tlsEnabled = document.getElementById('spoke-tls-enabled');
  if (tlsEnabled) tlsEnabled.checked = data.spoke_tls === 'on';
  const token = document.getElementById('spoke-acme-cf-token');
  const heKey = document.getElementById('spoke-acme-he-ddns-key');
  setSecretInputConfigured(token, isConfiguredSecretValue(data.cf_api_token_set ?? data.dns_credentials_configured?.cf_api_token ?? data.dns_credentials?.cf_api_token));
  setSecretInputConfigured(heKey, isConfiguredSecretValue(data.he_ddns_key_set ?? data.dns_credentials_configured?.he_ddns_key ?? data.dns_credentials?.he_ddns_key));
  toggleSpokeAcmeDnsSection();
  renderSpokeAcmeStatus(data.cert_info || {}, data);
}

async function saveSpokeAcmeConfig() {
  const cfTokenInput = document.getElementById('spoke-acme-cf-token');
  const heKeyInput = document.getElementById('spoke-acme-he-ddns-key');
  const cfToken = getSecretInputPayload(cfTokenInput);
  const heKey = getSecretInputPayload(heKeyInput);
  const payload = {
    enabled: !!document.getElementById('spoke-acme-enabled')?.checked,
    domain: document.getElementById('spoke-acme-domain')?.value.trim() || '',
    email: document.getElementById('spoke-acme-email')?.value.trim() || '',
    ca: document.getElementById('spoke-acme-ca')?.value || 'letsencrypt',
    challenge: document.getElementById('spoke-acme-challenge')?.value || 'http-01',
    dns_provider: document.getElementById('spoke-acme-dns-provider')?.value || '',
    dns_credentials: {},
    spoke_tls: document.getElementById('spoke-tls-enabled')?.checked ? 'on' : 'off'
  };
  if (cfToken.include) payload.dns_credentials.cf_api_token = cfToken.value;
  if (heKey.include) payload.dns_credentials.he_ddns_key = heKey.value;
  try {
    const data = await requestJson('/api/acme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const msg = document.getElementById('spoke-acme-msg');
    if (msg) {
      msg.textContent = 'TLS certificate settings saved.';
      msg.className = 'form-msg msg-ok';
    }
    renderSpokeAcmeStatus(data.cert_info || {}, data);
    setSecretInputConfigured(cfTokenInput, isConfiguredSecretValue(data.cf_api_token_set ?? data.dns_credentials_configured?.cf_api_token ?? data.dns_credentials?.cf_api_token));
    setSecretInputConfigured(heKeyInput, isConfiguredSecretValue(data.he_ddns_key_set ?? data.dns_credentials_configured?.he_ddns_key ?? data.dns_credentials?.he_ddns_key));
  } catch (error) {
    const msg = document.getElementById('spoke-acme-msg');
    if (msg) {
      msg.textContent = `Error: ${error.message}`;
      msg.className = 'form-msg msg-error';
    }
  }
}

let spokeAcmePoller = null;

async function pollSpokeAcmeStatus() {
  try {
    const status = await requestJson('/api/acme/status');
    if (!status.running) {
      if (spokeAcmePoller) {
        clearInterval(spokeAcmePoller);
        spokeAcmePoller = null;
      }
      const btn = document.getElementById('spoke-acme-request-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Request Certificate Now';
      }
      const msg = document.getElementById('spoke-acme-msg');
      if (status.last_result?.success) {
        if (msg) {
          msg.textContent = `Certificate issued for ${status.last_result.domain} — restart the spoke to enable HTTPS.`;
          msg.className = 'form-msg msg-ok';
        }
        await loadSpokeAcmeSettings();
      } else if (status.last_error && msg) {
        msg.textContent = status.last_error;
        msg.className = 'form-msg msg-error';
      }
    }
  } catch (error) {
    console.warn('ACME status poll failed', error);
  }
}

async function requestSpokeAcmeCert() {
  const btn = document.getElementById('spoke-acme-request-btn');
  const msg = document.getElementById('spoke-acme-msg');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Requesting certificate…';
  }
  if (msg) {
    msg.textContent = 'Requesting certificate… (this may take 60-90 seconds)';
    msg.className = 'form-msg msg-ok';
  }
  try {
    await requestJson('/api/acme/request', { method: 'POST' });
    if (spokeAcmePoller) clearInterval(spokeAcmePoller);
    spokeAcmePoller = setInterval(pollSpokeAcmeStatus, 2000);
    await pollSpokeAcmeStatus();
  } catch (error) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Request Certificate Now';
    }
    if (msg) {
      msg.textContent = `Error: ${error.message}`;
      msg.className = 'form-msg msg-error';
    }
  }
}

window.saveSpokeAcmeConfig = saveSpokeAcmeConfig;
window.requestSpokeAcmeCert = requestSpokeAcmeCert;


async function loadCentralStatus() {
  centralStatusInitialized = true;
  try {
    const data = await requestJson('/api/central/status');
    mergeSettings({
      site_mappings: data.site_mappings || {},
      monitored_checks: data.monitored_checks || []
    });
    centralTokenValid = Boolean(data.token_valid);
    setCentralApiStatus(centralTokenValid, data.token_state);
    handleCentralUpdate(
      data.status || {},
      Date.now() / 1000,
      data.wireless_clients || {},
      data.hardware_alerts || [],
      data.client_count_status || {}
    );
    renderSelectedChecksPreview();
    renderSiteMappingsTable();
  } catch (error) {
    centralTokenValid = false;
    setCentralApiStatus(false);
    updateCentralToolbar();
    if (centralEmpty) {
      centralEmpty.textContent = `Could not load Central status: ${error.message}`;
      centralEmpty.classList.remove('hidden');
    }
  }
}

function buildToggle(flag, checked) {
  const wrapper = document.createElement('label');
  wrapper.className = 'toggle-item';

  const text = document.createElement('span');
  text.className = 'toggle-label';
  text.textContent = flag;

  const switchLabel = document.createElement('span');
  switchLabel.className = 'switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.flag = flag;
  input.checked = checked;

  const slider = document.createElement('span');
  slider.className = 'slider';

  switchLabel.appendChild(input);
  switchLabel.appendChild(slider);
  wrapper.appendChild(text);
  wrapper.appendChild(switchLabel);
  return wrapper;
}

function renderControlPanel(hostname) {
  const client = clients.get(hostname);
  const refs = rowRefs.get(hostname);
  if (!client || !refs) return;

  const baseConfig = client.effective_config || client.config || {};
  refs.detailCell.textContent = '';

  const panel = document.createElement('div');
  panel.className = 'control-panel';

  const header = document.createElement('div');
  header.className = 'control-panel-header';
  const title = document.createElement('h2');
  title.textContent = client.hostname;
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Set per-client or global simulation overrides.';
  header.appendChild(title);
  header.appendChild(subtitle);

  const toggles = document.createElement('div');
  toggles.className = 'toggle-grid';
  FLAG_ORDER.forEach((flag) => {
    toggles.appendChild(buildToggle(flag, normalizeFlagValue(baseConfig[flag]) === 'on'));
  });

  const actions = document.createElement('div');
  actions.className = 'panel-actions';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'btn btn-primary';
  applyButton.textContent = 'Apply';
  applyButton.addEventListener('click', async () => {
    try {
      const nextState = collectPanelState(panel);
      const diff = {};
      FLAG_ORDER.forEach((flag) => {
        if (normalizeFlagValue(baseConfig[flag]) !== nextState[flag]) {
          diff[flag] = nextState[flag];
        }
      });
      if (!Object.keys(diff).length) return;
      const result = await sendJson(`/api/clients/${encodeURIComponent(hostname)}/control`, {
        method: 'POST',
        body: JSON.stringify(diff)
      });
      if (result?.client) upsertClient(result.client);
    } catch (error) {
      window.alert(`Apply failed: ${error.message}`);
    }
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'btn btn-secondary';
  clearButton.textContent = 'Clear Overrides';
  clearButton.addEventListener('click', async () => {
    try {
      const result = await sendJson(`/api/clients/${encodeURIComponent(hostname)}/control`, {
        method: 'DELETE'
      });
      if (result?.client) upsertClient(result.client);
    } catch (error) {
      window.alert(`Clear failed: ${error.message}`);
    }
  });

  const applyAllButton = document.createElement('button');
  applyAllButton.type = 'button';
  applyAllButton.className = 'btn btn-danger';
  applyAllButton.textContent = 'Apply to ALL';
  applyAllButton.addEventListener('click', async () => {
    try {
      const nextState = collectPanelState(panel);
      await sendJson('/api/clients/all/control', {
        method: 'POST',
        body: JSON.stringify(nextState)
      });
    } catch (error) {
      window.alert(`Apply to ALL failed: ${error.message}`);
    }
  });

  const saveOverridesButton = document.createElement('button');
  saveOverridesButton.type = 'button';
  saveOverridesButton.className = 'btn btn-secondary';
  saveOverridesButton.textContent = 'Save to user-overrides';
  saveOverridesButton.addEventListener('click', async () => {
    try {
      const username = hostname.split('-')[0] || hostname;
      const flags = collectPanelState(panel);
      const result = await requestJson('/api/config/overrides/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, flags })
      });
      window.alert(result?.pushed ? 'Saved to user-overrides and pushed to GitHub.' : 'Saved to user-overrides locally.');
    } catch (error) {
      window.alert(`Save to user-overrides failed: ${error.message}`);
    }
  });

  actions.appendChild(applyButton);
  actions.appendChild(clearButton);
  actions.appendChild(applyAllButton);
  actions.appendChild(saveOverridesButton);

  panel.appendChild(header);
  panel.appendChild(toggles);
  panel.appendChild(actions);

  // Error log section — shows the rolling buffer of errors reported by this client.
  // WHY: Operators need to diagnose why a client isn't connecting. Rather than
  // SSH-ing into the client to read log files, the error messages are surfaced here
  // directly in the dashboard so the problem can be identified remotely.
  const recentErrors = client.recent_errors || [];
  const errorSection = document.createElement('div');
  errorSection.className = 'error-log-section';
  const errorTitle = document.createElement('h3');
  const errCount = client.error_count || 0;
  errorTitle.textContent = `Error Log (${recentErrors.length} shown, ${errCount} total)`;
  errorSection.appendChild(errorTitle);

  if (recentErrors.length === 0) {
    const none = document.createElement('p');
    none.className = 'error-log-empty';
    none.textContent = 'No errors reported.';
    errorSection.appendChild(none);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'error-log-list';
    // Show newest errors first so the operator sees the latest problem immediately
    [...recentErrors].reverse().forEach(({ ts, msg }) => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 'error-ts';
      time.textContent = ts || '';
      const message = document.createElement('span');
      message.className = 'error-msg';
      message.textContent = msg || '';
      li.appendChild(time);
      li.appendChild(message);
      ul.appendChild(li);
    });
    errorSection.appendChild(ul);
  }

  panel.appendChild(errorSection);
  refs.detailCell.appendChild(panel);
}

function toggleControlRow(hostname) {
  if (openControlHost && openControlHost !== hostname) {
    const currentRefs = rowRefs.get(openControlHost);
    if (currentRefs) {
      currentRefs.detailRow.classList.add('hidden');
      currentRefs.mainRow.classList.remove('expanded');
      currentRefs.controlButton.textContent = 'Control';
    }
  }

  const refs = rowRefs.get(hostname);
  if (!refs) return;

  const shouldOpen = openControlHost !== hostname || refs.detailRow.classList.contains('hidden');
  refs.detailRow.classList.toggle('hidden', !shouldOpen);
  refs.mainRow.classList.toggle('expanded', shouldOpen);
  refs.controlButton.textContent = shouldOpen ? 'Close' : 'Control';
  openControlHost = shouldOpen ? hostname : null;

  if (shouldOpen) {
    renderControlPanel(hostname);
  }
}

function buildConfigInput(field, value = '') {
  const group = document.createElement('div');
  group.className = 'form-group';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = field.key;

  const input = document.createElement('input');
  input.className = 'form-input';
  input.type = field.type || 'text';
  input.value = value || '';
  input.dataset.configSection = field.section;
  input.dataset.configKey = field.key;

  group.appendChild(label);
  group.appendChild(input);
  return { group, input };
}

function buildConfigSelect(section, key, options, value = '') {
  const group = document.createElement('div');
  group.className = 'form-group';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = key;

  const select = document.createElement('select');
  select.className = 'form-input';
  select.dataset.configSection = section;
  select.dataset.configKey = key;

  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === value;
    select.appendChild(option);
  });

  group.appendChild(label);
  group.appendChild(select);
  return { group, select };
}

function buildConfigToggle(field, value) {
  const toggle = buildToggle(field.key, normalizeFlagValue(value) === 'on');
  const input = toggle.querySelector('input');
  if (input) {
    input.dataset.configSection = field.section;
    input.dataset.configKey = field.key;
  }
  return toggle;
}

function collectSectionedConfigState(root) {
  const payloads = {};
  if (!root) return payloads;
  root.querySelectorAll('[data-config-section][data-config-key]').forEach((input) => {
    const section = input.dataset.configSection;
    const key = input.dataset.configKey;
    if (!section || !key) return;
    if (!payloads[section]) payloads[section] = {};
    payloads[section][key] = input.type === 'checkbox' ? (input.checked ? 'on' : 'off') : input.value;
  });
  return payloads;
}

function buildBucketSummary(section, values = {}) {
  return `${section} — ${values.name || values.wsite || 'Unnamed bucket'}`;
}

const ADDRESS_SECTION_RE = /^(server|address)$/i;

function _buildSectionCard(section, values, container) {
  const card = document.createElement('div');
  card.className = 'setup-card setup-section-gap';

  const hdr = document.createElement('div');
  hdr.className = 'setup-card-header';
  const h2 = document.createElement('h2');
  h2.textContent = `[${_fmtSection(section)}]`;
  hdr.appendChild(h2);
  card.appendChild(hdr);

  const form = document.createElement('div');
  form.className = 'setup-form';

  const textPairs = [], boolPairs = [];
  Object.entries(values).forEach(([key, val]) => {
    (_isBoolVal(val) ? boolPairs : textPairs).push([key, val]);
  });

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'config-field-grid';

  textPairs.forEach(([key, val]) => {
    if (key === 'sim_load') {
      const simLoadOptions = ['100', '75', '50', '25', '0'];
      const { group, select } = buildConfigSelect(section, key, simLoadOptions, String(val));
      const lbl = group.querySelector('label');
      if (lbl) lbl.textContent = 'Sim Load %';
      // Replace option text with descriptive labels
      select.options[0].textContent = '100% — Full load (all simulations)';
      select.options[1].textContent = '75% — 3/4 simulations';
      select.options[2].textContent = '50% — Half simulations';
      select.options[3].textContent = '25% — 1/4 simulations';
      select.options[4].textContent = '0% — No simulations (stay associated)';
      fieldGrid.appendChild(group);
      return;
    }
    const { group } = buildConfigInput({ section, key, type: PW_KEY_RE.test(key) ? 'password' : 'text' }, val);
    const lbl = group.querySelector('label');
    if (lbl) lbl.textContent = _fmtConfigKey(key);
    fieldGrid.appendChild(group);
  });

  if (textPairs.length) form.appendChild(fieldGrid);

  if (boolPairs.length) {
    const h3 = document.createElement('h3');
    h3.textContent = 'Flags';
    form.appendChild(h3);
    const grid = document.createElement('div');
    grid.className = 'toggle-grid';
    boolPairs.forEach(([key, val]) => grid.appendChild(buildConfigToggle({ section, key }, val)));
    form.appendChild(grid);
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = `Save [${section}] to GitHub`;
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  const msg = document.createElement('div');
  msg.className = 'settings-message hidden';
  form.appendChild(msg);

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const updates = collectSectionedConfigState(form)[section] || {};
      const result = await requestJson('/api/config/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, updates }),
      });
      showInlineMessage(msg, result?.pushed ? `[${section}] saved and pushed to GitHub.` : `[${section}] saved. GitHub push skipped.`, false, 7000);
      await loadConfigEditor(true);
    } catch (error) {
      showInlineMessage(msg, `Error: ${error.message}`, true, 7000);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = `Save [${section}] to GitHub`;
    }
  });

  card.appendChild(form);
  container.appendChild(card);
}

function renderSimulationConfigForm() {
  if (!configSimulationForm) return;
  configSimulationForm.textContent = '';

  const sections = Object.keys(configData).filter(
    s => !BUCKET_SECTION_RE.test(s) && !ADDRESS_SECTION_RE.test(s)
  );
  if (sections.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No configuration sections found — sync from GitHub first.';
    configSimulationForm.appendChild(p);
    return;
  }

  sections.forEach(section => _buildSectionCard(section, configData[section] || {}, configSimulationForm));
}

function renderAddressesForm() {
  if (!configAddressesForm) return;
  configAddressesForm.textContent = '';

  const sections = Object.keys(configData).filter(s => ADDRESS_SECTION_RE.test(s));
  if (sections.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No [server] or [address] sections found — sync from GitHub first.';
    configAddressesForm.appendChild(p);
    return;
  }

  sections.forEach(section => _buildSectionCard(section, configData[section] || {}, configAddressesForm));
}

function renderBucketEditors() {
  if (!configBucketsContainer) return;
  configBucketsContainer.textContent = '';

  const buckets = Object.keys(configData)
    .filter(s => BUCKET_SECTION_RE.test(s))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

  if (buckets.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No bucket sections (s0–s9) found in simulation.conf.';
    configBucketsContainer.appendChild(p);
    return;
  }

  buckets.forEach((section, idx) => {
    const values = configData[section] || {};
    const details = document.createElement('details');
    details.className = 'setup-card setup-section-gap';
    if (idx === 0) details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = buildBucketSummary(section, values);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'setup-form';

    const tracked = { ...values };

    const fieldGrid = document.createElement('div');
    fieldGrid.className = 'config-field-grid';

    // Text inputs (preserve file order, skip booleans and sim_phy)
    Object.entries(values).forEach(([key, val]) => {
      if (key === 'sim_phy' || _isBoolVal(val)) return;
      const { group, input } = buildConfigInput(
        { section, key, type: PW_KEY_RE.test(key) ? 'password' : 'text' },
        val,
      );
      const lbl = group.querySelector('label');
      if (lbl) lbl.textContent = _fmtConfigKey(key);
      input.addEventListener('input', () => {
        tracked[key] = input.value.trim();
        summary.textContent = buildBucketSummary(section, tracked);
      });
      fieldGrid.appendChild(group);
    });

    // sim_phy select (if present)
    if ('sim_phy' in values) {
      const { group } = buildConfigSelect(section, 'sim_phy', ['wireless', 'ethernet'], values.sim_phy || 'wireless');
      const lbl = group.querySelector('label');
      if (lbl) lbl.textContent = 'Sim Phy';
      fieldGrid.appendChild(group);
    }

    body.appendChild(fieldGrid);

    // Toggle flags
    const boolPairs = Object.entries(values).filter(([k, v]) => k !== 'sim_phy' && _isBoolVal(v));
    if (boolPairs.length) {
      const h3 = document.createElement('h3');
      h3.textContent = 'Flags';
      body.appendChild(h3);
      const grid = document.createElement('div');
      grid.className = 'toggle-grid';
      boolPairs.forEach(([key, val]) => grid.appendChild(buildConfigToggle({ section, key }, val)));
      body.appendChild(grid);
    }

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-primary';
    saveButton.textContent = 'Save Bucket';
    actions.appendChild(saveButton);
    body.appendChild(actions);

    const message = document.createElement('div');
    message.className = 'settings-message hidden';
    body.appendChild(message);

    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      try {
        const updates = collectSectionedConfigState(body)[section] || {};
        const result = await requestJson('/api/config/simulation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section, updates }),
        });
        showInlineMessage(message, result?.pushed ? `Saved ${section} and pushed to GitHub.` : `Saved ${section}. GitHub push skipped.`, false, 7000);
        await loadConfigEditor(true);
      } catch (error) {
        showInlineMessage(message, `Error: ${error.message}`, true, 7000);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Bucket';
      }
    });

    details.appendChild(body);
    configBucketsContainer.appendChild(details);
  });
}

async function loadConfigEditor(force = false) {
  if (!force && configLoaded) return configData;
  try {
    const data = await requestJson('/api/config/parsed');
    configData = data || {};
    configLoaded = true;
    renderSimulationConfigForm();
    renderAddressesForm();
    renderBucketEditors();
    return configData;
  } catch (error) {
    configLoaded = false;
    showInlineMessage(configSimulationMsg, `Error: ${error.message}`, true, 7000);
    showInlineMessage(configBucketsMsg, `Error: ${error.message}`, true, 7000);
    throw error;
  }
}

// ── Command Inbox ─────────────────────────────────────────────────────────────

const cmdTarget    = document.getElementById('cmd-target');
const cmdAction    = document.getElementById('cmd-action');
const cmdSendBtn   = document.getElementById('cmd-send-btn');
const cmdClearBtn  = document.getElementById('cmd-clear-btn');
const cmdMsg       = document.getElementById('cmd-msg');
const cmdTbody     = document.getElementById('cmd-tbody');
const cmdEmpty     = document.getElementById('cmd-empty');

const CMD_STATUS_LABELS = {
  pending:   { text: 'Pending',   cls: 'badge-yellow' },
  delivered: { text: 'Delivered', cls: 'badge-blue' },
  completed: { text: 'Completed', cls: 'badge-green' },
  failed:    { text: 'Failed',    cls: 'badge-red' },
  expired:   { text: 'Expired',   cls: 'badge-grey' },
};

function proxmoxTargetLabel() {
  const hostname = String(latestProxmoxData?.hostname || latestProxmoxData?.node?.hostname || '').trim();
  return hostname || 'Proxmox Host';
}

function updateCmdTargetDropdown(clientList = [...clients.values()]) {
  if (!cmdTarget) return;
  const proxmoxOption = [...cmdTarget.options].find((option) => option.value === 'proxmox');
  if (proxmoxOption) proxmoxOption.textContent = proxmoxTargetLabel();
  [...cmdTarget.options].forEach((option) => {
    if (option.value !== 'all' && option.value !== 'proxmox') option.remove();
  });
  clientList.forEach((client) => {
    if (!client?.hostname) return;
    const option = document.createElement('option');
    option.value = client.hostname;
    option.textContent = client.hostname;
    cmdTarget.appendChild(option);
  });
}

// ── Command description helpers ───────────────────────────────────────────
function vmNameFromId(vmid) {
  if (!vmid) return null;
  const vms = (latestProxmoxData && latestProxmoxData.vms) || [];
  const found = vms.find((v) => String(v.vmid) === String(vmid));
  return found ? found.name : null;
}

const CMD_ACTION_LABELS = {
  restart_sim:          'Restarting simulation',
  reboot:               'Rebooting device',
  update_now:           'Forcing update',
  kill_switch:          'Kill switch',
  reclone_vms:          'Recloning all VMs',
  snapshot_vms:         'Snapshotting all VMs',
  start_vms:            'Starting all VMs',
  stop_vms:             'Stopping all VMs',
  reclone_vm:           'Recloning VM',
  delete_vm:            'Deleting VM',
  start_vm:             'Starting VM',
  stop_vm:              'Stopping VM',
  reboot_vm:            'Rebooting VM',
  snapshot_vm:          'Snapshotting VM',
  provision_unassigned: 'Provisioning unassigned dongles',
  update_agent:         'Updating Proxmox agent',
};

function cmdDescription(cmd) {
  const base = CMD_ACTION_LABELS[cmd.action] || cmd.action.replace(/_/g, ' ');
  const vmid = cmd.args && cmd.args.vmid;
  if (vmid) {
    const name = vmNameFromId(vmid);
    return name ? `${base}: ${name}` : `${base}: VM ${vmid}`;
  }
  return base;
}

function cmdTargetLabel(cmd) {
  const target = cmd.target || '—';
  const vmid = cmd.args && cmd.args.vmid;
  if (vmid) {
    const name = vmNameFromId(vmid);
    return name || `VM ${vmid}`;
  }
  if (target === 'all') return 'All Clients';
  if (target === 'proxmox') return proxmoxTargetLabel();
  return target;
}

function renderCommandTable(cmds) {
  if (!cmdTbody || !cmdEmpty) return;
  cmdTbody.innerHTML = '';
  if (!cmds || cmds.length === 0) {
    cmdEmpty.style.display = '';
    return;
  }
  cmdEmpty.style.display = 'none';
  [...cmds].reverse().forEach((cmd) => {
    const info = CMD_STATUS_LABELS[cmd.status] || { text: cmd.status, cls: 'badge-grey' };
    const age = cmd.age_secs != null ? `${Math.floor(cmd.age_secs / 60)}m ${cmd.age_secs % 60}s` : '—';
    const tr = document.createElement('tr');

    const targetTd = document.createElement('td');
    targetTd.textContent = cmdTargetLabel(cmd);
    tr.appendChild(targetTd);

    const actionTd = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = cmd.action;
    actionTd.appendChild(code);
    tr.appendChild(actionTd);

    const descTd = document.createElement('td');
    descTd.textContent = cmdDescription(cmd);
    tr.appendChild(descTd);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${info.cls}`;
    badge.textContent = info.text;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    const ageTd = document.createElement('td');
    ageTd.textContent = age;
    tr.appendChild(ageTd);

    const messageTd = document.createElement('td');
    messageTd.style.maxWidth = '220px';
    messageTd.style.overflow = 'hidden';
    messageTd.style.textOverflow = 'ellipsis';
    messageTd.style.whiteSpace = 'nowrap';
    messageTd.textContent = cmd.message || '—';
    tr.appendChild(messageTd);

    const deleteTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon';
    deleteBtn.dataset.id = cmd.id;
    deleteBtn.title = 'Remove';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', async (event) => {
      try {
        await fetch(`/api/commands/${event.currentTarget.dataset.id}`, { method: 'DELETE' });
      } catch (_) { /* silent */ }
    });
    deleteTd.appendChild(deleteBtn);
    tr.appendChild(deleteTd);

    cmdTbody.appendChild(tr);
  });
}

if (cmdSendBtn) {
  cmdSendBtn.addEventListener('click', async () => {
    const target = cmdTarget?.value || '';
    const action = cmdAction?.value || '';
    if (cmdMsg) {
      cmdMsg.textContent = '';
      cmdMsg.className = 'form-msg';
    }
    try {
      const data = await requestJson('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, action })
      });
      if (cmdMsg) {
        cmdMsg.textContent = `✓ Queued ${data.queued} command(s)`;
        cmdMsg.classList.add('msg-ok');
      }
    } catch (err) {
      if (cmdMsg) {
        cmdMsg.textContent = `✗ ${err.message}`;
        cmdMsg.classList.add('msg-error');
      }
    }
  });
}

if (cmdClearBtn) {
  cmdClearBtn.addEventListener('click', async () => {
    const ids = [...cmdTbody.querySelectorAll('[data-id]')].map((button) => button.dataset.id);
    await Promise.all(ids.map((id) => fetch(`/api/commands/${id}`, { method: 'DELETE' })));
  });
}

requestJson('/api/commands').then((commands) => {
  window._lastCommands = commands || [];
  renderCommandTable(commands);
}).catch(() => {});

async function renderServiceStatus() {
  const tbody = document.getElementById('services-tbody');
  if (!tbody) return;
  try {
    const data = await requestJson('/api/services/status');
    const tasks = data.tasks || {};
    const names = data.task_names || Object.keys(tasks);

    const LABELS = {
      sync_repo: 'Repo Sync',
      heartbeat: 'Heartbeat Check',
      central_token: 'Aruba Central Token',
      central_poller: 'Aruba Central Poller',
      update_checker: 'Update Checker',
      relay: 'Hub Loop',
      client_history_saver: 'Client History Save',
      command_expiry: 'Command Expiry',
      auto_recovery: 'Auto Recovery',
      schedule_check: 'Schedule Check',
      gkill_switch: 'Global Kill Switch',
      baseline_saver: 'Baseline Saver',
    };

    const rows = names.map((name) => {
      const t = tasks[name] || {};
      const status = t.status || 'pending';
      const dot = status === 'ok' ? '🟢' : status === 'error' ? '🔴' : status === 'warning' ? '🟡' : '⚪';
      const lastRun = t.last_run ? new Date(t.last_run).toLocaleTimeString() : '—';
      const runCount = t.run_count ?? '—';
      const consec = t.consecutive_errors || 0;
      const errorText = String(t.last_error_msg || '');
      const errMsg = errorText
        ? `<span title="${escHtml(errorText)}" style="color:var(--hpe-red);cursor:help">${escHtml(errorText.substring(0, 60))}${errorText.length > 60 ? '…' : ''}</span>`
        : '—';
      const label = LABELS[name] || name;
      return `<tr>
        <td>${label}</td>
        <td>${dot} ${status}</td>
        <td>${lastRun}</td>
        <td>${runCount}</td>
        <td>${consec > 0 ? `<span style="color:var(--hpe-red)">${consec}</span>` : '0'}</td>
        <td>${errMsg}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="empty-msg">No service data yet</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">Failed to load: ${escHtml(e.message || String(e))}</td></tr>`;
  }
}

function handleMessage(message) {
  if (document.getElementById('tab-api-server')?.classList.contains('active')) {
    renderServiceStatus().catch(() => {});
  }

  if (message.type === 'full_state') {
    (message.clients || []).forEach((client) => upsertClient(client));
    updateCmdTargetDropdown(message.clients || []);
    return;
  }

  if (message.type === 'repo_status') {
    setRepoStatus(message.synced, message.error, message.last_sync, message.repo_version);
    return;
  }

  if (message.type === 'relay_status') {
    setRelayStatus(message);
    return;
  }

  if (message.type === 'proxmox_update') {
    if (message.webui_vmid != null) webuiVmid = message.webui_vmid;
    if (message.pending_proxmox !== undefined) renderProxmoxPending(message.pending_proxmox || []);
    if (message.approved_proxmox !== undefined) renderProxmoxApproved(message.approved_proxmox || []);
    renderServerTab(message);
    return;
  }

  if (message.type === 'proxmox_pending_update') {
    renderProxmoxPending(message.pending || []);
    return;
  }

  if (message.type === 'reclone_update') {
    const previousStatus = latestRecloneState?.status;
    renderRecloneStatus(message);
    if (previousStatus === 'running' && message.status && message.status !== 'running') {
      scheduleProxmoxRefresh(1000);
    }
    return;
  }

  if (message.type === 'version_status') {
    applyVersionStatus(message);
    return;
  }

  if (message.type === 'update_all_progress') {
    handleUpdateAllProgress(message);
    return;
  }

  if (message.type === 'settings_update') {
    applySettingsToUI(message.settings);
    return;
  }

  if (message.type === 'central_update') {
    handleCentralUpdate(message.status, message.ts, message.wireless_clients, message.hardware_alerts, message.client_count_status);
    if (message.token_state) {
      const ts = message.token_state;
      setCentralApiStatus(ts.state === 'connected', ts);
    }
    return;
  }

  if (message.type === 'proxmox_log_update') {
    if (message.cleared) {
      agentLogLines = [];
    } else if (message.lines && message.lines.length) {
      appendAgentLogLines(message.lines);
    }
    return;
  }

  if (message.type === 'commands_update') {
    // Surface failures as toasts so the user knows something went wrong
    const prev = new Map((window._lastCommands || []).map((c) => [c.id, c.status]));
    (message.commands || []).forEach((c) => {
      if (c.status === 'failed' && prev.get(c.id) !== 'failed') {
        const label = c.action ? c.action.replace(/_/g, ' ') : 'command';
        const vmNote = c.args?.vmid ? ` (VM ${c.args.vmid})` : '';
        showToast(`⚠ ${label}${vmNote} failed — check Proxmox agent log`, 'error');
      }
    });
    window._lastCommands = message.commands || [];
    renderCommandTable(message.commands);
    return;
  }

  if (message.type === 'cert_renewed') {
    showToast(`TLS certificate renewed — expires ${message.expires || 'unknown'}`, 'success');
    loadSpokeAcmeSettings().catch(() => {});
    return;
  }

  if (message.type === 'acme_status') {
    if (!message.running) pollSpokeAcmeStatus();
    return;
  }

  if (message.type === 'notification') {
    if (cmdMsg && message.message) {
      cmdMsg.textContent = message.message;
      cmdMsg.className = 'form-msg';
      cmdMsg.classList.add(message.level === 'warning' ? 'msg-error' : 'msg-ok');
    }
    return;
  }

  if (message.type === 'gkill_switch_update') {
    applyGkillSwitch(message.value);
    return;
  }

  if (['status_update', 'overrides_update', 'overrides_cleared'].includes(message.type) && message.client) {
    upsertClient(message.client);
    updateCmdTargetDropdown();
    return;
  }

  if (message.type === 'clients_purged') {
    clients.clear();
    document.querySelectorAll('#clients-body tr:not(#empty-row)').forEach(r => r.remove());
    const emptyRow = document.getElementById('empty-row');
    if (emptyRow) emptyRow.classList.remove('hidden');
    updateClientCount();
    updateCmdTargetDropdown([]);
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  setWsStatus(false, 'Connecting');

  socket.addEventListener('open', () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    setWsStatus(true, 'Connected');
    // Fetch initial repo status via HTTP in case WS message races or was missed
    requestJson('/api/repo/status').then(d => {
      setRepoStatus(d.synced, d.error, d.last_sync, d.repo_version);
    }).catch(() => {});
    // If we showed "restarting" during an update, confirm success on reconnect
    if (updateMsg && updateMsg.textContent.includes('restarting')) {
      updateMsg.textContent = '✅ Update complete — service restarted successfully.';
      updateMsg.className = 'settings-message success';
      updateMsg.classList.remove('hidden');
      clearTimeout(updateMsg._timer);
      updateMsg._timer = setTimeout(() => { updateMsg.classList.add('hidden'); }, 10000);
    }
  });

  socket.addEventListener('message', (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (error) {
      console.error('Invalid WS message', error);
    }
  });

  socket.addEventListener('close', () => {
    setWsStatus(false, 'Disconnected');
    // If an update was running, the service is restarting — don't show an error
    if (updateWasInProgress && updateMsg) {
      updateWasInProgress = false;
      updateMsg.textContent = '🔄 Service restarting — reconnecting…';
      updateMsg.className = 'settings-message success';
      updateMsg.classList.remove('hidden');
      if (checkUpdateBtn) {
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = '🔄 Check & Update Now';
      }
    }
    if (!reconnectTimer) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
      }, 5000);
    }
  });

  socket.addEventListener('error', () => {
    socket.close();
  });
}

// ── Simulations top-level tabs ──────────────────────────────────────────
const simTopPanels = ['simtop-checks', 'simtop-hardware', 'simtop-clients'];

function activateSimTopTab(tabId = 'simtop-checks') {
  document.querySelectorAll('.simtop-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.simtop === tabId);
  });
  simTopPanels.forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.toggle('active', id === tabId);
    panel.classList.toggle('hidden', id !== tabId);
  });
  if (tabId === 'simtop-hardware') renderHwPanel();
  if (tabId === 'simtop-clients') renderCcPanel();
}

document.querySelectorAll('.simtop-subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateSimTopTab(btn.dataset.simtop));
});

// ── Simulations tab ───────────────────────────────────────────────
const simChecksList   = document.getElementById('sim-checks-list');
const simEmpty        = document.getElementById('sim-checks-empty');
const simOverview     = document.getElementById('sim-overview');
const simDetail       = document.getElementById('sim-detail');
const simDetailBack   = document.getElementById('sim-detail-back');
const simDetailTitle  = document.getElementById('sim-detail-title');
const simDetailSub    = document.getElementById('sim-detail-sub');
const simDetailBadge  = document.getElementById('sim-detail-badge');
const simLastRefreshed = document.getElementById('sim-last-refreshed');
const simRefreshBtn   = document.getElementById('sim-refresh-btn');
const simClientsPanel  = document.getElementById('sim-clients-panel');
const simClientsBack   = document.getElementById('sim-clients-back');
const simClientsTitle  = document.getElementById('sim-clients-title');
const simClientsSub    = document.getElementById('sim-clients-sub');
const simClientsBadge  = document.getElementById('sim-clients-central-badge');
const simClientsList   = document.getElementById('sim-clients-list');
const hwDetailPanel  = document.getElementById('hw-detail');
const hwDetailBack   = document.getElementById('hw-detail-back');
const hwDetailTitle  = document.getElementById('hw-detail-title');
const hwDetailSub    = document.getElementById('hw-detail-sub');
const hwDetailBadge  = document.getElementById('hw-detail-badge');
const hwSiteList     = document.getElementById('hw-site-list');
const ccDetailPanel  = document.getElementById('cc-detail');
const ccDetailBack   = document.getElementById('cc-detail-back');
const ccDetailTitle  = document.getElementById('cc-detail-title');
const ccDetailSub    = document.getElementById('cc-detail-sub');
const ccDetailBadge  = document.getElementById('cc-detail-badge');
const ccSiteDetail   = document.getElementById('cc-site-detail');

let simulationsData = [];
let openSimId = null;   // key into getSimGroups() map

function simStatusBadge(pf) {
  if (!pf) return { label: 'No Check', cls: 'sim-unknown' };
  if (pf.firing) return { label: '✓ Firing', cls: 'sim-pass' };
  return { label: '✗ Not Firing', cls: 'sim-fail' };
}

// Canonical order and labels for simulation test types
const SIM_TEST_ORDER = [
  'dns_fail', 'assoc_fail', 'dhcp_fail', 'port_flap',
  'iperf', 'www_traffic', 'download', 'ping_test',
];
const SIM_TEST_LABELS = {
  dns_fail:   'DNS Fail',
  assoc_fail: 'Association Fail',
  dhcp_fail:  'DHCP Fail',
  port_flap:  'Port Flap',
  iperf:      'iPerf',
  www_traffic:'Web Traffic',
  download:   'Download',
  ping_test:  'Ping Test',
};

/** Build a map of testKey → { label, sims[], aggLabel, aggCls }
 *  One tile per simulation type (test flag) that is enabled in at least one bucket. */
function getSimGroups() {
  const groups = new Map();

  for (const testKey of SIM_TEST_ORDER) {
    for (const sim of simulationsData) {
      const tests = sim.tests || {};
      if (!tests[testKey]) continue;
      if (!groups.has(testKey)) {
        groups.set(testKey, {
          key: testKey,
          label: SIM_TEST_LABELS[testKey] || testKey,
          sims: [],
        });
      }
      groups.get(testKey).sims.push(sim);
    }
  }

  // Compute aggregate Central firing status per group
  for (const group of groups.values()) {
    let anyFiring = false, anyFail = false, anyConfigured = false;
    for (const sim of group.sims) {
      const pf = sim.central_pass_fail;
      if (pf) { anyConfigured = true; if (pf.firing) anyFiring = true; else anyFail = true; }
    }
    if (!anyConfigured) {
      group.aggLabel = 'No Check'; group.aggCls = 'sim-unknown';
    } else if (anyFiring && !anyFail) {
      group.aggLabel = '✓ Firing'; group.aggCls = 'sim-pass';
    } else if (anyFail && !anyFiring) {
      group.aggLabel = '✗ Not Firing'; group.aggCls = 'sim-fail';
    } else {
      group.aggLabel = '⚠ Partial'; group.aggCls = 'sim-warn';
    }
  }
  return groups;
}

/** Build client rows into a container element */
function buildClientRows(sim, container) {
  container.textContent = '';
  const clients = sim.configured_clients || [];
  if (!clients.length) {
    const empty = document.createElement('div');
    empty.className = 'sim-client-row';
    empty.textContent = 'No clients configured.';
    container.appendChild(empty);
    return;
  }
  clients.forEach((c) => {
    const row = document.createElement('div');
    const statusCls = c.online ? 'online' : c.reporting ? 'offline' : 'not-reporting';
    row.className = `sim-client-row ${statusCls}`;

    const hostname = document.createElement('span');
    hostname.className = 'sim-client-hostname';
    hostname.textContent = c.hostname;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'sim-client-status';
    if (c.online) {
      statusSpan.textContent = '● Online'; statusSpan.style.color = 'var(--hpe-green-dark)';
    } else if (c.reporting) {
      statusSpan.textContent = '○ Offline'; statusSpan.style.color = '#999';
    } else {
      statusSpan.textContent = '⚠ Not Reporting'; statusSpan.style.color = '#e67e22';
    }

    const lastSeen = document.createElement('span');
    lastSeen.className = 'sim-client-lastseen';
    if (c.last_seen) {
      const ago = Math.round((Date.now() - new Date(c.last_seen).getTime()) / 60000);
      lastSeen.textContent = ago < 2 ? 'just now' : `${ago}m ago`;
    } else {
      lastSeen.textContent = 'never seen';
    }

    row.appendChild(hostname);
    row.appendChild(statusSpan);
    row.appendChild(lastSeen);
    container.appendChild(row);
  });
}

function formatClientCountDelta(dropPct) {
  if (!Number.isFinite(dropPct) || Math.abs(dropPct) < 0.05) return '0.0%';
  return dropPct > 0
    ? `-${dropPct.toFixed(1)}%`
    : `+${Math.abs(dropPct).toFixed(1)}%`;
}

function renderChecksList() {
  const list = simChecksList;
  const emptyEl = simEmpty;
  const filterInput = document.getElementById('checks-filter');
  const countBadge = document.getElementById('checks-count');
  if (!list) return;

  const filterText = filterInput ? filterInput.value.trim().toLowerCase() : '';

  list.textContent = '';
  if (emptyEl) {
    emptyEl.textContent = 'No checks configured — sync simulation.conf and configure hardware alerts.';
    emptyEl.classList.add('hidden');
    list.appendChild(emptyEl);
  }

  const groups = getSimGroups();

  const simRows = [];
  for (const [key, group] of groups) {
    const dotCls = group.aggCls === 'sim-pass' ? 'dot-ok'
      : group.aggCls === 'sim-fail' ? 'dot-err'
      : group.aggCls === 'sim-warn' ? 'dot-warn' : 'dot-unknown';
    const sites = [...new Set(group.sims.map((s) => s.wsite).filter(Boolean))];
    let latestTs = null;
    for (const sim of group.sims) {
      const pf = sim.central_pass_fail;
      if (pf && pf.ts && (!latestTs || pf.ts > latestTs)) latestTs = pf.ts;
    }
    simRows.push({
      key,
      label: group.label,
      dotCls,
      badge: 'SIM',
      badgeCls: 'check-badge-sim',
      detail: sites.length ? sites.join(' · ') : '— no sites',
      ts: latestTs,
      priority: dotCls === 'dot-err' ? 0 : dotCls === 'dot-warn' ? 1 : dotCls === 'dot-ok' ? 2 : 3,
      onClick: () => openSimGroup(key),
    });
  }
  simRows.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

  const hwRows = [];
  for (const hw of hwAlertsData) {
    const affected = hw.total || 0;
    const dotCls = affected > 0 ? 'dot-err' : 'dot-ok';
    const siteNames = Object.values(hw.sites || {}).map((s) => s.site_name || '').filter(Boolean);
    hwRows.push({
      key: hw.id,
      label: hw.name || hw.id,
      dotCls,
      badge: (hw.device_type || 'HW').toUpperCase(),
      badgeCls: 'check-badge-hw',
      detail: affected > 0
        ? `${affected} device${affected !== 1 ? 's' : ''} affected${siteNames.length ? ` — ${siteNames.slice(0, 3).join(', ')}` : ''}`
        : 'No active alerts',
      ts: null,
      priority: affected > 0 ? 0 : 2,
      onClick: () => openHwDetail(hw.id),
    });
  }
  hwRows.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
  _hwRowsCache = hwRows;
  const ccRows = [];
  for (const [wsite, info] of Object.entries(clientCountData)) {
    const degraded = info.status === 'DEGRADED';
    const noData = info.status === 'NO_DATA';
    const stale = info.baseline_stale;
    const dotCls = noData ? 'dot-unknown' : degraded ? 'dot-err' : 'dot-ok';
    const staleLabel = stale
      ? ` ⏱ last baseline ${info.baseline_recorded_at ? new Date(info.baseline_recorded_at * 1000).toLocaleTimeString() : 'saved'}`
      : '';
    ccRows.push({
      key: wsite,
      label: info.site_name || wsite,
      dotCls,
      badge: 'CC',
      badgeCls: 'check-badge-cc',
      detail: noData
        ? 'Collecting baseline…'
        : `Current: ${info.current} / Avg: ${Math.round(info.hourly_avg)} (${formatClientCountDelta(info.drop_pct)})${staleLabel}`,
      ts: info.ts,
      priority: degraded ? 0 : noData ? 3 : 2,
      onClick: () => openCcDetail(wsite),
    });
  }
  ccRows.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
  _ccRowsCache = ccRows;

  // ── Monitored Central checks (alerts / insights from Settings) ────────────
  const monRows = [];
  const monChecks = currentSettings.monitored_checks || [];
  for (const mc of monChecks) {
    const checkId = mc.id;
    const checkName = mc.name || checkId;
    const checkType = (mc.type || 'alert').toUpperCase().slice(0, 3); // ALT / INS
    let anyOk = false, anyFail = false, latestTs = null;
    const firingAt = [], missingAt = [];
    for (const [wsite, checks] of Object.entries(centralStatusData)) {
      if (!(checkId in checks)) continue;
      const info = checks[checkId];
      if (info.status === 'OK') { anyOk = true; firingAt.push(wsite); }
      else { anyFail = true; missingAt.push(wsite); }
      if (info.ts && (!latestTs || info.ts > latestTs)) latestTs = info.ts;
    }
    const hasData = anyOk || anyFail;
    const dotCls = !hasData ? 'dot-unknown' : anyFail ? 'dot-err' : 'dot-ok';
    const detail = !hasData
      ? 'Not yet polled'
      : anyFail && !anyOk
        ? `Not detected at: ${missingAt.join(', ')}`
        : anyOk && !anyFail
          ? `Detected at: ${firingAt.join(', ')}`
          : `Partial — OK: ${firingAt.join(', ')} · Missing: ${missingAt.join(', ')}`;
    monRows.push({
      key: `mon-${checkId}`,
      label: checkName,
      dotCls,
      badge: checkType,
      badgeCls: 'check-badge-mon',
      detail,
      ts: latestTs,
      priority: dotCls === 'dot-err' ? 0 : dotCls === 'dot-warn' ? 1 : dotCls === 'dot-ok' ? 2 : 3,
      onClick: () => {},  // no drill-down for now
    });
  }
  monRows.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

  // Tab count badges reflect only Checks-tab rows (SIM + MON)
  const allRowsFlat = [...simRows, ...monRows];
  let failCount = 0, funcCount = 0, warnCount = 0;
  for (const item of allRowsFlat) {
    item.effectiveTab = getEffectiveTabForItem(item);
    if (item.effectiveTab === 'failing') failCount++;
    else if (item.effectiveTab === 'functional') funcCount++;
    else warnCount++;
  }
  // Also include hw/cc in totals for the badge display
  const allHwCc = [...hwRows, ...ccRows];
  for (const item of allHwCc) {
    item.effectiveTab = getEffectiveTabForItem(item);
    if (item.effectiveTab === 'failing') failCount++;
    else if (item.effectiveTab === 'functional') funcCount++;
    else warnCount++;
  }
  const elFail = document.getElementById('sim-tab-failing-count');
  const elFunc = document.getElementById('sim-tab-functional-count');
  const elWarn = document.getElementById('sim-tab-warning-count');
  if (elFail) elFail.textContent = failCount;
  if (elFunc) elFunc.textContent = funcCount;
  if (elWarn) elWarn.textContent = warnCount;

  const tabTotal = activeSimTab === 'failing' ? failCount : activeSimTab === 'functional' ? funcCount : warnCount;
  const totalChecksAll = simRows.length + hwRows.length + ccRows.length + monRows.length;  if (countBadge) countBadge.textContent = `${tabTotal} of ${totalChecksAll} check${totalChecksAll !== 1 ? 's' : ''}`;

  if (!totalChecksAll) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  function makeRow(item) {
    // Filter by active sub-tab
    if (item.effectiveTab !== activeSimTab) return null;

    const matchesFilter = !filterText
      || item.label.toLowerCase().includes(filterText)
      || item.detail.toLowerCase().includes(filterText);
    if (!matchesFilter) return null;

    const row = document.createElement('div');
    row.className = 'check-row';
    row.dataset.key = item.key;

    const dot = document.createElement('span');
    dot.className = `check-dot ${item.dotCls}`;

    const name = document.createElement('span');
    name.className = 'check-name';
    name.textContent = item.label;

    const badge = document.createElement('span');
    badge.className = `check-badge ${item.badgeCls}`;
    badge.textContent = item.badge;

    const detail = document.createElement('span');
    detail.className = 'check-detail';
    detail.textContent = item.detail;

    const tsEl = document.createElement('span');
    tsEl.className = 'check-ts';
    if (item.ts) {
      const ago = Math.round((Date.now() / 1000 - item.ts) / 60);
      tsEl.textContent = ago < 2 ? 'just now' : `${ago}m ago`;
    } else {
      tsEl.textContent = '—';
    }

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(detail);
    row.appendChild(tsEl);
    row.addEventListener('click', item.onClick);
    return row;
  }

  function appendSection(title, rows) {
    const visibleRows = rows.map(makeRow).filter(Boolean);
    if (!visibleRows.length) return;
    const hdr = document.createElement('div');
    hdr.className = 'checks-section-header';
    hdr.textContent = title;
    list.appendChild(hdr);
    visibleRows.forEach((row) => list.appendChild(row));
  }

  appendSection('Simulation Checks', simRows);
  appendSection('Monitored Central Checks', monRows);

  // HW and CC rows live in their own top-level tabs — trigger re-render if visible
  const hwPanel = document.getElementById('simtop-hardware');
  if (hwPanel && !hwPanel.classList.contains('hidden')) renderHwPanel();
  const ccPanel = document.getElementById('simtop-clients');
  if (ccPanel && !ccPanel.classList.contains('hidden')) renderCcPanel();

  const visibleCount = list.querySelectorAll('.check-row').length;
  if (!visibleCount && emptyEl) {
    const tabLabel = activeSimTab === 'failing' ? 'failing' : activeSimTab === 'functional' ? 'functional' : 'warning';
    emptyEl.textContent = filterText
      ? `No ${tabLabel} checks match the current filter.`
      : `No ${tabLabel} checks.`;
    emptyEl.classList.remove('hidden');
  }
}

function openSimGroup(key) {
  const groups = getSimGroups();
  const group = groups.get(key);
  if (!group || !simOverview || !simDetail) return;
  openSimId = key;
  simOverview.classList.add('hidden');
  simDetail.classList.remove('hidden');

  if (simDetailTitle) simDetailTitle.textContent = group.label;
  if (simDetailSub) {
    const uniqueSites = [...new Set(group.sims.map(s => s.wsite).filter(Boolean))];
    simDetailSub.textContent = uniqueSites.length
      ? `Running at: ${uniqueSites.join(', ')}`
      : 'No sites configured';
  }
  if (simDetailBadge) {
    simDetailBadge.textContent = group.aggLabel;
    simDetailBadge.className = `sim-status-badge ${group.aggCls}`;
  }

  const siteList = document.getElementById('sim-site-list');
  if (!siteList) return;
  siteList.textContent = '';

  // Aggregate buckets by site — user only cares about sites + reporting count
  const siteMap = new Map();
  for (const sim of group.sims) {
    const site = sim.wsite || '(no site)';
    if (!siteMap.has(site)) {
      siteMap.set(site, { active: 0, centralPf: null, simId: sim.id });
    }
    const entry = siteMap.get(site);
    entry.active += sim.active_client_count || 0;
    // Use Central pass/fail if any bucket at this site has it configured
    if (sim.central_pass_fail && !entry.centralPf) entry.centralPf = sim.central_pass_fail;
  }

  for (const [site, { active, centralPf, simId }] of siteMap) {
    const { label, cls } = simStatusBadge(centralPf);

    const siteRow = document.createElement('div');
    siteRow.className = 'sim-site-row';
    siteRow.style.cursor = 'pointer';
    siteRow.title = 'Click to see clients at this site';

    const siteName = document.createElement('span');
    siteName.className = 'sim-site-name';
    siteName.textContent = site;

    const siteCount = document.createElement('span');
    siteCount.className = 'sim-site-count';
    siteCount.textContent = `${active} reporting`;

    const siteBadge = document.createElement('span');
    siteBadge.className = `sim-status-badge ${cls}`;
    siteBadge.textContent = label;

    const arrow = document.createElement('span');
    arrow.style.cssText = 'margin-left:auto;color:var(--muted);font-size:0.85rem;';
    arrow.textContent = '›';

    siteRow.appendChild(siteName);
    siteRow.appendChild(siteCount);
    siteRow.appendChild(siteBadge);
    siteRow.appendChild(arrow);
    siteRow.addEventListener('click', () => openSimClients(simId, site, group.key, centralPf, group.label));
    siteList.appendChild(siteRow);
  }
}

async function openSimClients(simId, wsite, testKey, alertPf, checkLabel) {
  if (!simClientsPanel || !simDetail) return;
  simDetail.classList.add('hidden');
  simClientsPanel.classList.remove('hidden');

  if (simClientsTitle) simClientsTitle.textContent = checkLabel || 'Clients';
  if (simClientsSub)  simClientsSub.textContent  = `Site: ${wsite}`;
  if (simClientsList) simClientsList.innerHTML = '<div class="sim-clients-loading">Loading…</div>';

  // Alert polarity: alert PRESENT in Central = GREEN (sim is working)
  const alertMonitored = alertPf !== null && alertPf !== undefined;
  const alertFiring    = alertMonitored && alertPf.firing === true;

  try {
    const data = await requestJson(`/api/simulations/${encodeURIComponent(simId)}/clients`);
    const clientList = data.clients || [];
    if (!simClientsList) return;
    simClientsList.textContent = '';

    if (!clientList.length) {
      simClientsList.innerHTML = '<div class="sim-client-card" style="color:var(--muted)">No clients configured for this simulation.</div>';
      return;
    }

    for (const c of clientList) {
      const card = document.createElement('div');
      card.className = 'sim-client-card';

      // Hostname
      const hostname = document.createElement('span');
      hostname.className = 'sim-client-card-hostname';
      hostname.textContent = c.hostname;

      // Last seen
      const lastSeen = document.createElement('span');
      lastSeen.style.cssText = 'font-size:0.78rem;color:var(--muted);';
      if (c.api_last_seen) {
        const ago = Math.round((Date.now() - new Date(c.api_last_seen).getTime()) / 60000);
        lastSeen.textContent = ago < 2 ? 'just now' : `${ago}m ago`;
      } else {
        lastSeen.textContent = 'never seen';
      }

      // Indicators container
      const indicators = document.createElement('div');
      indicators.className = 'sim-client-indicators';

      // --- Icon 1: SIM RUNNING ---
      const activeSims = Array.isArray(c.active_simulations) ? c.active_simulations : [];
      const simRunning = activeSims.includes(testKey);
      const simInd = document.createElement('div');
      simInd.className = 'sim-client-indicator';
      const simDot = document.createElement('span');
      simDot.className = `ind-dot ${simRunning ? 'green' : c.api_online ? 'yellow' : 'grey'}`;
      const simLabel = document.createElement('span');
      simLabel.className = 'ind-label';
      simLabel.textContent = 'SIM';
      simInd.title = simRunning ? 'Simulation running'
                   : c.api_online ? 'Online — sim not active'
                   : 'Client offline';
      simInd.appendChild(simDot);
      simInd.appendChild(simLabel);

      // --- Icon 2: ALERT / INSIGHT ---
      const alertInd = document.createElement('div');
      alertInd.className = 'sim-client-indicator';
      const alertDot = document.createElement('span');
      const alertLabelEl = document.createElement('span');
      alertLabelEl.className = 'ind-label';
      alertLabelEl.textContent = 'ALERT';
      if (!alertMonitored) {
        alertDot.className = 'ind-dot unknown';
        alertLabelEl.style.color = 'var(--muted)';
        alertLabelEl.textContent = 'N/A';
        alertInd.title = 'No Central check configured for this simulation';
      } else if (alertFiring) {
        alertDot.className = 'ind-dot green';
        alertInd.title = `Alert detected in Central: ${alertPf.check_name || testKey}`;
      } else {
        alertDot.className = 'ind-dot red';
        alertInd.title = `Alert NOT seen in Central: ${alertPf.check_name || testKey}`;
      }
      alertInd.appendChild(alertDot);
      alertInd.appendChild(alertLabelEl);

      indicators.appendChild(simInd);
      indicators.appendChild(alertInd);

      card.appendChild(hostname);
      card.appendChild(lastSeen);
      card.appendChild(indicators);
      simClientsList.appendChild(card);
    }
  } catch (err) {
    if (simClientsList) simClientsList.innerHTML = `<div class="sim-client-card" style="color:#e74c3c">Error loading clients: ${err.message}</div>`;
  }
}

function closeSimDetail() {
  openSimId = null;
  if (simDetail) simDetail.classList.add('hidden');
  if (simOverview) simOverview.classList.remove('hidden');
}

// ── Hardware panel renderer ───────────────────────────────────────────────
function renderHwPanel() {
  const container = document.getElementById('hw-checks-list');
  if (!container) return;
  container.textContent = '';
  const rows = _hwRowsCache;
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'central-empty';
    empty.textContent = 'No hardware alerts configured.';
    container.appendChild(empty);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('div');
    row.className = 'check-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.innerHTML = `
      <span class="check-dot ${item.dotCls}"></span>
      <span class="check-label">${item.label}</span>
      <span class="check-badge ${item.badgeCls}">${item.badge}</span>
      <span class="check-detail">${item.detail}</span>
      <span class="check-ts">${item.ts ? new Date(item.ts * 1000).toLocaleTimeString() : ''}</span>
    `;
    row.addEventListener('click', item.onClick);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') item.onClick(); });
    container.appendChild(row);
  }
}

// ── Client Count panel renderer ───────────────────────────────────────────
function renderCcPanel() {
  const container = document.getElementById('cc-checks-list');
  if (!container) return;
  container.textContent = '';
  const rows = _ccRowsCache;
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'central-empty';
    empty.textContent = 'No client count data yet.';
    container.appendChild(empty);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('div');
    row.className = 'check-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.innerHTML = `
      <span class="check-dot ${item.dotCls}"></span>
      <span class="check-label">${item.label}</span>
      <span class="check-badge ${item.badgeCls}">${item.badge}</span>
      <span class="check-detail">${item.detail}</span>
      <span class="check-ts">${item.ts ? new Date(item.ts * 1000).toLocaleTimeString() : ''}</span>
    `;
    row.addEventListener('click', item.onClick);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') item.onClick(); });
    container.appendChild(row);
  }
}

function openHwDetail(checkId) {
  const hw = hwAlertsData.find((item) => item.id === checkId);
  if (!hw || !hwDetailPanel) return;
  const hwOverview = document.getElementById('hw-overview');
  if (hwOverview) hwOverview.classList.add('hidden');
  hwDetailPanel.classList.remove('hidden');

  if (hwDetailTitle) hwDetailTitle.textContent = hw.name || hw.id;
  const totalDevices = hw.total || 0;
  if (hwDetailSub) hwDetailSub.textContent = totalDevices > 0 ? `${totalDevices} device(s) affected` : 'No active alerts';
  if (hwDetailBadge) {
    hwDetailBadge.textContent = totalDevices > 0 ? `${totalDevices} DOWN` : '✓ Clear';
    hwDetailBadge.className = `sim-status-badge ${totalDevices > 0 ? 'sim-fail' : 'sim-pass'}`;
  }

  if (!hwSiteList) return;
  hwSiteList.textContent = '';
  const sites = Object.entries(hw.sites || {});
  if (!sites.length) {
    const empty = document.createElement('div');
    empty.className = 'sim-site-row';
    empty.textContent = 'No sites with active alerts.';
    hwSiteList.appendChild(empty);
    return;
  }
  for (const [wsite, info] of sites) {
    const row = document.createElement('div');
    row.className = 'sim-site-row';
    row.style.flexDirection = 'column';
    row.style.gap = '6px';
    row.style.alignItems = 'flex-start';
    row.style.cursor = 'default';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;width:100%;align-items:center;';
    const siteName = document.createElement('span');
    siteName.className = 'sim-site-name';
    siteName.textContent = info.site_name || wsite;
    const siteBadge = document.createElement('span');
    siteBadge.className = 'sim-status-badge sim-fail';
    siteBadge.textContent = `${(info.devices || []).length} device(s)`;
    top.appendChild(siteName);
    top.appendChild(siteBadge);

    const deviceList = document.createElement('ul');
    deviceList.style.cssText = 'margin:0;padding-left:1.2rem;font-size:0.82rem;color:var(--muted);';
    for (const dev of (info.devices || [])) {
      const li = document.createElement('li');
      li.textContent = dev;
      deviceList.appendChild(li);
    }

    row.appendChild(top);
    row.appendChild(deviceList);
    hwSiteList.appendChild(row);
  }
}

function closeHwDetail() {
  if (hwDetailPanel) hwDetailPanel.classList.add('hidden');
  const hwOverview = document.getElementById('hw-overview');
  if (hwOverview) hwOverview.classList.remove('hidden');
}

function openCcDetail(wsite) {
  const info = clientCountData[wsite];
  if (!info || !ccDetailPanel) return;
  const ccOverview = document.getElementById('cc-overview');
  if (ccOverview) ccOverview.classList.add('hidden');
  ccDetailPanel.classList.remove('hidden');

  if (ccDetailTitle) ccDetailTitle.textContent = info.site_name || wsite;
  const degraded = info.status === 'DEGRADED';
  const noData = info.status === 'NO_DATA';
  const stale = info.baseline_stale;
  if (ccDetailSub) ccDetailSub.textContent = `Client count monitoring — ${info.status}${stale ? ' (last session baseline)' : ''}`;
  if (ccDetailBadge) {
    ccDetailBadge.textContent = noData ? 'Collecting baseline' : degraded ? `${info.drop_pct.toFixed(1)}% drop` : '✓ OK';
    ccDetailBadge.className = `sim-status-badge ${noData ? 'sim-unknown' : degraded ? 'sim-fail' : 'sim-pass'}`;
  }
  if (!ccSiteDetail) return;
  ccSiteDetail.textContent = '';
  const row = document.createElement('div');
  row.className = 'sim-site-row';
  row.style.cursor = 'default';
  const staleNote = stale && info.baseline_recorded_at
    ? `<span style="font-size:0.8rem;color:var(--muted)"> ⏱ Baseline from ${new Date(info.baseline_recorded_at * 1000).toLocaleString()} — rebuilding live average</span>`
    : '';
  row.innerHTML = `
    <span class="sim-site-name">${info.site_name || wsite}</span>
    <span style="font-size:0.85rem;color:var(--muted)">
      Current: <strong>${info.current}</strong> &nbsp;|&nbsp;
      60-min avg: <strong>${Math.round(info.hourly_avg)}</strong> &nbsp;|&nbsp;
      Δ: <strong style="color:${degraded ? '#e74c3c' : 'var(--hpe-green-dark)'}">${noData ? '—' : formatClientCountDelta(info.drop_pct)}</strong>
    </span>${staleNote}
  `;
  ccSiteDetail.appendChild(row);
}

function closeCcDetail() {
  if (ccDetailPanel) ccDetailPanel.classList.add('hidden');
  const ccOverview = document.getElementById('cc-overview');
  if (ccOverview) ccOverview.classList.remove('hidden');
}

async function loadSimulations() {
  try {
    const data = await requestJson('/api/simulations');
    simulationsData = (data.simulations || []).sort((a, b) => a.id.localeCompare(b.id));
    renderChecksList();
    if (simLastRefreshed) {
      simLastRefreshed.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;
    }
    if (openSimId) {
      openSimGroup(openSimId);
    }
  } catch (err) {
    const emptyEl = simEmpty;
    if (emptyEl) {
      emptyEl.textContent = `Error loading simulations: ${err.message}`;
      emptyEl.classList.remove('hidden');
    }
  }
}

const checksFilterInput = document.getElementById('checks-filter');
if (checksFilterInput) {
  checksFilterInput.addEventListener('input', renderChecksList);
}

if (simDetailBack) simDetailBack.addEventListener('click', closeSimDetail);
if (simClientsBack) simClientsBack.addEventListener('click', () => {
  if (simClientsPanel) simClientsPanel.classList.add('hidden');
  if (simDetail) simDetail.classList.remove('hidden');
});
if (hwDetailBack) hwDetailBack.addEventListener('click', closeHwDetail);
if (ccDetailBack) ccDetailBack.addEventListener('click', closeCcDetail);

// ── Purge client history ───────────────────────────────────────────────────
const purgeHistoryBtn = document.getElementById('purge-history-btn');
if (purgeHistoryBtn) {
  purgeHistoryBtn.addEventListener('click', async () => {
    if (!confirm('Clear all client history? Records on disk will also be deleted. This cannot be undone.')) return;
    purgeHistoryBtn.disabled = true;
    purgeHistoryBtn.textContent = '⏳ Purging…';
    try {
      const resp = await fetch('/api/clients/history', { method: 'DELETE' });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    } catch (err) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      purgeHistoryBtn.disabled = false;
      purgeHistoryBtn.textContent = '🗑 Purge History';
    }
  });
}

if (simTabButton) {
  simTabButton.addEventListener('click', () => {
    loadSimulations();
  });
}

if (simRefreshBtn) {
  simRefreshBtn.addEventListener('click', async () => {
    const orig = simRefreshBtn.textContent;
    simRefreshBtn.disabled = true;
    simRefreshBtn.textContent = 'Refreshing…';
    try {
      await loadSimulations();
    } finally {
      simRefreshBtn.disabled = false;
      simRefreshBtn.textContent = orig;
    }
  });
}

if (centralDetailBack) {
  centralDetailBack.addEventListener('click', closeSiteDetail);
}

if (centralTabButton) {
  centralTabButton.addEventListener('click', () => {
    if (!centralStatusInitialized || !Object.keys(centralStatusData).length) {
      loadCentralStatus();
    } else {
      renderCentralOverview();
    }
  });
}

if (configTabButton) {
  configTabButton.addEventListener('click', () => {
    loadConfigEditor().catch(() => {});
  });
}

// configSimulationSaveBtn removed — each section now has its own per-section Save button

document.querySelectorAll('.config-subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateConfigSubtab(btn.dataset.subtab));
});

document.querySelectorAll('.server-subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateServerSubtab(btn.dataset.subtab));
});

document.querySelectorAll('.sim-subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateSimSubtab(btn.dataset.simtab));
});

if (setupSubtabButtons.length) {
  setupSubtabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateSetupSubtab(btn.dataset.subtab);
    });
  });
}

async function _autoSaveRelay() {
  const tenantId = relayTenantIdInput?.value?.trim() || '';
  const payload = {
    relay_enabled: relayEnabledSelect?.value || 'off',
    relay_server_url: relayServerUrlInput?.value?.trim() || '',
    relay_spoke_name: relaySpokeName?.value?.trim() || '',
    relay_tenant_hint: tenantId,
    relay_tenant_id: tenantId,
  };
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showInlineMessage(relayMsg, 'Hub settings saved.', false);
    await loadSettings();
    await requestJson('/api/relay/status').then(setRelayStatus).catch(() => {});
  } catch (error) {
    showInlineMessage(relayMsg, `Error: ${error.message}`, true);
  }
}

if (relayEnabledSelect) relayEnabledSelect.addEventListener('change', _autoSaveRelay);
[relayServerUrlInput, relaySpokeName, relayTenantIdInput].forEach((el) => {
  if (el) el.addEventListener('blur', _autoSaveRelay);
});
if (relayClearConfigBtn) {
  relayClearConfigBtn.addEventListener('click', () => clearSettingsProvider('relay', {
    button: relayClearConfigBtn,
    messageEl: relayMsg,
    successText: 'Hub config cleared.',
    extraDataHandler: (data) => setRelayStatus(data.relay_status || { enabled: false, connected: false, last_sync: null, error: null, registration_status: 'unregistered' })
  }));
}

// Registration diagnostics button
const relayDiagBtn = document.getElementById('relay-diag-btn');
const relayDiagPanel = document.getElementById('relay-diag-panel');
const serviceLogsRefreshBtn = document.getElementById('service-logs-refresh');
const serviceLogsCountEl = document.getElementById('service-logs-count');
const serviceLogsOutputEl = document.getElementById('service-logs-output');

async function loadSetupServiceLogs(lines = 50) {
  const requestedLines = Number.parseInt(lines, 10) || 50;
  if (serviceLogsRefreshBtn) serviceLogsRefreshBtn.disabled = true;
  if (serviceLogsOutputEl) serviceLogsOutputEl.textContent = 'Loading service logs…';
  try {
    const data = await requestJson(`/api/logs/service?lines=${encodeURIComponent(requestedLines)}`);
    const logLines = Array.isArray(data?.lines) ? data.lines : [];
    const returnedCount = Number.isFinite(data?.count) ? data.count : logLines.length;
    if (serviceLogsCountEl) {
      serviceLogsCountEl.textContent = `Last ${requestedLines} ${requestedLines === 1 ? 'line' : 'lines'}`;
      serviceLogsCountEl.title = `${returnedCount} ${returnedCount === 1 ? 'line' : 'lines'} returned`;
    }
    if (serviceLogsOutputEl) {
      serviceLogsOutputEl.textContent = logLines.length ? logLines.join('\n') : '(no service logs available)';
      serviceLogsOutputEl.scrollTop = serviceLogsOutputEl.scrollHeight;
    }
  } catch (err) {
    if (serviceLogsCountEl) serviceLogsCountEl.textContent = `Last ${requestedLines} ${requestedLines === 1 ? 'line' : 'lines'}`;
    if (serviceLogsOutputEl) serviceLogsOutputEl.textContent = `Error fetching service logs: ${err}`;
  } finally {
    if (serviceLogsRefreshBtn) serviceLogsRefreshBtn.disabled = false;
  }
}

if (serviceLogsRefreshBtn) {
  serviceLogsRefreshBtn.addEventListener('click', () => {
    loadSetupServiceLogs();
  });
}

if (relayDiagBtn) {
  relayDiagBtn.addEventListener('click', async () => {
    relayDiagBtn.disabled = true;
    relayDiagBtn.textContent = '⏳ Running…';
    if (relayDiagPanel) relayDiagPanel.classList.remove('hidden');
    try {
      const [diagResult] = await Promise.allSettled([
        requestJson('/api/relay/diag'),
        loadSetupServiceLogs(),
      ]);
      if (diagResult.status !== 'fulfilled') throw diagResult.reason;
      const d = diagResult.value;

      // Config check
      const cfg = d.config || {};
      const cfgEl = document.getElementById('relay-diag-config');
      if (cfgEl) {
        const rows = [
          ['relay_enabled', cfg.relay_enabled],
          ['server_url',    cfg.server_url],
          ['spoke_name',    cfg.spoke_name],
          ['hostname',      cfg.hostname],
          ['spoke_id',      cfg.spoke_id],
          ['api_key',       cfg.api_key_configured ? '✅ set' : '❌ not set'],
          ['tenant_id',     cfg.tenant_id || '(none)'],
        ];
        cfgEl.innerHTML = rows.map(([k, v]) =>
          `<dt>${escHtml(k)}</dt><dd>${escHtml(String(v ?? ''))}</dd>`
        ).join('');
      }

      // Reachability
      const reach = d.reachability || {};
      const reachEl = document.getElementById('relay-diag-reach');
      if (reachEl) {
        const icon = reach.ok ? '✅' : '❌';
        const urlColor = reach.ok ? 'var(--success,#22c55e)' : 'var(--error,#ef4444)';
        let bodyHtml = '';
        if (reach.detail) {
          try {
            const pretty = JSON.stringify(JSON.parse(reach.detail), null, 2);
            bodyHtml = `<pre class="diag-code">${escHtml(pretty)}</pre>`;
          } catch {
            bodyHtml = `<pre class="diag-code">${escHtml(reach.detail)}</pre>`;
          }
        }
        reachEl.innerHTML =
          `<div class="diag-reach-row">
             <span>${icon}</span>
             <span class="diag-reach-url" style="color:${urlColor}">${escHtml(reach.tested_url || '')}</span>
           </div>${bodyHtml}`;
      }

      // Log
      const log = d.log || [];
      const logCountEl = document.getElementById('relay-diag-log-count');
      if (logCountEl) logCountEl.textContent = String(log.length);
      const logEl = document.getElementById('relay-diag-log');
      if (logEl) {
        if (!log.length) {
          logEl.innerHTML = `<div class="diag-log-entry"><span class="diag-log-attrs">(no registration attempts recorded yet)</span></div>`;
        } else {
          logEl.innerHTML = log.map(e => {
            const attrs = Object.entries(e)
              .filter(([k]) => k !== 'ts' && k !== 'event')
              .map(([k, v]) => `${escHtml(k)}=${escHtml(JSON.stringify(v))}`)
              .join(' &nbsp;');
            const ev = e.event || '';
            const cls = /error|fail/i.test(ev) ? 'is-error' : /ok|approved|received/i.test(ev) ? 'is-ok' : '';
            return `<div class="diag-log-entry ${cls}">
              <span class="diag-log-ts">[${escHtml(e.ts || '')}]</span>
              <span class="diag-log-event">${escHtml(ev)}</span>
              ${attrs ? `<span class="diag-log-attrs">${attrs}</span>` : ''}
            </div>`;
          }).join('');
        }
      }
    } catch (err) {
      const logEl = document.getElementById('relay-diag-log');
      if (logEl) logEl.textContent = `Error fetching diagnostics: ${err}`;
    } finally {
      relayDiagBtn.disabled = false;
      relayDiagBtn.textContent = '🔍 Run Registration Diagnostics';
    }
  });
}

if (addVidPidBtn) {
  addVidPidBtn.addEventListener('click', addVidPid);
}

if (addIgnoredHostnameBtn) {
  addIgnoredHostnameBtn.addEventListener('click', async () => {
    const hostname = (newIgnoredHostnameInput?.value || '').trim();
    if (!hostname) return;
    const current = parseJsonList(currentSettings.ignored_hostnames);
    if (current.includes(hostname)) {
      showNotification(`${hostname} is already in the list`, 'error');
      return;
    }
    current.push(hostname);
    currentSettings.ignored_hostnames = serializeJsonList(current);
    if (newIgnoredHostnameInput) newIgnoredHostnameInput.value = '';
    renderIgnoredHostnamesList();
    try {
      await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignored_hostnames: currentSettings.ignored_hostnames }),
      });
      showNotification(`${hostname} added to ignored clients`, 'success');
    } catch (err) {
      showNotification(`Error saving: ${err.message}`, 'error');
    }
  });
}

// ── Auto-save: USB settings & VM Maintenance ─────────────────────────────────
// Checkboxes / selects → save immediately on change.
// Text / number inputs → save on blur (when user clicks/tabs away).

async function _autoSaveUsb(msgEl) {
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectUsbSettingsPayload()),
    });
    showInlineMessage(msgEl, 'Saved.', false);
  } catch (err) {
    showInlineMessage(msgEl, `Error: ${err.message}`, true);
  }
}

async function _autoSaveVmMaintenance(msgEl) {
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vm_silent_timeout: String(vmSilentTimeoutInput?.value || '24'),
        reclone_schedule_enabled: recloneScheduleEnabledInput?.checked ? 'on' : 'off',
        reclone_schedule_cron: `${recloneScheduleDayInput?.value || 'sunday'} ${recloneScheduleTimeInput?.value || '02:00'}`,
        reclone_concurrency: String(recloneConcurrencyInput?.value ?? '1'),
      }),
    });
    showInlineMessage(msgEl, 'Saved.', false);
  } catch (err) {
    showInlineMessage(msgEl, `Error: ${err.message}`, true);
  }
}

// USB — save checkbox changes immediately; number inputs on blur.
if (usbAutoProvisionInput) usbAutoProvisionInput.addEventListener('change', () => _autoSaveUsb(usbSettingsMsg));
[usbMissingTimeoutInput, vmImage1TemplateIdInput, vmImage2TemplateIdInput, vmImage1PctInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveUsb(usbSettingsMsg));
});

// Layer 1 VLAN — save on blur
[l1VlanStartInput, l1VlanEndInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveUsb(l1VlanMsg));
});

// VM Maintenance — checkboxes/selects: save on change; number/time inputs: save on blur.
if (recloneScheduleEnabledInput) recloneScheduleEnabledInput.addEventListener('change', () => _autoSaveVmMaintenance(vmMaintenanceMsg));
if (recloneScheduleDayInput)     recloneScheduleDayInput.addEventListener('change',  () => _autoSaveVmMaintenance(vmMaintenanceMsg));
[vmSilentTimeoutInput, recloneScheduleTimeInput, recloneConcurrencyInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveVmMaintenance(vmMaintenanceMsg));
});

if (centralRefreshBtn) {
  centralRefreshBtn.addEventListener('click', async () => {
    const originalLabel = centralRefreshBtn.textContent;
    centralRefreshBtn.disabled = true;
    centralRefreshBtn.textContent = 'Refreshing…';
    try {
      await requestJson('/api/central/poll', { method: 'POST' });
      await loadCentralStatus();
    } catch (error) {
      if (centralLastSynced) centralLastSynced.textContent = `Refresh failed: ${error.message}`;
    } finally {
      centralRefreshBtn.disabled = false;
      centralRefreshBtn.textContent = originalLabel;
    }
  });
}

if (centralSaveBtn) {
  centralSaveBtn.addEventListener('click', async () => {
    const originalLabel = centralSaveBtn.textContent;
    centralSaveBtn.disabled = true;
    centralSaveBtn.textContent = 'Saving…';
    showInlineMessage(centralConfigMsg, '', false, 0);
    try {
      await persistCentralApiConfig();
      showInlineMessage(centralConfigMsg, 'Saved.', false, 2000);
    } catch (error) {
      showInlineMessage(centralConfigMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      centralSaveBtn.disabled = false;
      centralSaveBtn.textContent = originalLabel;
    }
  });
}

if (centralTestBtn) {
  centralTestBtn.addEventListener('click', async () => {
    const originalLabel = centralTestBtn.textContent;
    centralTestBtn.disabled = true;
    centralTestBtn.textContent = 'Testing…';
    showInlineMessage(centralConfigMsg, '', false, 0);
    try {
      await persistCentralApiConfig();
      const result = await requestJson('/api/central/test-connection', { method: 'POST' });
      centralTokenValid = true;
      setCentralApiStatus(true);
      updateCentralToolbar();
      showInlineMessage(centralConfigMsg, result.message || 'Connected to Central API successfully.', false);
    } catch (error) {
      centralTokenValid = false;
      setCentralApiStatus(false);
      updateCentralToolbar();
      showInlineMessage(centralConfigMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      centralTestBtn.disabled = false;
      centralTestBtn.textContent = originalLabel;
    }
  });
}

if (centralClearBtn) {
  centralClearBtn.addEventListener('click', async () => {
    const originalLabel = centralClearBtn.textContent;
    centralClearBtn.disabled = true;
    centralClearBtn.textContent = 'Clearing…';
    showInlineMessage(centralConfigMsg, '', false, 0);
    try {
      const response = await requestJson('/api/settings/clear/central', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: getCentralApiMode() })
      });
      applySettingsToUI(response.settings || {});
      resetCentralSecretInputs();
      centralTokenValid = false;
      setCentralApiStatus(false);
      updateCentralToolbar();
      showInlineMessage(centralConfigMsg, 'Config cleared', false, 3000);
    } catch (error) {
      showInlineMessage(centralConfigMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      centralClearBtn.disabled = false;
      centralClearBtn.textContent = originalLabel;
    }
  });
}

async function loadSiteMappingSources() {
  if (loadSitesBtn) { loadSitesBtn.disabled = true; loadSitesBtn.textContent = 'Loading…'; }
  if (sitesLoadStatus) sitesLoadStatus.textContent = '';
  const [wsiteResult, centralResult] = await Promise.allSettled([
    requestJson('/api/local-wsites'),
    requestJson('/api/central/sites'),
  ]);

  localWsites = wsiteResult.status === 'fulfilled' ? (wsiteResult.value.wsites || []) : [];
  centralSites = centralResult.status === 'fulfilled' ? (centralResult.value.sites || []) : [];
  renderSiteMappingsTable();

  const msgs = [];
  if (wsiteResult.status === 'rejected') msgs.push(`Local: ${wsiteResult.reason?.message}`);
  else msgs.push(`${localWsites.length} local wsite(s)`);

  if (centralResult.status === 'rejected') {
    msgs.push(`Central: ${centralResult.reason?.message}`);
  } else {
    const warn = centralResult.value?.warning;
    msgs.push(warn ? `Central: ⚠ ${warn}` : `${centralSites.length} Central site(s)`);
  }

  if (sitesLoadStatus) sitesLoadStatus.textContent = msgs.join(' | ');
  if (loadSitesBtn) { loadSitesBtn.disabled = false; loadSitesBtn.textContent = '🔄 Load Sites'; }
}

if (loadSitesBtn) {
  loadSitesBtn.addEventListener('click', loadSiteMappingSources);
}

if (addMappingBtn) {
  addMappingBtn.addEventListener('click', () => addMappingRow());
}

async function _autoSaveSiteMappings() {
  const rows = siteMappingsBody ? [...siteMappingsBody.querySelectorAll('tr')] : [];
  const siteMappings = {};
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    const wsite = cells[0]?.querySelector('.mapping-val')?.value?.trim() || '';
    const centralSite = cells[1]?.querySelector('.mapping-val')?.value?.trim() || '';
    if (wsite && centralSite) siteMappings[wsite] = centralSite;
  });
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_mappings: siteMappings })
    });
    applySettingsToUI({ site_mappings: siteMappings });
    showInlineMessage(centralMappingsMsg, 'Site mappings saved.', false, 2000);
    renderCentralOverview();
  } catch (error) {
    showInlineMessage(centralMappingsMsg, `Error: ${error.message}`, true, 7000);
  }
}

if (siteMappingsBody) {
  siteMappingsBody.addEventListener('change', _autoSaveSiteMappings);
}

if (loadChecksBtn) {
  loadChecksBtn.addEventListener('click', async () => {
    const originalLabel = loadChecksBtn.textContent;
    loadChecksBtn.disabled = true;
    loadChecksBtn.textContent = 'Loading…';
    if (availableChecksContainer) availableChecksContainer.textContent = 'Loading available checks…';
    try {
      const data = await requestJson('/api/central/available');
      availableChecks = {
        alerts: data.alerts || [],
        insights: data.insights || []
      };
      renderAvailableChecks();
      const total = availableChecks.alerts.length + availableChecks.insights.length;
      const warn = data.warning ? ` ⚠ ${data.warning}` : '';
      showInlineMessage(centralChecksMsg, `${total} check(s) loaded.${warn}`, !!data.warning, data.warning ? 10000 : 3000);
    } catch (error) {
      availableChecks = { alerts: [], insights: [] };
      if (availableChecksContainer) {
        availableChecksContainer.textContent = `Unable to load checks: ${error.message}`;
      }
      showInlineMessage(centralChecksMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      loadChecksBtn.disabled = false;
      loadChecksBtn.textContent = originalLabel;
    }
  });
}

async function _autoSaveMonitoredChecks() {
  const allInputs = availableChecksContainer
    ? [...availableChecksContainer.querySelectorAll('input[type="checkbox"]')]
    : [];
  const monitoredChecks = allInputs.length
    ? allInputs.filter((cb) => cb.checked).map((cb) => ({
        type: cb.dataset.type,
        id: cb.dataset.id,
        name: cb.dataset.name || cb.dataset.id
      }))
    : (currentSettings.monitored_checks || []);
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitored_checks: monitoredChecks })
    });
    applySettingsToUI({ monitored_checks: monitoredChecks });
    showInlineMessage(centralChecksMsg, 'Saved.', false, 1500);
  } catch (error) {
    showInlineMessage(centralChecksMsg, `Error: ${error.message}`, true, 7000);
  }
}

if (availableChecksContainer) {
  availableChecksContainer.addEventListener('change', (e) => {
    if (e.target?.type === 'checkbox') _autoSaveMonitoredChecks();
  });
}

// ── Hardware Checks ────────────────────────────────────────────────────────
let availableAlertTypes = []; // loaded from /api/central/available

function renderHwChecksList() {
  if (!hwChecksContainer) return;
  hwChecksContainer.textContent = '';
  if (!availableAlertTypes.length) return;

  const selectedIds = new Set((currentSettings.hardware_checks || []).map((c) => c.id));
  const deviceTypeIcons = { ap: '📡', gateway: '🌐', switch: '🔀' };

  availableAlertTypes.forEach((alert) => {
    const row = document.createElement('label');
    row.className = 'hw-check-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = alert.id;
    cb.dataset.name = alert.name || alert.id;
    cb.dataset.deviceType = alert.device_type || '';
    cb.checked = selectedIds.has(alert.id);

    const icon = document.createElement('span');
    icon.className = 'hw-check-icon';
    const dtype = (alert.device_type || '').toLowerCase();
    icon.textContent = deviceTypeIcons[dtype] || '⚠';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'hw-check-name';
    nameSpan.textContent = alert.name || alert.id;

    const idSpan = document.createElement('span');
    idSpan.className = 'hw-check-id';
    idSpan.textContent = alert.id;

    row.appendChild(cb);
    row.appendChild(icon);
    row.appendChild(nameSpan);
    row.appendChild(idSpan);
    hwChecksContainer.appendChild(row);
  });
}

if (hwLoadAlertsBtn) {
  hwLoadAlertsBtn.addEventListener('click', async () => {
    hwLoadAlertsBtn.disabled = true;
    hwLoadAlertsBtn.textContent = 'Loading…';
    if (hwChecksContainer) hwChecksContainer.textContent = 'Loading available alert types…';
    try {
      const data = await requestJson('/api/central/available');
      availableAlertTypes = data.alerts || [];
      renderHwChecksList();
      const warn = data.warning ? ` ⚠ ${data.warning}` : '';
      showInlineMessage(hwChecksMsg, `${availableAlertTypes.length} alert type(s) loaded.${warn}`, !!data.warning, data.warning ? 10000 : 3000);
    } catch (err) {
      availableAlertTypes = [];
      if (hwChecksContainer) hwChecksContainer.textContent = '';
      showInlineMessage(hwChecksMsg, `Error: ${err.message}`, true, 7000);
    } finally {
      hwLoadAlertsBtn.disabled = false;
      hwLoadAlertsBtn.textContent = 'Load Available Alert Types';
    }
  });
}

async function _autoSaveHwChecks() {
  const allInputs = hwChecksContainer
    ? [...hwChecksContainer.querySelectorAll('input[type="checkbox"]')]
    : [];
  const hardwareChecks = allInputs.length
    ? allInputs.filter((cb) => cb.checked).map((cb) => ({
        id: cb.dataset.id,
        name: cb.dataset.name || cb.dataset.id,
        device_type: cb.dataset.deviceType || ''
      }))
    : (currentSettings.hardware_checks || []);
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hardware_checks: hardwareChecks })
    });
    currentSettings.hardware_checks = hardwareChecks;
    renderHwChecksPreview();
    if (availableAlertTypes.length) renderHwChecksList();
    showInlineMessage(hwChecksMsg, 'Saved.', false, 1500);
  } catch (err) {
    showInlineMessage(hwChecksMsg, `Error: ${err.message}`, true, 7000);
  }
}

if (hwChecksContainer) {
  hwChecksContainer.addEventListener('change', (e) => {
    if (e.target?.type === 'checkbox') _autoSaveHwChecks();
  });
}

// ── Sync interval ──────────────────────────────────────────────────────────
if (syncIntervalInput) {
  syncIntervalInput.addEventListener('blur', async () => {
    const val = parseInt(syncIntervalInput.value, 10);
    if (!val || val < 60 || val > 86400) {
      showInlineMessage(syncIntervalMsg, 'Enter a value between 60 and 86400 seconds.', true);
      return;
    }
    try {
      const response = await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_sync_interval: val })
      });
      applySettingsToUI(response.settings || { repo_sync_interval: val });
      showInlineMessage(syncIntervalMsg, `Sync interval set to ${val}s.`, false);
    } catch (err) {
      showInlineMessage(syncIntervalMsg, `Error: ${err.message}`, true);
    }
  });
}

// ── Email notifications ────────────────────────────────────────────────────
function collectEmailPayload() {
  const payload = {
    email_enabled: emailEnabledToggle?.checked ?? false,
    smtp_host:     smtpHost?.value.trim() || '',
    smtp_port:     parseInt(smtpPort?.value, 10) || 587,
    smtp_user:     smtpUser?.value.trim() || '',
    smtp_from:     smtpFrom?.value.trim() || '',
    smtp_to:       (smtpTo?.value || '').split(',').map(s => s.trim()).filter(Boolean),
  };
  const smtpSecret = getSecretInputPayload(smtpPassword);
  if (smtpSecret.include) payload.smtp_password = smtpSecret.value;
  return payload;
}

async function _autoSaveEmail() {
  const payload = collectEmailPayload();
  try {
    const response = await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: payload })
    });
    applySettingsToUI(response.settings || {});
    resetSecretInput(smtpPassword);
    showInlineMessage(emailNotifMsg, 'Saved.', false, 1500);
  } catch (err) {
    showInlineMessage(emailNotifMsg, `Error: ${err.message}`, true);
  }
}

if (emailEnabledToggle) emailEnabledToggle.addEventListener('change', _autoSaveEmail);
[smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, smtpTo].forEach((el) => {
  if (el) el.addEventListener('blur', _autoSaveEmail);
});

if (testEmailBtn) {
  testEmailBtn.addEventListener('click', async () => {
    const payload = { channel: 'email', ...collectEmailPayload() };
    testEmailBtn.disabled = true;
    testEmailBtn.textContent = 'Sending…';
    try {
      await requestJson('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showInlineMessage(emailNotifMsg, 'Test email sent — check your inbox.', false);
    } catch (err) {
      showInlineMessage(emailNotifMsg, `Failed: ${err.message}`, true, 8000);
    } finally {
      testEmailBtn.disabled = false;
      testEmailBtn.textContent = 'Send Test';
    }
  });
}

// ── Teams webhook ──────────────────────────────────────────────────────────
async function _autoSaveTeams() {
  const secret = getSecretInputPayload(teamsWebhookUrl);
  const payload = {
    teams_enabled:     teamsEnabledToggle?.checked ?? false,
  };
  if (secret.include) payload.teams_webhook_url = secret.value.trim();
  try {
    const response = await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: payload })
    });
    applySettingsToUI(response.settings || {});
    resetSecretInput(teamsWebhookUrl);
    showInlineMessage(teamsNotifMsg, 'Saved.', false, 1500);
  } catch (err) {
    showInlineMessage(teamsNotifMsg, `Error: ${err.message}`, true);
  }
}

if (teamsEnabledToggle) teamsEnabledToggle.addEventListener('change', _autoSaveTeams);
if (teamsWebhookUrl) teamsWebhookUrl.addEventListener('blur', _autoSaveTeams);

if (testTeamsBtn) {
  testTeamsBtn.addEventListener('click', async () => {
    const url = teamsWebhookUrl?.value.trim() || '';
    if (!url) {
      showInlineMessage(teamsNotifMsg, 'Enter a webhook URL first.', true);
      return;
    }
    testTeamsBtn.disabled = true;
    testTeamsBtn.textContent = 'Sending…';
    try {
      await requestJson('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'teams', teams_webhook_url: url })
      });
      showInlineMessage(teamsNotifMsg, 'Test card posted to Teams.', false);
    } catch (err) {
      showInlineMessage(teamsNotifMsg, `Failed: ${err.message}`, true, 8000);
    } finally {
      testTeamsBtn.disabled = false;
      testTeamsBtn.textContent = 'Send Test';
    }
  });
}

// ── Clear Cache buttons ────────────────────────────────────────────────────────

// ── Troubleshooting tab — system health, service control, WiFi fix ─────────────

function fmtBytes(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}
function fmtUptime(secs) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600),
        m = Math.floor((secs % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

async function loadSystemHealth() {
  try {
    const r = await fetch('/api/system/health');
    if (!r.ok) return;
    const d = await r.json();

    // Service status dot
    const dot = document.getElementById('svc-status-dot');
    const lbl = document.getElementById('svc-status-label');
    if (dot && lbl) {
      const active = d.service_status === 'active';
      dot.style.background = active ? '#6fcf97' : '#eb5757';
      lbl.textContent = d.service_status || '—';
    }

    // Uptime
    const up = document.getElementById('syshealth-uptime');
    if (up) up.textContent = d.uptime_secs ? fmtUptime(d.uptime_secs) : '—';

    // Disk bar
    if (d.disk && d.disk.total) {
      const pct = Math.round(d.disk.used / d.disk.total * 100);
      const bar = document.getElementById('syshealth-disk-bar');
      const lbl2 = document.getElementById('syshealth-disk-label');
      if (bar) { bar.style.width = pct + '%'; bar.style.background = pct > 85 ? '#eb5757' : '#6fcf97'; }
      if (lbl2) lbl2.textContent = `${fmtBytes(d.disk.used)} / ${fmtBytes(d.disk.total)} (${pct}%)`;
    }

    // RAM bar
    if (d.memory && d.memory.total_kb) {
      const pct = Math.round(d.memory.used_kb / d.memory.total_kb * 100);
      const bar = document.getElementById('syshealth-ram-bar');
      const lbl3 = document.getElementById('syshealth-ram-label');
      if (bar) { bar.style.width = pct + '%'; bar.style.background = pct > 85 ? '#eb5757' : '#56ccf2'; }
      if (lbl3) lbl3.textContent = `${fmtBytes(d.memory.used_kb * 1024)} / ${fmtBytes(d.memory.total_kb * 1024)} (${pct}%)`;
    }

    // Load
    const loadEl = document.getElementById('syshealth-load');
    if (loadEl && d.load) loadEl.textContent = d.load.join('  /  ');

    // Proxmox install command
    const cmdEl = document.getElementById('proxmox-install-cmd');
    if (cmdEl && d.proxmox_install_cmd) cmdEl.textContent = d.proxmox_install_cmd;
  } catch (_) {}
}

document.getElementById('syshealth-refresh-btn')?.addEventListener('click', loadSystemHealth);

// Service control
['restart', 'start', 'stop'].forEach((action) => {
  document.getElementById(`svc-${action}-btn`)?.addEventListener('click', async () => {
    const msg = document.getElementById('svc-control-msg');
    if (action === 'stop' && !confirm(
      'Stop the WebUI service?\n\nThis will take the dashboard offline. You will need to restart it from the Proxmox host console or via SSH.\n\nProceed?')) return;
    try {
      const r = await fetch(`/api/service/${action}`, { method: 'POST' });
      const d = await r.json();
      if (msg) {
        msg.textContent = d.message || (r.ok ? 'Done' : 'Error');
        msg.className = `settings-message ${r.ok && d.status === 'ok' ? '' : 'error'}`;
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 5000);
      }
      if (r.ok && (action === 'restart' || action === 'start')) {
        setTimeout(() => loadSystemHealth(), 3000);
      }
    } catch (err) {
      if (msg) { msg.textContent = `Error: ${err.message}`; msg.className = 'settings-message error'; msg.classList.remove('hidden'); }
    }
  });
});

// Copy proxmox install command
document.getElementById('proxmox-install-copy-btn')?.addEventListener('click', () => {
  const cmd = document.getElementById('proxmox-install-cmd')?.textContent || '';
  if (!cmd) return;
  navigator.clipboard.writeText(cmd).then(() => showToast('Command copied to clipboard', 'success'))
    .catch(() => showToast('Copy failed — select and copy manually', 'error'));
});

// WiFi auth fix — dispatch update_now to all clients
document.getElementById('wifi-fix-btn')?.addEventListener('click', async () => {
  if (!confirm('Push WiFi Auth Fix to all clients?\n\nThis queues an Update Now command for every registered client. Each client will re-deploy the polkit rule and restart nm-applet.')) return;
  try {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'all', action: 'update_now' }),
    });
    if (!r.ok) throw new Error(await r.text());
    const d = await r.json();
    showToast(`WiFi fix queued for ${d.queued} client(s)`, 'success');
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
});

document.getElementById('server-clear-cache-btn')?.addEventListener('click', async () => {
  if (!confirm('Clear all server-side cache?\n\nThis resets Proxmox state, VM list, command history, and reclone logs. No restart is required.')) return;
  try {
    const r = await fetch('/api/server/clear-cache', { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    showToast('Server cache cleared.', 'success');
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
});

document.getElementById('setup-clear-cache-btn')?.addEventListener('click', async () => {
  if (!confirm('Clear all cache and re-clone?\n\nThis will:\n• Remove git lock files\n• Wipe and re-clone the repo from GitHub\n• Delete client history, state cache, and central history files\n• Restart the WebUI service\n\nThe page will reload automatically once the service is back up.')) return;
  try {
    const r = await fetch('/api/setup/clear-cache', { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    showToast('Cache cleared — restarting service, reloading in 10s…', 'info');
    setTimeout(() => location.reload(), 10000);
  } catch (err) {
    // Service may have restarted before responding
    showToast('Cache cleared — service restarting, reloading in 10s…', 'info');
    setTimeout(() => location.reload(), 10000);
  }
});

// ── VM category inner tab nav ──────────────────────────────────────────────────
const vmCatTabs = Array.from(document.querySelectorAll('.vm-cat-tab'));
vmCatTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeVmCat = btn.dataset.cat;
    vmCatTabs.forEach((button) => button.classList.toggle('active', button.dataset.cat === activeVmCat));
    ['sim', 'other', 'containers', 'templates'].forEach((cat) => {
      document.getElementById(`vm-cat-panel-${cat}`)?.classList.toggle('hidden', cat !== activeVmCat);
    });
    // Bulk bar hidden for templates (read-only)
    const bulkBar = document.getElementById('vm-bulk-bar');
    if (bulkBar) bulkBar.classList.toggle('hidden', activeVmCat === 'templates');
    // Reset select-all
    const sa = document.getElementById('server-select-all');
    if (sa) sa.checked = false;
  });
});

document.getElementById('server-select-all')?.addEventListener('change', (e) => {
  // Only select checkboxes within the active category panel
  const panel = document.getElementById(`vm-cat-panel-${activeVmCat}`);
  if (panel) panel.querySelectorAll('.vm-check:not([disabled])').forEach((cb) => { cb.checked = e.target.checked; });
  const thCheck = document.getElementById(`server-th-check-${activeVmCat}`);
  if (thCheck) thCheck.checked = e.target.checked;
});

['start', 'stop', 'reclone', 'delete'].forEach((op) => {
  document.getElementById(`server-bulk-${op}`)?.addEventListener('click', async () => {
    if (activeVmCat === 'templates') return; // no bulk ops on templates
    const panel = document.getElementById(`vm-cat-panel-${activeVmCat}`);
    if (!panel) return;
    const selected = [...panel.querySelectorAll('.vm-check:checked')].map((cb) => ({
      vmid: cb.dataset.vmid,
      name: cb.dataset.vmName || '',
      vmType: cb.dataset.vmType || 'qemu',
      recloneSupported: cb.dataset.recloneSupported === 'true',
      sourceVmid: cb.dataset.recloneSourceVmid || '',
    }));
    if (!selected.length) return;

    try {
      if (op === 'delete') {
        if (activeVmCat !== 'sim' && !confirmVmDelete(selected)) return;
        const results = await Promise.allSettled(selected.map((entry) => deleteProxmoxVm(entry.vmid)));
        const failed = results.filter((result) => result.status === 'rejected');
        const successCount = results.length - failed.length;
        if (successCount) {
          showNotification(`Delete queued for ${successCount} guest(s)`, 'info');
          scheduleProxmoxRefresh();
        }
        if (failed.length) {
          throw new Error(failed[0].reason?.message || 'One or more deletes failed');
        }
        return;
      }

      const action = op === 'reclone' ? 'reclone_vm' : `${op}_vm`;
      const eligible = op === 'reclone'
        ? selected.filter((entry) => entry.recloneSupported)
        : selected;
      if (!eligible.length) {
        showNotification('No selected guests can be recloned with the current configuration.', 'warning');
        return;
      }
      await Promise.all(eligible.map((entry) => sendProxmoxCommand(action, entry.vmid, {
        type: entry.vmType || 'qemu',
        source_vmid: entry.sourceVmid ? parseInt(entry.sourceVmid, 10) : undefined,
      })));
      const skipped = selected.length - eligible.length;
      showNotification(`${op} sent for ${eligible.length} VM(s)${skipped ? ` (${skipped} skipped)` : ''}`, 'info');
    } catch (err) {
      showNotification(`Error: ${err.message}`, 'error');
    }
  });
});

updateCentralToolbar();
activateSetupSubtab('setup-github');
const updateAllBtn = document.getElementById('update-all-btn');
if (updateAllBtn && !updateAllBtn._bound) {
  updateAllBtn.addEventListener('click', triggerUpdateAll);
  updateAllBtn._bound = true;
}
connectWebSocket();
loadSimulations();

// Single init call replaces 5 separate REST calls — UI renders immediately from cache
(async () => {
  try {
    const init = await requestJson('/api/init');
    // Proxmox
    if (init.proxmox) {
      if (init.proxmox.webui_vmid != null) webuiVmid = init.proxmox.webui_vmid;
      if (init.proxmox.connected || (init.proxmox.vms || []).length || (init.proxmox.usb_state || []).length || (init.proxmox.unknown_usb || []).length || (init.proxmox.pending_proxmox || []).length || (init.proxmox.approved_proxmox || []).length) {
        renderServerTab(init.proxmox);
      }
    }
    // Reclone
    if (init.reclone) renderRecloneStatus(init.reclone);
    // Update All
    if (init.update_all) handleUpdateAllProgress(init.update_all);
    // Central
    if (init.central) {
      centralTokenValid = Boolean(init.central.token_valid);
      setCentralApiStatus(centralTokenValid, init.central.token_state);
      handleCentralUpdate(init.central.status || {}, Date.now() / 1000, init.central.wireless_clients || {}, init.central.hardware_alerts || [], init.central.client_count_status || {});
    }
    // Relay
    if (init.relay) setRelayStatus(init.relay);
    // Kill switch (global from GitHub, local from simulation.conf)
    if (init.kill_switch !== undefined) applyGkillSwitch(init.kill_switch);
    if (init.local_kill_switch !== undefined) {
      simDisabledState.local = init.local_kill_switch === 'on';
      renderSimDisabledBanner();
    }
    // Footer version — prefer app_version (VERSION file), fall back to installer_version
    const footerVersion = document.getElementById('footer-version');
    if (footerVersion) {
      footerVersion.textContent = `v${init.app_version || init.installer_version || '—'}`;
      footerVersion.title = `WebUI version: v${init.app_version || init.installer_version || '—'}`;
    }
  } catch (_) { /* silent — WS will provide live state */ }
})();

// ── Auto-refresh ──────────────────────────────────────────────────────────────
let _refreshTimer = null;

async function refreshAll() {
  try {
    const init = await requestJson('/api/init');
    if (init.proxmox) {
      if (init.proxmox.webui_vmid != null) webuiVmid = init.proxmox.webui_vmid;
      if (init.proxmox.connected || (init.proxmox.vms || []).length || (init.proxmox.usb_state || []).length || (init.proxmox.unknown_usb || []).length || (init.proxmox.pending_proxmox || []).length || (init.proxmox.approved_proxmox || []).length) {
        renderServerTab(init.proxmox);
      }
    }
    if (init.reclone) renderRecloneStatus(init.reclone);
    if (init.update_all) handleUpdateAllProgress(init.update_all);
    if (init.central) {
      centralTokenValid = Boolean(init.central.token_valid);
      setCentralApiStatus(centralTokenValid, init.central.token_state);
      handleCentralUpdate(init.central.status || {}, Date.now() / 1000, init.central.wireless_clients || {}, init.central.hardware_alerts || [], init.central.client_count_status || {});
    }
    if (init.relay) setRelayStatus(init.relay);
    if (init.kill_switch !== undefined) applyGkillSwitch(init.kill_switch);
    if (init.local_kill_switch !== undefined) {
      simDisabledState.local = init.local_kill_switch === 'on';
      renderSimDisabledBanner();
    }
  } catch (_) { /* silent */ }
  // Also refresh simulations tab data so it stays current on auto-refresh
  try { await loadSimulations(); } catch (_) { /* silent */ }
}

function updateRefreshCountdownDisplay(text, paused = false) {
  const countdown = document.getElementById('refresh-countdown');
  if (!countdown) return;
  countdown.textContent = text;
  countdown.classList.toggle('paused', paused);
}

function stopRefreshTimers() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  if (refreshCountdownTimer) { clearInterval(refreshCountdownTimer); refreshCountdownTimer = null; }
}

function computeRefreshPaused() {
  if (activeSpokeTab === 'server') {
    return !refreshActiveServerSubtabs.has(activeServerSubtab);
  }
  return !refreshActiveTabs.has(activeSpokeTab);
}

function restartRefreshTimer() {
  stopRefreshTimers();
  if (refreshIntervalSeconds <= 0) {
    updateRefreshCountdownDisplay('Off');
    return;
  }
  if (refreshPaused) {
    updateRefreshCountdownDisplay('Paused', true);
    return;
  }
  refreshSecondsLeft = refreshIntervalSeconds;
  updateRefreshCountdownDisplay(String(refreshSecondsLeft) + 's');
  refreshCountdownTimer = setInterval(() => {
    refreshSecondsLeft = Math.max(0, refreshSecondsLeft - 1);
    updateRefreshCountdownDisplay(String(refreshSecondsLeft) + 's');
  }, 1000);
  _refreshTimer = setInterval(async () => {
    refreshSecondsLeft = refreshIntervalSeconds;
    updateRefreshCountdownDisplay(String(refreshSecondsLeft) + 's');
    await refreshAll();
  }, refreshIntervalSeconds * 1000);
}

function updateRefreshPausedState() {
  const wasPaused = refreshPaused;
  refreshPaused = computeRefreshPaused();
  restartRefreshTimer();
  if (wasPaused && !refreshPaused) {
    refreshAll().catch(() => {});
  }
}

function applyRefreshInterval(seconds) {
  refreshIntervalSeconds = Number.isFinite(seconds) ? seconds : 0;
  localStorage.setItem('refreshInterval', String(refreshIntervalSeconds));
  updateRefreshPausedState();
}

const refreshSelect = document.getElementById('refresh-interval-select');
if (refreshSelect) {
  const saved = localStorage.getItem('refreshInterval');
  const defaultInterval = 10;
  const initial = saved !== null ? Number(saved) : defaultInterval;
  const opt = refreshSelect.querySelector(`option[value="${initial}"]`);
  if (opt) opt.selected = true;
  applyRefreshInterval(initial);
  refreshSelect.addEventListener('change', () => applyRefreshInterval(Number(refreshSelect.value)));
}

// ── Log viewer ────────────────────────────────────────────────────────────────
let loadServiceLogs = () => {};

(function initLogViewer() {
  const output       = document.getElementById('logs-output');
  const tailBtn      = document.getElementById('logs-tail-btn');
  const stopBtn      = document.getElementById('logs-stop-btn');
  const refreshBtn   = document.getElementById('logs-refresh-btn');
  const clearBtn     = document.getElementById('logs-clear-btn');
  const filterInput  = document.getElementById('logs-filter');
  const linesSelect  = document.getElementById('logs-lines-select');
  const sourceSelect = document.getElementById('logs-source-select');
  const autoScroll   = document.getElementById('logs-autoscroll');

  if (!output) return;

  let evtSource = null;
  let tailConnected = false;
  let tailRequested = false;
  let historyLoaded = false;
  const MAX_LINES = 2000;

  function classify(text) {
    const t = text.toLowerCase();
    if (/\b(error|err|exception|traceback|critical)\b/.test(t)) return 'log-err';
    if (/\b(warning|warn)\b/.test(t)) return 'log-warn';
    if (/\b(info)\b/.test(t)) return 'log-info';
    if (/\b(debug)\b/.test(t)) return 'log-debug';
    return '';
  }

  function highlight(text, filter) {
    if (!filter) return escHtml(text);
    const re = new RegExp(`(${filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escHtml(text).replace(re, '<mark class="log-hi">$1</mark>');
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function appendLine(text) {
    const filter = filterInput.value.trim();
    if (filter && !text.toLowerCase().includes(filter.toLowerCase())) return;

    const span = document.createElement('span');
    span.className = 'log-line ' + classify(text);
    span.innerHTML = highlight(text, filter) + '\n';
    output.appendChild(span);

    while (output.children.length > MAX_LINES) output.removeChild(output.firstChild);
    if (autoScroll.checked) output.scrollTop = output.scrollHeight;
  }

  function clearOutput() { output.innerHTML = ''; }

  async function loadHistory() {
    const lines  = linesSelect.value;
    const source = sourceSelect ? sourceSelect.value : 'journal';
    clearOutput();
    try {
      const resp = await fetch(`/api/logs/history?lines=${lines}&source=${source}`);
      const text = await resp.text();
      text.split('\n').forEach(l => { if (l) appendLine(l); });
    } catch (e) {
      appendLine(`[ERROR] Could not load logs: ${e}`);
    }
  }

  function tailStreamUrl() {
    const source = sourceSelect ? sourceSelect.value : 'journal';
    return `/api/logs/stream?source=${encodeURIComponent(source)}`;
  }

  function startTail() {
    if (evtSource) return;
    tailRequested = true;
    tailConnected = false;
    evtSource = new EventSource(tailStreamUrl());
    evtSource.onopen = () => {
      tailConnected = true;
    };
    evtSource.onmessage = (e) => {
      if (!e.data) return;
      try {
        const line = JSON.parse(e.data);
        if (line) appendLine(line);
      } catch {
        appendLine(e.data);
      }
    };
    evtSource.onerror = () => {
      if (!evtSource || !tailRequested) return;
      if (!tailConnected || evtSource.readyState === EventSource.CLOSED) {
        appendLine('[stream disconnected — click Start Tail to reconnect]');
        stopTail();
      }
    };
    tailBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
  }

  function stopTail() {
    tailRequested = false;
    tailConnected = false;
    if (evtSource) { evtSource.close(); evtSource = null; }
    tailBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
  }

  tailBtn.addEventListener('click', startTail);
  stopBtn.addEventListener('click', stopTail);
  refreshBtn.addEventListener('click', loadHistory);
  clearBtn.addEventListener('click', clearOutput);
  if (sourceSelect) sourceSelect.addEventListener('change', async () => {
    const restartTail = Boolean(evtSource);
    if (restartTail) stopTail();
    await loadHistory();
    if (restartTail) startTail();
  });

  // Re-apply filter live
  filterInput.addEventListener('input', () => {
    const lines = Array.from(output.querySelectorAll('.log-line')).map(s => s.textContent);
    clearOutput();
    lines.forEach(appendLine);
  });

  loadServiceLogs = () => {
    if (!historyLoaded) {
      historyLoaded = true;
      loadHistory();
    }
  };

  // Expose loadHistory so update handler can switch to install log after failure
  window._logsLoadHistory = loadHistory;
  window._logsSetSource   = (src) => { if (sourceSelect) sourceSelect.value = src; };
})();

document.getElementById('spoke-acme-challenge')?.addEventListener('change', toggleSpokeAcmeDnsSection);
document.getElementById('spoke-acme-dns-provider')?.addEventListener('change', toggleSpokeAcmeDnsSection);


  })();
}

// ════════════════════════════════════════════════════════════════
// HUB — only runs when WEBUI_MODE === 'hub'
// ════════════════════════════════════════════════════════════════
if (WEBUI_MODE === 'hub') {
  (function () {

"use strict";

let authToken = localStorage.getItem("hub_token") || null;
let currentUser = null;
let currentTenantId = null;
let tenants = [];
let spokeCache = {};
let activeSpokeModal = null;
let ws = null;
let wsReconnectTimer = null;
let activeTab = "dashboard";
let autoRefreshTimer = null;
let autoRefreshCountdownTimer = null;
let autoRefreshSecondsLeft = 10;
let refreshPaused = false;
const autoRefreshActiveTabs = new Set(["dashboard", "simulations", "clients", "spokes", "config"]);
let tenantDetailState = { open: false, tenantId: null, activeTab: "dashboard", data: {} };
let tenantUserCounts = {};
let dashboardTenantRows = [];
let aggregateDashboardData = null;
let aggregateSimulationRows = [];
let aggregateClientRows = [];
const hubSimulationUiState = { search: "" };
const hubClientUiState = { search: "", status: "all", spoke: "all" };
const tenantDashboardSort = { key: "name", direction: "asc" };

const PROCESSING_FEATURES = ["aruba_polling", "teams_webhook", "email", "heartbeat", "gkill", "schedules", "repo_sync"];
const spokeUiState = { expandedByTenant: {}, search: "" };
const renderTokens = {};
const scheduledReloads = {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

function showToast(message, level = "ok") {
  const container = $("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  const cls = level === "ok" ? "success" : level === "warn" ? "error" : "error";
  toast.className = `settings-message ${cls}`;
  toast.textContent = message;
  toast.style.cssText = "min-width:240px;max-width:420px;box-shadow:0 4px 16px rgba(0,0,0,0.15);cursor:pointer;";
  toast.addEventListener("click", () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function isOnline(lastSeenIso) {
  if (!lastSeenIso) return false;
  const ts = new Date(lastSeenIso).getTime();
  return !Number.isNaN(ts) && Date.now() - ts < 120000;
}

function statusDot(online) {
  return `<span class="status-dot ${online ? "online" : "offline"}"></span>`;
}

function updateGkillBadge(value) {
  const badge = $("#gkill-badge");
  if (!badge) return;
  const on = ["on", "true", "1", "enabled"].includes(String(value || "").toLowerCase());
  badge.classList.toggle("hidden", !on);
  badge.textContent = on ? "⚠ GKILL ON" : "GKILL OFF";
}

function updateApiStatus(online, text) {
  const dot = $("#api-dot");
  const label = $("#api-text");
  if (dot) dot.className = `status-dot ${online ? "online" : "offline"}`;
  if (label) label.textContent = text;
}

function setFormMessage(id, message, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message || "";
  el.className = `form-msg ${message ? (ok ? "msg-ok" : "msg-error") : ""}`.trim();
}

function tenantName(tenantId) {
  const tenant = tenants.find(item => item.id === tenantId);
  return tenant ? tenant.name : tenantId;
}

function currentRoleForTenant(tenantId = currentTenantId) {
  if (!currentUser) return "";
  if (currentUser.is_superadmin) return "superadmin";
  return currentUser.tenant_roles.find(role => role.tenant_id === tenantId)?.role || "";
}

function canManageTenant(tenantId = currentTenantId) {
  if (!currentUser || !tenantId) return false;
  return currentUser.is_superadmin || currentRoleForTenant(tenantId) === "admin";
}

function getTenantMeta(tenantId) {
  return tenants.find(item => item.id === tenantId) || { id: tenantId, name: tenantId };
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function formatInlineValue(value) {
  if (!hasMeaningfulValue(value)) return "—";
  if (Array.isArray(value)) return value.map(item => formatInlineValue(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function uniqueValues(values = []) {
  const seen = new Set();
  return values.filter(value => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSpokeClients(spoke) {
  return Array.isArray(spoke?.telemetry?.clients) ? spoke.telemetry.clients : [];
}

function getSpokeProxmoxSummary(spoke) {
  const telemetry = spoke?.telemetry || {};
  return telemetry.proxmox || telemetry.proxmox_summary || telemetry.proxmox_status || telemetry.server || {};
}

function getSpokeVmCount(spoke) {
  const proxmox = getSpokeProxmoxSummary(spoke);
  const vmCount = Number(proxmox.vm_count);
  if (Number.isFinite(vmCount)) return vmCount;
  return Array.isArray(proxmox.vms) ? proxmox.vms.length : 0;
}

function getSpokeRunningVmCount(spoke) {
  const proxmox = getSpokeProxmoxSummary(spoke);
  const runningCount = Number(proxmox.running_count);
  if (Number.isFinite(runningCount)) return runningCount;
  return Array.isArray(proxmox.vms) ? proxmox.vms.filter(vm => vm.status === "running").length : 0;
}

function getSpokeUsbCount(spoke) {
  const proxmox = getSpokeProxmoxSummary(spoke);
  const usbCount = Number(proxmox.usb_count);
  if (Number.isFinite(usbCount)) return usbCount;
  return Array.isArray(proxmox.usb_state) ? proxmox.usb_state.length : 0;
}

function summarizeTenantSpokes(spokes = []) {
  const approved = spokes.filter(spoke => spoke.status === "approved");
  const onlineCount = approved.filter(spoke => isOnline(spoke.last_seen)).length;
  const lastSeenTimes = approved
    .map(spoke => new Date(spoke.last_seen).getTime())
    .filter(value => Number.isFinite(value));
  return {
    totalCount: spokes.length,
    approvedCount: approved.length,
    pendingCount: Math.max(0, spokes.length - approved.length),
    onlineCount,
    offlineCount: Math.max(0, approved.length - onlineCount),
    clientCount: approved.reduce((sum, spoke) => sum + getSpokeClients(spoke).length, 0),
    vmCount: approved.reduce((sum, spoke) => sum + getSpokeVmCount(spoke), 0),
    runningVmCount: approved.reduce((sum, spoke) => sum + getSpokeRunningVmCount(spoke), 0),
    usbCount: approved.reduce((sum, spoke) => sum + getSpokeUsbCount(spoke), 0),
    lastSync: lastSeenTimes.length ? new Date(Math.max(...lastSeenTimes)).toISOString() : null,
  };
}

function renderTenantSummaryPills(summary) {
  return `
    <span class="stat-pill">${summary.approvedCount} spokes</span>
    <span class="stat-pill">${summary.onlineCount} online</span>
    <span class="stat-pill">${summary.clientCount} clients</span>
    <span class="stat-pill">${summary.vmCount} VMs</span>
    <span class="stat-pill">${summary.runningVmCount} running</span>
  `;
}

function getActiveTenantId() {
  return tenantDetailState.open ? tenantDetailState.tenantId : currentTenantId;
}

function aggregateEndpoint(path) {
  const tenantId = getActiveTenantId();
  return tenantId
    ? `/api/aggregate/${path}?tenant_id=${encodeURIComponent(tenantId)}`
    : `/api/aggregate/${path}`;
}

async function loadAggregateData(path) {
  if (!currentUser || !getActiveTenantId()) return null;
  const res = await apiFetch(aggregateEndpoint(path));
  if (!res || !res.ok) return null;
  return res.json();
}

function hubSimulationBadgeClass(simulation) {
  if (FAILURE_SIMS.has(simulation)) return "badge badge-failure";
  if (TRAFFIC_SIMS.has(simulation)) return "badge badge-traffic";
  return "badge badge-grey";
}

function hubImpactSummary(activeSimulations = []) {
  const labels = [...new Set((activeSimulations || []).map(sim => IMPACT_LABELS[sim]).filter(Boolean))];
  return labels.length ? labels.join(" · ") : "— Normal";
}

function simulationStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  const cls = normalized.includes("running") ? "online" : normalized.includes("offline") ? "offline" : "warning";
  return `<span class="site-status-pill ${cls}">${escHtml(status || "Unknown")}</span>`;
}

function renderDashboardAggregate(data) {
  const hardwareRows = Object.entries(data.hardware_breakdown || {}).map(([name, count]) => `
    <tr><td>${escHtml(name)}</td><td>${count}</td></tr>
  `).join("");
  const checks = data.checks_summary || {};
  return `
    <div class="tenant-metrics-grid">
      <article class="tenant-metric-card"><span class="tenant-metric-label">Total Clients</span><strong class="tenant-metric-value">${data.client_count ?? 0}</strong><span class="tenant-metric-hint">Across approved spokes</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">Spoke Health</span><strong class="tenant-metric-value">${data.spokes_online ?? 0} / ${data.spokes_total ?? 0}</strong><span class="tenant-metric-hint">Online within last 120s</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">Checks Passing</span><strong class="tenant-metric-value">${checks.pass ?? 0}</strong><span class="tenant-metric-hint">Warnings ${checks.warning ?? 0} · Failing ${checks.fail ?? 0}</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">Hardware Types</span><strong class="tenant-metric-value">${Object.keys(data.hardware_breakdown || {}).length}</strong><span class="tenant-metric-hint">Observed client platforms</span></article>
    </div>
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Hardware Breakdown</h2><p>Client totals per reported hardware type for this tenant.</p></div>
        <table class="data-table">
          <thead><tr><th>Hardware Type</th><th>Count</th></tr></thead>
          <tbody>${hardwareRows || '<tr><td colspan="2" class="empty-state">No client hardware reported.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Checks Summary</h2><p>Roll-up across stored spoke telemetry in this tenant.</p></div>
        <table class="data-table">
          <tbody>
            <tr><td>Pass</td><td>${checks.pass ?? 0}</td></tr>
            <tr><td>Fail</td><td>${checks.fail ?? 0}</td></tr>
            <tr><td>Warning</td><td>${checks.warning ?? 0}</td></tr>
            <tr><td>Spokes Online</td><td>${data.spokes_online ?? 0} of ${data.spokes_total ?? 0}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function renderSimulationRows() {
  const tbody = $("#hub-simulations-tbody");
  if (!tbody) return;
  const search = hubSimulationUiState.search.trim().toLowerCase();
  const rows = aggregateSimulationRows.filter(row => !search
    || String(row.spoke_name || row.spoke_hostname || "").toLowerCase().includes(search)
    || String(row.simulation_name || "").toLowerCase().includes(search)
    || String(row.status || "").toLowerCase().includes(search));
  const uniqueSpokes = new Set(rows.map(row => row.spoke_id));
  const totalClients = rows.reduce((sum, row) => sum + Number(row.client_count || 0), 0);
  $("#hub-simulations-pill") && ($("#hub-simulations-pill").textContent = `${rows.length} simulations`);
  $("#hub-simulation-clients-pill") && ($("#hub-simulation-clients-pill").textContent = `${totalClients} clients`);
  $("#hub-simulation-spokes-pill") && ($("#hub-simulation-spokes-pill").textContent = `${uniqueSpokes.size} spokes`);
  tbody.innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escHtml(row.spoke_name || row.spoke_hostname || row.spoke_id)}</strong></td>
      <td>${escHtml(row.simulation_name || "—")}</td>
      <td>${simulationStatusBadge(row.status)}</td>
      <td>${Number(row.client_count || 0)}</td>
    </tr>
  `).join("") : '<tr><td colspan="4" class="empty-state">No simulation telemetry reported for this tenant.</td></tr>';
}

function updateClientSpokeFilterOptions() {
  const select = $("#hub-clients-spoke-filter");
  if (!select) return;
  const currentValue = select.value || "all";
  const options = [...new Set(aggregateClientRows.map(row => row.spoke_name || row.spoke_hostname || row.spoke_id).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  select.innerHTML = '<option value="all">All spokes</option>' + options.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join("");
  select.value = options.includes(currentValue) ? currentValue : "all";
}

function renderClientRowsForHub() {
  const tbody = $("#hub-clients-tbody");
  if (!tbody) return;
  const search = hubClientUiState.search.trim().toLowerCase();
  const rows = aggregateClientRows.filter(client => {
    const statusMatch = hubClientUiState.status === "all"
      || (hubClientUiState.status === "online" && client.online)
      || (hubClientUiState.status === "offline" && !client.online);
    if (!statusMatch) return false;
    const spokeName = client.spoke_name || client.spoke_hostname || client.spoke_id || "";
    if (hubClientUiState.spoke !== "all" && spokeName !== hubClientUiState.spoke) return false;
    if (!search) return true;
    const haystack = [
      client.hostname,
      spokeName,
      client.platform,
      client.simulation_id,
      client.connected_ssid,
      ...(client.active_simulations || []),
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
  const onlineCount = rows.filter(client => client.online).length;
  const uniqueSpokes = new Set(rows.map(client => client.spoke_id));
  $("#hub-clients-pill") && ($("#hub-clients-pill").textContent = `${rows.length} clients`);
  $("#hub-clients-online-pill") && ($("#hub-clients-online-pill").textContent = `${onlineCount} online`);
  $("#hub-clients-spokes-pill") && ($("#hub-clients-spokes-pill").textContent = `${uniqueSpokes.size} spokes`);
  tbody.innerHTML = rows.length ? rows.map(client => `
    <tr>
      <td><span class="site-status-pill ${client.online ? "online" : "offline"}">${client.online ? "Online" : "Offline"}</span></td>
      <td>${escHtml(client.hostname || "—")}</td>
      <td>${escHtml(client.spoke_name || client.spoke_hostname || client.spoke_id || "—")}</td>
      <td>${escHtml(client.platform || client.hw_type || "—")}</td>
      <td>${escHtml(client.simulation_id || "—")}</td>
      <td>${escHtml(client.connected_ssid || "—")}</td>
      <td><div class="badge-list">${(client.active_simulations || []).length ? client.active_simulations.map(sim => `<span class="${hubSimulationBadgeClass(sim)}">${escHtml(sim)}</span>`).join("") : '<span class="muted">—</span>'}</div></td>
      <td>${escHtml(hubImpactSummary(client.active_simulations || []))}</td>
      <td>${escHtml(fmtDate(client.last_seen))}</td>
      <td>${Number(client.error_count || 0)}</td>
    </tr>
  `).join("") : '<tr><td colspan="10" class="empty-state">No client telemetry reported for this tenant.</td></tr>';
}

function buildTenantUserCounts(users = []) {
  return users.reduce((counts, user) => {
    (user.tenant_roles || []).forEach(role => {
      counts[role.tenant_id] = (counts[role.tenant_id] || 0) + 1;
    });
    return counts;
  }, {});
}

function getTenantUserCount(tenantId) {
  return Object.prototype.hasOwnProperty.call(tenantUserCounts, tenantId) ? tenantUserCounts[tenantId] : null;
}

function compareTenantDashboardValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function tenantDashboardSortValue(row, key) {
  if (key === "approvedSpokes" || key === "userCount") return row[key] ?? -1;
  if (key === "createdAt" || key === "lastSync") return row[key] ? new Date(row[key]).getTime() : 0;
  return String(row[key] || "").toLowerCase();
}

function sortDashboardTenantRows(rows) {
  const { key, direction } = tenantDashboardSort;
  const sorted = [...rows].sort((left, right) => compareTenantDashboardValues(
    tenantDashboardSortValue(left, key),
    tenantDashboardSortValue(right, key),
  ));
  return direction === "desc" ? sorted.reverse() : sorted;
}

function renderDashboardTenantSortHeader(label, key) {
  const active = tenantDashboardSort.key === key;
  const indicator = active ? (tenantDashboardSort.direction === "asc" ? "▲" : "▼") : "↕";
  const ariaSort = active ? (tenantDashboardSort.direction === "asc" ? "ascending" : "descending") : "none";
  return `<button class="tenant-table-sort${active ? " active" : ""}" data-dashboard-tenant-sort="${escHtml(key)}" aria-sort="${ariaSort}" type="button"><span>${escHtml(label)}</span><span class="tenant-table-sort-indicator" aria-hidden="true">${indicator}</span></button>`;
}

function renderDashboardTenantTable(rows) {
  const sortedRows = sortDashboardTenantRows(rows);
  const body = sortedRows.length ? sortedRows.map(row => `
    <tr>
      <td><button class="btn btn-link tenant-link-btn" data-open-tenant="${escHtml(row.id)}" type="button">${escHtml(row.name)}</button></td>
      <td><code>${escHtml(row.id)}</code></td>
      <td>${row.approvedSpokes}</td>
      <td>${row.userCount ?? '<span class="muted">—</span>'}</td>
      <td>${row.createdAt ? escHtml(fmtDate(row.createdAt)) : '<span class="muted">—</span>'}</td>
      <td title="${escHtml(row.lastSync ? fmtDate(row.lastSync) : "—")}">${row.lastSync ? escHtml(relativeTime(row.lastSync)) : '<span class="muted">—</span>'}</td>
      <td>
        <div class="tenant-table-actions">
          <button class="btn btn-secondary btn-small" data-open-tenant="${escHtml(row.id)}" type="button">Manage</button>
          ${currentUser?.is_superadmin ? `<button class="btn btn-danger btn-small" data-delete-tenant="${escHtml(row.id)}" type="button">Delete</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("") : '<tr><td colspan="7" class="empty-state">No tenants available.</td></tr>';
  return `
    <section class="setup-card tenant-list-card">
      <div class="setup-card-header">
        <h2>Tenants</h2>
        <p>Tenant overview for the hub. Open a tenant to view its dashboard, spokes, commands, and configuration.</p>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>${renderDashboardTenantSortHeader("Tenant Name", "name")}</th>
              <th>${renderDashboardTenantSortHeader("Tenant ID", "id")}</th>
              <th>${renderDashboardTenantSortHeader("Approved Spokes", "approvedSpokes")}</th>
              <th>${renderDashboardTenantSortHeader("Users", "userCount")}</th>
              <th>${renderDashboardTenantSortHeader("Created", "createdAt")}</th>
              <th>${renderDashboardTenantSortHeader("Last Sync", "lastSync")}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function setTenantDetailVisible(open) {
  $("#hub-dashboard-overview")?.classList.toggle("hidden", open);
  $("#hub-tenant-detail")?.classList.toggle("hidden", !open);
}

function resetTenantDetail() {
  tenantDetailState.open = false;
  tenantDetailState.tenantId = null;
  tenantDetailState.activeTab = "dashboard";
  setTenantDetailVisible(false);
  updateRefreshPausedState();
}

function scheduleReload(key, callback, delay = 250) {
  if (scheduledReloads[key]) clearTimeout(scheduledReloads[key]);
  scheduledReloads[key] = window.setTimeout(() => {
    scheduledReloads[key] = null;
    callback();
  }, delay);
}

async function refreshAfterSpokeApproval(tenantId = currentTenantId) {
  const refresh = async () => {
    if (currentUser?.is_superadmin) {
      await loadSuperadmin();
    } else if (tenantId && canManageTenant(tenantId)) {
      await loadTenantPendingSpokes();
    }

    if (tenantId) {
      await ensureTenantSpokesFor(tenantId, true);
    }
    await loadDashboard(true);
    if (tenantId === currentTenantId) {
      await loadSimulations(true);
      await loadClients(true);
      await loadSpokes(true);
      await loadConfig(true);
    }
    if (tenantDetailState.open && tenantDetailState.tenantId === tenantId) {
      const data = await loadTenantDetailData(true);
      renderTenantDetail(data);
    }
    if (activeSpokeModal?.tenant_id === tenantId) {
      const latest = getSpokeFromCache(tenantId, activeSpokeModal.spoke.id);
      if (latest) activeSpokeModal.spoke = latest;
      renderSpokeClientsTab();
    }
  };

  await refresh();
  [1500, 5000].forEach((delay, index) => {
    scheduleReload(`approval-refresh-${tenantId || "all"}-${index}`, () => {
      refresh().catch(() => {});
    }, delay);
  });
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { ...options, headers };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (init.body && !(init.body instanceof FormData) && typeof init.body !== "string") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(url, init).catch(() => null);
  if (!response) {
    updateApiStatus(false, "Disconnected");
    return null;
  }
  updateApiStatus(true, "Connected");
  if (response.status === 401 && authToken) {
    logout(false);
    return null;
  }
  return response;
}

async function readJson(response) {
  if (!response) return null;
  return response.json().catch(() => null);
}

function renderInBatches(key, container, items, renderItem, batchSize = 40) {
  renderTokens[key] = (renderTokens[key] || 0) + 1;
  const token = renderTokens[key];
  container.innerHTML = "";
  let index = 0;
  function draw() {
    if (renderTokens[key] !== token) return;
    const fragment = document.createDocumentFragment();
    for (let count = 0; count < batchSize && index < items.length; count += 1, index += 1) {
      fragment.appendChild(renderItem(items[index], index));
    }
    container.appendChild(fragment);
    if (index < items.length) window.requestAnimationFrame(draw);
  }
  window.requestAnimationFrame(draw);
}

async function pingApi() {
  const res = await fetch("/api/health").catch(() => null);
  const ok = Boolean(res && res.ok);
  updateApiStatus(ok, ok ? "Connected" : "Disconnected");
  if (ok) {
    const data = await res.json().catch(() => null);
    const footerVersion = $("#footer-version");
    if (footerVersion && data?.version) {
      footerVersion.textContent = `v${data.version}`;
      footerVersion.title = `WebUI version: v${data.version} | Branch: ${data.branch || "?"} | SHA: ${data.sha || "?"}`;
    }
  }
}

function getExpandedSet(tenantId = currentTenantId) {
  if (!tenantId) return new Set();
  if (!spokeUiState.expandedByTenant[tenantId]) spokeUiState.expandedByTenant[tenantId] = new Set();
  return spokeUiState.expandedByTenant[tenantId];
}

function syncRoleBadge() {
  const badge = $("#topbar-role-badge");
  if (!badge || !currentUser) return;
  badge.textContent = currentUser.is_superadmin ? "SUPERADMIN" : (currentRoleForTenant() || "user").toUpperCase();
}

function buildTenantSelector() {
  const wrap = $("#tenant-selector");
  const select = $("#tenant-select");
  if (!wrap || !select) return;
  select.innerHTML = tenants.map(tenant => `<option value="${escHtml(tenant.id)}">${escHtml(tenant.name)}</option>`).join("");
  if (currentTenantId) select.value = currentTenantId;
  // Show the dropdown whenever there are multiple tenants or the user is a superadmin with any tenant.
  const show = currentUser && tenants.length > 0 && (tenants.length > 1 || currentUser.is_superadmin);
  wrap.classList.toggle("hidden", !show);
}

function clearDynamicTenantTabs() {
  $$(".dynamic-tenant-tab").forEach(tab => tab.remove());
}

function buildSuperadminTenantTabs() {
  clearDynamicTenantTabs();
  // No per-tenant tabs — tenant is selected via the dropdown in the header.
  // Ensure the Spokes tab is always visible for authenticated users.
  const spokesTab = $('.tab[data-tab="spokes"]');
  if (spokesTab) spokesTab.classList.remove("hidden");
}

function applyAuthUI() {
  const loggedIn = Boolean(currentUser && authToken);
  $("#login-btn")?.classList.toggle("hidden", loggedIn);
  $("#topbar-user")?.classList.toggle("hidden", !loggedIn);
  $("#topbar-username") && ($("#topbar-username").textContent = currentUser?.username || "");
  $$(".auth-tab").forEach(tab => tab.classList.toggle("hidden", !loggedIn));
  $(".superadmin-tab")?.classList.toggle("hidden", !(loggedIn && currentUser?.is_superadmin));
  if (!loggedIn) {
    currentTenantId = null;
    tenants = [];
    spokeCache = {};
    tenantUserCounts = {};
    dashboardTenantRows = [];
    tenantDetailState.data = {};
    resetTenantDetail();
    clearDynamicTenantTabs();
    $("#tenant-selector")?.classList.add("hidden");
    $(".tab[data-tab='spokes']")?.classList.remove("hidden");
    $(".tab[data-tab='superadmin']") && ($(".tab[data-tab='superadmin']").textContent = "🔑 Superadmin");
    if (activeTab !== "dashboard") showTab("dashboard");
    return;
  }
  buildTenantSelector();
  syncRoleBadge();
  buildSuperadminTenantTabs();
  const setupTab = $('.tab[data-tab="setup"]');
  setupTab?.classList.toggle("hidden", !canManageTenant() && !currentUser.is_superadmin);
}

async function loadUserContext() {
  if (!authToken) {
    currentUser = null;
    applyAuthUI();
    return;
  }
  const meRes = await apiFetch("/api/auth/me");
  if (!meRes || !meRes.ok) {
    logout(false);
    return;
  }
  currentUser = await meRes.json();
  if (currentUser.is_superadmin) {
    const [tenantsRes, usersRes] = await Promise.all([
      apiFetch("/api/superadmin/tenants"),
      apiFetch("/api/superadmin/users"),
    ]);
    tenants = tenantsRes && tenantsRes.ok ? (await tenantsRes.json()).map(item => ({ id: item.id, name: item.name || item.id, raw: item })) : [];
    tenantUserCounts = usersRes && usersRes.ok ? buildTenantUserCounts(await usersRes.json()) : {};
  } else {
    tenants = (currentUser.tenant_roles || []).map(role => ({ id: role.tenant_id, name: role.tenant_id, raw: null }));
    tenantUserCounts = {};
  }
  if (tenants.length && !tenants.some(tenant => tenant.id === currentTenantId)) {
    currentTenantId = tenants[0].id;
  }
  applyAuthUI();
  populateCommandSpokeSelect();
}

function openLoginModal() {
  $("#login-modal")?.classList.remove("hidden");
  $("#login-error") && ($("#login-error").textContent = "");
  $("#login-username")?.focus();
}

function closeLoginModal() {
  $("#login-modal")?.classList.add("hidden");
  setFormMessage("login-error", "", false);
}

async function submitLogin() {
  const username = $("#login-username")?.value.trim();
  const password = $("#login-password")?.value || "";
  if (!username || !password) {
    setFormMessage("login-error", "Enter username and password.", false);
    return;
  }
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch(() => null);
  if (!res || !res.ok) {
    const data = res ? await res.json().catch(() => null) : null;
    const detail = data?.detail;
    setFormMessage("login-error", detail?.message || detail || "Invalid credentials.", false);
    return;
  }
  const payload = await res.json();
  authToken = payload.access_token;
  localStorage.setItem("hub_token", authToken);
  closeLoginModal();
  await loadUserContext();
  connectWebSocket();
  await refreshCurrentView(true);
  showToast("Signed in successfully.", "ok");
}

function logout(showMessage = true) {
  authToken = null;
  currentUser = null;
  currentTenantId = null;
  tenants = [];
  spokeCache = {};
  aggregateDashboardData = null;
  aggregateSimulationRows = [];
  aggregateClientRows = [];
  tenantDetailState.data = {};
  resetTenantDetail();
  activeSpokeModal = null;
  localStorage.removeItem("hub_token");
  applyAuthUI();
  closeSpokeModal();
  if (showMessage) showToast("Signed out.", "ok");
}

async function setCurrentTenant(tenantId, reload = true) {
  currentTenantId = tenantId;
  aggregateDashboardData = null;
  aggregateSimulationRows = [];
  aggregateClientRows = [];
  $("#tenant-select") && ($("#tenant-select").value = tenantId || "");
  syncRoleBadge();
  applyAuthUI();
  populateCommandSpokeSelect();
  if (reload && ["dashboard", "simulations", "clients", "spokes", "setup", "config", "commands"].includes(activeTab)) await refreshCurrentView(true);
}

function showTab(rawTabId, opts = {}) {
  const tabId = rawTabId.startsWith('hub-') ? rawTabId.slice(4) : rawTabId;
  if (["simulations", "clients", "spokes", "setup", "config", "commands", "superadmin"].includes(tabId) && !currentUser) {
    openLoginModal();
    return;
  }
  activeTab = tabId;
  $("#hub-root")?.querySelectorAll(".tab-content").forEach(panel => panel.classList.add("hidden"));
  const panel = $("#hub-root")?.querySelector(`#tab-hub-${CSS.escape(tabId)}`);
  if (panel) panel.classList.remove("hidden");
  $$("#tab-nav .hub-only .tab").forEach(button => button.classList.remove("active"));
  if (opts.button) {
    opts.button.classList.add("active");
  } else {
    $(`#tab-nav .hub-only .tab[data-tab="hub-${tabId}"]`)?.classList.add("active");
  }
  updateRefreshPausedState();
  refreshCurrentView();
}

async function refreshCurrentView(force = false) {
  if (activeTab === "dashboard") {
    await loadDashboard(force);
  } else if (activeTab === "simulations") {
    await loadSimulations(force);
  } else if (activeTab === "clients") {
    await loadClients(force);
  } else if (activeTab === "spokes") {
    await loadSpokes(force);
  } else if (activeTab === "commands") {
    await loadCommands();
  } else if (activeTab === "setup") {
    await loadSetup(force);
  } else if (activeTab === "config") {
    await loadConfig(force);
  } else if (activeTab === "superadmin") {
    await loadSuperadmin();
  }
}

function getTenantSpokes() {
  return currentTenantId ? (spokeCache[currentTenantId] || []) : [];
}

function spokeLabel(count) {
  return `${count} ${count === 1 ? "spoke" : "spokes"}`;
}

function spokePrimaryLabel(spoke) {
  return String(spoke?.spoke_name || spoke?.hostname || spoke?.id || "—");
}

function spokeSecondaryLabel(spoke, fallback = "—") {
  const primary = spokePrimaryLabel(spoke);
  const parts = [];
  const hostname = String(spoke?.hostname || "").trim();
  const label = String(spoke?.label || "").trim();
  const workspace = String(spoke?.workspace_id || spoke?.tenant_id || "").trim();
  if (hostname && hostname !== primary) parts.push(hostname);
  if (label && label !== primary && label !== hostname) parts.push(label);
  if (!parts.length && workspace && workspace !== primary) parts.push(workspace);
  return parts.join(" · ") || fallback;
}

function spokeCommandLabel(spoke) {
  const primary = spokePrimaryLabel(spoke);
  const hostname = String(spoke?.hostname || "").trim();
  return hostname && hostname !== primary ? `${primary} (${hostname})` : primary;
}

function spokeSearchText(spoke) {
  return [
    spokePrimaryLabel(spoke),
    String(spoke?.hostname || ""),
    String(spoke?.label || ""),
    String(spoke?.id || ""),
  ].join(" ").toLowerCase();
}

function updateSpokeStatPills(spokes) {
  const approved = spokes.filter(spoke => spoke.status === "approved");
  const onlineCount = approved.filter(spoke => isOnline(spoke.last_seen)).length;
  const clientCount = approved.reduce((sum, spoke) => sum + ((spoke.telemetry?.clients || []).length), 0);
  $("#spokes-count-pill") && ($("#spokes-count-pill").textContent = spokeLabel(approved.length));
  $("#spokes-online-pill") && ($("#spokes-online-pill").textContent = `${onlineCount} online`);
  $("#spokes-clients-pill") && ($("#spokes-clients-pill").textContent = `${clientCount} clients`);
}

async function ensureTenantSpokesFor(tenantId, force = false) {
  if (!tenantId) return [];
  if (!force && spokeCache[tenantId]) return spokeCache[tenantId];
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  if (!res || !res.ok) return spokeCache[tenantId] || [];
  const spokes = await res.json();
  spokeCache[tenantId] = spokes;
  if (tenantId === currentTenantId) populateCommandSpokeSelect();
  return spokes;
}

function summarizeConfigField(spokes, key, formatter = formatInlineValue) {
  const approved = spokes.filter(spoke => spoke.status === "approved");
  const populated = approved
    .map(spoke => spoke.config?.[key] ?? spoke.seed_config?.[key])
    .filter(hasMeaningfulValue);
  const values = uniqueValues(populated);
  return {
    value: values.length === 1 ? formatter(values[0]) : values.length ? `${values.length} values` : "—",
    detail: values.length > 1
      ? values.map(item => formatter(item)).join(" • ")
      : `${populated.length}/${approved.length || 0} spokes`,
  };
}

function renderConfigSummaryRow(label, summary) {
  return `
    <tr>
      <td>${escHtml(label)}</td>
      <td>${escHtml(summary.value)}</td>
      <td>${escHtml(summary.detail)}</td>
    </tr>
  `;
}

async function loadTenantDetailData(force = false) {
  const tenantId = tenantDetailState.tenantId;
  if (!tenantId || !currentUser) return null;
  if (!force && tenantDetailState.data[tenantId]) return tenantDetailState.data[tenantId];

  const [spokesRes, commandsRes, processingRes, settingsRes] = await Promise.all([
    apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`),
    apiFetch(`/api/${encodeURIComponent(tenantId)}/commands`),
    apiFetch(`/api/${encodeURIComponent(tenantId)}/processing-summary`),
    canManageTenant(tenantId) ? apiFetch(`/api/${encodeURIComponent(tenantId)}/settings`) : Promise.resolve(null),
  ]);

  const data = {
    tenantId,
    spokes: [],
    commands: [],
    processing: null,
    settings: null,
    settingsError: canManageTenant(tenantId) ? null : "Admin access required to view tenant setup settings.",
  };

  if (spokesRes?.ok) {
    data.spokes = await spokesRes.json();
    spokeCache[tenantId] = data.spokes;
  }
  if (commandsRes?.ok) data.commands = await commandsRes.json();
  if (processingRes?.ok) data.processing = await processingRes.json();
  if (settingsRes) {
    if (settingsRes.ok) {
      data.settings = await settingsRes.json();
      data.settingsError = null;
    } else {
      const err = await readJson(settingsRes);
      data.settingsError = err?.detail || `Unable to load tenant settings (${settingsRes.status}).`;
    }
  }

  tenantDetailState.data[tenantId] = data;
  return data;
}

function renderTenantDashboardPanel(data, summary) {
  const healthRows = data.spokes
    .filter(spoke => spoke.status === "approved")
    .sort((a, b) => spokePrimaryLabel(a).localeCompare(spokePrimaryLabel(b)))
    .map(spoke => `
      <tr>
        <td><strong>${escHtml(spokePrimaryLabel(spoke))}</strong><div class="muted">${escHtml(spokeSecondaryLabel(spoke))}</div></td>
        <td><span class="tenant-status-badge ${isOnline(spoke.last_seen) ? "online" : "offline"}">${isOnline(spoke.last_seen) ? "Online" : "Offline"}</span></td>
        <td>${getSpokeClients(spoke).length}</td>
        <td>${getSpokeVmCount(spoke)}</td>
        <td>${getSpokeRunningVmCount(spoke)}</td>
        <td title="${escHtml(fmtDate(spoke.last_seen))}">${escHtml(relativeTime(spoke.last_seen))}</td>
      </tr>
    `)
    .join("");
  const recentCommands = [...(data.commands || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
    .map(command => {
      const spoke = data.spokes.find(item => item.id === command.spoke_id);
      return `
        <tr>
          <td>${escHtml(fmtDate(command.created_at))}</td>
          <td>${escHtml(spoke ? spokeCommandLabel(spoke) : command.spoke_id)}</td>
          <td>${escHtml(command.type)}</td>
          <td><span class="badge cmd-status-${escHtml(command.status)}">${escHtml(command.status)}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="tenant-metrics-grid">
      <article class="tenant-metric-card"><span class="tenant-metric-label">Approved Spokes</span><strong class="tenant-metric-value">${summary.approvedCount}</strong><span class="tenant-metric-hint">${summary.pendingCount} pending</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">Online / Offline</span><strong class="tenant-metric-value">${summary.onlineCount} / ${summary.offlineCount}</strong><span class="tenant-metric-hint">Based on 120s heartbeat</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">Sim Clients</span><strong class="tenant-metric-value">${summary.clientCount}</strong><span class="tenant-metric-hint">Across approved spokes</span></article>
      <article class="tenant-metric-card"><span class="tenant-metric-label">VM Footprint</span><strong class="tenant-metric-value">${summary.vmCount}</strong><span class="tenant-metric-hint">${summary.runningVmCount} running · ${summary.usbCount} USB devices</span></article>
    </div>
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Spoke Health</h2><p>Aggregated view of each spoke in this tenant.</p></div>
        <table class="data-table">
          <thead><tr><th>Spoke</th><th>Status</th><th>Clients</th><th>VMs</th><th>Running</th><th>Last Sync</th></tr></thead>
          <tbody>${healthRows || '<tr><td colspan="6" class="empty-state">No approved spokes in this tenant.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Recent Commands</h2><p>Latest tenant-wide commands sent from the hub.</p></div>
        <table class="data-table">
          <thead><tr><th>Created</th><th>Spoke</th><th>Command</th><th>Status</th></tr></thead>
          <tbody>${recentCommands || '<tr><td colspan="4" class="empty-state">No commands recorded for this tenant.</td></tr>'}</tbody>
        </table>
      </section>
    </div>
  `;
}

function renderTenantSpokesPanel(data) {
  const rows = [...data.spokes]
    .sort((a, b) => spokePrimaryLabel(a).localeCompare(spokePrimaryLabel(b)))
    .map(spoke => `
      <tr>
        <td><strong>${escHtml(spokePrimaryLabel(spoke))}</strong><div class="muted">${escHtml(spokeSecondaryLabel(spoke))}</div></td>
        <td><span class="tenant-status-badge ${spoke.status === "approved" && isOnline(spoke.last_seen) ? "online" : "offline"}">${escHtml(spoke.status === "approved" ? (isOnline(spoke.last_seen) ? "online" : "offline") : spoke.status)}</span></td>
        <td><code>${escHtml(spoke.id)}</code></td>
        <td title="${escHtml(fmtDate(spoke.last_seen))}">${escHtml(relativeTime(spoke.last_seen))}</td>
        <td>${getSpokeClients(spoke).length}</td>
        <td>${getSpokeVmCount(spoke)}</td>
        <td>${spoke.status === "approved" ? `<button class="btn btn-secondary btn-small" data-open-spoke-modal="${escHtml(spoke.id)}" type="button">Open Detail</button>` : '<span class="muted">—</span>'}</td>
      </tr>
    `)
    .join("");

  return `
    <section class="setup-card">
      <div class="setup-card-header"><h2>Tenant Spokes</h2><p>Status, heartbeat, and telemetry summary for every spoke assigned to this tenant.</p></div>
      <table class="data-table">
        <thead><tr><th>Spoke</th><th>Status</th><th>Spoke ID</th><th>Last Sync</th><th>Clients</th><th>VMs</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty-state">No spokes assigned to this tenant.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function renderTenantCommandsPanel(data) {
  const commands = [...(data.commands || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const queuedCount = commands.filter(command => command.status === "queued").length;
  const rows = commands.slice(0, 50).map(command => {
    const spoke = data.spokes.find(item => item.id === command.spoke_id);
    return `
      <tr>
        <td>${escHtml(fmtDate(command.created_at))}</td>
        <td>${escHtml(spoke ? spokeCommandLabel(spoke) : command.spoke_id)}</td>
        <td>${escHtml(command.type)}</td>
        <td><span class="badge cmd-status-${escHtml(command.status)}">${escHtml(command.status)}</span></td>
        <td>${escHtml(fmtDate(command.expires_at))}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tenant-detail-inline-stats">
      <span class="stat-pill">${queuedCount} queued</span>
      <span class="stat-pill">${commands.length} recent commands</span>
      <span class="stat-pill">${data.spokes.filter(spoke => spoke.status === "approved").length} targetable spokes</span>
    </div>
    <section class="setup-card">
      <div class="setup-card-header"><h2>Recent Tenant Commands</h2><p>Hub command history across all spokes in this tenant.</p></div>
      <table class="data-table">
        <thead><tr><th>Created</th><th>Spoke</th><th>Command</th><th>Status</th><th>Expires</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="empty-state">No commands recorded for this tenant.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function renderTenantSetupPanel(data) {
  const tenantId = data.tenantId;
  const tenant = data.settings?.tenant || getTenantMeta(tenantId);
  const aruba = data.settings?.aruba || {};
  const notifications = data.settings?.notifications || {};
  const apiBase = `${window.location.origin}/api/${tenantId}/spokes/{spoke_id}`;
  const accessNote = data.settingsError ? `<div class="tenant-detail-note">${escHtml(data.settingsError)}</div>` : "";

  return `
    ${accessNote}
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Tenant Setup</h2><p>Hub-managed settings for this tenant.</p></div>
        <div class="setup-status-grid">
          <div class="setup-status-item"><span class="setup-status-label">Tenant Name</span><span class="setup-status-value">${escHtml(tenant.name || tenantId)}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Tenant ID</span><span class="setup-status-value"><code>${escHtml(tenant.id || tenantId)}</code></span></div>
          <div class="setup-status-item"><span class="setup-status-label">Aruba CID</span><span class="setup-status-value">${escHtml(tenant.aruba_cid || "—")}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Created</span><span class="setup-status-value">${escHtml(fmtDate(tenant.created_at))}</span></div>
        </div>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Relay API</h2><p>Endpoints used by spokes in this tenant.</p></div>
        <div class="setup-status-grid">
          <div class="setup-status-item"><span class="setup-status-label">Registration</span><span class="setup-status-value">${escHtml(`${window.location.origin}/api/spokes/register`)}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Telemetry</span><span class="setup-status-value">${escHtml(`POST ${apiBase}/telemetry`)}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Inbox</span><span class="setup-status-value">${escHtml(`GET ${apiBase}/inbox`)}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Ack</span><span class="setup-status-value">${escHtml(`POST ${apiBase}/ack`)}</span></div>
        </div>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Aruba Central</h2></div>
        <table class="data-table">
          <tbody>
            <tr><td>Configured</td><td>${escHtml(aruba.configured ? "Yes" : "No")}</td></tr>
            <tr><td>Cluster URL</td><td>${escHtml(aruba.cluster_url || "—")}</td></tr>
            <tr><td>Client ID</td><td>${escHtml(aruba.client_id || "—")}</td></tr>
            <tr><td>Customer ID</td><td>${escHtml(aruba.customer_id || tenant.aruba_cid || "—")}</td></tr>
            <tr><td>API Version</td><td>${escHtml(aruba.api_version || "—")}</td></tr>
          </tbody>
        </table>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Notifications</h2></div>
        <table class="data-table">
          <tbody>
            <tr><td>Enabled</td><td>${escHtml(notifications.enabled ? "Yes" : "No")}</td></tr>
            <tr><td>Teams Webhook</td><td>${escHtml(notifications.teams_webhook_configured ? "Configured" : "Not configured")}</td></tr>
            <tr><td>SMTP Host</td><td>${escHtml(notifications.smtp_host || "—")}</td></tr>
            <tr><td>SMTP User</td><td>${escHtml(notifications.smtp_user || "—")}</td></tr>
            <tr><td>Recipients</td><td>${escHtml((notifications.to_emails || []).join(", ") || "—")}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function renderTenantConfigPanel(data) {
  const spokes = data.spokes || [];
  const approved = spokes.filter(spoke => spoke.status === "approved");
  const siteMappings = uniqueValues(approved.map(spoke => Object.keys(spoke.config?.site_mappings || {})).flat());
  const relayRows = [
    renderConfigSummaryRow("Relay Enabled", summarizeConfigField(spokes, "relay_enabled")),
    renderConfigSummaryRow("Relay Server URL", summarizeConfigField(spokes, "relay_server_url")),
    renderConfigSummaryRow("Relay Poll Interval", summarizeConfigField(spokes, "relay_poll_interval")),
    renderConfigSummaryRow("Relay Tenant Hint", summarizeConfigField(spokes, "relay_tenant_hint")),
    renderConfigSummaryRow("Repo URL", summarizeConfigField(spokes, "repo_url")),
    renderConfigSummaryRow("Repo Branch", summarizeConfigField(spokes, "repo_branch")),
    renderConfigSummaryRow("Site Mappings", { value: siteMappings.length ? `${siteMappings.length} mapped sites` : "—", detail: `${approved.filter(spoke => Object.keys(spoke.config?.site_mappings || {}).length > 0).length}/${approved.length || 0} spokes` }),
  ].join("");

  const processingRows = data.processing?.islands?.length ? PROCESSING_FEATURES.map(feature => {
    const counts = data.processing.islands.reduce((acc, item) => {
      const mode = item.effective_modes?.[feature] || item.global_mode || data.processing.default_mode || "centralized";
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {});
    return `
      <tr>
        <td>${escHtml(feature.replace(/_/g, " "))}</td>
        <td>${escHtml(data.processing.default_mode || "centralized")}</td>
        <td>${escHtml(Object.entries(counts).map(([mode, count]) => `${mode}:${count}`).join(" • "))}</td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="3" class="empty-state">No processing summary available.</td></tr>';

  return `
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Aggregated Spoke Config</h2><p>Common runtime configuration across spokes in this tenant.</p></div>
        <table class="data-table">
          <thead><tr><th>Setting</th><th>Observed Value</th><th>Coverage</th></tr></thead>
          <tbody>${relayRows}</tbody>
        </table>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Processing Defaults</h2><p>Tenant default mode plus effective spoke distribution per feature.</p></div>
        <table class="data-table">
          <thead><tr><th>Feature</th><th>Tenant Default</th><th>Effective Modes</th></tr></thead>
          <tbody>${processingRows}</tbody>
        </table>
      </section>
    </div>
  `;
}

function renderTenantDetail(data = tenantDetailState.data[tenantDetailState.tenantId]) {
  if (!tenantDetailState.open || !tenantDetailState.tenantId || !data) return;
  const summary = summarizeTenantSpokes(data.spokes || []);
  const meta = getTenantMeta(tenantDetailState.tenantId);

  $("#tenant-detail-title") && ($("#tenant-detail-title").textContent = meta.name || tenantDetailState.tenantId);
  $("#tenant-detail-subtitle") && ($("#tenant-detail-subtitle").textContent = `Tenant ID: ${tenantDetailState.tenantId} · Last sync ${relativeTime(summary.lastSync)}`);
  $("#tenant-detail-pills") && ($("#tenant-detail-pills").innerHTML = renderTenantSummaryPills(summary));

  $("#tenant-detail-dashboard-panel") && ($("#tenant-detail-dashboard-panel").innerHTML = renderTenantDashboardPanel(data, summary));
  $("#tenant-detail-spokes-panel") && ($("#tenant-detail-spokes-panel").innerHTML = renderTenantSpokesPanel(data));
  $("#tenant-detail-commands-panel") && ($("#tenant-detail-commands-panel").innerHTML = renderTenantCommandsPanel(data));
  $("#tenant-detail-setup-panel") && ($("#tenant-detail-setup-panel").innerHTML = renderTenantSetupPanel(data));
  $("#tenant-detail-config-panel") && ($("#tenant-detail-config-panel").innerHTML = renderTenantConfigPanel(data));

  ["dashboard", "spokes", "commands", "setup", "config"].forEach(tabId => {
    $(`.tenant-detail-tab[data-tenant-detail-tab="${tabId}"]`)?.classList.toggle("active", tenantDetailState.activeTab === tabId);
    $("#tenant-detail-" + tabId + "-panel")?.classList.toggle("hidden", tenantDetailState.activeTab !== tabId);
  });
  setTenantDetailVisible(true);
  updateRefreshPausedState();
}

async function openTenantDetail(tenantId, tabId = "dashboard", force = false) {
  if (!tenantId || !currentUser) return;
  await setCurrentTenant(tenantId, false);
  tenantDetailState.open = true;
  tenantDetailState.tenantId = tenantId;
  tenantDetailState.activeTab = tabId;
  setTenantDetailVisible(true);
  updateRefreshPausedState();
  ["dashboard", "spokes", "commands", "setup", "config"].forEach(panelId => {
    const panel = $("#tenant-detail-" + panelId + "-panel");
    if (panel) panel.innerHTML = '<div class="empty-state">Loading…</div>';
  });
  const data = await loadTenantDetailData(force);
  if (!tenantDetailState.open || tenantDetailState.tenantId !== tenantId) return;
  renderTenantDetail(data);
}

async function loadDashboard(force = false) {
  const grid = $("#dashboard-grid");
  const empty = $("#dashboard-empty");
  if (currentUser) {
    if (!currentTenantId) {
      if (grid) grid.innerHTML = "";
      if (empty) {
        empty.textContent = "Select a tenant to view dashboard data.";
        empty.classList.remove("hidden");
      }
      return;
    }
    aggregateDashboardData = force || !aggregateDashboardData
      ? await loadAggregateData("dashboard")
      : aggregateDashboardData;
    $("#dash-spokes-pill") && ($("#dash-spokes-pill").textContent = `${aggregateDashboardData?.spokes_online ?? 0}/${aggregateDashboardData?.spokes_total ?? 0} online`);
    $("#dash-clients-pill") && ($("#dash-clients-pill").textContent = `${aggregateDashboardData?.client_count ?? 0} clients`);
    $("#dash-online-pill") && ($("#dash-online-pill").textContent = `${aggregateDashboardData?.checks_summary?.pass ?? 0} checks passing`);
    if (!grid) return;
    grid.classList.remove("spoke-grid");
    grid.innerHTML = aggregateDashboardData ? renderDashboardAggregate(aggregateDashboardData) : "";
    empty?.classList.toggle("hidden", Boolean(aggregateDashboardData));
    if (empty && !aggregateDashboardData) empty.textContent = "Unable to load tenant dashboard data.";
    setTenantDetailVisible(false);
    return;
  }

  const res = await fetch("/api/sites").catch(() => null);
  if (!res || !res.ok) return;
  const sites = (await res.json()).filter(site => site.status === "approved");
  dashboardTenantRows = [];
  const onlineCount = sites.filter(site => isOnline(site.last_seen)).length;
  const clientCount = sites.reduce((sum, site) => sum + ((site.telemetry?.clients || []).length), 0);
  $("#dash-spokes-pill") && ($("#dash-spokes-pill").textContent = spokeLabel(sites.length));
  $("#dash-clients-pill") && ($("#dash-clients-pill").textContent = `${clientCount} clients`);
  $("#dash-online-pill") && ($("#dash-online-pill").textContent = `${onlineCount} online`);
  empty && (empty.textContent = "No spokes registered yet.");
  empty?.classList.toggle("hidden", sites.length > 0);
  if (!grid) return;
  grid.classList.add("spoke-grid");
  renderInBatches("dashboard", grid, sites, site => {
    const online = isOnline(site.last_seen);
    const clients = site.telemetry?.clients || [];
    const card = document.createElement("article");
    card.className = "spoke-card compact-card";
    card.dataset.tenantId = site.workspace_id || site.tenant_id || "";
    card.dataset.spokeId = site.id;
    card.innerHTML = `
      <div class="spoke-card-header-row">
        <div class="spoke-card-title-wrap">
          <div class="spoke-card-title">${escHtml(spokePrimaryLabel(site))}</div>
          <div class="spoke-card-subtitle">${escHtml(spokeSecondaryLabel(site, site.workspace_id || "—"))}</div>
        </div>
        <div class="spoke-card-status" data-online-state>${statusDot(online)}</div>
      </div>
      <div class="spoke-card-meta">
        <span class="stat-pill">${clients.length} clients</span>
        <span class="stat-pill">${online ? "Online" : "Offline"}</span>
      </div>
      <div class="spoke-card-footer">Last seen ${escHtml(relativeTime(site.last_seen))}</div>
    `;
    return card;
  }, 60);
  setTenantDetailVisible(false);
}

async function loadSimulations(force = false) {
  if (!currentTenantId) {
    aggregateSimulationRows = [];
    renderSimulationRows();
    return;
  }
  const data = force || !aggregateSimulationRows.length ? await loadAggregateData("simulations") : { simulations: aggregateSimulationRows };
  aggregateSimulationRows = data?.simulations || [];
  renderSimulationRows();
}

async function loadClients(force = false) {
  if (!currentTenantId) {
    aggregateClientRows = [];
    updateClientSpokeFilterOptions();
    renderClientRowsForHub();
    return;
  }
  const data = force || !aggregateClientRows.length ? await loadAggregateData("clients") : { clients: aggregateClientRows };
  aggregateClientRows = data?.clients || [];
  updateClientSpokeFilterOptions();
  renderClientRowsForHub();
}

async function loadSetup() {
  await loadSettings();
}

async function loadConfig(force = false) {
  const container = $("#hub-config-content");
  if (!container) return;
  if (!currentTenantId || !currentUser) {
    container.innerHTML = '<div class="empty-state">Sign in and select a tenant to view config.</div>';
    return;
  }
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  const data = await loadTenantDetailData(force);
  container.innerHTML = data ? renderTenantConfigPanel(data) : '<div class="empty-state">Unable to load tenant config.</div>';
}

async function ensureSpokes(force = false) {
  if (!currentTenantId) return [];
  return ensureTenantSpokesFor(currentTenantId, force);
}

function renderClientRows(clients = []) {
  if (!clients.length) {
    return '<tr><td colspan="5" class="empty-state">No client telemetry reported.</td></tr>';
  }
  return clients.map(client => {
    const online = isOnline(client.last_seen);
    const clientId = client.client_id || client.id || client.hostname || "—";
    return `
      <tr>
        <td>${escHtml(clientId)}</td>
        <td>${escHtml(client.hostname || client.client_id || client.id || "—")}</td>
        <td><span class="site-status-pill ${online ? "online" : "offline"}">${online ? "Online" : "Offline"}</span></td>
        <td>${escHtml(relativeTime(client.last_seen))}</td>
        <td>${escHtml(client.ip_address || client.ip || "—")}</td>
      </tr>
    `;
  }).join("");
}

function renderSpokeBody(section, spoke) {
  const body = $(".spoke-section-body", section);
  if (!body) return;
  const clients = spoke.telemetry?.clients || [];
  body.innerHTML = `
    <div class="spoke-section-summary">
      <span class="stat-pill">Workspace ${escHtml(tenantName(spoke.tenant_id))}</span>
      <span class="stat-pill">${clients.length} clients</span>
      <span class="stat-pill">Seen ${escHtml(relativeTime(spoke.last_seen))}</span>
    </div>
    <div class="spoke-action-bar">
      <button class="btn btn-secondary btn-small" data-action="detail" type="button">Open Detail</button>
      <button class="btn btn-secondary btn-small" data-action="audit" type="button">View Audit Log</button>
      <button class="btn btn-secondary btn-small" data-action="mode" type="button">Processing Mode</button>
      <select class="form-input form-input-sm quick-command-select">
        <option value="kill_switch">Kill Switch</option>
        <option value="restart_sim">Restart Simulation</option>
        <option value="reclone">Reclone</option>
        <option value="reboot">Reboot</option>
        <option value="repo_sync">Repo Sync</option>
        <option value="update_now">Update Now</option>
      </select>
      <button class="btn btn-primary btn-small" data-action="send" type="button">Send Command</button>
    </div>
    <table class="data-table spoke-client-table">
      <thead><tr><th>Client ID</th><th>Hostname</th><th>Status</th><th>Last Seen</th><th>IP</th></tr></thead>
      <tbody>${renderClientRows(clients)}</tbody>
    </table>
  `;
  const quickSelect = $(".quick-command-select", body);
  if (!canManageTenant(spoke.tenant_id)) {
    const modeButton = $('[data-action="mode"]', body);
    if (modeButton) modeButton.disabled = true;
  }
  body.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "detail") openSpokeModal(spoke, spoke.tenant_id, "spoke-clients");
    if (action === "audit") openSpokeModal(spoke, spoke.tenant_id, "spoke-audit");
    if (action === "mode") openSpokeModal(spoke, spoke.tenant_id, "spoke-mode");
    if (action === "send") await sendCommandToSpoke(spoke.tenant_id, spoke.id, quickSelect?.value || "kill_switch");
  }, { once: true });
}

function createSpokeSection(spoke) {
  const expanded = getExpandedSet().has(spoke.id);
  const online = isOnline(spoke.last_seen);
  const clients = spoke.telemetry?.clients || [];
  const section = document.createElement("section");
  section.className = "spoke-section";
  section.dataset.spokeId = spoke.id;
  section.dataset.tenantId = spoke.tenant_id;
  section.innerHTML = `
    <div class="spoke-section-header">
      <span class="spoke-toggle ${expanded ? "open" : ""}">▶</span>
      ${statusDot(online)}
      <span class="spoke-hostname">${escHtml(spokePrimaryLabel(spoke))}</span>
      <span class="spoke-label-inline">${escHtml(spokeSecondaryLabel(spoke))}</span>
      <span class="spoke-meta">${clients.length} clients · ${escHtml(relativeTime(spoke.last_seen))}</span>
    </div>
    <div class="spoke-section-body ${expanded ? "expanded" : ""}"></div>
  `;
  $(".spoke-section-header", section)?.addEventListener("click", event => {
    if (event.target.closest("button,select,input,a")) return;
    toggleSpokeSection(section, spoke);
  });
  if (expanded) {
    renderSpokeBody(section, spoke);
    $(".spoke-section-body", section).dataset.rendered = "1";
  }
  return section;
}

function toggleSpokeSection(section, spoke) {
  const expandedSet = getExpandedSet();
  const body = $(".spoke-section-body", section);
  const toggle = $(".spoke-toggle", section);
  const opening = !body.classList.contains("expanded");
  body.classList.toggle("expanded", opening);
  toggle?.classList.toggle("open", opening);
  if (opening) {
    expandedSet.add(spoke.id);
    if (!body.dataset.rendered) {
      renderSpokeBody(section, spoke);
      body.dataset.rendered = "1";
    }
  } else {
    expandedSet.delete(spoke.id);
  }
}

async function loadSpokes(force = false) {
  const spokes = await ensureSpokes(force);
  updateSpokeStatPills(spokes);
  const search = spokeUiState.search.trim().toLowerCase();
  const filtered = spokes.filter(spoke => spoke.status === "approved" && (!search || spokeSearchText(spoke).includes(search)));
  const list = $("#spokes-list");
  const empty = $("#spokes-empty");
  empty?.classList.toggle("hidden", filtered.length > 0);
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = "";
    return;
  }
  const group = document.createElement("section");
  group.className = "workspace-group setup-card";
  group.innerHTML = `<div class="workspace-header"><h2>${escHtml(tenantName(currentTenantId))}</h2><p>Workspace: ${escHtml(currentTenantId)}</p></div><div class="workspace-body"></div>`;
  list.innerHTML = "";
  list.appendChild(group);
  renderInBatches("spokes", $(".workspace-body", group), filtered, spoke => createSpokeSection(spoke), 30);
}

function populateCommandSpokeSelect() {
  const select = $("#cmd-spoke");
  if (!select) return;
  const spokes = getTenantSpokes().filter(spoke => spoke.status === "approved");
  select.innerHTML = spokes.map(spoke => `<option value="${escHtml(spoke.id)}">${escHtml(spokeCommandLabel(spoke))}</option>`).join("");
}

async function sendCommandToSpoke(tenantId, spokeId, type) {
  const response = await apiFetch("/api/commands", {
    method: "POST",
    body: { tenant_id: tenantId, spoke_id: spokeId, type, target: "spoke", payload: {} },
  });
  if (!response || !response.ok) {
    const err = await readJson(response);
    showToast(err?.detail || `Failed to send ${type}.`, "err");
    return false;
  }
  showToast(`${type} queued for ${spokeId}.`, "ok");
  if (activeTab === "commands") loadCommands();
  if (activeSpokeModal?.spoke?.id === spokeId) loadSpokeCommands();
  return true;
}

async function loadCommands() {
  if (!currentTenantId) return;
  await ensureSpokes();
  populateCommandSpokeSelect();
  const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/commands`);
  if (!res || !res.ok) return;
  const commands = await res.json();
  const queued = commands.filter(command => command.status === "queued").length;
  $("#commands-count-pill") && ($("#commands-count-pill").textContent = `${queued} queued`);
  const tbody = $("#commands-tbody");
  if (!tbody) return;
  if (!commands.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No commands queued.</td></tr>';
    return;
  }
  tbody.innerHTML = commands.map(command => {
    const spoke = getTenantSpokes().find(item => item.id === command.spoke_id);
    return `
      <tr>
        <td>${escHtml(spoke ? spokeCommandLabel(spoke) : command.spoke_id)}</td>
        <td>${escHtml(command.type)}</td>
        <td><span class="badge cmd-status-${escHtml(command.status)}">${escHtml(command.status)}</span></td>
        <td>${escHtml(fmtDate(command.created_at))}</td>
        <td>${escHtml(fmtDate(command.expires_at))}</td>
      </tr>
    `;
  }).join("");
}

async function sendCommandFromForm() {
  const spokeId = $("#cmd-spoke")?.value;
  const type = $("#cmd-type")?.value || "kill_switch";
  if (!currentTenantId || !spokeId) {
    setFormMessage("cmd-msg", "Select a spoke first.", false);
    return;
  }
  const ok = await sendCommandToSpoke(currentTenantId, spokeId, type);
  setFormMessage("cmd-msg", ok ? "Command queued." : "Failed to queue command.", ok);
  if (ok) loadCommands();
}

function getSpokeFromCache(tenantId, spokeId) {
  return (spokeCache[tenantId] || []).find(spoke => spoke.id === spokeId) || null;
}

function renderSpokeClientsTab() {
  const spoke = getSpokeFromCache(activeSpokeModal?.tenant_id, activeSpokeModal?.spoke?.id) || activeSpokeModal?.spoke;
  if (!spoke) return;
  activeSpokeModal.spoke = spoke;
  const tbody = $("#spoke-clients-tbody");
  if (!tbody) return;
  tbody.innerHTML = renderClientRows(spoke.telemetry?.clients || []);
}

async function loadSpokeCommands() {
  if (!activeSpokeModal) return;
  const { tenant_id: tenantId, spoke } = activeSpokeModal;
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/commands?spoke_id=${encodeURIComponent(spoke.id)}`);
  if (!res || !res.ok) return;
  const commands = await res.json();
  const tbody = $("#spoke-cmds-tbody");
  if (!tbody) return;
  const items = commands.slice(0, 20);
  tbody.innerHTML = items.length ? items.map(command => `
    <tr>
      <td>${escHtml(command.type)}</td>
      <td><span class="badge cmd-status-${escHtml(command.status)}">${escHtml(command.status)}</span></td>
      <td>${escHtml(fmtDate(command.created_at))}</td>
      <td>${escHtml(fmtDate(command.expires_at))}</td>
    </tr>`).join("") : '<tr><td colspan="4" class="empty-state">No commands for this spoke.</td></tr>';
}

async function loadSpokeAudit() {
  if (!activeSpokeModal) return;
  const { tenant_id: tenantId, spoke } = activeSpokeModal;
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spoke.id)}/audit`);
  if (!res || !res.ok) return;
  const audit = (await res.json()).slice(-20).reverse();
  const tbody = $("#spoke-audit-tbody");
  if (!tbody) return;
  tbody.innerHTML = audit.length ? audit.map(entry => `
    <tr>
      <td>${escHtml(fmtDate(entry.timestamp))}</td>
      <td>${escHtml(entry.task_type)}</td>
      <td>${escHtml(entry.execution_mode)}</td>
      <td>${escHtml(entry.status)}</td>
      <td>${escHtml(entry.detail || "—")}</td>
    </tr>`).join("") : '<tr><td colspan="5" class="empty-state">No audit entries.</td></tr>';
}

async function loadSpokeProcessingMode() {
  if (!activeSpokeModal) return;
  const saveBtn = $("#mode-save-btn");
  if (saveBtn) saveBtn.disabled = !canManageTenant(activeSpokeModal.tenant_id);
  const res = await apiFetch(`/api/${encodeURIComponent(activeSpokeModal.tenant_id)}/processing-summary`);
  if (!res || !res.ok) return;
  const summary = await res.json();
  const spokeSummary = summary.islands.find(item => item.spoke_id === activeSpokeModal.spoke.id);
  if (!spokeSummary) return;
  $("#mode-global") && ($("#mode-global").value = spokeSummary.global_mode || "centralized");
  const grid = $("#mode-features-grid");
  if (!grid) return;
  grid.innerHTML = PROCESSING_FEATURES.map(feature => `
    <div class="mode-feature-item">
      <label class="mode-feature-label" for="mode-${feature}">${escHtml(feature.replace(/_/g, " "))}</label>
      <select id="mode-${feature}" class="form-input mode-feature-select">
        <option value="inherit">Inherit</option>
        <option value="centralized">Centralized</option>
        <option value="distributed">Distributed</option>
      </select>
    </div>
  `).join("");
  PROCESSING_FEATURES.forEach(feature => {
    const value = spokeSummary.feature_overrides?.[feature];
    const select = $(`#mode-${feature}`);
    if (select) select.value = value || "inherit";
    if (select && !canManageTenant(activeSpokeModal.tenant_id)) select.disabled = true;
  });
  setFormMessage("mode-msg", "", true);
}

async function saveSpokeProcessingMode() {
  if (!activeSpokeModal || !canManageTenant(activeSpokeModal.tenant_id)) return;
  const payload = { global_mode: $("#mode-global")?.value || "centralized" };
  PROCESSING_FEATURES.forEach(feature => {
    const value = $(`#mode-${feature}`)?.value || "inherit";
    payload[feature] = value === "inherit" ? null : value;
  });
  const res = await apiFetch(`/api/${encodeURIComponent(activeSpokeModal.tenant_id)}/spokes/${encodeURIComponent(activeSpokeModal.spoke.id)}/processing-mode`, {
    method: "PATCH",
    body: payload,
  });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("mode-msg", err?.detail || "Failed to save mode.", false);
    return;
  }
  setFormMessage("mode-msg", "Processing mode saved.", true);
  showToast("Processing mode updated.", "ok");
  await loadSpokes(true);
}

function openSpokeModal(spoke, tenantId, subtab = "spoke-clients") {
  activeSpokeModal = { spoke, tenant_id: tenantId };
  $("#spoke-modal-title") && ($("#spoke-modal-title").textContent = `${spokePrimaryLabel(spoke)} — ${tenantName(tenantId)}`);
  $("#spoke-modal")?.classList.remove("hidden");
  activateSpokeSubtab(subtab);
  renderSpokeClientsTab();
  loadSpokeCommands();
  loadSpokeProcessingMode();
  loadSpokeAudit();
}

function closeSpokeModal() {
  $("#spoke-modal")?.classList.add("hidden");
  activeSpokeModal = null;
}

function activateSpokeSubtab(subtabId) {
  $$(".spoke-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtabId));
  ["spoke-clients", "spoke-commands", "spoke-mode", "spoke-audit"].forEach(panelId => {
    document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtabId);
  });
  if (subtabId === "spoke-commands") loadSpokeCommands();
  if (subtabId === "spoke-mode") loadSpokeProcessingMode();
  if (subtabId === "spoke-audit") loadSpokeAudit();
}

async function sendSpokeCommand(type) {
  if (!activeSpokeModal) return;
  const ok = await sendCommandToSpoke(activeSpokeModal.tenant_id, activeSpokeModal.spoke.id, type);
  if (ok) {
    loadSpokeCommands();
    loadSpokeAudit();
  }
}
window.sendSpokeCommand = sendSpokeCommand;

async function loadSettings() {
  if (!currentTenantId) return;
  const apiBase = `${window.location.origin}/api/${currentTenantId}/spokes/{id}`;
  $("#api-register-url") && ($("#api-register-url").textContent = `${window.location.origin}/api/spokes/register`);
  $("#api-telemetry-url") && ($("#api-telemetry-url").textContent = `POST ${apiBase}/telemetry`);
  $("#api-inbox-url") && ($("#api-inbox-url").textContent = `GET ${apiBase}/inbox`);
  $("#api-ack-url") && ($("#api-ack-url").textContent = `POST ${apiBase}/ack`);
  const disabled = !canManageTenant();
  ["aruba-save-btn", "notif-save-btn", "acme-request-btn"].forEach(id => { const btn = document.getElementById(id); if (btn) btn.disabled = disabled; });
  // Load tenant admin pending spokes whenever settings tab opens
  if (canManageTenant() && !currentUser?.is_superadmin) loadTenantPendingSpokes();
  const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/settings`);
  if (!res || !res.ok) return;
  const data = await res.json();
  const aruba = data.aruba || {};
  const notifications = data.notifications || {};
  $("#aruba-api-version") && ($("#aruba-api-version").value = aruba.api_version || "classic");
  $("#aruba-cluster-url") && ($("#aruba-cluster-url").value = aruba.cluster_url || "");
  $("#aruba-client-id") && ($("#aruba-client-id").value = aruba.client_id || "");
  $("#aruba-customer-id") && ($("#aruba-customer-id").value = aruba.customer_id || data.tenant?.aruba_cid || "");
  setSecretInputConfigured($("#aruba-client-secret"), isConfiguredSecretValue(aruba.client_secret_configured ?? aruba.client_secret_set ?? aruba.client_secret));
  $("#notif-enabled") && ($("#notif-enabled").checked = Boolean(notifications.enabled));
  setSecretInputConfigured($("#notif-teams"), isConfiguredSecretValue(notifications.teams_webhook_url_configured ?? notifications.teams_webhook_url_set ?? notifications.teams_webhook_url));
  $("#notif-smtp-host") && ($("#notif-smtp-host").value = notifications.smtp_host || "");
  $("#notif-smtp-port") && ($("#notif-smtp-port").value = notifications.smtp_port || 587);
  $("#notif-smtp-user") && ($("#notif-smtp-user").value = notifications.smtp_user || "");
  setSecretInputConfigured($("#notif-smtp-pass"), isConfiguredSecretValue(notifications.smtp_password_configured ?? notifications.smtp_pass_configured ?? notifications.smtp_pass_set ?? notifications.smtp_pass));
  $("#notif-to-emails") && ($("#notif-to-emails").value = (notifications.to_emails || []).join(", "));

  await loadAcmeSettings();
}

async function savePassword() {
  const current_password = $("#pw-current")?.value || "";
  const new_password = $("#pw-new")?.value || "";
  const confirm = $("#pw-confirm")?.value || "";
  if (!current_password || !new_password) {
    setFormMessage("pw-msg", "Enter current and new password.", false);
    return;
  }
  if (new_password !== confirm) {
    setFormMessage("pw-msg", "Passwords do not match.", false);
    return;
  }
  const res = await apiFetch("/api/auth/change-password", { method: "POST", body: { current_password, new_password } });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("pw-msg", err?.detail || "Unable to change password.", false);
    return;
  }
  setFormMessage("pw-msg", "Password updated.", true);
  ["pw-current", "pw-new", "pw-confirm"].forEach(id => { const input = document.getElementById(id); if (input) input.value = ""; });
}

async function saveArubaSettings() {
  if (!currentTenantId) return;
  const payload = {
    api_version: $("#aruba-api-version")?.value || "classic",
    cluster_url: $("#aruba-cluster-url")?.value.trim() || "",
    client_id: $("#aruba-client-id")?.value.trim() || "",
    customer_id: $("#aruba-customer-id")?.value.trim() || "",
  };
  const arubaSecret = getSecretInputPayload($("#aruba-client-secret"));
  if (arubaSecret.include) payload.client_secret = arubaSecret.value;

  const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/settings/aruba`, { method: "POST", body: payload });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("aruba-msg", err?.detail || "Unable to save Aruba settings.", false);
    return;
  }
  setFormMessage("aruba-msg", "Aruba settings saved.", true);
  await loadSettings();
}

async function saveNotificationSettings() {
  if (!currentTenantId) return;
  const payload = {
    enabled: Boolean($("#notif-enabled")?.checked),
    smtp_host: $("#notif-smtp-host")?.value.trim() || "",
    smtp_port: Number($("#notif-smtp-port")?.value || 587),
    smtp_user: $("#notif-smtp-user")?.value.trim() || "",
    to_emails: $("#notif-to-emails")?.value || "",
  };
  const teamsSecret = getSecretInputPayload($("#notif-teams"));
  if (teamsSecret.include) payload.teams_webhook_url = teamsSecret.value.trim();
  const smtpSecret = getSecretInputPayload($("#notif-smtp-pass"));
  if (smtpSecret.include) payload.smtp_pass = smtpSecret.value;

  const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/settings/notifications`, { method: "POST", body: payload });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("notif-msg", err?.detail || "Unable to save notifications.", false);
    return;
  }
  setFormMessage("notif-msg", "Notifications saved.", true);
  await loadSettings();
}

function showKeyBanner(apiKey, spokeId) {
  const banner = $("#sa-key-banner");
  if (!banner) return;
  banner.innerHTML = `
    <strong>⚠ Save this API key — it will not be shown again.</strong>
    <div class="api-key-display">${escHtml(apiKey)}</div>
    <div class="row">
      <span>Spoke ${escHtml(spokeId)} approved.</span>
      <button class="btn btn-secondary btn-small" id="sa-key-dismiss" type="button">Dismiss</button>
    </div>
  `;
  banner.classList.remove("hidden");
  $("#sa-key-dismiss")?.addEventListener("click", () => banner.classList.add("hidden"), { once: true });
}



function acmeBadgeClass(daysRemaining) {
  if (typeof daysRemaining !== "number" || Number.isNaN(daysRemaining)) return "badge-grey";
  if (daysRemaining > 30) return "badge-green";
  if (daysRemaining >= 10) return "badge-yellow";
  return "badge-red";
}

function toggleAcmeDnsSection() {
  const challenge = $("#acme-challenge")?.value || "http-01";
  const isDns = challenge === "dns-01";
  $("#acme-dns-section")?.classList.toggle("hidden", !isDns);
  if (isDns) {
    const provider = $("#acme-dns-provider")?.value || "cloudflare";
    $("#acme-cloudflare-fields")?.classList.toggle("hidden", provider !== "cloudflare");
    $("#acme-he-fields")?.classList.toggle("hidden", provider !== "hurricane_electric");
  }
}

let hubAcmeSettings = null;
let hubAcmeStatus = {};
let hubAcmePoller = null;
let hubAcmeLogExpanded = false;

function getHubAcmeRequestStatus(status = {}, cfg = {}) {
  if (status?.running) return "running";
  if (status?.status) return String(status.status).toLowerCase();
  if (status?.last_result?.success === true) return "success";
  if (status?.last_result?.success === false) return "failed";
  if (status?.last_error || cfg?.last_error) return "error";
  return "idle";
}

function hubAcmeStatusLabel(statusValue) {
  switch (statusValue) {
    case "running": return "Running";
    case "success": return "Success";
    case "failed": return "Failed";
    case "error": return "Error";
    default: return "Idle";
  }
}

function getHubAcmeLogText(cfg = {}, status = {}) {
  return String(status?.last_log || cfg?.last_log || status?.last_error || cfg?.last_error || "");
}

function updateHubAcmeDisplay() {
  renderAcmeStatus(hubAcmeSettings?.cert_info || {}, hubAcmeSettings || {}, hubAcmeStatus || {});
  renderAcmeLogPanel(hubAcmeSettings || {}, hubAcmeStatus || {});
}

function renderAcmeStatus(certInfo = {}, cfg = {}, status = {}) {
  const container = $("#acme-cert-status");
  if (!container) return;
  const requestStatus = getHubAcmeRequestStatus(status, cfg);
  const requestStatusLabel = hubAcmeStatusLabel(requestStatus);
  const lastLogAt = status?.last_log_at || cfg?.last_log_at || "";
  const lastLogValue = lastLogAt ? escHtml(fmtDate(lastLogAt)) : '<span class="muted">—</span>';
  const lastError = status?.last_error || cfg?.last_error || "";
  const lastErrorValue = lastError ? escHtml(lastError) : '<span class="muted">—</span>';
  if (!certInfo || certInfo.source === "none") {
    container.innerHTML = `
      <div class="setup-status-item"><span class="setup-status-label">Certificate</span><span class="setup-status-value">Not configured</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Challenge</span><span class="setup-status-value">${escHtml(cfg.challenge || "http-01")}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Authority</span><span class="setup-status-value">${escHtml(cfg.ca || "letsencrypt")}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Request Status</span><span class="setup-status-value">${escHtml(requestStatusLabel)}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Log Updated</span><span class="setup-status-value">${lastLogValue}</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Last Error</span><span class="setup-status-value">${lastErrorValue}</span></div>
    `;
    return;
  }
  const days = Number(certInfo.days_remaining ?? 0);
  container.innerHTML = `
    <div class="setup-status-item"><span class="setup-status-label">Domain</span><span class="setup-status-value">${escHtml(certInfo.domain || cfg.domain || "—")}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Expires</span><span class="setup-status-value">${escHtml(certInfo.expires || "—")} <span class="badge ${acmeBadgeClass(days)}">${Number.isFinite(days) ? `${days} days` : "unknown"}</span></span></div>
    <div class="setup-status-item"><span class="setup-status-label">Issuer</span><span class="setup-status-value">${escHtml(certInfo.issuer || "—")}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Source</span><span class="setup-status-value">${escHtml(certInfo.source || "—")}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Request Status</span><span class="setup-status-value">${escHtml(requestStatusLabel)}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Log Updated</span><span class="setup-status-value">${lastLogValue}</span></div>
    <div class="setup-status-item"><span class="setup-status-label">Last Error</span><span class="setup-status-value">${lastErrorValue}</span></div>
  `;
}

function renderAcmeLogPanel(cfg = {}, status = {}) {
  const panel = $("#acme-log-panel");
  const meta = $("#acme-log-meta");
  const output = $("#acme-log-output");
  const toggleBtn = $("#acme-log-toggle-btn");
  const copyBtn = $("#acme-log-copy-btn");
  if (!panel || !meta || !output || !toggleBtn || !copyBtn) return;
  const requestStatus = getHubAcmeRequestStatus(status, cfg);
  const logText = getHubAcmeLogText(cfg, status);
  const logAt = status?.last_log_at || cfg?.last_log_at || "";
  const hasLog = Boolean(logText);
  const forceExpanded = requestStatus === "failed" || requestStatus === "error";
  if (forceExpanded) hubAcmeLogExpanded = true;
  const expanded = forceExpanded || hubAcmeLogExpanded;
  panel.classList.toggle("hidden", !hasLog && requestStatus === "idle");
  meta.textContent = `${hubAcmeStatusLabel(requestStatus)}${logAt ? ` · Updated ${fmtDate(logAt)}` : ""}`;
  toggleBtn.classList.toggle("hidden", forceExpanded || !hasLog);
  toggleBtn.textContent = expanded ? "Hide Log" : "Show Log";
  toggleBtn.onclick = () => {
    hubAcmeLogExpanded = !expanded;
    renderAcmeLogPanel(cfg, status);
  };
  copyBtn.disabled = !hasLog;
  copyBtn.onclick = async () => {
    if (!hasLog) return;
    try {
      await navigator.clipboard.writeText(logText);
      showToast("ACME log copied to clipboard", "ok");
    } catch (error) {
      console.warn("ACME log copy failed", error);
      showToast("Unable to copy ACME log", "warn");
    }
  };
  output.textContent = hasLog ? logText : "No ACME debug log captured yet.";
  output.classList.toggle("hidden", !expanded && !forceExpanded);
  if ((expanded || forceExpanded) && requestStatus === "running") {
    output.scrollTop = output.scrollHeight;
  }
}

function stopHubAcmeStatusPolling() {
  if (!hubAcmePoller) return;
  clearInterval(hubAcmePoller);
  hubAcmePoller = null;
}

async function pollHubAcmeStatus() {
  try {
    const res = await apiFetch("/api/acme/status");
    if (!res || !res.ok) return;
    hubAcmeStatus = await res.json();
    updateHubAcmeDisplay();
    if (!hubAcmeStatus?.running) stopHubAcmeStatusPolling();
  } catch (error) {
    console.warn("Hub ACME status poll failed", error);
  }
}

function startHubAcmeStatusPolling() {
  stopHubAcmeStatusPolling();
  pollHubAcmeStatus().catch(() => {});
  hubAcmePoller = window.setInterval(() => {
    pollHubAcmeStatus().catch(() => {});
  }, 2000);
}

async function loadAcmeSettings() {
  const [settingsRes, statusRes] = await Promise.all([
    apiFetch("/api/settings/acme"),
    apiFetch("/api/acme/status"),
  ]);
  if (!settingsRes || !settingsRes.ok) return;
  const data = await settingsRes.json();
  hubAcmeSettings = data;
  hubAcmeStatus = statusRes?.ok ? await statusRes.json() : {};
  $("#acme-domain") && ($("#acme-domain").value = data.domain || "");
  $("#acme-email") && ($("#acme-email").value = data.email || "");
  $("#acme-ca") && ($("#acme-ca").value = data.ca || "letsencrypt");
  $("#acme-challenge") && ($("#acme-challenge").value = data.challenge || "http-01");
  $("#acme-dns-provider") && ($("#acme-dns-provider").value = data.dns_provider || "cloudflare");
  $("#acme-enabled") && ($("#acme-enabled").checked = Boolean(data.enabled));
  setSecretInputConfigured($("#acme-cf-token"), isConfiguredSecretValue(data.dns_credentials_configured?.cf_api_token ?? data.dns_credentials?.cf_api_token));
  setSecretInputConfigured($("#acme-he-ddns-key"), isConfiguredSecretValue(data.dns_credentials_configured?.he_ddns_key ?? data.dns_credentials?.he_ddns_key));
  toggleAcmeDnsSection();
  updateHubAcmeDisplay();
  if (hubAcmeStatus?.running) startHubAcmeStatusPolling();
  else stopHubAcmeStatusPolling();
}

async function saveAcmeConfig() {
  const payload = {
    enabled: Boolean($("#acme-enabled")?.checked),
    domain: $("#acme-domain")?.value.trim() || "",
    email: $("#acme-email")?.value.trim() || "",
    ca: $("#acme-ca")?.value || "letsencrypt",
    challenge: $("#acme-challenge")?.value || "http-01",
    dns_provider: $("#acme-dns-provider")?.value || "",
    dns_credentials: {},
  };
  const acmeCfToken = getSecretInputPayload($("#acme-cf-token"));
  if (acmeCfToken.include) payload.dns_credentials.cf_api_token = acmeCfToken.value;
  const acmeHeKey = getSecretInputPayload($("#acme-he-ddns-key"));
  if (acmeHeKey.include) payload.dns_credentials.he_ddns_key = acmeHeKey.value;

  const res = await apiFetch("/api/settings/acme", { method: "POST", body: payload });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("acme-msg", err?.detail || "Unable to save ACME settings.", false);
    return;
  }
  const data = await res.json();
  hubAcmeSettings = data;
  setFormMessage("acme-msg", "TLS certificate settings saved.", true);
  updateHubAcmeDisplay();
  setSecretInputConfigured($("#acme-cf-token"), isConfiguredSecretValue(data.dns_credentials_configured?.cf_api_token ?? data.dns_credentials?.cf_api_token));
  setSecretInputConfigured($("#acme-he-ddns-key"), isConfiguredSecretValue(data.dns_credentials_configured?.he_ddns_key ?? data.dns_credentials?.he_ddns_key));
}

async function requestAcmeCert() {
  const button = $("#acme-request-btn");
  if (button) {
    button.disabled = true;
    button.textContent = "Requesting certificate…";
  }
  hubAcmeLogExpanded = true;
  hubAcmeStatus = {
    ...(hubAcmeStatus || {}),
    running: true,
    status: "running",
    last_result: null,
    last_error: null,
    last_log: "",
    last_log_at: "",
  };
  updateHubAcmeDisplay();
  startHubAcmeStatusPolling();
  setFormMessage("acme-msg", "Requesting certificate… (this may take 60-90 seconds)", true);
  try {
    const res = await apiFetch("/api/settings/acme/request", { method: "POST" });
    const data = await readJson(res);
    await loadAcmeSettings();
    if (!res || !res.ok || !data?.success) {
      setFormMessage("acme-msg", data?.error || data?.detail || "Certificate request failed.", false);
      return;
    }
    setFormMessage("acme-msg", `Certificate issued for ${data.domain} — expires ${data.expires || "unknown"}.`, true);
  } catch (error) {
    await loadAcmeSettings().catch(() => {});
    setFormMessage("acme-msg", error.message || "Certificate request failed.", false);
  } finally {
    stopHubAcmeStatusPolling();
    if (button) {
      button.disabled = !canManageTenant();
      button.textContent = "Request Certificate Now";
    }
  }
}

window.saveAcmeConfig = saveAcmeConfig;
window.requestAcmeCert = requestAcmeCert;

async function loadSuperadmin() {
  if (!currentUser?.is_superadmin) return;
  const [tenantsRes, pendingRes, usersRes] = await Promise.all([
    apiFetch("/api/superadmin/tenants"),
    apiFetch("/api/superadmin/pending-spokes"),
    apiFetch("/api/superadmin/users"),
  ]);
  let tenantData = [];
  if (tenantsRes?.ok) {
    tenantData = await tenantsRes.json();
    tenants = tenantData.map(item => ({ id: item.id, name: item.name || item.id, raw: item }));
    await Promise.all(tenantData.map(item => ensureTenantSpokesFor(item.id, true)));
    buildTenantSelector();
    buildSuperadminTenantTabs();
  }
  if (usersRes?.ok) {
    const users = await usersRes.json();
    tenantUserCounts = buildTenantUserCounts(users);
    renderSuperadminUsers(users);
  }
  if (tenantsRes?.ok) renderSuperadminTenants(tenantData);
  if (pendingRes?.ok) renderPendingSpokes(await pendingRes.json());
  loadGkillState();
}

function renderPendingSpokes(items) {
  $("#sa-pending-count") && ($("#sa-pending-count").textContent = String(items.length));
  const tbody = $("#sa-pending-tbody");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No pending spokes.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td><strong>${escHtml(item.spoke_name || item.hostname)}</strong></td>
      <td><code>${escHtml(item.hostname)}</code></td>
      <td>${item.tenant_hint
        ? `<span class="role-badge" style="background:var(--hpe-green,#01a982)">${escHtml(tenantName(item.tenant_hint))}</span>`
        : '<span class="muted">—</span>'}</td>
      <td>${escHtml(fmtDate(item.registered_at))}</td>
      <td>
        <select class="form-input form-input-sm sa-tenant-assign" data-pending-id="${escHtml(item.id)}">
          ${tenants.map(tenant => `<option value="${escHtml(tenant.id)}"${item.tenant_hint === tenant.id ? ' selected' : ''}>${escHtml(tenant.name)}</option>`).join("")}
        </select>
      </td>
      <td>
        <button class="btn btn-primary btn-small" data-approve-id="${escHtml(item.id)}" type="button">Approve</button>
        <button class="btn btn-danger btn-small" data-reject-id="${escHtml(item.id)}" type="button">Reject</button>
      </td>
    </tr>
  `).join("");
}

// ── Tenant admin pending spokes ──────────────────────────────────────────────
async function loadTenantPendingSpokes() {
  if (!currentTenantId || !canManageTenant()) return;
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/pending-spokes`,
      { headers: { Authorization: `Bearer ${authToken}` } });
    if (!res.ok) return;
    const items = await res.json();
    renderTenantPendingSpokes(items);
  } catch (_) { /* silent */ }
}

function renderTenantPendingSpokes(items) {
  const btn = document.getElementById("settings-pending-tab-btn");
  const countEl = document.getElementById("settings-pending-count");
  if (btn) btn.style.display = items.length > 0 ? "" : "none";
  if (countEl) countEl.textContent = String(items.length);
  const tbody = document.getElementById("settings-pending-tbody");
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No pending spokes for this tenant.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td><strong>${escHtml(item.spoke_name || item.hostname)}</strong></td>
      <td><code>${escHtml(item.hostname)}</code></td>
      <td>${escHtml(fmtDate(item.registered_at))}</td>
      <td>
        <button class="btn btn-primary btn-small" data-tenant-approve-id="${escHtml(item.id)}" type="button">Approve</button>
        <button class="btn btn-danger btn-small" data-tenant-reject-id="${escHtml(item.id)}" type="button">Reject</button>
      </td>
    </tr>
  `).join("");
  // wire approve/reject
  tbody.querySelectorAll("[data-tenant-approve-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.tenantApproveId;
      const res = await fetch(`/api/tenant/${currentTenantId}/pending-spokes/${id}/approve`,
        { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) { alert("Approval failed: " + (await res.text())); return; }
      const data = await res.json();
      const banner = document.getElementById("settings-pending-key-banner");
      if (banner && data.api_key) {
        banner.textContent = `✅ Spoke approved. API Key (shown once): ${data.api_key}`;
        banner.classList.remove("hidden");
        setTimeout(() => banner.classList.add("hidden"), 30000);
      }
      showToast("Spoke approved.", "ok");
      await refreshAfterSpokeApproval(currentTenantId);
    });
  });
  tbody.querySelectorAll("[data-tenant-reject-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.tenantRejectId;
      await fetch(`/api/tenant/${currentTenantId}/pending-spokes/${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
      loadTenantPendingSpokes();
    });
  });
}


function renderSuperadminTenants(items) {
  $("#sa-tenants-count") && ($("#sa-tenants-count").textContent = String(items.length));
  const tbody = $("#sa-tenants-tbody");
  if (!tbody) return;
  tbody.innerHTML = items.length ? [...items].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true, sensitivity: "base" })).map(item => {
    const summary = summarizeTenantSpokes(spokeCache[item.id] || []);
    const userCount = getTenantUserCount(item.id);
    return `
      <tr>
        <td>${escHtml(item.name || item.id)}</td>
        <td><code>${escHtml(item.id)}</code></td>
        <td>${summary.approvedCount}</td>
        <td>${userCount ?? '<span class="muted">—</span>'}</td>
        <td>${item.created_at ? escHtml(fmtDate(item.created_at)) : '<span class="muted">—</span>'}</td>
        <td>
          <div class="tenant-table-actions">
            <button class="btn btn-secondary btn-small" data-open-tenant="${escHtml(item.id)}" type="button">Manage</button>
            <button class="btn btn-danger btn-small" data-delete-tenant="${escHtml(item.id)}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="6" class="empty-state">No tenants found.</td></tr>';
}

function renderUserRoles(user) {
  if (user.is_superadmin) return '<span class="role-badge">SUPERADMIN</span>';
  return user.tenant_roles?.length ? user.tenant_roles.map(role => `
    <span class="tenant-role-chip">${escHtml(role.tenant_id)} · ${escHtml(role.role)} <button data-remove-role="${escHtml(user.id)}:${escHtml(role.tenant_id)}" type="button">×</button></span>
  `).join("") : "—";
}

function renderUserRoleAssignForm(user, tenants) {
  if (user.is_superadmin) return '—';
  const options = tenants.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`).join('');
  return `<div class="inline-form-row">` +
    `<select class="form-input form-input-sm user-tenant-select" data-user-id="${escHtml(user.id)}">${options}</select>` +
    `<select class="form-input form-input-sm user-role-select" data-user-id="${escHtml(user.id)}">` +
    `<option value="admin">Admin</option><option value="operator">Operator</option></select>` +
    `<button class="btn btn-secondary btn-small" data-assign-role="${escHtml(user.id)}" type="button">Assign</button>` +
    `<button class="btn btn-danger btn-small" data-delete-user="${escHtml(user.id)}" type="button">Delete</button>` +
    `</div>`;
}

function renderSuperadminUsers(users) {
  $("#sa-users-count") && ($("#sa-users-count").textContent = String(users.length));
  const tbody = $("#sa-users-tbody");
  if (!tbody) return;
  tbody.innerHTML = users.length ? users.map(user => `
    <tr>
      <td>${escHtml(user.username)}</td>
      <td>${user.is_superadmin ? "superadmin" : "tenant-scoped"}</td>
      <td><div class="tenant-role-list">${renderUserRoles(user)}</div></td>
      <td>${renderUserRoleAssignForm(user, tenants)}</td>
    </tr>
  `).join("") : '<tr><td colspan="4" class="empty-state">No users found.</td></tr>';
}

async function loadGkillState() {
  const res = await apiFetch("/api/superadmin/gkill-state");
  if (!res || !res.ok) return;
  const data = await res.json();
  $("#sa-gkill-value") && ($("#sa-gkill-value").textContent = String(data.value || "—"));
  $("#sa-gkill-fetched") && ($("#sa-gkill-fetched").textContent = data.last_fetched ? fmtDate(new Date(data.last_fetched * 1000).toISOString()) : "—");
  $("#sa-gkill-error") && ($("#sa-gkill-error").textContent = data.error || "—");
  updateGkillBadge(data.value);
}

async function approvePendingSpoke(id) {
  const select = $(`.sa-tenant-assign[data-pending-id="${CSS.escape(id)}"]`);
  const tenantId = select?.value;
  if (!tenantId) return;
  const res = await apiFetch(`/api/superadmin/pending-spokes/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: { tenant_id: tenantId },
  });
  if (!res || !res.ok) {
    const err = await readJson(res);
    showToast(err?.detail || "Failed to approve spoke.", "err");
    return;
  }
  const data = await res.json();
  showKeyBanner(data.api_key, data.spoke_id);
  showToast("Spoke approved.", "ok");
  await refreshAfterSpokeApproval(tenantId);
}

async function rejectPendingSpoke(id) {
  const res = await apiFetch(`/api/superadmin/pending-spokes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to reject spoke.", "err");
    return;
  }
  showToast("Pending spoke rejected.", "ok");
  loadSuperadmin();
}

async function createTenant() {
  const name = $("#sa-tenant-name")?.value.trim();
  const aruba_cid = $("#sa-tenant-cid")?.value.trim() || null;
  if (!name) {
    setFormMessage("sa-tenant-msg", "Tenant name is required.", false);
    return;
  }
  const res = await apiFetch("/api/superadmin/tenants", { method: "POST", body: { name, aruba_cid } });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("sa-tenant-msg", err?.detail || "Unable to create tenant.", false);
    return;
  }
  setFormMessage("sa-tenant-msg", "Tenant created.", true);
  $("#sa-tenant-name") && ($("#sa-tenant-name").value = "");
  $("#sa-tenant-cid") && ($("#sa-tenant-cid").value = "");
  $("#sa-tenant-form")?.classList.add("hidden");
  await loadSuperadmin();
}

async function deleteTenant(id) {
  if (!window.confirm(`Delete tenant ${id}?`)) return;
  const res = await apiFetch(`/api/superadmin/tenants/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to delete tenant.", "err");
    return;
  }
  if (currentTenantId === id) currentTenantId = tenants.find(tenant => tenant.id !== id)?.id || null;
  showToast("Tenant deleted.", "ok");
  await loadSuperadmin();
  await loadDashboard(true);
}

async function createUser() {
  const username = $("#sa-new-username")?.value.trim();
  const password = $("#sa-new-password")?.value || "";
  if (!username || !password) {
    setFormMessage("sa-user-msg", "Username and password are required.", false);
    return;
  }
  const res = await apiFetch("/api/superadmin/users", { method: "POST", body: { username, password } });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("sa-user-msg", err?.detail || "Unable to create user.", false);
    return;
  }
  setFormMessage("sa-user-msg", "User created.", true);
  $("#sa-new-username") && ($("#sa-new-username").value = "");
  $("#sa-new-password") && ($("#sa-new-password").value = "");
  loadSuperadmin();
}

async function deleteUser(userId) {
  if (!window.confirm("Delete this user?")) return;
  const res = await apiFetch(`/api/superadmin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to delete user.", "err");
    return;
  }
  showToast("User deleted.", "ok");
  loadSuperadmin();
}

async function assignRole(userId) {
  const tenantId = $(`.user-tenant-select[data-user-id="${CSS.escape(userId)}"]`)?.value;
  const role = $(`.user-role-select[data-user-id="${CSS.escape(userId)}"]`)?.value || "operator";
  if (!tenantId) return;
  const res = await apiFetch(`/api/superadmin/users/${encodeURIComponent(userId)}/roles`, { method: "POST", body: { tenant_id: tenantId, role } });
  if (!res || !res.ok) {
    showToast("Failed to assign role.", "err");
    return;
  }
  showToast("Role assigned.", "ok");
  loadSuperadmin();
}

async function removeRole(userId, tenantId) {
  const res = await apiFetch(`/api/superadmin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(tenantId)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to remove role.", "err");
    return;
  }
  showToast("Role removed.", "ok");
  loadSuperadmin();
}

function applyOnlineState(root, online) {
  root.querySelectorAll("[data-online-state] .status-dot, .spoke-section-header > .status-dot").forEach(dot => {
    dot.className = `status-dot ${online ? "online" : "offline"}`;
  });
}

function updateOnlineBadges(spokeOnline) {
  if (!spokeOnline) return;
  document.querySelectorAll("[data-spoke-id]").forEach(node => {
    const tenantId = node.dataset.tenantId;
    const spokeId = node.dataset.spokeId;
    const online = spokeOnline?.[tenantId]?.[spokeId];
    if (typeof online === "boolean") applyOnlineState(node, online);
  });
}

function updateAutoRefreshCountdownDisplay(text, paused = false) {
  const countdown = $("#auto-refresh-countdown");
  if (!countdown) return;
  countdown.textContent = text;
  countdown.classList.toggle("paused", paused);
}

function computeRefreshPaused() {
  if (activeTab !== "dashboard") {
    return !autoRefreshActiveTabs.has(activeTab);
  }
  if (tenantDetailState.open) {
    return !autoRefreshActiveTabs.has(tenantDetailState.activeTab);
  }
  return false;
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  if (autoRefreshCountdownTimer) {
    clearInterval(autoRefreshCountdownTimer);
    autoRefreshCountdownTimer = null;
  }
}

function syncAutoRefreshState() {
  stopAutoRefresh();
  const toggle = $("#auto-refresh-toggle");
  const intervalSelect = $("#auto-refresh-interval");
  if (!toggle?.checked) {
    updateAutoRefreshCountdownDisplay("Off");
    return;
  }
  const seconds = parseInt(intervalSelect?.value || "10", 10);
  if (!(seconds > 0)) {
    updateAutoRefreshCountdownDisplay("Off");
    return;
  }
  if (refreshPaused) {
    updateAutoRefreshCountdownDisplay("Paused", true);
    return;
  }
  autoRefreshSecondsLeft = seconds;
  updateAutoRefreshCountdownDisplay(String(autoRefreshSecondsLeft) + 's');
  autoRefreshCountdownTimer = setInterval(() => {
    autoRefreshSecondsLeft = Math.max(0, autoRefreshSecondsLeft - 1);
    updateAutoRefreshCountdownDisplay(String(autoRefreshSecondsLeft) + 's');
  }, 1000);
  autoRefreshTimer = setInterval(async () => {
    autoRefreshSecondsLeft = seconds;
    updateAutoRefreshCountdownDisplay(String(autoRefreshSecondsLeft) + 's');
    await refreshCurrentView(false);
  }, seconds * 1000);
}

function updateRefreshPausedState() {
  const wasPaused = refreshPaused;
  refreshPaused = computeRefreshPaused();
  syncAutoRefreshState();
  if (wasPaused && !refreshPaused) {
    refreshCurrentView(true).catch(() => {});
  }
}

function startAutoRefresh() {
  updateRefreshPausedState();
}

function connectWebSocket() {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) return;
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onopen = () => updateApiStatus(true, "Connected");
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === "telemetry") {
      if (activeTab === "dashboard") scheduleReload("ws-dashboard", () => loadDashboard(true));
      if (activeTab === "simulations") scheduleReload("ws-simulations", () => loadSimulations(true));
      if (activeTab === "clients") scheduleReload("ws-clients", () => loadClients(true));
      if (activeTab === "spokes") scheduleReload("ws-spokes", () => loadSpokes(true));
      if (activeTab === "config") scheduleReload("ws-config", () => loadConfig(true));
      if (activeSpokeModal && data.tenant_id === activeSpokeModal.tenant_id && data.spoke_id === activeSpokeModal.spoke.id) {
        scheduleReload("ws-modal", () => loadSpokes(true).then(() => renderSpokeClientsTab()));
      }
    } else if (data.type === "heartbeat_update") {
      updateOnlineBadges(data.island_online);
    } else if (data.type === "gkill_switch_update") {
      updateGkillBadge(data.value);
    } else if (data.type === "notification") {
      showToast(data.message, data.level === "warning" ? "warn" : "ok");
    } else if (data.type === "cert_renewed") {
      showToast(`TLS certificate renewed — expires ${data.expires || "unknown"}`, "ok");
      if (activeTab === "setup") loadAcmeSettings();
    } else if (data.type === "pending_spoke_registered") {
      if (currentUser?.is_superadmin && activeTab === "superadmin") loadSuperadmin();
      if (canManageTenant() && !currentUser?.is_superadmin && data.tenant_hint === currentTenantId) {
        loadTenantPendingSpokes();
        showToast(`New spoke '${data.spoke_name || data.hostname}' is pending approval.`, "ok");
      }
    } else if (data.type === "spoke_approved") {
      scheduleReload(`ws-approved-${data.tenant_id || "all"}`, () => {
        refreshAfterSpokeApproval(data.tenant_id || currentTenantId).catch(() => {});
      });
    } else if (data.type === "task_result") {
      showToast(`Spoke ${data.spoke_id}: ${data.task_type} ${data.status}`, data.status === "success" ? "ok" : "err");
      if (activeSpokeModal && data.spoke_id === activeSpokeModal.spoke.id) {
        loadSpokeCommands();
        loadSpokeAudit();
      }
    }
  };
  ws.onclose = () => {
    updateApiStatus(false, "Disconnected");
    ws = null;
    wsReconnectTimer = window.setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
  };
}

function bindEvents() {
  document.addEventListener("click", event => {
    const tabButton = event.target.closest("#tab-nav .tab");
    if (tabButton) {
      if (tabButton.dataset.tenantId) setCurrentTenant(tabButton.dataset.tenantId, false);
      showTab(tabButton.dataset.tab, { button: tabButton });
      return;
    }

    const tenantSortButton = event.target.closest("[data-dashboard-tenant-sort]");
    if (tenantSortButton) {
      const key = tenantSortButton.dataset.dashboardTenantSort;
      if (key) {
        tenantDashboardSort.direction = tenantDashboardSort.key === key && tenantDashboardSort.direction === "asc" ? "desc" : "asc";
        tenantDashboardSort.key = key;
        $("#dashboard-grid") && ($("#dashboard-grid").innerHTML = renderDashboardTenantTable(dashboardTenantRows));
      }
      return;
    }

    const openTenantButton = event.target.closest("[data-open-tenant]");
    if (openTenantButton) {
      showTab("dashboard");
      openTenantDetail(openTenantButton.dataset.openTenant, "dashboard", true);
      return;
    }

    const tenantDetailTab = event.target.closest(".tenant-detail-tab");
    if (tenantDetailTab) {
      tenantDetailState.activeTab = tenantDetailTab.dataset.tenantDetailTab;
      renderTenantDetail();
      return;
    }

    if (event.target.closest("#tenant-detail-back-btn")) {
      resetTenantDetail();
      loadDashboard(true);
      return;
    }

    const detailSpokeButton = event.target.closest("[data-open-spoke-modal]");
    if (detailSpokeButton) {
      const spoke = getSpokeFromCache(tenantDetailState.tenantId, detailSpokeButton.dataset.openSpokeModal);
      if (spoke) openSpokeModal(spoke, tenantDetailState.tenantId, "spoke-clients");
      return;
    }

    const setupButton = event.target.closest(".settings-subtab");
    if (setupButton) {
      const subtab = setupButton.dataset.subtab;
      $$(".settings-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtab));
      ["settings-account", "settings-aruba", "settings-notifications", "settings-api", "settings-tls", "settings-pending-spokes"].forEach(panelId => {
        document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtab);
      });
      return;
    }

    const saButton = event.target.closest(".sa-subtab");
    if (saButton) {
      const subtab = saButton.dataset.subtab;
      $$(".sa-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtab));
      ["sa-pending", "sa-tenants", "sa-users", "sa-gkill"].forEach(panelId => {
        document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtab);
      });
      return;
    }

    const spokeSubtab = event.target.closest(".spoke-subtab");
    if (spokeSubtab) {
      activateSpokeSubtab(spokeSubtab.dataset.subtab);
      return;
    }

    if (event.target.matches("[data-approve-id]")) approvePendingSpoke(event.target.dataset.approveId);
    if (event.target.matches("[data-reject-id]")) rejectPendingSpoke(event.target.dataset.rejectId);
    if (event.target.matches("[data-delete-tenant]")) deleteTenant(event.target.dataset.deleteTenant);
    if (event.target.matches("[data-delete-user]")) deleteUser(event.target.dataset.deleteUser);
    if (event.target.matches("[data-assign-role]")) assignRole(event.target.dataset.assignRole);
    if (event.target.matches("[data-remove-role]")) {
      const [userId, tenantId] = event.target.dataset.removeRole.split(":");
      removeRole(userId, tenantId);
    }
  });

  $("#tenant-select")?.addEventListener("change", event => {
    const tenantId = event.target.value;
    setCurrentTenant(tenantId);
  });
  $("#login-btn")?.addEventListener("click", openLoginModal);
  $("#logout-btn")?.addEventListener("click", () => logout(true));
  $("#login-submit-btn")?.addEventListener("click", submitLogin);
  $("#login-cancel-btn")?.addEventListener("click", closeLoginModal);
  $("#login-modal")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeLoginModal(); });
  $("#login-password")?.addEventListener("keydown", event => { if (event.key === "Enter") submitLogin(); });
  $("#refresh-dashboard-btn")?.addEventListener("click", () => loadDashboard(true));
  $("#refresh-simulations-btn")?.addEventListener("click", () => loadSimulations(true));
  $("#refresh-clients-btn")?.addEventListener("click", () => loadClients(true));
  $("#refresh-spokes-btn")?.addEventListener("click", () => loadSpokes(true));
  $("#refresh-commands-btn")?.addEventListener("click", loadCommands);
  $("#refresh-config-btn")?.addEventListener("click", () => loadConfig(true));
  $("#auto-refresh-toggle")?.addEventListener("change", startAutoRefresh);
  $("#auto-refresh-interval")?.addEventListener("change", startAutoRefresh);
  $("#send-command-btn")?.addEventListener("click", sendCommandFromForm);
  $("#collapse-all-btn")?.addEventListener("click", () => { getExpandedSet().clear(); loadSpokes(); });
  $("#expand-all-btn")?.addEventListener("click", async () => {
    const spokes = await ensureSpokes();
    spokeUiState.expandedByTenant[currentTenantId] = new Set(spokes.filter(spoke => spoke.status === "approved").map(spoke => spoke.id));
    loadSpokes();
  });
  $("#hub-simulations-search")?.addEventListener("input", event => {
    hubSimulationUiState.search = event.target.value || "";
    renderSimulationRows();
  });
  $("#hub-clients-search")?.addEventListener("input", event => {
    hubClientUiState.search = event.target.value || "";
    renderClientRowsForHub();
  });
  $("#hub-clients-status-filter")?.addEventListener("change", event => {
    hubClientUiState.status = event.target.value || "all";
    renderClientRowsForHub();
  });
  $("#hub-clients-spoke-filter")?.addEventListener("change", event => {
    hubClientUiState.spoke = event.target.value || "all";
    renderClientRowsForHub();
  });
  $("#spoke-search")?.addEventListener("input", event => {
    spokeUiState.search = event.target.value || "";
    scheduleReload("spoke-search", () => loadSpokes(), 120);
  });
  $("#spoke-modal-close")?.addEventListener("click", closeSpokeModal);
  $("#spoke-modal")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeSpokeModal(); });
  $("#mode-save-btn")?.addEventListener("click", saveSpokeProcessingMode);
  $("#pw-save-btn")?.addEventListener("click", savePassword);
  $("#aruba-save-btn")?.addEventListener("click", saveArubaSettings);
  $("#notif-save-btn")?.addEventListener("click", saveNotificationSettings);
  $("#sa-gkill-refresh-btn")?.addEventListener("click", loadGkillState);
  $("#sa-add-tenant-btn")?.addEventListener("click", () => $("#sa-tenant-form")?.classList.toggle("hidden"));
  $("#sa-cancel-tenant-btn")?.addEventListener("click", () => $("#sa-tenant-form")?.classList.add("hidden"));
  $("#sa-save-tenant-btn")?.addEventListener("click", createTenant);
  $("#sa-create-user-btn")?.addEventListener("click", createUser);
}

(async function init() {
  bindEvents();
  await pingApi();
  if (authToken) await loadUserContext();
  connectWebSocket();
  if (currentUser && currentTenantId) await ensureSpokes(true);
  await loadDashboard();
  startAutoRefresh();
})();

document.getElementById("acme-challenge")?.addEventListener("change", toggleAcmeDnsSection);
document.getElementById("acme-dns-provider")?.addEventListener("change", toggleAcmeDnsSection);


  })();
}
