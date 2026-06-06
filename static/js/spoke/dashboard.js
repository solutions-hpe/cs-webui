// Spoke application module extracted from static/app.js.

import { WEBUI_MODE } from '../state.js';
import { escHtml, showInlineMessage } from '../utils.js';

function consumeInitPayload() {
  const init = window.__CS_WEBUI_INIT__ || null;
  window.__CS_WEBUI_INIT__ = null;
  return init;
}

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
const clientCount = document.getElementById('client-count');
const clientsPill = document.getElementById('clients-pill');
const clientsOnlinePill = document.getElementById('clients-online-pill');
const wsDot = document.getElementById('ws-dot');
const wsText = document.getElementById('ws-text');
const setupTroubleshootPanel = document.getElementById('setup-troubleshoot');
const msgStatsRate = document.getElementById('msg-stats-rate');
const msgStatsCount = document.getElementById('msg-stats-count');
const msgStatsPressureDot = document.getElementById('msg-stats-pressure-dot');
const msgStatsPressureText = document.getElementById('msg-stats-pressure-text');
const msgStatsWsDot = document.getElementById('msg-stats-ws-dot');
const msgStatsWsText = document.getElementById('msg-stats-ws-text');
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
let spokeCentralBrowseData = null;
let spokeCaMonitoredItems = [];
let spokeCaBrowseActiveTab = 'central-browse-panel';
let spokeCaBrowseRefreshTimer = null;
// Demo scenario state: hostname → {scenario, minutes_remaining, expires_at}
let _demoActiveMap = {};
let _demoRefreshTimer = null;
let currentSettings = {
  repo_url: '',
  repo_branch: '',
  github_token_configured: false,
  hub_managed: false,
  central_api: {
    mode: 'classic',
    classic: { url: '', username: '', password_configured: false },
    central: { url: '', client_id: '', customer_id: '', client_secret_configured: false }
  },
  central_config: {
    api_version: 'classic',
    cluster_url: '',
    access_token_configured: false,
    refresh_token_configured: false,
    client_id: '',
    client_secret_configured: false,
    customer_id: ''
  },
  site_mappings: {},
  spoke_monitored_items: [],
  monitored_checks: [],
  hardware_checks: [],
  relay_enabled: 'off',
  relay_server_url: '',
  hub_tls_verify: 'off',
  relay_spoke_name: '',
  relay_tenant_hint: '',
  relay_tenant_id: '',
  relay_spoke_id: '',
  relay_poll_interval: 60,
  relay_api_key_configured: false,
  admin_password_configured: false,
  session_timeout_minutes: 30,
  auth_provider: 'local',
  auth_ldap_url: '',
  auth_ldap_bind_dn: '',
  auth_ldap_bind_password_configured: false,
  auth_ldap_user_base: '',
  auth_ldap_user_filter: '(&(objectClass=user)(sAMAccountName={username}))',
  auth_ldap_group_admin: '',
  auth_ldap_group_viewer: '',
  auth_radius_host: '',
  auth_radius_port: 1812,
  auth_radius_secret_configured: false,
  auth_radius_role_attr: 'Filter-Id',
  auth_radius_admin_val: 'admin',
  auth_tacacs_host: '',
  auth_tacacs_port: 49,
  auth_tacacs_secret_configured: false,
  auth_tacacs_admin_priv: 15,
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
  usb_max_slots: '24',
  cpu_provision_threshold: '80',
  cpu_delete_threshold: '90',
  mem_provision_threshold: '80',
  mem_delete_threshold: '90',
  vm_image_1_template_id: '100',
  vm_image_1_template_spec: '100',
  vm_image_2_template_id: '200',
  vm_image_2_template_spec: '200',
  vm_image_1_pct: '50',
  usb_auto_provision: 'off',
  usb_ignored_vidpids: '[]',
  ignored_hostnames: '["sim-rpi-0000"]',
  vm_silent_timeout: '24',
  reclone_schedule_enabled: 'off',
  reclone_schedule_cron: 'sunday 02:00',
  reclone_concurrency: '1',
  protected_vmids: '',
  l1_vlan_start: '100',
  l1_vlan_end: '199',
  guest_agent_watchdog_enabled: 'on',
  guest_agent_grace_minutes: '20',
  guest_agent_check_interval_minutes: '10',
  guest_agent_reboot_after_minutes: '10',
  guest_agent_reclone_after_minutes: '30',
  watchdog_reboot_enabled: 'on',
  proxmox_config: {}
};
let configData = {};
let configLoaded = false;
let centralTokenValid = null;
let centralLastSyncedTs = null;
let centralStatusInitialized = false;
let latestProxmoxData = { vms: [], usb_state: [], usb_quarantine: [], unknown_usb: [], reclone_state: null, vh_devices: null };  // physical_usb removed
let latestRecloneState = null;
let proxmoxServerSelected = null; // hostname of currently selected Proxmox agent (null = show server list)
let usbCountdownTimer = null;
let activeVmCat = 'sim';   // 'sim' | 'other' | 'containers' | 'templates'
let webuiVmid = null;      // VMID of the LXC container running this service (protected from delete)
let _lastUnknownUsbFp = ''; // Fingerprint to skip re-rendering unknown USB table when unchanged
let _lastCertifiedUsbFp = ''; // Fingerprint to skip re-rendering certified USB table when unchanged
let _lastQuarantineFp = ''; // Fingerprint to skip re-rendering quarantine table when unchanged
let _lastMissingFp = '';    // Fingerprint for missing-dongle set — only restart countdown when it changes
const spokeRoot = document.getElementById('spoke-root');
const spokeNavRoot = document.getElementById('spoke-nav');
const spokeTabPanels = document.querySelectorAll('#spoke-root .tab-content');
let activeSpokeTab = spokeNavRoot?.querySelector('.tab.active')?.dataset.tab || 'simulations';
let activeServerSubtab = spokeRoot?.querySelector('.server-subtab.active')?.dataset.subtab || 'server-vms';
let refreshPaused = false;
let refreshCountdownTimer = null;
let refreshSecondsLeft = 10;
let refreshIntervalSeconds = 10;
const SECRET_CONFIGURED_PLACEHOLDER = '**********';
const refreshActiveTabs = new Set(['dashboard']);
let clientTypeFilter = 'all';

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
const spokeNavTabs = Array.from(spokeNavRoot?.querySelectorAll('.tab') || []);
spokeNavTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    spokeNavTabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    spokeTabPanels.forEach((panel) => panel.classList.add('hidden'));

    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeSpokeTab = tab.dataset.tab;
    document.getElementById(`tab-${tab.dataset.tab}`)?.classList.remove('hidden');
    if (tab.dataset.tab === 'setup') activateSetupSubtab('setup-github');
    if (tab.dataset.tab === 'server') { activateServerSubtab('server-vms'); loadProxmoxApproved().catch(() => {}); }
    if (tab.dataset.tab === 'central') { activateCentralSubtab('central-sites-panel'); }
    if (tab.dataset.tab === 'simulations') { activateSimTopTab('simtop-checks'); }
    resetTabDrilldowns(tab.dataset.tab);
    updateRefreshPausedState();
  });
});

// Reset any open drill-down panels back to the overview when the top-level
// tab is clicked — so you never land in a stale detail view.
function resetTabDrilldowns(tabName) {
  if (tabName === 'server') {
    // Always return to the server list when re-entering the VM Server tab.
    proxmoxServerSelected = null;
  }
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

async function hydrateSetupSubtab(subtabId) {
  if (!subtabId) return;

  if (subtabId === 'setup-troubleshoot') {
    await loadSystemHealth();
    _updateMsgStatsCard();
    return;
  }

  if (subtabId === 'setup-hub-overrides') {
    loadSpokeConfOverrides().catch(() => {});
    return;
  }

  if (subtabId === 'setup-sim-config' || subtabId === 'setup-addresses' || subtabId === 'setup-buckets') {
    loadConfigEditor().catch(() => {});
    return;
  }

  const loadSetupSettings = async () => {
    try {
      await loadSettings();
    } catch (error) {
      const activePanel = document.querySelector('#tab-setup .setup-subpanel:not(.hidden)');
      const existingMsg = activePanel?.querySelector('.settings-message, [role="alert"]');
      if (existingMsg) {
        existingMsg.textContent = `Could not load settings: ${error.message}`;
        existingMsg.classList.remove('hidden');
        existingMsg.classList.add('error');
      }
    }
  };

  if (subtabId === 'setup-notifications') {
    await loadSetupSettings();
    return;
  }

  await loadSetupSettings();

  if (subtabId === 'setup-central' || subtabId === 'central-config-panel') {
    await loadCentralStatus().catch(() => {});
  }

  // When the Proxmox setup sub-tab is activated, load unknown USB devices from all spokes
  // so the admin can certify them directly from the hub without logging into each spoke.
  if (subtabId === 'setup-proxmox') {
    loadAndRenderSpokeUnknownUsb().catch(() => {});
    loadPxServersList().catch(() => {});
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
  void hydrateSetupSubtab(subtabId);
}

function activateServerSubtab(subtabId = 'server-vms') {
  activeServerSubtab = subtabId;
  document.querySelectorAll('.server-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === subtabId);
  });
  ['server-node', 'server-vms', 'server-usb', 'server-t3', 'server-other', 'server-vh', 'server-commands'].forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    const isActive = id === subtabId;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('hidden', !isActive);
  });
  if (subtabId === 'server-vh') renderVhDevices(latestProxmoxData);
  if (subtabId === 'server-usb') renderIgnoredUsbList();
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
  const toRender = [...filtered].reverse();
  agentLogViewer.textContent = '';
  for (const line of toRender) {
    const el = document.createElement('div');
    el.className = `agent-log-line ${classifyLogLine(line)}`;
    el.textContent = line;
    agentLogViewer.appendChild(el);
  }
  if (agentLogAutoScroll) agentLogViewer.scrollTop = 0;
}

async function loadAgentLogs() {
  try {
    const data = await requestJson('/api/proxmox/logs');
    agentLogLines = data.lines || [];
    if (!agentLogLines.length) {
      const hint = 'No logs yet — logs arrive on the next agent telemetry poll (≤60s after activity).';
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
    const atTop = agentLogViewer.scrollTop < 40;
    agentLogAutoScroll = atTop;
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
const centralSubPanels = ['central-browse-panel', 'central-alerts-panel', 'central-insights-panel', 'central-clients-panel', 'central-devices-panel', 'central-history-panel', 'central-config-panel'];

function activateCentralSubtab(subtabId = 'central-browse-panel') {
  document.querySelectorAll('.central-subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === subtabId);
  });
  centralSubPanels.forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.toggle('active', id === subtabId);
    panel.classList.toggle('hidden', id !== subtabId);
  });
  if (['central-browse-panel', 'central-alerts-panel', 'central-insights-panel', 'central-clients-panel', 'central-devices-panel'].includes(subtabId)) {
    spokeCaBrowseActiveTab = subtabId;
    if (!spokeCentralBrowseData) void fetchSpokeCentralBrowse();
    else renderSpokeCaBrowseTab();
  }
  if (subtabId === 'central-sites-panel') renderCentralSites();
  if (subtabId === 'central-alerts-panel') renderCentralAllAlerts();
  if (subtabId === 'central-clients-panel') renderCentralClients();
  if (subtabId === 'central-history-panel') renderCentralAllHistory();
  if (subtabId === 'central-config-panel') void hydrateSetupSubtab('central-config-panel');
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

const serverPressureIndicator = document.getElementById('server-pressure-indicator');

// Message rate tracking (rolling 10-second window)
const _msgTimestamps = [];
let _pressureState = { active: false, level: 'idle', throttle_interval: 15, reason: '' };
let _msgRateTimer = null;

function _recordWsMsg() {
  const now = Date.now();
  _msgTimestamps.push(now);
  // Trim to 10-second window
  const cutoff = now - 10000;
  let i = 0;
  while (i < _msgTimestamps.length && _msgTimestamps[i] < cutoff) i++;
  if (i > 0) _msgTimestamps.splice(0, i);
}

function _getWsMsgRate() {
  const now = Date.now();
  const cutoff = now - 10000;
  let i = 0;
  while (i < _msgTimestamps.length && _msgTimestamps[i] < cutoff) i++;
  if (i > 0) _msgTimestamps.splice(0, i);
  return (_msgTimestamps.length / 10);
}

function _getPressureLevel() {
  const rawLevel = String(_pressureState?.level || '').toLowerCase();
  if (!_pressureState?.active || rawLevel === 'idle' || rawLevel === 'normal') return 'idle';
  return rawLevel === 'high' ? 'high' : 'medium';
}

function _isTroubleshootVisible() {
  return !!setupTroubleshootPanel && !setupTroubleshootPanel.classList.contains('hidden');
}

function _updateMsgStatsCard() {
  if (!_isTroubleshootVisible() || !msgStatsRate || !msgStatsCount || !msgStatsPressureText || !msgStatsWsText) return;
  const rate = _getWsMsgRate();
  const pressureLevel = _getPressureLevel();
  const wsConnected = socket?.readyState === WebSocket.OPEN;

  msgStatsRate.textContent = rate.toFixed(1);
  msgStatsCount.textContent = String(_msgTimestamps.length);
  if (msgStatsPressureDot) msgStatsPressureDot.className = `msg-stat-dot level-${pressureLevel}`;
  msgStatsPressureText.textContent = pressureLevel;
  if (msgStatsWsDot) msgStatsWsDot.className = `status-dot ${wsConnected ? 'online' : 'offline'}`;
  msgStatsWsText.textContent = wsConnected ? 'connected' : 'disconnected';
}

function _updatePressureBadge() {
  const rate = _getWsMsgRate();
  const { active, throttle_interval, reason } = _pressureState;
  const level = _getPressureLevel();
  const showBadge = active || rate >= 1;

  if (serverPressureIndicator) {
    if (!showBadge) {
      serverPressureIndicator.style.display = 'none';
    } else {
      const rateFmt = rate.toFixed(1);
      const icon = level === 'high' ? '⚠️' : level === 'medium' ? '⏳' : '📊';
      const throttleText = active ? ` → ${throttle_interval}s` : '';
      serverPressureIndicator.textContent = `${icon} ${rateFmt} msg/s${throttleText}`;
      serverPressureIndicator.title = active
        ? `Server under load${reason ? ` (${reason})` : ''} — client reporting slowed to ${throttle_interval}s intervals`
        : 'WebSocket receive rate';
      serverPressureIndicator.className = `spoke-only server-pressure-badge level-${level}`;
      serverPressureIndicator.style.display = '';
    }
  }

  _updateMsgStatsCard();
}

function applyServerPressure(msg) {
  _pressureState = {
    active: !!msg.active,
    level: msg.level || 'idle',
    throttle_interval: msg.throttle_interval || 15,
    reason: msg.reason || '',
  };
  _updatePressureBadge();
}

function setRelayStatus(data = {}) {
  updateRelayIndicatorVisibility();
  const stateText = document.getElementById('relay-state-text');
  const lastTime = document.getElementById('relay-last-time');
  const lastError = document.getElementById('relay-last-error');
  const spokeIdDisplay = document.getElementById('relay-spoke-id-display');
  const apikeyStatus = document.getElementById('relay-apikey-status');

  const isNameConflict = data.registration_status === 'name_conflict' || (data.error || '').startsWith('name_conflict:');
  const isPending = data.enabled && (data.registration_status === 'pending' || data.api_key_configured === false) && !data.connected && !isNameConflict;

  if (stateText) stateText.textContent = !data.enabled ? 'Disabled' : data.connected ? '✓ Connected' : isNameConflict ? '✗ Name conflict' : data.error ? '✗ Error' : data.registration_status === 'pending' ? 'Pending approval' : 'Enabled';
  if (lastTime) lastTime.textContent = data.last_sync ? new Date(data.last_sync * 1000).toLocaleTimeString() : '—';
  if (lastError) lastError.textContent = data.error || '—';
  if (spokeIdDisplay) spokeIdDisplay.textContent = data.spoke_id || '—';
  if (apikeyStatus) apikeyStatus.textContent = data.api_key_configured ? '✓ Received' : 'Pending approval';

  const dotEl = document.getElementById('relay-indicator-dot');
  const textEl = document.getElementById('relay-indicator-text');
  if (dotEl) {
    if (data.connected) {
      dotEl.className = 'ind-dot green';
      dotEl.title = `Hub connected — last sync: ${new Date((data.last_sync || 0) * 1000).toLocaleTimeString()}`;
    } else if (isPending) {
      dotEl.className = 'ind-dot grey';
      dotEl.title = 'Awaiting hub approval';
    } else {
      dotEl.className = 'ind-dot red';
      dotEl.title = `Hub disconnected: ${data.error || 'unknown'}`;
    }
  }
  if (textEl) {
    textEl.textContent = isPending ? 'Hub: Pending' : '';
    textEl.style.display = isPending ? '' : 'none';
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
  // Update footer repo pill
  if (repoVersion) {
    const fRepo = document.getElementById('footer-repo-version');
    if (fRepo) { fRepo.textContent = `GitHub Repo v${repoVersion}`; fRepo.title = `Client-sim repo version: v${repoVersion}`; }
  }
}

// ── Setup tab — settings form ─────────────────────────────────────
const branchInput = document.getElementById('branch-input');
const githubTokenInput = document.getElementById('github-token-input');
const githubTokenStatus = document.getElementById('github-token-status');
const syncNowBtn = document.getElementById('sync-now-btn');
const syncNowMsg = document.getElementById('sync-now-message');
const settingsMsg = document.getElementById('settings-message');
const settingsForm = document.getElementById('settings-form');
const hubManagedBanner = document.getElementById('hub-managed-banner');
const githubClearConfigBtn = document.getElementById('github-clear-config-btn');
const refreshWebuiBtn = document.getElementById('refresh-webui-btn');
const updateMsg = document.getElementById('update-message');
const versionCurrent = document.getElementById('version-current');
const versionAvailable = document.getElementById('version-available');
const versionLastChecked = document.getElementById('version-last-checked');
const serverVersionCurrent = document.getElementById('server-version-current');
const serverVersionAvailable = document.getElementById('server-version-available');
const serverUpdateMsg = document.getElementById('server-update-message');
const setupActiveBranch = document.getElementById('setup-active-branch');
const repoUrlInput = document.getElementById('repo-url-input');
const centralTabButtons = Array.from(spokeNavRoot?.querySelectorAll('.tab[data-tab="central"]') || []);
const configTabButtons = Array.from(spokeNavRoot?.querySelectorAll('.tab[data-tab="config"]') || []);
const simTabButtons = Array.from(spokeNavRoot?.querySelectorAll('.tab[data-tab="simulations"]') || []);
const spokeSetupTabButtons = Array.from(spokeNavRoot?.querySelectorAll('.tab[data-tab="setup"]') || []);
const setupSubtabButtons = document.querySelectorAll('#tab-setup .setup-subnav .setup-subtab');
const setupSubpanels = document.querySelectorAll('#tab-setup .setup-subpanel');
const centralOverview = document.getElementById('central-overview');
const centralSitesGrid = document.getElementById('central-sites-table');
const centralEmpty = document.getElementById('central-empty');
const centralRefreshBtn = document.getElementById('central-refresh-btn');
const centralSearchInput = document.getElementById('central-search');
const centralModePill = document.getElementById('central-mode-pill');
const centralSitesPill = document.getElementById('central-sites-pill');
const centralUpdatedPill = document.getElementById('central-updated-pill');
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
const centralSiteDevices = document.getElementById('central-site-devices');
const centralSiteDevicesCount = document.getElementById('central-site-devices-count');
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
const relayHubTlsVerifyInput = document.getElementById('relay-hub-tls-verify-input');
const relayTenantIdInput = document.getElementById('relay-tenant-id-input');
const relayMsg = document.getElementById('relay-message');
const relayClearConfigBtn = document.getElementById('relay-clear-config-btn');
const adminPasswordInput = document.getElementById('admin-password-input');
const adminPasswordStatus = document.getElementById('admin-password-status');
const adminPasswordSaveBtn = document.getElementById('admin-password-save-btn');
const adminPasswordMsg = document.getElementById('admin-password-message');
const sessionTimeoutMinutesInput = document.getElementById('session-timeout-minutes-input');
const spokeUserPill = document.getElementById('spoke-user-pill');
const spokeUserName = document.getElementById('spoke-user-name');
const spokeUserRole = document.getElementById('spoke-user-role');
const spokeAuthProviderSelect = document.getElementById('spoke-auth-provider-select');
const spokeAuthLdapFields = document.getElementById('spoke-auth-ldap-fields');
const spokeAuthRadiusFields = document.getElementById('spoke-auth-radius-fields');
const spokeAuthTacacsFields = document.getElementById('spoke-auth-tacacs-fields');
const spokeLdapUrlInput = document.getElementById('spoke-ldap-url');
const spokeLdapBindDnInput = document.getElementById('spoke-ldap-bind-dn');
const spokeLdapBindPasswordInput = document.getElementById('spoke-ldap-bind-password');
const spokeLdapUserBaseInput = document.getElementById('spoke-ldap-user-base');
const spokeLdapUserFilterInput = document.getElementById('spoke-ldap-user-filter');
const spokeLdapGroupAdminInput = document.getElementById('spoke-ldap-group-admin');
const spokeLdapGroupViewerInput = document.getElementById('spoke-ldap-group-viewer');
const spokeRadiusHostInput = document.getElementById('spoke-radius-host');
const spokeRadiusPortInput = document.getElementById('spoke-radius-port');
const spokeRadiusSecretInput = document.getElementById('spoke-radius-secret');
const spokeRadiusRoleAttrInput = document.getElementById('spoke-radius-role-attr');
const spokeRadiusAdminValInput = document.getElementById('spoke-radius-admin-val');
const spokeTacacsHostInput = document.getElementById('spoke-tacacs-host');
const spokeTacacsPortInput = document.getElementById('spoke-tacacs-port');
const spokeTacacsSecretInput = document.getElementById('spoke-tacacs-secret');
const spokeTacacsAdminPrivInput = document.getElementById('spoke-tacacs-admin-priv');
const spokeAuthTestBtn = document.getElementById('spoke-auth-test-btn');
const spokeAuthSettingsSaveBtn = document.getElementById('spoke-auth-settings-save-btn');
const spokeAuthSettingsMsg = document.getElementById('spoke-auth-settings-msg');
const topbarUpdateAllBtn = document.getElementById('update-all-btn');
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
const saveEmailBtn       = document.getElementById('save-email-btn');
const emailNotifMsg      = document.getElementById('email-notif-msg');
const teamsEnabledToggle = document.getElementById('teams-enabled-toggle');
const teamsWebhookUrl    = document.getElementById('teams-webhook-url');
const testTeamsBtn       = document.getElementById('test-teams-btn');
const saveTeamsBtn       = document.getElementById('save-teams-btn');
const teamsNotifMsg      = document.getElementById('teams-notif-msg');
const usbAutoProvisionInput = document.getElementById('usb-auto-provision');
const usbMissingTimeoutInput = document.getElementById('usb-missing-timeout');
const usbMaxSlotsInput = document.getElementById('usb-max-slots');
const vmImage1TemplateIdInput = document.getElementById('vm-image-1-template-id');
const vmImage2TemplateIdInput = document.getElementById('vm-image-2-template-id');
const templateVmidSpecError = document.getElementById('template-vmid-spec-error');
const vmImage1PctInput = document.getElementById('vm-image-1-pct');
const usbVidPidTbody = document.getElementById('usb-vidpid-tbody');
const newVidPidInput = document.getElementById('new-vidpid');
const newVidPidTypeInput = document.getElementById('new-vidpid-type');
const newVidPidLabelInput = document.getElementById('new-vidpid-label');
const usbIgnoredList = document.getElementById('usb-ignored-list');
const usbT2IgnoredList = document.getElementById('usb-t2-ignored-list');
const ignoredHostnamesList = document.getElementById('ignored-hostnames-list');
const newIgnoredHostnameInput = document.getElementById('new-ignored-hostname');
const addIgnoredHostnameBtn = document.getElementById('add-ignored-hostname-btn');
const vmSilentTimeoutInput = document.getElementById('vm-silent-timeout');
const recloneScheduleEnabledInput = document.getElementById('reclone-schedule-enabled');
const recloneScheduleDayInput = document.getElementById('reclone-schedule-day');
const recloneScheduleTimeInput = document.getElementById('reclone-schedule-time');
const recloneConcurrencyInput = document.getElementById('reclone-concurrency');
const vmRecloneConcurrencyInput = document.getElementById('vm-reclone-concurrency');
const l1VlanStartInput = document.getElementById('l1-vlan-start');
const l1VlanEndInput = document.getElementById('l1-vlan-end');
const l1VlanMsg = document.getElementById('l1-vlan-message');
const usbSettingsMsg = document.getElementById('usb-settings-message');
const vmMaintenanceMsg = document.getElementById('vm-maintenance-message');
const agentWatchdogMsg = document.getElementById('agent-watchdog-message');
const addVidPidBtn = document.getElementById('add-vidpid-btn');
const usbSummaryPanel = document.getElementById('usb-summary-panel');
const usbSummaryTbody = document.getElementById('usb-summary-tbody');
const unknownUsbSection = document.getElementById('unknown-usb-section');
const unknownUsbTbody = document.getElementById('unknown-usb-tbody');
const usbQuarantineSection = document.getElementById('usb-quarantine-section');
const usbQuarantineTbody = document.getElementById('usb-quarantine-tbody');
const recloneStatusBadge = document.getElementById('reclone-status-badge');
const recloneProgressWrap = document.getElementById('reclone-progress-wrap');
const recloneProgressBar = document.getElementById('reclone-progress-bar');
const recloneProgressLabel = document.getElementById('reclone-progress-label');
const recloneVmLog = document.getElementById('reclone-vm-log');
const recloneLastRun = document.getElementById('reclone-last-run');
const recloneNowBtn = document.getElementById('reclone-now-btn');

document.getElementById('reclone-clear-btn')?.addEventListener('click', clearRecloneState);


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

if (usbQuarantineTbody) {
  usbQuarantineTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-usb-quarantine-clear]');
    if (!btn) return;
    const busPath = btn.dataset.usbQuarantineClear;
    btn.disabled = true;
    btn.textContent = 'Clearing…';
    try {
      await requestJson('/api/proxmox/command', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear_usb_quarantine', args: { bus_path: busPath } }),
      });
      showNotification(`Quarantine cleared for bus ${busPath}`, 'info');
    } catch (err) {
      showNotification(`Failed to clear quarantine: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Clear Quarantine';
    }
  });
}

function defaultCentralApiSettings() {
  return {
    mode: 'classic',
    classic: { url: '', username: '', password_configured: false },
    central: { url: '', client_id: '', customer_id: '', client_secret_configured: false }
  };
}

function defaultCentralConfigSettings() {
  return {
    api_version: 'classic',
    cluster_url: '',
    access_token_configured: false,
    refresh_token_configured: false,
    client_id: '',
    client_secret_configured: false,
    customer_id: ''
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
  const mergedCentralConfig = {
    ...defaultCentralConfigSettings(),
    ...(currentSettings.central_config || {}),
    ...(next.central_config || {}),
    access_token_configured: next.central_config?.access_token_configured ?? currentSettings.central_config?.access_token_configured ?? false,
    refresh_token_configured: next.central_config?.refresh_token_configured ?? currentSettings.central_config?.refresh_token_configured ?? false,
    client_secret_configured: next.central_config?.client_secret_configured ?? currentSettings.central_config?.client_secret_configured ?? false,
  };
  const merged = {
    repo_url: next.repo_url ?? currentSettings.repo_url ?? repoUrlInput?.value ?? '',
    repo_branch: next.repo_branch ?? currentSettings.repo_branch ?? '',
    github_token_configured: next.github_token_configured ?? currentSettings.github_token_configured ?? false,
    hub_managed: next.hub_managed ?? currentSettings.hub_managed ?? false,
    central_api: mergedCentralApi,
    central_config: mergedCentralConfig,
    site_mappings: next.site_mappings ?? currentSettings.site_mappings ?? {},
    spoke_monitored_items: Array.isArray(next.spoke_monitored_items)
      ? next.spoke_monitored_items
      : (currentSettings.spoke_monitored_items || []),
    monitored_checks: Array.isArray(next.monitored_checks)
      ? next.monitored_checks
      : (currentSettings.monitored_checks || []),
    hardware_checks: Array.isArray(next.hardware_checks)
      ? next.hardware_checks
      : (currentSettings.hardware_checks || []),
    relay_enabled: next.relay_enabled ?? currentSettings.relay_enabled ?? 'off',
    relay_server_url: next.relay_server_url ?? currentSettings.relay_server_url ?? '',
    hub_tls_verify: next.hub_tls_verify ?? currentSettings.hub_tls_verify ?? 'off',
    relay_spoke_name: next.relay_spoke_name ?? currentSettings.relay_spoke_name ?? '',
    relay_tenant_hint: next.relay_tenant_hint ?? next.relay_tenant_id ?? currentSettings.relay_tenant_hint ?? currentSettings.relay_tenant_id ?? '',
    relay_tenant_id: next.relay_tenant_id ?? next.relay_tenant_hint ?? currentSettings.relay_tenant_id ?? currentSettings.relay_tenant_hint ?? '',
    relay_spoke_id: next.relay_spoke_id ?? currentSettings.relay_spoke_id ?? '',
    relay_poll_interval: next.relay_poll_interval ?? currentSettings.relay_poll_interval ?? 60,
    relay_api_key_configured: next.relay_api_key_configured ?? currentSettings.relay_api_key_configured ?? false,
    admin_password_configured: next.admin_password_configured ?? currentSettings.admin_password_configured ?? false,
    session_timeout_minutes: next.session_timeout_minutes ?? currentSettings.session_timeout_minutes ?? 30,
    auth_provider: next.auth_provider ?? currentSettings.auth_provider ?? 'local',
    auth_ldap_url: next.auth_ldap_url ?? currentSettings.auth_ldap_url ?? '',
    auth_ldap_bind_dn: next.auth_ldap_bind_dn ?? currentSettings.auth_ldap_bind_dn ?? '',
    auth_ldap_bind_password_configured: next.auth_ldap_bind_password_configured ?? currentSettings.auth_ldap_bind_password_configured ?? false,
    auth_ldap_user_base: next.auth_ldap_user_base ?? currentSettings.auth_ldap_user_base ?? '',
    auth_ldap_user_filter: next.auth_ldap_user_filter ?? currentSettings.auth_ldap_user_filter ?? '(&(objectClass=user)(sAMAccountName={username}))',
    auth_ldap_group_admin: next.auth_ldap_group_admin ?? currentSettings.auth_ldap_group_admin ?? '',
    auth_ldap_group_viewer: next.auth_ldap_group_viewer ?? currentSettings.auth_ldap_group_viewer ?? '',
    auth_radius_host: next.auth_radius_host ?? currentSettings.auth_radius_host ?? '',
    auth_radius_port: next.auth_radius_port ?? currentSettings.auth_radius_port ?? 1812,
    auth_radius_secret_configured: next.auth_radius_secret_configured ?? currentSettings.auth_radius_secret_configured ?? false,
    auth_radius_role_attr: next.auth_radius_role_attr ?? currentSettings.auth_radius_role_attr ?? 'Filter-Id',
    auth_radius_admin_val: next.auth_radius_admin_val ?? currentSettings.auth_radius_admin_val ?? 'admin',
    auth_tacacs_host: next.auth_tacacs_host ?? currentSettings.auth_tacacs_host ?? '',
    auth_tacacs_port: next.auth_tacacs_port ?? currentSettings.auth_tacacs_port ?? 49,
    auth_tacacs_secret_configured: next.auth_tacacs_secret_configured ?? currentSettings.auth_tacacs_secret_configured ?? false,
    auth_tacacs_admin_priv: next.auth_tacacs_admin_priv ?? currentSettings.auth_tacacs_admin_priv ?? 15,
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
    usb_max_slots: next.usb_max_slots ?? currentSettings.usb_max_slots ?? '24',
    cpu_provision_threshold: next.cpu_provision_threshold ?? currentSettings.cpu_provision_threshold ?? '80',
    cpu_delete_threshold:    next.cpu_delete_threshold    ?? currentSettings.cpu_delete_threshold    ?? '90',
    mem_provision_threshold: next.mem_provision_threshold ?? currentSettings.mem_provision_threshold ?? '80',
    mem_delete_threshold:    next.mem_delete_threshold    ?? currentSettings.mem_delete_threshold    ?? '90',
    vm_image_1_template_id: next.vm_image_1_template_id ?? currentSettings.vm_image_1_template_id ?? '100',
    vm_image_1_template_spec: next.vm_image_1_template_spec ?? currentSettings.vm_image_1_template_spec ?? String(next.vm_image_1_template_id ?? currentSettings.vm_image_1_template_id ?? '100'),
    vm_image_2_template_id: next.vm_image_2_template_id ?? currentSettings.vm_image_2_template_id ?? '200',
    vm_image_2_template_spec: next.vm_image_2_template_spec ?? currentSettings.vm_image_2_template_spec ?? String(next.vm_image_2_template_id ?? currentSettings.vm_image_2_template_id ?? '200'),
    vm_image_1_pct: next.vm_image_1_pct ?? currentSettings.vm_image_1_pct ?? '50',
    usb_auto_provision: next.usb_auto_provision ?? currentSettings.usb_auto_provision ?? 'off',
    usb_ignored_vidpids: next.usb_ignored_vidpids ?? currentSettings.usb_ignored_vidpids ?? '[]',
    ignored_hostnames: next.ignored_hostnames ?? currentSettings.ignored_hostnames ?? '["sim-rpi-0000"]',
    vm_silent_timeout: next.vm_silent_timeout ?? currentSettings.vm_silent_timeout ?? '24',
    reclone_schedule_enabled: next.reclone_schedule_enabled ?? currentSettings.reclone_schedule_enabled ?? 'off',
    reclone_schedule_cron: next.reclone_schedule_cron ?? currentSettings.reclone_schedule_cron ?? 'sunday 02:00',
    reclone_concurrency: next.reclone_concurrency ?? currentSettings.reclone_concurrency ?? '1',
    protected_vmids: next.protected_vmids ?? currentSettings.protected_vmids ?? '',
    l1_vlan_start: next.l1_vlan_start ?? currentSettings.l1_vlan_start ?? '100',
    l1_vlan_end: next.l1_vlan_end ?? currentSettings.l1_vlan_end ?? '199',
    guest_agent_watchdog_enabled: next.guest_agent_watchdog_enabled ?? currentSettings.guest_agent_watchdog_enabled ?? 'on',
    guest_agent_grace_minutes: next.guest_agent_grace_minutes ?? currentSettings.guest_agent_grace_minutes ?? '20',
    guest_agent_check_interval_minutes: next.guest_agent_check_interval_minutes ?? currentSettings.guest_agent_check_interval_minutes ?? '10',
    guest_agent_reboot_after_minutes: next.guest_agent_reboot_after_minutes ?? currentSettings.guest_agent_reboot_after_minutes ?? '10',
    guest_agent_reclone_after_minutes: next.guest_agent_reclone_after_minutes ?? currentSettings.guest_agent_reclone_after_minutes ?? '30',
    watchdog_reboot_enabled: next.watchdog_reboot_enabled ?? currentSettings.watchdog_reboot_enabled ?? 'on',
    proxmox_config: next.proxmox_config ?? currentSettings.proxmox_config ?? {}
  };
  currentSettings = merged;
  return merged;
}

function isCentralApiConfigured(settings = currentSettings, tokenState = null) {
  const centralApi = settings.central_api || defaultCentralApiSettings();
  const centralConfig = settings.central_config || defaultCentralConfigSettings();
  const mode = centralApi.mode === 'central' || centralConfig.api_version === 'new_central' ? 'central' : 'classic';

  if (mode === 'central') {
    const url = String(centralApi.central?.url ?? centralConfig.cluster_url ?? '').trim();
    const clientId = String(centralApi.central?.client_id ?? centralConfig.client_id ?? '').trim();
    return Boolean(url && clientId && (centralApi.central?.client_secret_configured || centralConfig.client_secret_configured));
  }

  const url = String(centralApi.classic?.url ?? centralConfig.cluster_url ?? '').trim();
  const hasCredential = Boolean(
    centralApi.classic?.password_configured
    || centralConfig.access_token_configured
    || centralConfig.refresh_token_configured
    || (tokenState && tokenState.state && tokenState.state !== 'not_configured')
  );
  return Boolean(url && hasCredential);
}

function updateCentralApiVisibility(tokenState = null) {
  const indicator = document.getElementById('central-api-status');
  if (!indicator) return;
  indicator.classList.toggle('hidden', !isCentralApiConfigured(currentSettings, tokenState));
}

function updateRelayIndicatorVisibility(settings = currentSettings) {
  const indicator = document.getElementById('relay-indicator');
  if (!indicator) return;
  indicator.classList.toggle('hidden', !String(settings.relay_server_url || '').trim());
}

function showHubManagedBanner() {
  if (!hubManagedBanner || WEBUI_MODE !== 'spoke') return;
  hubManagedBanner.classList.remove('d-none');
  const unlockBtn = document.getElementById('hub-managed-unlock-btn');
  if (unlockBtn && !unlockBtn._bound) {
    unlockBtn._bound = true;
    unlockBtn.addEventListener('click', async () => {
      if (!confirm('Revert to local control?\n\nThis clears hub_managed and your hub API key. Use this if the hub tenant was deleted or the hub is permanently unreachable.')) return;
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Reverting…';
      try {
        const res = await fetch('/api/relay/revert-local', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        showToast('✓ Reverted to local control', 'success');
      } catch (err) {
        showToast(`Failed to revert: ${err.message}`, 'error');
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Revert to Local Control';
      }
    });
  }
}

function hideHubManagedBanner() {
  if (!hubManagedBanner) return;
  hubManagedBanner.classList.add('d-none');
}

function lockSettingsInputs() {
  if (!settingsForm || WEBUI_MODE !== 'spoke') return;
  settingsForm.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.dataset.relay === 'true') return;
    el.disabled = true;
    el.classList.add('hub-locked');
  });
}

function unlockSettingsInputs() {
  if (!settingsForm) return;
  settingsForm.querySelectorAll('input, select, textarea').forEach((el) => {
    el.disabled = false;
    el.classList.remove('hub-locked');
  });
}

function setInputValueIfIdle(input, value) {
  if (input && !input.matches(':focus')) input.value = value || '';
}

function normalizeSpokeAuthProvider(provider) {
  return ['local', 'ldap', 'radius', 'tacacs'].includes(provider) ? provider : 'local';
}

function updateSpokeLoginProviderUi(provider = window.__SPOKE_AUTH_PROVIDER__ || currentSettings.auth_provider || 'local') {
  const nextProvider = normalizeSpokeAuthProvider(String(provider || 'local').trim().toLowerCase());
  const usernameGroup = document.getElementById('spoke-login-username-group');
  const usernameInput = document.getElementById('spoke-login-username');
  const subtitle = document.querySelector('#spoke-login-overlay .hub-login-subtitle');
  const needsUsername = nextProvider !== 'local';
  usernameGroup?.classList.toggle('hidden', !needsUsername);
  if (usernameInput) {
    usernameInput.required = needsUsername;
    if (!needsUsername) usernameInput.value = '';
  }
  if (subtitle) {
    subtitle.textContent = needsUsername
      ? 'Enter your username and password to continue.'
      : 'Enter the administrator password to continue.';
  }
}

function updateSpokeAuthProviderVisibility(provider = currentSettings.auth_provider || 'local') {
  const nextProvider = normalizeSpokeAuthProvider(String(provider || 'local').trim().toLowerCase());
  if (spokeAuthProviderSelect && !spokeAuthProviderSelect.matches(':focus')) {
    spokeAuthProviderSelect.value = nextProvider;
  }
  spokeAuthLdapFields?.classList.toggle('hidden', nextProvider !== 'ldap');
  spokeAuthRadiusFields?.classList.toggle('hidden', nextProvider !== 'radius');
  spokeAuthTacacsFields?.classList.toggle('hidden', nextProvider !== 'tacacs');
  updateSpokeLoginProviderUi(nextProvider);
}

function updateSpokeUserUi() {
  if (!spokeUserPill) return;
  const username = spokeCurrentUser?.username || '';
  const role = spokeCurrentUser?.role || '';
  const shouldShow = WEBUI_MODE === 'spoke' && Boolean(window.__SPOKE_AUTH_REQUIRED__ && username);
  spokeUserPill.classList.toggle('hidden', !shouldShow);
  if (spokeUserName) spokeUserName.textContent = username || '—';
  if (spokeUserRole) {
    spokeUserRole.textContent = role || '';
    spokeUserRole.classList.toggle('hidden', !role);
  }
}

function applySpokeViewerMode() {
  const isViewer = WEBUI_MODE === 'spoke' && spokeCurrentUser?.role === 'viewer';

  spokeSetupTabButtons.forEach((button) => button.classList.toggle('hidden', isViewer));
  if (isViewer && activeSpokeTab === 'setup') {
    simTabButtons[0]?.click();
  }

  // Restore tabs (no demo role on spoke)
  centralTabButtons.forEach((b) => b.classList.remove('hidden'));
  Array.from(spokeNavRoot?.querySelectorAll('.tab[data-tab="server"]') || []).forEach((b) => b.classList.remove('hidden'));

  topbarUpdateAllBtn?.classList.toggle('hidden', isViewer);
  document.getElementById('reclone-now-btn')?.classList.toggle('hidden', isViewer);
  document.getElementById('reclone-clear-btn')?.classList.toggle('hidden', isViewer);
  document.getElementById('autoprov-reset-btn')?.classList.toggle('hidden', isViewer);
  document.getElementById('vm-bulk-bar')?.classList.toggle('hidden', isViewer || activeVmCat === 'templates');
  document.querySelectorAll('.vm-action-btn').forEach((button) => {
    button.classList.toggle('hidden', isViewer);
    if (isViewer) button.disabled = true;
  });
  document.querySelectorAll('.vm-check, #server-select-all, [id^="server-th-check-"]').forEach((input) => {
    if (input instanceof HTMLInputElement && isViewer) {
      input.checked = false;
      input.disabled = true;
    }
  });
}

function applySpokeAuthSettingsToUI(settings = currentSettings) {
  if (WEBUI_MODE !== 'spoke') return;
  const provider = normalizeSpokeAuthProvider(String(settings.auth_provider || 'local').trim().toLowerCase());
  window.__SPOKE_AUTH_PROVIDER__ = provider;
  setInputValueIfIdle(spokeLdapUrlInput, settings.auth_ldap_url || '');
  setInputValueIfIdle(spokeLdapBindDnInput, settings.auth_ldap_bind_dn || '');
  if (sessionTimeoutMinutesInput && !sessionTimeoutMinutesInput.matches(':focus')) {
    sessionTimeoutMinutesInput.value = settings.session_timeout_minutes ?? 30;
  }
  setSecretInputConfigured(spokeLdapBindPasswordInput, settings.auth_ldap_bind_password_configured);
  setInputValueIfIdle(spokeLdapUserBaseInput, settings.auth_ldap_user_base || '');
  setInputValueIfIdle(spokeLdapUserFilterInput, settings.auth_ldap_user_filter || '(&(objectClass=user)(sAMAccountName={username}))');
  setInputValueIfIdle(spokeLdapGroupAdminInput, settings.auth_ldap_group_admin || '');
  setInputValueIfIdle(spokeLdapGroupViewerInput, settings.auth_ldap_group_viewer || '');
  setInputValueIfIdle(spokeRadiusHostInput, settings.auth_radius_host || '');
  if (spokeRadiusPortInput && !spokeRadiusPortInput.matches(':focus')) spokeRadiusPortInput.value = settings.auth_radius_port ?? 1812;
  setSecretInputConfigured(spokeRadiusSecretInput, settings.auth_radius_secret_configured);
  setInputValueIfIdle(spokeRadiusRoleAttrInput, settings.auth_radius_role_attr || 'Filter-Id');
  setInputValueIfIdle(spokeRadiusAdminValInput, settings.auth_radius_admin_val || 'admin');
  setInputValueIfIdle(spokeTacacsHostInput, settings.auth_tacacs_host || '');
  if (spokeTacacsPortInput && !spokeTacacsPortInput.matches(':focus')) spokeTacacsPortInput.value = settings.auth_tacacs_port ?? 49;
  setSecretInputConfigured(spokeTacacsSecretInput, settings.auth_tacacs_secret_configured);
  if (spokeTacacsAdminPrivInput && !spokeTacacsAdminPrivInput.matches(':focus')) spokeTacacsAdminPrivInput.value = settings.auth_tacacs_admin_priv ?? 15;
  updateSpokeAuthProviderVisibility(provider);
}

async function loadSpokeAuthSettings(settingsData = null) {
  if (WEBUI_MODE !== 'spoke') return settingsData || null;
  const settings = settingsData || await requestJson('/api/settings');
  applySpokeAuthSettingsToUI(mergeSettings(settings || {}));
  return settings;
}

async function saveSpokeAuthSettings() {
  const provider = normalizeSpokeAuthProvider(String(spokeAuthProviderSelect?.value || currentSettings.auth_provider || 'local').trim().toLowerCase());
  const sessionTimeoutMinutes = Number.parseInt(sessionTimeoutMinutesInput?.value || currentSettings.session_timeout_minutes || 30, 10);
  if (!Number.isFinite(sessionTimeoutMinutes) || sessionTimeoutMinutes < 5 || sessionTimeoutMinutes > 1440) {
    const error = new Error('Session timeout must be between 5 and 1440 minutes.');
    error.handled = true;
    showInlineMessage(spokeAuthSettingsMsg, error.message, true, 7000);
    throw error;
  }
  const payload = {
    auth_provider: provider,
    session_timeout_minutes: sessionTimeoutMinutes,
    auth_ldap_url: spokeLdapUrlInput?.value?.trim() || '',
    auth_ldap_bind_dn: spokeLdapBindDnInput?.value?.trim() || '',
    auth_ldap_user_base: spokeLdapUserBaseInput?.value?.trim() || '',
    auth_ldap_user_filter: spokeLdapUserFilterInput?.value?.trim() || '(&(objectClass=user)(sAMAccountName={username}))',
    auth_ldap_group_admin: spokeLdapGroupAdminInput?.value?.trim() || '',
    auth_ldap_group_viewer: spokeLdapGroupViewerInput?.value?.trim() || '',
    auth_radius_host: spokeRadiusHostInput?.value?.trim() || '',
    auth_radius_port: Number.parseInt(spokeRadiusPortInput?.value || currentSettings.auth_radius_port || 1812, 10) || 1812,
    auth_radius_role_attr: spokeRadiusRoleAttrInput?.value?.trim() || 'Filter-Id',
    auth_radius_admin_val: spokeRadiusAdminValInput?.value?.trim() || 'admin',
    auth_tacacs_host: spokeTacacsHostInput?.value?.trim() || '',
    auth_tacacs_port: Number.parseInt(spokeTacacsPortInput?.value || currentSettings.auth_tacacs_port || 49, 10) || 49,
    auth_tacacs_admin_priv: Number.parseInt(spokeTacacsAdminPrivInput?.value || currentSettings.auth_tacacs_admin_priv || 15, 10) || 15,
  };
  const ldapSecret = getSecretInputPayload(spokeLdapBindPasswordInput);
  if (ldapSecret.include) payload.auth_ldap_bind_password = ldapSecret.value;
  const radiusSecret = getSecretInputPayload(spokeRadiusSecretInput);
  if (radiusSecret.include) payload.auth_radius_secret = radiusSecret.value;
  const tacacsSecret = getSecretInputPayload(spokeTacacsSecretInput);
  if (tacacsSecret.include) payload.auth_tacacs_secret = tacacsSecret.value;

  const response = await requestJson('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  applySettingsToUI(response.settings || payload);
  resetSecretInput(spokeLdapBindPasswordInput);
  resetSecretInput(spokeRadiusSecretInput);
  resetSecretInput(spokeTacacsSecretInput);
  showInlineMessage(spokeAuthSettingsMsg, 'Authentication settings saved.', false, 5000);
  return response;
}

async function testSpokeAuthConnection() {
  const provider = normalizeSpokeAuthProvider(String(spokeAuthProviderSelect?.value || currentSettings.auth_provider || 'local').trim().toLowerCase());
  const response = await requestJson('/api/auth/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  showInlineMessage(spokeAuthSettingsMsg, response.detail || (response.ok ? 'Connection OK.' : 'Connection failed.'), !response.ok, 7000);
  return response;
}

async function refreshSpokeAuthState() {
  if (WEBUI_MODE !== 'spoke' || !window.__SPOKE_AUTH_REQUIRED__) {
    spokeCurrentUser = null;
    updateSpokeUserUi();
    applySpokeViewerMode();
    return null;
  }
  const response = await fetch('/api/auth/check', { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  if (data.authenticated) {
    spokeCurrentUser = {
      username: data.username || 'admin',
      role: data.role || 'admin',
      auth_provider: data.auth_provider || normalizeSpokeAuthProvider(window.__SPOKE_AUTH_PROVIDER__ || 'local'),
    };
  } else {
    spokeCurrentUser = null;
  }
  updateSpokeUserUi();
  applySpokeViewerMode();
  return data;
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
  notice.className = `app-notification settings-message ${level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'success'}`;
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

/**
 * Handle the "Reclone" action for a single VM.
 * If auto-provisioning is enabled, just delete — auto-prov will redeploy automatically,
 * avoiding a race where both reclone and auto-prov try to deploy the same client.
 * If auto-provisioning is disabled, queue the full delete+reclone.
 */
async function handleRecloneAction(vmid, entry = {}, extraArgs = {}) {
  if (currentSettings.usb_auto_provision === 'on') {
    await deleteProxmoxVm(vmid);
    showNotification(`Deleted ${describeProxmoxGuest(entry)} — auto-provisioning will redeploy`, 'info');
    scheduleProxmoxRefresh();
  } else {
    await sendProxmoxCommand('reclone_vm', vmid, extraArgs);
    showNotification(`Reclone queued for ${describeProxmoxGuest(entry)}`, 'info');
  }
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
  const hostReady = Boolean(host) && approved.some((entry) => proxmoxHostnameMatches(entry?.hostname, host));
  btn.disabled = !hostReady;
  btn.title = hostReady
    ? 'Reinstall the Proxmox host agent from GitHub and restart it'
    : 'Approve and connect the Proxmox host before updating the agent';
}

function syncGithubGatedButtons() {
  const hasToken = Boolean(currentSettings.github_token_configured);
  // Update All button
  const updateAllBtn = document.getElementById('update-all-btn');
  if (updateAllBtn && updateAllBtn.dataset.busy !== 'true') {
    updateAllBtn.disabled = !hasToken;
    updateAllBtn.title = hasToken
      ? 'Update all Proxmox agents then the WebUI server'
      : 'GitHub token required — configure it in the GitHub settings tab';
  }
  // Repo Sync button (hub command to spoke)
  const repoSyncBtn = document.querySelector('[onclick*="repo_sync"]');
  if (repoSyncBtn) {
    repoSyncBtn.disabled = !hasToken;
    repoSyncBtn.title = hasToken
      ? 'Trigger a repo sync on this spoke'
      : 'GitHub token required — configure it in the GitHub settings tab';
  }
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

async function triggerAgentUpdateForHost(hostname) {
  try {
    const url = '/api/proxmox/update-agent' + (hostname ? `?hostname=${encodeURIComponent(hostname)}` : '');
    const result = await requestJson(url, { method: 'POST' });
    showToast(`Queued agent update for ${result.target || hostname} (${result.branch || 'current branch'})`, 'info');
  } catch (e) {
    showToast('Failed to queue agent update: ' + e.message, 'error');
  }
}
window.triggerAgentUpdateForHost = triggerAgentUpdateForHost;

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
  if (clients.size) refreshClientWatchdogBadges();
  renderProxmoxApproveState(
    Array.isArray(latestProxmoxData.pending_proxmox) ? latestProxmoxData.pending_proxmox : [],
    Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : []
  );

  // Update footer agent version pill
  const agentVer = latestProxmoxData.agent_version;
  const fAgent = document.getElementById('footer-agent-version');
  if (fAgent) {
    if (agentVer) {
      fAgent.textContent = `PXMX Agent v${agentVer}`;
      fAgent.title = `Proxmox agent version: v${agentVer}`;
      fAgent.style.display = '';
    } else {
      fAgent.style.display = 'none';
    }
  }

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
  syncSpokeClientTypeFilter();

  const setEl = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  updateCmdTargetDropdown();
  if (Array.isArray(window._lastCommands)) renderCommandTable(window._lastCommands);

  // Render two-level server navigation (list view or detail view)
  const approved = Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : [];
  renderSpokeVmServerView(approved);

  // Spoke-level global stats (shown in Details sub-tab)
  setEl('detail-spoke-version', latestProxmoxData.spoke_version || '—');
  const pendingCmds = latestProxmoxData.pending_command_count;
  const pendingEl = document.getElementById('detail-pending-cmds');
  if (pendingEl) {
    pendingEl.innerHTML = pendingCmds != null
      ? (pendingCmds > 0
          ? `<span style="color:var(--accent-orange,#f39c12);font-weight:600;">${pendingCmds}</span>`
          : `<span class="muted">0</span>`)
      : `<span class="muted">—</span>`;
  }

  // Cache last_seen to localStorage so we can show accurate "X ago" after restarts
  const PROXMOX_LS_KEY = 'proxmox_last_seen';
  if (latestProxmoxData.last_seen) {
    try { localStorage.setItem(PROXMOX_LS_KEY, String(latestProxmoxData.last_seen)); } catch (_) {}
  }

  renderUsbSummary(latestProxmoxData);
  renderRecloneStatus(latestRecloneState || latestProxmoxData.reclone_state || {});
  renderAutoProvisionStatus();
  renderVhDevices(latestProxmoxData);

  // Filter VMs to the selected agent when in detail view; show all when on server list.
  const allVms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
  const vms = proxmoxServerSelected
    ? allVms.filter(v => v._agent_hostname === proxmoxServerSelected)
    : allVms;
  const autoRecoveryPending = new Set(
    Array.isArray(latestProxmoxData.auto_recovery_pending) ? latestProxmoxData.auto_recovery_pending : []
  );

  const configuredTemplateIds = getConfiguredTemplateIds(currentSettings);

  // Categorise VMs: templates → sim clients (vmid > 90000, qemu) → containers (lxc) → T3 IoT → other
  const templateVms = vms.filter((v) =>
    v.is_template === true || v.is_template === 'true' ||
    configuredTemplateIds.has(String(v.vmid))
  );
  const nonTemplateVms = vms.filter((v) => !templateVms.includes(v));
  const containerVms = nonTemplateVms.filter((v) => v.type === 'lxc');
  const qemuVms      = nonTemplateVms.filter((v) => v.type !== 'lxc');
  const simVms       = qemuVms.filter((v) => Number(v.vmid) > 90000);
  const nonSimQemu   = qemuVms.filter((v) => !simVms.includes(v));
  // T3: qemu VMs whose PCI passthrough addresses overlap with known T3 device addresses on this node
  const t3AddrSet = new Set((data.t3_pci_devices || []).map(d => String(d.id || '').toLowerCase()));
  const iotVms    = t3AddrSet.size
    ? nonSimQemu.filter(v => (v.pci_passthrough_addrs || []).some(a => t3AddrSet.has(String(a).toLowerCase())))
    : [];
  const otherVms  = nonSimQemu.filter(v => !iotVms.includes(v));

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
      const isProvisioning = vm.prov_status === 'provisioning' || vm.pending_checkin === true;
      const statusDot = isProvisioning ? '🔵' : vm.status === 'running' ? '🟢' : vm.status === 'paused' ? '🟡' : '⚫';
      const statusText = isProvisioning ? 'provisioning' : (vm.status || 'unknown');
      const memUsed  = vm.mem    ? fmtSize(Number(vm.mem)    * 1024 * 1024) : '—';
      const memTotal = vm.maxmem ? fmtSize(Number(vm.maxmem) * 1024 * 1024) : '—';
      const cpu = vm.cpu != null && !Number.isNaN(Number(vm.cpu)) ? Number(vm.cpu).toFixed(1) + '%' : '—';
      return `<tr class="vm-row-template">
        <td>${vm.vmid}</td>
        <td>${escHtml(vm.name || '—')}</td>
        <td>${cpu}</td>
        <td>${memUsed} / ${memTotal}</td>
        <td>${statusDot} ${statusText}</td>
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
    { action: 'reclone_vm',  label: '⎘',  title: currentSettings.usb_auto_provision === 'on' ? 'Reclone (delete only — auto-prov will redeploy)' : 'Reclone'  },
    { action: 'delete_vm',   label: '✕',  title: 'Delete'   },
  ];

// Build per-VM reclone status map: vmid → 'queued' | 'in_progress'
  const vmRecloneStatus = new Map();
  if (latestRecloneState?.status === 'running') {
    (latestRecloneState.log || []).forEach((e) => {
      if (e.status === 'queued' || e.status === 'in_progress') {
        vmRecloneStatus.set(Number(e.vmid), e.status);
      }
    });
    if (latestRecloneState.current_vm != null) {
      const cid = Number(latestRecloneState.current_vm);
      if (!vmRecloneStatus.has(cid)) vmRecloneStatus.set(cid, 'in_progress');
    }
  }

  function _renderVmGroup(catKey, vmList) {
    const tbody  = document.getElementById(`server-vm-tbody-${catKey}`);
    const empty  = document.getElementById(`server-empty-${catKey}`);
    const thChk  = document.getElementById(`server-th-check-${catKey}`);
    if (!tbody) return;

    // Sort: in-flight states first (recloning/provisioning/deleting/queued), then stopped, then running by VMID
    const statusPriority = (vm) => {
      const rLog = vmRecloneStatus.get(Number(vm.vmid));
      if (rLog === 'in_progress') return 0;
      if (rLog === 'queued') return 1;
      if (['deleting', 'provisioning', 'cloning', 'configuring'].includes(vm.status)) return 2;
      if (vm.prov_status === 'provisioning' || vm.pending_checkin === true) return 2;
      if (vm.prov_status === 'post_prov_retry') return 2;
      if (vm.prov_status === 'agent_unresponsive' || vm.prov_status === 'agent_rebooting') return 2;
      if (vm.status !== 'running') return 3;
      return 4;
    };
    const sorted = [...vmList].sort((a, b) => {
      const pa = statusPriority(a), pb = statusPriority(b);
      if (pa !== pb) return pa - pb;
      return Number(a.vmid) - Number(b.vmid);
    });

    tbody.innerHTML = '';
    if (thChk) { thChk.disabled = sorted.length === 0; thChk.checked = false; }
    if (empty) empty.style.display = sorted.length ? 'none' : '';
    if (!sorted.length) return;

    sorted.forEach((vm) => {
      const recloneLog   = vmRecloneStatus.get(Number(vm.vmid));
      const isDeleting   = vm.status === 'deleting';
      const isWebui      = webuiVmid != null && Number(vm.vmid) === webuiVmid;
      const isProvisioning = vm.prov_status === 'provisioning' || vm.pending_checkin === true;
      const baseStatusText = isDeleting
        ? '🔴 deleting…'
        : isProvisioning
        ? '🟡 provisioning…'
        : `${vm.status === 'running' ? '🟢' : vm.status === 'paused' ? '🟡' : '⚫'} ${vm.status || 'unknown'}`;
      let statusLabel;
      if (recloneLog === 'in_progress')                  statusLabel = '🔄 recloning…';
      else if (recloneLog === 'queued')                  statusLabel = '⏳ queued';
      else if (vm.status === 'cloning')                  statusLabel = '🟡 cloning…';
      else if (vm.status === 'configuring')              statusLabel = '🟡 configuring…';
      else if (vm.prov_status === 'post_prov_retry')     statusLabel = '🔁 retrying…';
      else if (vm.prov_status === 'agent_rebooting')     statusLabel = '🔄 agent rebooting…';
      else if (vm.prov_status === 'agent_unresponsive')  statusLabel = '⚠️ agent down';
      else                                               statusLabel = baseStatusText;
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

      const recloneSupported = vm.reclone_supported !== false && !isWebui && !isDeleting;
      const recloneReason = isWebui
        ? 'Cannot reclone the container running this service'
        : isDeleting
        ? 'VM is being deleted'
        : (vm.reclone_reason || 'This guest cannot be recloned from the current configuration');
      const actionBtns = VM_ACTIONS.map((a) => {
        if (isDeleting) {
          return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" disabled title="VM is being deleted">${a.label}</button>`;
        }
        if (a.action === 'delete_vm' && isWebui) {
          return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" disabled title="Cannot delete the container running this service">${a.label}</button>`;
        }
        if (a.action === 'reclone_vm' && !recloneSupported) {
          return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" disabled title="${escHtml(recloneReason)}">${a.label}</button>`;
        }
        return `<button class="btn-icon vm-action-btn" data-action="${a.action}" data-vmid="${vm.vmid}" title="${a.title}">${a.label}</button>`;
      }).join(' ');

      const consoleBtn = (vm.status === 'running' && !isDeleting)
        ? `<button class="btn-icon vm-console-btn" data-vmid="${vm.vmid}" data-vmtype="${vm.type || 'qemu'}" title="Open VNC Console" style="color:#4fc3f7;">⎕</button>`
        : `<button class="btn-icon" disabled title="${isDeleting ? 'VM is being deleted' : 'VM must be running to open console'}" style="opacity:0.3;">⎕</button>`;

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
        <td>${actionBtns} ${consoleBtn}</td>
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
          if (btn.dataset.action === 'reclone_vm') {
            await handleRecloneAction(btn.dataset.vmid, entry, {
              type: row?.dataset.vmType || 'qemu',
              source_vmid: row?.dataset.recloneSourceVmid ? parseInt(row.dataset.recloneSourceVmid, 10) : undefined,
            });
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

    tbody.querySelectorAll('.vm-console-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vmid = btn.dataset.vmid;
        const vmtype = btn.dataset.vmtype || 'qemu';
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const res = await requestJson(`/api/proxmox/console/${encodeURIComponent(vmid)}?vmtype=${encodeURIComponent(vmtype)}`, { method: 'POST' });
          window.open(`/console?session_id=${encodeURIComponent(res.session_id)}`, '_blank');
        } catch (err) {
          showNotification(`Console error: ${err.message}`, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = '⎕';
        }
      });
    });
    if (thChk && !thChk._vmBound) {
      thChk._vmBound = true;
      thChk.addEventListener('change', (e) => {
        tbody.querySelectorAll('.vm-check:not([disabled])').forEach((cb) => { cb.checked = e.target.checked; });
        const sa = document.getElementById('server-select-all');
        if (sa) sa.checked = e.target.checked;
      });
    }
  }

  // Snapshot checked VM IDs before rebuild so WS-driven re-renders don't clear selections
  const _checkedVmids = new Set(
    [...document.querySelectorAll('.vm-check:checked')].map((cb) => cb.dataset.vmid)
  );
  const _selectAllWasChecked = document.getElementById('server-select-all')?.checked ?? false;

  _renderVmGroup('sim', simVms);
  _renderVmGroup('other', otherVms);
  _renderVmGroup('containers', containerVms);

  // Populate IoT (T3) and Other subtab tables
  const _vmStatusDot = (s) => `<span class="status-dot ${s === 'running' ? 'online' : 'offline'}" title="${escHtml(s)}"></span> ${escHtml(s)}`;
  const _t3Tbody = document.getElementById('server-t3-vm-tbody');
  if (_t3Tbody) {
    _t3Tbody.innerHTML = iotVms.length
      ? iotVms.map(v => `<tr>
          <td>${escHtml(String(v.vmid))}</td>
          <td>${escHtml(v.name || '—')}</td>
          <td>${escHtml(v.type || 'qemu')}</td>
          <td>${_vmStatusDot(v.status || 'unknown')}</td>
          <td>${escHtml((v.pci_passthrough_addrs || []).join(', ') || '—')}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty-state">No IoT (T3) devices detected on this node.</td></tr>`;
  }
  // Update T3 subtab badge
  document.querySelectorAll('.server-subtab[data-subtab="server-t3"]').forEach(btn => {
    btn.innerHTML = `IoT (T3) <span class="badge-count">${iotVms.length}</span>`;
  });

  const _otherAll = [...otherVms, ...containerVms];
  const _otherTbody = document.getElementById('server-other-vm-tbody');
  if (_otherTbody) {
    _otherTbody.innerHTML = _otherAll.length
      ? _otherAll.map(v => `<tr>
          <td style="white-space:nowrap">${escHtml(String(v.vmid))}</td>
          <td>${escHtml(v.name || '—')}</td>
          <td style="white-space:nowrap">${escHtml(v.type || 'qemu')}</td>
          <td style="white-space:nowrap">${_vmStatusDot(v.status || 'unknown')}</td>
          <td></td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty-state">No other VMs or containers.</td></tr>`;
  }
  // Update Other subtab badge
  document.querySelectorAll('.server-subtab[data-subtab="server-other"]').forEach(btn => {
    btn.innerHTML = `Other <span class="badge-count">${_otherAll.length}</span>`;
  });

  // Restore checked state preserved from before the rebuild
  if (_checkedVmids.size) {
    ['sim', 'other', 'containers'].forEach((cat) => {
      const tbody = document.getElementById(`server-vm-tbody-${cat}`);
      if (!tbody) return;
      let allChecked = true;
      const boxes = [...tbody.querySelectorAll('.vm-check:not([disabled])')];
      boxes.forEach((cb) => {
        if (_checkedVmids.has(cb.dataset.vmid)) {
          cb.checked = true;
        } else {
          allChecked = false;
        }
      });
      // Sync per-category th-check
      const thChk = document.getElementById(`server-th-check-${cat}`);
      if (thChk && boxes.length) thChk.checked = allChecked && boxes.some((b) => b.checked);
    });

    // Restore global select-all checkbox
    const selectAll = document.getElementById('server-select-all');
    if (selectAll) {
      const allBoxes = [...document.querySelectorAll('.vm-check:not([disabled])')];
      selectAll.checked = allBoxes.length > 0 && allBoxes.every((cb) => cb.checked);
    }
  } else {
    // Nothing was checked — reset to clean state
    const selectAll = document.getElementById('server-select-all');
    if (selectAll) selectAll.checked = false;
  }
  applySpokeViewerMode();
}

function renderProxmoxApproveState(pending, approved) {
  const extraCard = document.getElementById('proxmox-extra-pending');
  const extraList = document.getElementById('proxmox-extra-pending-list');
  const extraCount = document.getElementById('proxmox-extra-pending-count');
  if (!extraCard || !extraList) return;

  if (extraCount) extraCount.textContent = String(pending.length);
  if (pending.length) {
    extraCard.classList.remove('hidden');
    extraList.innerHTML = pending.map((a) => {
      const enc = encodeURIComponent(String(a.hostname || ''));
      return `<strong>${escHtml(a.hostname)}</strong> `
        + `<button class="btn btn-primary" style="font-size:11px;padding:2px 8px;" onclick="approveProxmoxAgent(decodeURIComponent('${enc}')).then(()=>loadPxServersList())">Approve</button> `;
    }).join(' &nbsp; ');
  } else {
    extraCard.classList.add('hidden');
    extraList.innerHTML = '';
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
window.approveProxmoxAgent = approveProxmoxAgent;

async function rejectProxmoxAgent(hostname) {
  await requestJson(`/api/proxmox/reject/${encodeURIComponent(hostname)}`, { method: 'POST' });
}
window.rejectProxmoxAgent = rejectProxmoxAgent;

async function revokeProxmoxAgent(hostname) {
  if (!confirm(`Revoke key for ${hostname}?`)) return;
  await requestJson(`/api/proxmox/approved/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
  loadProxmoxApproved().catch(() => {});
}
window.revokeProxmoxAgent = revokeProxmoxAgent;

async function loadProxmoxApproved() {
  const approved = await requestJson('/api/proxmox/approved');
  renderProxmoxApproved(Array.isArray(approved) ? approved : []);
}

// ── Proxmox Servers list (Setup → Proxmox) ────────────────────────────────────

async function loadPxServersList() {
  try {
    const [approved, pending] = await Promise.all([
      requestJson('/api/proxmox/approved'),
      requestJson('/api/proxmox/pending'),
    ]);
    renderPxServersList(
      Array.isArray(approved) ? approved : [],
      Array.isArray(pending) ? pending : []
    );
  } catch (_) { /* non-fatal */ }
}
window.loadPxServersList = loadPxServersList;

function _fmtRelTime(ts) {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function renderPxServersList(approved, pending) {
  const tbody = document.getElementById('px-servers-tbody');
  const pendingTbody = document.getElementById('px-pending-tbody');
  if (!tbody || !pendingTbody) return;

  // Approved servers table
  if (approved.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No approved servers yet.</td></tr>';
  } else {
    tbody.innerHTML = approved.map((s) => {
      const connected = s.connected;
      const dot = connected
        ? '<span class="status-dot online" title="Connected"></span>'
        : '<span class="status-dot offline" title="Offline"></span>';
      const enc = encodeURIComponent(String(s.hostname || ''));
      return `<tr>
        <td style="text-align:center;">${dot}</td>
        <td><strong>${escHtml(s.hostname)}</strong></td>
        <td>${escHtml(s.pve_version || '—')}</td>
        <td>${escHtml(s.agent_version || '—')}</td>
        <td>${s.vm_count ?? '—'}</td>
        <td>${_fmtRelTime(s.last_seen)}</td>
        <td>
          <button class="btn btn-danger btn-small" onclick="revokeProxmoxAgent(decodeURIComponent('${enc}'))">Remove</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Pending agents table
  if (pending.length === 0) {
    pendingTbody.innerHTML = '<tr><td colspan="4" class="empty-state">No pending agents.</td></tr>';
  } else {
    pendingTbody.innerHTML = pending.map((p) => {
      const enc = encodeURIComponent(String(p.hostname || ''));
      return `<tr>
        <td><strong>${escHtml(p.hostname)}</strong></td>
        <td>${escHtml(p.ip || '—')}</td>
        <td>${_fmtRelTime(p.first_seen)}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-small" onclick="approveProxmoxAgent(decodeURIComponent('${enc}')).then(()=>loadPxServersList())">Approve</button>
          <button class="btn btn-danger btn-small" onclick="rejectProxmoxAgent(decodeURIComponent('${enc}')).then(()=>loadPxServersList())">Reject</button>
        </td>
      </tr>`;
    }).join('');
  }
}

// ── Spoke VM Server two-level navigation ──────────────────────────────────────

/**
 * Top-level router: shows the server card list or the per-agent detail view
 * depending on whether an agent has been selected.
 */
function refreshProxmoxTokenCard(hostname) {
  const tokenInput = document.getElementById('server-proxmox-api-token-input');
  const tokenSaveBtn = document.getElementById('server-proxmox-api-token-save-btn');
  const tokenAutoprovBtn = document.getElementById('server-proxmox-api-token-autoprov-btn');
  const tokenStatus = document.getElementById('server-proxmox-token-status');
  if (!tokenStatus) return;

  if (!hostname) {
    tokenStatus.textContent = 'Select a server to manage its API token.';
  } else {
    tokenStatus.textContent = '⏳ Loading token status…';
    requestJson(`/api/proxmox/token/${encodeURIComponent(hostname)}`)
      .then(data => {
        const liveStatus = document.getElementById('server-proxmox-token-status');
        if (!liveStatus) return;
        if (data.configured) {
          liveStatus.textContent = `✅ API token configured for ${hostname}.`;
        } else if (data.global_configured) {
          liveStatus.textContent = '⚠️ No per-host token — using global fallback token.';
        } else {
          liveStatus.textContent = '⚠️ No API token saved — VNC console sessions will fail.';
        }
      })
      .catch(() => {
        const liveStatus = document.getElementById('server-proxmox-token-status');
        if (liveStatus) liveStatus.textContent = '⚠️ Could not load token status.';
      });
  }

  if (tokenSaveBtn && tokenInput) {
    const newSaveBtn = tokenSaveBtn.cloneNode(true);
    tokenSaveBtn.replaceWith(newSaveBtn);
    newSaveBtn.addEventListener('click', async () => {
      const token = (document.getElementById('server-proxmox-api-token-input')?.value || '').trim();
      const liveStatus = document.getElementById('server-proxmox-token-status');
      if (!token) { if (liveStatus) liveStatus.textContent = 'Enter a token first.'; return; }
      if (!hostname) { if (liveStatus) liveStatus.textContent = 'No server selected.'; return; }
      newSaveBtn.disabled = true;
      newSaveBtn.textContent = 'Saving…';
      try {
        await requestJson(`/api/proxmox/token/${encodeURIComponent(hostname)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proxmox_token: token }),
        });
        if (liveStatus) liveStatus.textContent = `✅ API token saved for ${hostname}.`;
        const input = document.getElementById('server-proxmox-api-token-input');
        if (input) input.value = '';
      } catch (err) {
        if (liveStatus) liveStatus.textContent = `Error: ${err.message}`;
      } finally {
        newSaveBtn.disabled = false;
        newSaveBtn.textContent = 'Save Token';
      }
    });
  }

  if (tokenAutoprovBtn) {
    const newAutoprovBtn = tokenAutoprovBtn.cloneNode(true);
    tokenAutoprovBtn.replaceWith(newAutoprovBtn);
    newAutoprovBtn.addEventListener('click', async () => {
      const liveStatus = document.getElementById('server-proxmox-token-status');
      if (!hostname) { if (liveStatus) liveStatus.textContent = 'No server selected.'; return; }
      newAutoprovBtn.disabled = true;
      newAutoprovBtn.textContent = '⏳ Provisioning…';
      if (liveStatus) liveStatus.textContent = `⏳ Creating Proxmox API token via pvesh on ${hostname}…`;
      try {
        await requestJson(`/api/proxmox/token/${encodeURIComponent(hostname)}/auto-provision`, {
          method: 'POST',
        });
        if (liveStatus) liveStatus.textContent = `✅ API token auto-provisioned (root@pam!cs-hub) for ${hostname}.`;
      } catch (err) {
        if (liveStatus) liveStatus.textContent = `❌ Auto-provision failed: ${err.message}`;
      } finally {
        newAutoprovBtn.disabled = false;
        newAutoprovBtn.textContent = '⚙ Auto-provision';
      }
    });
  }
}

function vmSetRangeFor(n) {
  const vmSet = Math.max(1, parseInt(n, 10) || 1);
  const stride = Math.max(1, parseInt(currentSettings?.usb_max_slots, 10) || 24);
  const start = 90000 + (vmSet - 1) * stride + 1;
  return { start, end: start + stride - 1 };
}

function parseHostnameVmSet(hostname) {
  const match = String(hostname || '').match(/(\d+)$/);
  const vmSet = match ? parseInt(match[1], 10) : 1;
  return Number.isFinite(vmSet) && vmSet >= 1 ? vmSet : 1;
}

function vmSetOverrideOptions(currentVal) {
  const selectedVal = parseInt(currentVal, 10) || 0;
  let opts = `<option value="0"${selectedVal === 0 ? ' selected' : ''}>Auto (from hostname)</option>`;
  for (let n = 1; n <= 99; n += 1) {
    const { start, end } = vmSetRangeFor(n);
    opts += `<option value="${n}"${selectedVal === n ? ' selected' : ''}>VM Set ${n} (${start}–${end})</option>`;
  }
  return opts;
}

function proxmoxVmSetInfo(srv = {}) {
  const hostname = String(srv.hostname || '');
  const hostConfig = (currentSettings.proxmox_config && currentSettings.proxmox_config[hostname]) || {};
  const override = parseInt(srv.vm_set_override ?? hostConfig.vm_set_override ?? 0, 10) || 0;
  let effectiveVmSet = parseInt(srv.effective_vm_set, 10);
  if (!Number.isFinite(effectiveVmSet) || effectiveVmSet < 1) {
    effectiveVmSet = override || parseHostnameVmSet(hostname);
  }
  const range = (srv.vmid_range && Number.isFinite(Number(srv.vmid_range.start)) && Number.isFinite(Number(srv.vmid_range.end)))
    ? { start: Number(srv.vmid_range.start), end: Number(srv.vmid_range.end) }
    : vmSetRangeFor(effectiveVmSet);
  return { override, effectiveVmSet, range };
}

async function saveProxmoxVmSetOverride(hostname, vmSetOverride) {
  const result = await requestJson(`/api/proxmox/config/${encodeURIComponent(hostname)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_set_override: vmSetOverride }),
  });
  const nextConfig = { ...(currentSettings.proxmox_config || {}) };
  if (result.vm_set_override) {
    nextConfig[hostname] = { ...(nextConfig[hostname] || {}), vm_set_override: result.vm_set_override };
  } else {
    delete nextConfig[hostname];
  }
  currentSettings.proxmox_config = nextConfig;
  const approved = Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : [];
  const target = approved.find((srv) => String(srv.hostname || '') === hostname);
  if (target) target.vm_set_override = result.vm_set_override || 0;
  renderSpokeVmServerView(approved);
  scheduleProxmoxRefresh(500);
  return result;
}

function bindVmSetOverrideSelects() {
  document.querySelectorAll('.vm-set-override-select').forEach((select) => {
    ['click', 'mousedown', 'keydown'].forEach((eventName) => {
      select.addEventListener(eventName, (event) => event.stopPropagation());
    });
    select.addEventListener('change', async (event) => {
      const el = event.currentTarget;
      const hostname = el.dataset.hostname || '';
      const vmSetOverride = parseInt(el.value, 10) || 0;
      const previous = parseInt(el.dataset.previous || '0', 10) || 0;
      el.disabled = true;
      try {
        await saveProxmoxVmSetOverride(hostname, vmSetOverride);
        showToast(`Saved VM set override for ${hostname}: ${vmSetOverride || 'Auto'}`, 'success');
      } catch (error) {
        el.value = String(previous);
        showToast(`Failed to save VM set override: ${error.message}`, 'error');
      } finally {
        el.disabled = false;
      }
    });
  });
}

function renderSpokeVmServerView(approved) {
  const listView   = document.getElementById('server-list-view');
  const detailView = document.getElementById('server-detail-view');
  if (!listView || !detailView) return;

  if (proxmoxServerSelected) {
    listView.style.display   = 'none';
    detailView.style.display = '';
    refreshProxmoxTokenCard(proxmoxServerSelected);

    // Update breadcrumb header for the selected agent
    const agent = (approved || []).find(a => a.hostname === proxmoxServerSelected);
    const nameEl   = document.getElementById('server-detail-hostname');
    const statusEl = document.getElementById('server-detail-status-pill');
    const vmEl     = document.getElementById('server-detail-vm-pill');
    const usbEl    = document.getElementById('server-detail-usb-pill');
    if (nameEl)   nameEl.textContent   = proxmoxServerSelected;
    if (statusEl) {
      statusEl.className   = `stat-pill ${agent?.connected ? 'online' : 'offline'}`;
      statusEl.textContent = agent?.connected ? 'Online' : 'Offline';
    }
    if (vmEl)     vmEl.textContent     = `${agent?.vm_count ?? 0} VMs`;
    if (usbEl)    usbEl.textContent    = `${agent?.usb_count ?? 0} USB`;

    // Wire back button once
    const backBtn = document.getElementById('server-back-btn');
    if (backBtn && !backBtn._bound) {
      backBtn.addEventListener('click', () => {
        proxmoxServerSelected = null;
        renderSpokeVmServerView(
          Array.isArray(latestProxmoxData.approved_proxmox) ? latestProxmoxData.approved_proxmox : []
        );
      });
      backBtn._bound = true;
    }

    // Show only this agent's card in the Details sub-tab
    renderProxmoxServerCards(agent ? [agent] : []);
  } else {
    listView.style.display   = '';
    detailView.style.display = 'none';
    // Button lives in the list-view toolbar — show/hide based on role
    const deleteAllBtn = document.getElementById('server-delete-all-sim');
    if (deleteAllBtn) deleteAllBtn.style.display = spokeCurrentUser?.role === 'viewer' ? 'none' : '';
    renderSpokeServerList(approved);
  }
}

/**
 * Renders the server selection cards in the list view.
 * Mirrors the hub's renderHubVmServer spoke-card grid.
 */
function renderSpokeServerList(approved) {
  const container = document.getElementById('pxagent-server-cards');
  if (!container) return;

  // Update summary pills
  const hostCount  = approved ? approved.length : 0;
  const totalVMs   = (approved || []).reduce((s, h) => s + Number(h.vm_count  || 0), 0);
  const totalUSB   = (approved || []).reduce((s, h) => s + Number(h.usb_count || 0), 0);
  const clientCnt  = clients.size;
  const hostsPill   = document.getElementById('spoke-vm-hosts-pill');
  const vmsPill     = document.getElementById('spoke-vm-vms-pill');
  const usbPill     = document.getElementById('spoke-vm-usb-pill');
  const clientsPill = document.getElementById('spoke-vm-clients-pill');
  if (hostsPill)   hostsPill.textContent   = `${hostCount} host${hostCount === 1 ? '' : 's'}`;
  if (vmsPill)     vmsPill.textContent     = `${totalVMs} VM${totalVMs === 1 ? '' : 's'}`;
  if (usbPill)     usbPill.textContent     = `${totalUSB} USB`;
  if (clientsPill) clientsPill.textContent = `${clientCnt} client${clientCnt === 1 ? '' : 's'}`;

  if (!approved || approved.length === 0) {
    container.innerHTML = '<div class="empty-state">No Proxmox agents approved. Go to Setup → Proxmox to approve an agent.</div>';
    return;
  }

  container.innerHTML = approved.map(srv => {
    const node    = srv.node || {};
    const online  = srv.connected;
    const cpuPill = node.cpu_percent != null
      ? `<span class="server-stat-pill" title="Current CPU">📊 CPU: ${Number(node.cpu_percent).toFixed(1)}%</span>`
      : '';
    const ramUsed  = node.mem_used_kb  ? fmtSizeKB(node.mem_used_kb)  : null;
    const ramTotal = node.mem_total_kb ? fmtSizeKB(node.mem_total_kb) : null;
    const ramPill  = ramUsed && ramTotal
      ? `<span class="server-stat-pill" title="RAM">📊 Mem: ${ramUsed} / ${ramTotal}</span>`
      : '';
    const vmSetInfo = proxmoxVmSetInfo(srv);
    const bucketSummary = `VMIDs ${vmSetInfo.range.start}–${vmSetInfo.range.end} · Effective VM set ${vmSetInfo.effectiveVmSet}`;
    const bucketControl = `<label style="display:inline-flex;align-items:center;gap:6px;margin-left:auto;" title="Override the VM set (VMID block) assigned to this Proxmox host"><span style="font-size:12px;color:var(--muted);">VM Set Override</span><select class="form-input vm-set-override-select" data-hostname="${escHtml(srv.hostname || '')}" data-previous="${vmSetInfo.override}" style="min-width:220px;font-size:12px;padding:4px 8px;">${vmSetOverrideOptions(vmSetInfo.override)}</select></label>`;
    const ph = srv.provision_halt;
    const throttlePill = (currentSettings.usb_auto_provision === 'on' && ph && ph.halted) ? (() => {
      const reason = ph.reason === 'cpu'
        ? `CPU ${ph.cpu_pct ?? '?'}% ≥ ${ph.cpu_threshold ?? 80}% threshold`
        : `Memory ${ph.mem_pct ?? '?'}% ≥ ${ph.mem_threshold ?? 80}% threshold`;
      return `<span class="server-stat-pill" style="color:var(--warning,#f59e0b);font-weight:600;" title="Auto-provisioning throttled: ${escHtml(reason)}">⏸ Auto-Provisioning Throttled</span>`;
    })() : '';
    return `
      <div class="setup-card hub-vmserver-spoke-card" role="button" tabindex="0"
           data-hostname="${escHtml(srv.hostname || '')}" style="cursor:pointer;">
        <div class="panel-header">
          <span class="server-node-name" style="min-width:180px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(srv.hostname || '')}">${escHtml(srv.hostname || 'Unknown')}</span>
          <span class="stat-pill ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
          <span class="stat-pill">${srv.vm_count ?? 0} VMs</span>
          <span class="stat-pill">${srv.usb_count ?? 0} USB</span>
          ${cpuPill}${ramPill}${throttlePill}
          <span class="stat-pill" style="margin-left:auto;">Click to open →</span>
        </div>
        <div style="padding:8px 16px;font-size:0.82rem;color:var(--muted);display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
          <span>Agent ${escHtml(srv.agent_version || '—')} &nbsp;·&nbsp; PVE ${escHtml(srv.pve_version || '—')} &nbsp;·&nbsp; ${online ? '🟢 Proxmox connected' : '⚫ Agent not reporting'}</span>
          <span>${escHtml(bucketSummary)}</span>
          ${bucketControl}
        </div>
      </div>`;
  }).join('');

  bindVmSetOverrideSelects();

  container.querySelectorAll('.hub-vmserver-spoke-card').forEach(card => {
    const openCard = () => {
      proxmoxServerSelected = card.dataset.hostname;
      renderSpokeVmServerView(approved);
    };
    card.addEventListener('click', openCard);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openCard(); });
  });
}

function renderProxmoxServerCards(approved) {
  const container = document.getElementById('proxmox-server-cards');
  if (!container) return;

  if (!approved || approved.length === 0) {
    container.innerHTML = '<div class="setup-card setup-section-gap" style="text-align:center;color:var(--muted);padding:32px;">No Proxmox agents approved. Go to Setup → Proxmox to approve an agent.</div>';
    return;
  }

  const networkTypes = new Set(['nfs', 'cifs', 'glusterfs', 'cephfs', 'rbd', 'iscsi', 'pbs']);

  container.innerHTML = approved.map((srv) => {
    const node = srv.node || {};
    const enc = encodeURIComponent(String(srv.hostname || ''));
    const dot = srv.connected
      ? '<span class="status-dot online" title="Connected" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--green,#22c55e);flex-shrink:0;"></span>'
      : '<span class="status-dot offline" title="Offline" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--danger,#ef4444);flex-shrink:0;"></span>';

    const cpuPill = node.cpu_percent != null
      ? `<span class="server-stat-pill" title="Current CPU">⚡ CPU: ${Number(node.cpu_percent).toFixed(1)}%</span>`
      : '';
    const ramUsed  = node.mem_used_kb  ? fmtSizeKB(node.mem_used_kb)  : null;
    const ramTotal = node.mem_total_kb ? fmtSizeKB(node.mem_total_kb) : null;
    const ramPill  = ramUsed && ramTotal
      ? `<span class="server-stat-pill" title="RAM">🧠 RAM: ${ramUsed} / ${ramTotal}</span>`
      : '';
    const storagePills = Array.isArray(node.storage) ? node.storage.map((s) => {
      const icon = networkTypes.has(s.type) ? '🌐' : '🗄️';
      return `<span class="server-stat-pill" title="${escHtml(s.name)} (${escHtml(s.type)})">${icon} ${escHtml(s.name)}: ${fmtSizeKB(s.used)} / ${fmtSizeKB(s.total)}</span>`;
    }).join('') : '';

    const ph = srv.provision_halt;
    const throttlePill = (currentSettings.usb_auto_provision === 'on' && ph && ph.halted) ? (() => {
      const reason = ph.reason === 'cpu'
        ? `CPU ${ph.cpu_pct ?? '?'}% ≥ ${ph.cpu_threshold ?? 80}% threshold`
        : `Memory ${ph.mem_pct ?? '?'}% ≥ ${ph.mem_threshold ?? 80}% threshold`;
      return `<span class="server-stat-pill" style="color:var(--warning,#f59e0b);font-weight:600;border-color:var(--warning,#f59e0b);" title="Auto-provisioning throttled: ${escHtml(reason)}">⏸ Auto-Provisioning Throttled</span>`;
    })() : '';

    const cpuProv = parseInt(currentSettings.cpu_provision_threshold ?? '80', 10);
    const memProv = parseInt(currentSettings.mem_provision_threshold ?? '80', 10);
    const metricColor = (v, thr) => {
      if (v == null) return '';
      if (v >= thr) return 'color:var(--danger,#ef4444);font-weight:600;';
      if (v >= thr * 0.9) return 'color:var(--warning,#f59e0b);font-weight:600;';
      return '';
    };
    const cpuAvgPill = srv.cpu_1h_avg != null
      ? `<span class="server-stat-pill" title="1-hour average CPU usage" style="${metricColor(srv.cpu_1h_avg, cpuProv)}">📊 CPU avg: ${Number(srv.cpu_1h_avg).toFixed(1)}%</span>`
      : '';
    const memAvgPill = srv.mem_1h_avg != null
      ? `<span class="server-stat-pill" title="1-hour average memory usage" style="${metricColor(srv.mem_1h_avg, memProv)}">📊 Mem avg: ${Number(srv.mem_1h_avg).toFixed(1)}%</span>`
      : '';

    const vmCount = srv.vm_count != null ? `${srv.vm_count} total` : '—';
    const lastSeen = _fmtRelTime(srv.last_seen);

    return `<div class="setup-card setup-section-gap">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;padding-top:2px;">
            ${dot}
            <h2 style="margin:0;white-space:nowrap;">${escHtml(srv.hostname || 'Unknown')}</h2>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
              ${cpuPill}${ramPill}${storagePills}
            </div>
            ${(cpuAvgPill || memAvgPill || throttlePill) ? `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">${cpuAvgPill}${memAvgPill}${throttlePill}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:stretch;gap:4px;flex-shrink:0;min-width:130px;">
          <button class="btn btn-danger btn-small" onclick="revokeProxmoxAgent(decodeURIComponent('${enc}'))">✕ Revoke Agent</button>
          <button class="btn btn-primary btn-small" onclick="triggerAgentUpdateForHost(decodeURIComponent('${enc}'))">⬆ Update Agent</button>
          <span style="font-size:11px;color:var(--muted);text-align:right;">Last seen: ${lastSeen}</span>
        </div>
      </div>
      <table class="data-table">
        <tbody>
          <tr>
            <th>Proxmox Connected</th>
            <td>${srv.connected ? '🟢 Yes' : '⚫ No'}</td>
            <th title="Version reported by the Proxmox host agent">Agent Version</th>
            <td>${escHtml(srv.agent_version || '—')}</td>
          </tr>
          <tr>
            <th title="Proxmox VE version reported by the host">PVE Version</th>
            <td>${escHtml(srv.pve_version || '—')}</td>
            <th>VMs</th>
            <td>${vmCount}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }).join('');
}

function applySettingsToUI(s) {
  const settings = mergeSettings(s);
  if (WEBUI_MODE === 'spoke') {
    if (settings.hub_managed) {
      showHubManagedBanner();
      lockSettingsInputs();
    } else {
      hideHubManagedBanner();
      unlockSettingsInputs();
    }
  }
  // Local kill switch is driven by /api/init local_kill_switch (from simulation.conf),
  // NOT from WebUI settings — the settings object never contains kill_switch.
  if (repoUrlInput) repoUrlInput.value = settings.repo_url || repoUrlInput.value;
  if (branchInput && !branchInput.matches(':focus')) branchInput.value = settings.repo_branch || '';
  if (setupActiveBranch) setupActiveBranch.textContent = settings.repo_branch || '—';
  setSecretInputConfigured(githubTokenInput, settings.github_token_configured);
  if (githubTokenStatus) githubTokenStatus.textContent = settings.github_token_configured ? '✓ Token configured' : 'Not configured';
  syncGithubGatedButtons();
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
  if (relayHubTlsVerifyInput) relayHubTlsVerifyInput.checked = settings.hub_tls_verify === 'on';
  setInputValueIfIdle(relaySpokeName, settings.relay_spoke_name || '');
  setInputValueIfIdle(relayTenantIdInput, settings.relay_tenant_id || settings.relay_tenant_hint || '');
  const spokeIdDisplay = document.getElementById('relay-spoke-id-display');
  if (spokeIdDisplay) spokeIdDisplay.textContent = settings.relay_spoke_id || '—';
  const apikeyStatus = document.getElementById('relay-apikey-status');
  if (apikeyStatus) apikeyStatus.textContent = settings.relay_api_key_configured ? '✓ Received' : 'Pending approval';
  if (adminPasswordInput && !adminPasswordInput.matches(':focus')) {
    adminPasswordInput.value = '';
  }
  if (adminPasswordInput) {
    adminPasswordInput.dataset.configured = settings.admin_password_configured ? 'true' : 'false';
    adminPasswordInput.placeholder = 'Leave blank to disable';
  }
  if (adminPasswordStatus) {
    adminPasswordStatus.textContent = settings.admin_password_configured
      ? 'Password configured. Set a new password to rotate it, or leave blank and click Save to disable login.'
      : 'Set a password to require login when accessing this dashboard. Leave blank to allow open access.';
  }
  applySpokeAuthSettingsToUI(settings);
  updateCentralApiVisibility();
  updateRelayIndicatorVisibility(settings);
  if (usbAutoProvisionInput) usbAutoProvisionInput.checked = settings.usb_auto_provision === 'on';
  if (usbMissingTimeoutInput && !usbMissingTimeoutInput.matches(':focus')) usbMissingTimeoutInput.value = settings.usb_missing_timeout ?? '60';
  if (usbMaxSlotsInput && !usbMaxSlotsInput.matches(':focus')) usbMaxSlotsInput.value = settings.usb_max_slots ?? '24';
  const cpuProvThrInput = document.getElementById('cpu-provision-threshold');
  const cpuDelThrInput  = document.getElementById('cpu-delete-threshold');
  const memProvThrInput = document.getElementById('mem-provision-threshold');
  const memDelThrInput  = document.getElementById('mem-delete-threshold');
  if (cpuProvThrInput && !cpuProvThrInput.matches(':focus')) cpuProvThrInput.value = settings.cpu_provision_threshold ?? '80';
  if (cpuDelThrInput  && !cpuDelThrInput.matches(':focus'))  cpuDelThrInput.value  = settings.cpu_delete_threshold ?? '90';
  if (memProvThrInput && !memProvThrInput.matches(':focus'))  memProvThrInput.value = settings.mem_provision_threshold ?? '80';
  if (memDelThrInput  && !memDelThrInput.matches(':focus'))   memDelThrInput.value  = settings.mem_delete_threshold ?? '90';
  if (vmImage1TemplateIdInput && !vmImage1TemplateIdInput.matches(':focus')) vmImage1TemplateIdInput.value = getTemplateSpecValue(settings, 1);
  if (vmImage2TemplateIdInput && !vmImage2TemplateIdInput.matches(':focus')) vmImage2TemplateIdInput.value = getTemplateSpecValue(settings, 2);
  updateTemplateSpecValidation();
  if (vmImage1PctInput && !vmImage1PctInput.matches(':focus')) vmImage1PctInput.value = settings.vm_image_1_pct ?? '50';
  if (vmSilentTimeoutInput && !vmSilentTimeoutInput.matches(':focus')) vmSilentTimeoutInput.value = settings.vm_silent_timeout ?? '24';
  const schedule = parseScheduleCron(settings.reclone_schedule_cron);
  if (recloneScheduleEnabledInput) recloneScheduleEnabledInput.checked = settings.reclone_schedule_enabled === 'on';
  if (recloneConcurrencyInput) recloneConcurrencyInput.value = settings.reclone_concurrency ?? '1';
  if (vmRecloneConcurrencyInput && !vmRecloneConcurrencyInput.matches(':focus')) vmRecloneConcurrencyInput.value = settings.reclone_concurrency ?? '1';
  const protectedVmidsInput = document.getElementById('protected-vmids');
  if (protectedVmidsInput && !protectedVmidsInput.matches(':focus')) protectedVmidsInput.value = settings.protected_vmids ?? '';
  if (l1VlanStartInput && !l1VlanStartInput.matches(':focus')) l1VlanStartInput.value = settings.l1_vlan_start ?? '100';
  if (l1VlanEndInput && !l1VlanEndInput.matches(':focus')) l1VlanEndInput.value = settings.l1_vlan_end ?? '199';
  const agentWatchdogEnabled = document.getElementById('guest-agent-watchdog-enabled');
  if (agentWatchdogEnabled) agentWatchdogEnabled.checked = (settings.guest_agent_watchdog_enabled ?? 'on') === 'on';
  const watchdogRebootEnabled = document.getElementById('watchdog-reboot-enabled');
  if (watchdogRebootEnabled) watchdogRebootEnabled.checked = (settings.watchdog_reboot_enabled ?? 'on') === 'on';
  const agentGrace = document.getElementById('guest-agent-grace-minutes');
  if (agentGrace && !agentGrace.matches(':focus')) agentGrace.value = settings.guest_agent_grace_minutes ?? '20';
  const agentInterval = document.getElementById('guest-agent-check-interval-minutes');
  if (agentInterval && !agentInterval.matches(':focus')) agentInterval.value = settings.guest_agent_check_interval_minutes ?? '10';
  const agentReboot = document.getElementById('guest-agent-reboot-after-minutes');
  if (agentReboot && !agentReboot.matches(':focus')) agentReboot.value = settings.guest_agent_reboot_after_minutes ?? '10';
  const agentReclone = document.getElementById('guest-agent-reclone-after-minutes');
  if (agentReclone && !agentReclone.matches(':focus')) agentReclone.value = settings.guest_agent_reclone_after_minutes ?? '30';
  if (recloneScheduleDayInput && !recloneScheduleDayInput.matches(':focus')) recloneScheduleDayInput.value = schedule.day;
  if (recloneScheduleTimeInput && !recloneScheduleTimeInput.matches(':focus')) recloneScheduleTimeInput.value = schedule.time;
  try { renderUsbVidPidTable(); } catch (_) {}
  try { renderIgnoredUsbList(); } catch (_) {}
  try { renderIgnoredHostnamesList(); } catch (_) {}
  try { renderSiteMappingsTable(); } catch (_) {}
  try { renderSelectedChecksPreview(); } catch (_) {}
  try { renderHwChecksPreview(); } catch (_) {}
  spokeCaMonitoredItems = settings.spoke_monitored_items || [];
  if ((availableChecks.alerts.length || availableChecks.insights.length) && availableChecksContainer) {
    try { renderAvailableChecks(); } catch (_) {}
  }
  try { renderCentralOverview(); } catch (_) {}
  try { if (spokeCentralBrowseData || ['central-browse-panel', 'central-alerts-panel', 'central-insights-panel', 'central-clients-panel', 'central-devices-panel'].includes(spokeCaBrowseActiveTab)) renderSpokeCaBrowseTab(); } catch (_) {}
  try { renderChecksList(); } catch (_) {} // Refresh sim tab whenever settings change (monitored checks may have changed)
  try { renderSpokeMonitoredItems(); } catch (_) {}
  try { renderUsbSummary(latestProxmoxData); } catch (_) {}
  try { renderRecloneStatus(latestRecloneState || latestProxmoxData.reclone_state || {}); } catch (_) {}
  try { renderAutoProvisionStatus(); } catch (_) {}
  if (centralSiteDetailOpen) {
    try { renderSiteClients(centralSiteDetailOpen); } catch (_) {}
    try { renderSiteChecks(centralSiteDetailOpen, centralStatusData[centralSiteDetailOpen] || {}); } catch (_) {}
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
      applySettingsToUI(response.settings || { github_token_configured: Boolean(token) });
      resetSecretInput(githubTokenInput);
      if (token) {
        if (githubTokenStatus) githubTokenStatus.textContent = '⏳ Validating token…';
        try {
          const check = await requestJson('/api/test-github');
          if (check.valid) {
            if (githubTokenStatus) githubTokenStatus.textContent = `✓ Token valid — authenticated as ${check.username}`;
            showSettingsMessage('GitHub token saved and validated.', false);
          } else {
            if (githubTokenStatus) githubTokenStatus.textContent = `✗ Token saved but invalid: ${check.error}`;
            showSettingsMessage(`Token saved but validation failed: ${check.error}`, true);
          }
        } catch {
          if (githubTokenStatus) githubTokenStatus.textContent = '✓ Token saved (validation unavailable)';
          showSettingsMessage('GitHub token saved.', false);
        }
      } else {
        showSettingsMessage('GitHub token cleared.', false);
      }
    } catch (err) {
      showSettingsMessage(`Error: ${err.message}`, true);
    }
  });
}

if (adminPasswordSaveBtn) {
  adminPasswordSaveBtn.addEventListener('click', async () => {
    const originalLabel = adminPasswordSaveBtn.textContent;
    const password = adminPasswordInput?.value?.trim() || '';
    adminPasswordSaveBtn.disabled = true;
    adminPasswordSaveBtn.textContent = 'Saving…';
    showInlineMessage(adminPasswordMsg, '', false, 0);
    try {
      const response = await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: password })
      });
      applySettingsToUI(response.settings || { admin_password_configured: Boolean(password) });
      if (adminPasswordInput) adminPasswordInput.value = '';
      showInlineMessage(
        adminPasswordMsg,
        password ? 'Dashboard password saved. Existing sessions were signed out.' : 'Dashboard password setting cleared. Existing sessions were signed out.',
        false,
        5000,
      );
    } catch (error) {
      showInlineMessage(adminPasswordMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      adminPasswordSaveBtn.disabled = false;
      adminPasswordSaveBtn.textContent = originalLabel;
    }
  });
}

if (spokeAuthProviderSelect) {
  spokeAuthProviderSelect.addEventListener('change', () => {
    updateSpokeAuthProviderVisibility(spokeAuthProviderSelect.value);
    showInlineMessage(spokeAuthSettingsMsg, '', false, 0);
  });
}

if (spokeAuthSettingsSaveBtn) {
  spokeAuthSettingsSaveBtn.addEventListener('click', async () => {
    const originalLabel = spokeAuthSettingsSaveBtn.textContent;
    spokeAuthSettingsSaveBtn.disabled = true;
    spokeAuthSettingsSaveBtn.textContent = 'Saving…';
    try {
      await saveSpokeAuthSettings();
    } catch (error) {
      if (!error?.handled) showInlineMessage(spokeAuthSettingsMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      spokeAuthSettingsSaveBtn.disabled = false;
      spokeAuthSettingsSaveBtn.textContent = originalLabel;
    }
  });
}

if (spokeAuthTestBtn) {
  spokeAuthTestBtn.addEventListener('click', async () => {
    const originalLabel = spokeAuthTestBtn.textContent;
    spokeAuthTestBtn.disabled = true;
    spokeAuthTestBtn.textContent = 'Testing…';
    try {
      await testSpokeAuthConnection();
    } catch (error) {
      showInlineMessage(spokeAuthSettingsMsg, `Error: ${error.message}`, true, 7000);
    } finally {
      spokeAuthTestBtn.disabled = false;
      spokeAuthTestBtn.textContent = originalLabel;
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

if (syncNowBtn) {
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
}

function applyVersionStatus(data) {
  // Show cs-webui frontend version (not client-sim installer version) in Setup tile
  if (versionCurrent) versionCurrent.textContent = data.cswebui_current ?? data.current_version ?? '—';
  if (versionAvailable) versionAvailable.textContent = data.cswebui_available ?? data.available_version ?? '—';
  if (versionLastChecked) versionLastChecked.textContent = data.last_checked ?? '—';

  // Show server backend (installer) version
  if (serverVersionCurrent) serverVersionCurrent.textContent = data.current_version ?? '—';
  if (serverVersionAvailable) serverVersionAvailable.textContent = data.available_version ?? '—';

  // Highlight update-server-btn when an update is available
  const updateServerBtn = document.getElementById('update-server-btn');
  if (updateServerBtn && !updateServerBtn.dataset.busy) {
    const hasUpdate = data.update_available && data.available_version && data.available_version !== data.current_version;
    updateServerBtn.classList.toggle('btn-warning', !!hasUpdate);
    updateServerBtn.title = hasUpdate
      ? `Update available: v${data.available_version} — click to install`
      : 'Pull latest server code from GitHub and restart the service';
  }

  const inProgress = !!data.update_in_progress;
  updateWasInProgress = inProgress;

  // Server update progress
  const logDetails = document.getElementById('server-update-log-details');
  const logOutput  = document.getElementById('server-update-log-output');
  if (serverUpdateMsg) {
    if (data.update_error) {
      serverUpdateMsg.textContent = `Update failed: ${data.update_error}`;
      serverUpdateMsg.className = 'settings-message error';
      serverUpdateMsg.classList.remove('hidden');
      if (logDetails && logOutput && data.update_log?.length) {
        logOutput.textContent = data.update_log.join('\n');
        logDetails.classList.remove('hidden');
        logDetails.open = true;
      }
    } else if (inProgress) {
      const lastLine = data.update_log?.length ? ` — ${data.update_log[data.update_log.length - 1]}` : '';
      serverUpdateMsg.textContent = `Installing v${data.available_version}… service will restart.${lastLine}`;
      serverUpdateMsg.className = 'settings-message success';
      serverUpdateMsg.classList.remove('hidden');
      if (logDetails && logOutput && data.update_log?.length) {
        logOutput.textContent = data.update_log.join('\n');
        logDetails.classList.remove('hidden');
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    }
  }

}

if (refreshWebuiBtn) {
  refreshWebuiBtn.addEventListener('click', async () => {
    refreshWebuiBtn.disabled = true;
    refreshWebuiBtn.textContent = '↻ Refreshing…';
    updateMsg.textContent = 'Downloading latest UI files from GitHub…';
    updateMsg.className = 'settings-message success';
    updateMsg.classList.remove('hidden');
    clearTimeout(updateMsg._timer);
    try {
      const res = await fetch('/api/refresh-webui', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      updateMsg.textContent = data.message;
      updateMsg._timer = setTimeout(() => { updateMsg.className = 'settings-message hidden'; }, 10000);
    } catch (err) {
      updateMsg.textContent = `Error: ${err.message}`;
      updateMsg.className = 'settings-message error';
      updateMsg._timer = setTimeout(() => { updateMsg.className = 'settings-message hidden'; }, 10000);
    } finally {
      refreshWebuiBtn.disabled = false;
      refreshWebuiBtn.textContent = '↻ Refresh UI Files';
    }
  });
}

// Update Server button — calls /api/self-update (no GitHub token needed)
const updateServerBtn = document.getElementById('update-server-btn');
if (updateServerBtn) {
  updateServerBtn.addEventListener('click', async () => {
    updateServerBtn.disabled = true;
    updateServerBtn.dataset.busy = 'true';
    updateServerBtn.textContent = '⬆ Checking…';
    if (serverUpdateMsg) {
      serverUpdateMsg.textContent = 'Syncing repo and checking for updates…';
      serverUpdateMsg.className = 'settings-message success';
      serverUpdateMsg.classList.remove('hidden');
    }
    try {
      const res = await fetch('/api/self-update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      if (serverUpdateMsg) {
        serverUpdateMsg.textContent = data.message;
        if (data.message?.includes('already up to date') || data.message?.includes('Already up to date')) {
          serverUpdateMsg._timer = setTimeout(() => { serverUpdateMsg.className = 'settings-message hidden'; }, 8000);
        }
      }
    } catch (err) {
      if (serverUpdateMsg) {
        serverUpdateMsg.textContent = `Error: ${err.message}`;
        serverUpdateMsg.className = 'settings-message error';
        serverUpdateMsg._timer = setTimeout(() => { serverUpdateMsg.className = 'settings-message hidden'; }, 10000);
      }
    } finally {
      updateServerBtn.disabled = false;
      delete updateServerBtn.dataset.busy;
      updateServerBtn.textContent = '⬆ Update Server';
    }
  });
}



function normalizeFlagValue(value) {
  return String(value ?? 'off').toLowerCase() === 'on' ? 'on' : 'off';
}

function formatLastSeen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function proxmoxVmForHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return null;
  const vms = Array.isArray(latestProxmoxData?.vms) ? latestProxmoxData.vms : [];
  return vms.find((vm) => String(vm?.name || '').trim().toLowerCase() === normalized) || null;
}

function spokeUsbVmids() {
  return new Set(
    (Array.isArray(latestProxmoxData?.usb_state) ? latestProxmoxData.usb_state : [])
      .map((device) => String(device?.vmid ?? '').trim())
      .filter(Boolean)
  );
}

function clientVmid(client = {}) {
  const directVmid = client?.vmid ?? client?.proxmox_vmid;
  if (directVmid != null && String(directVmid).trim() !== '') return String(directVmid).trim();
  const proxmoxVm = proxmoxVmForHostname(client?.hostname);
  const proxmoxVmid = proxmoxVm?.vmid;
  return proxmoxVmid != null && String(proxmoxVmid).trim() !== '' ? String(proxmoxVmid).trim() : '';
}

function clientIsOnline(client = {}) {
  return Boolean(client?.connected || client?.online);
}

function clientHasT3Pci(client = {}, proxmoxVm = proxmoxVmForHostname(client?.hostname)) {
  if (client?.has_t3_pci) return true;
  if (Number(client?.t3_pci_count || 0) > 0) return true;
  if (String(client?.hw_type || '').trim().toUpperCase() === 'T3') return true;
  const t3AddrSet = new Set(
    (Array.isArray(latestProxmoxData?.t3_pci_devices) ? latestProxmoxData.t3_pci_devices : [])
      .map((device) => String(device?.id || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return t3AddrSet.size > 0
    && Array.isArray(proxmoxVm?.pci_passthrough_addrs)
    && proxmoxVm.pci_passthrough_addrs.some((address) => t3AddrSet.has(String(address || '').trim().toLowerCase()));
}

function classifyClient(client = {}, usbVmids = spokeUsbVmids()) {
  const proxmoxVm = proxmoxVmForHostname(client?.hostname);
  if (clientHasT3Pci(client, proxmoxVm)) return 't3';
  if (client.has_usb != null) return client.has_usb ? 't2' : 't1';
  if (proxmoxVm?.reclone_bus_path) return 't2';
  if (Array.isArray(client?.usb_devices) && client.usb_devices.length) return 't2';
  return usbVmids.has(clientVmid(client)) ? 't2' : 't1';
}

function syncSpokeClientTypeTabs() {
  document.querySelectorAll('[data-clienttype]').forEach((button) => {
    button.classList.toggle('active', button.dataset.clienttype === clientTypeFilter);
  });
}

function updateSpokeClientTypeCounts(allClients = [...clients.values()]) {
  const usbVmids = spokeUsbVmids();
  const counts = { all: allClients.length, t1: 0, t2: 0, t3: 0 };
  allClients.forEach((client) => {
    const type = classifyClient(client, usbVmids);
    if (counts[type] !== undefined) counts[type] += 1;
  });
  const countAll = document.getElementById('client-type-count-all');
  const countT1 = document.getElementById('client-type-count-t1');
  const countT2 = document.getElementById('client-type-count-t2');
  const countT3 = document.getElementById('client-type-count-t3');
  if (countAll) countAll.textContent = String(counts.all);
  if (countT1) countT1.textContent = String(counts.t1);
  if (countT2) countT2.textContent = String(counts.t2);
  if (countT3) countT3.textContent = String(counts.t3);
  return counts;
}

function renderClientRows() {
  const container = document.getElementById('clients-sites-list');
  if (!container) return;
  syncSpokeClientTypeTabs();
  const allClients = [...clients.values()];
  const usbVmids = spokeUsbVmids();
  const counts = updateSpokeClientTypeCounts(allClients);
  const search = String(document.getElementById('clients-search')?.value || '').trim().toLowerCase();
  const statusFilter = String(document.getElementById('clients-status-filter')?.value || 'all').trim().toLowerCase();

  const filtered = allClients.filter((client) => {
    const typeMatch = clientTypeFilter === 'all' || classifyClient(client, usbVmids) === clientTypeFilter;
    const isOnline = clientIsOnline(client);
    const statusMatch = statusFilter === 'all'
      || (statusFilter === 'online' && isOnline)
      || (statusFilter === 'offline' && !isOnline);
    const haystack = [
      client.hostname,
      client.platform,
      client.connected_ssid,
      ...(Array.isArray(client.active_simulations) ? client.active_simulations : []),
    ].join(' ').toLowerCase();
    return typeMatch && statusMatch && (!search || haystack.includes(search));
  });

  filtered.sort((a, b) => {
    const onlineDiff = Number(clientIsOnline(b)) - Number(clientIsOnline(a));
    if (onlineDiff) return onlineDiff;
    return String(a.hostname || '').localeCompare(String(b.hostname || ''), undefined, { sensitivity: 'base' });
  });

  const onlineCount = filtered.filter((client) => clientIsOnline(client)).length;
  if (clientsPill) clientsPill.textContent = `${filtered.length} client${filtered.length === 1 ? '' : 's'}`;
  if (clientsOnlinePill) clientsOnlinePill.textContent = `${onlineCount} online`;
  updateClientCount(filtered.length, counts.all);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${allClients.length ? 'No clients match the current filters.' : 'No clients connected — waiting for beacons…'}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-scroll">
      <table class="data-table hub-client-site-table">
        <thead><tr>
          <th>Status</th><th>Hostname</th><th>Platform</th>
          <th style="min-width:120px;white-space:nowrap">SSID</th>
          <th style="white-space:nowrap">Last Seen</th>
          <th>Errors</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${filtered.map((client) => renderSpokeClientRows(client)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('button.client-control-btn[data-hostname]').forEach((btn) => {
    btn.addEventListener('click', () => toggleControlRow(btn.dataset.hostname));
  });
  if (openControlHost && clients.has(openControlHost)) {
    const detailCell = container.querySelector(`tr.control-row[data-hostname="${CSS.escape(openControlHost)}"] td`);
    if (detailCell) renderControlPanel(openControlHost, detailCell);
  }
}

function renderSpokeClientRows(client) {
  const isOnline = clientIsOnline(client);
  const hostname = client.hostname || '—';
  const errCount = Number(client.error_count || 0);
  const sims = Array.isArray(client.active_simulations) ? client.active_simulations : [];
  const formattedTitle = typeof fmtDate === 'function' ? fmtDate(client.last_seen) : (client.last_seen || '');
  const lastSeen = `<span title="${escHtml(formattedTitle)}">${escHtml(formatLastSeen(client.last_seen))}</span>`;
  const hasPending = clientHasPendingCheckin(hostname);
  const hostnameHtml = escHtml(hostname) + (hasPending ? ' <span class="badge bg-warning text-dark ms-1">Awaiting Check-in</span>' : '');
  const errHtml = errCount > 0
    ? `<span class="error-badge" title="${escHtml(`${errCount} error(s) — open Control to see log`)}">${errCount > 99 ? '99+' : errCount}</span>`
    : '—';
  const isOpen = openControlHost === hostname;
  const ctrlLabel = isOpen ? 'Close' : 'Control';
  const simBadgesHtml = buildSimBadgesHtml(sims);
  return `
    <tr class="client-row hub-client-main-row${isOnline ? '' : ' client-offline'}${isOpen ? ' expanded' : ''}" data-hostname="${escHtml(hostname)}">
      <td class="status-cell"><span class="status-dot ${isOnline ? 'online' : 'offline'}"></span></td>
      <td class="hostname-cell">${hostnameHtml}</td>
      <td>${escHtml(client.platform || '—')}</td>
      <td style="white-space:nowrap">${escHtml(client.connected_ssid || '—')}</td>
      <td class="nowrap-cell">${lastSeen}</td>
      <td class="error-cell">${errHtml}</td>
      <td><button type="button" class="btn btn-small client-control-btn" data-hostname="${escHtml(hostname)}">${ctrlLabel}</button></td>
    </tr>
    <tr class="hub-client-sims-row">
      <td colspan="7" class="hub-client-sims-cell">${simBadgesHtml}</td>
    </tr>
    <tr class="control-row${isOpen ? '' : ' hidden'}" data-hostname="${escHtml(hostname)}">
      <td colspan="7"></td>
    </tr>
  `;
}

function buildSimBadgesHtml(sims = []) {
  if (!sims.length) return '<span class="muted-text">— No active simulations</span>';
  return sims.map((sim) => `<span class="${escHtml(badgeClass(sim))}">${escHtml(sim)}</span>`).join(' ');
}

function syncSpokeClientTypeFilter() {
  renderClientRows();
}

function setClientTypeFilter(nextFilter = 'all') {
  clientTypeFilter = ['t1', 't2', 't3'].includes(nextFilter) ? nextFilter : 'all';
  renderClientRows();
}

function clientHasPendingCheckin(hostname) {
  return Boolean(proxmoxVmForHostname(hostname)?.pending_checkin);
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
  _updateMsgStatsCard();
}

function setCentralApiStatus(valid, tokenState) {
  updateCentralApiVisibility(tokenState);
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

function updateClientCount(visibleCount = clients.size, totalCount = clients.size) {
  if (clientCount) {
    const visible = Number.isFinite(visibleCount) ? visibleCount : clients.size;
    const total = Number.isFinite(totalCount) ? totalCount : clients.size;
    clientCount.textContent = visible !== total
      ? `${visible} / ${total} clients`
      : `${visible} client${visible === 1 ? '' : 's'}`;
  }
  const clientsPill = document.getElementById('spoke-vm-clients-pill');
  if (clientsPill) {
    const cnt = clients.size;
    clientsPill.textContent = `${cnt} client${cnt === 1 ? '' : 's'}`;
  }
}

function refreshClientWatchdogBadges() {
  Array.from(clients.values()).forEach((client) => upsertClient(client));
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
  renderClientRows();
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

function getTemplateSpecValue(settings = currentSettings, slot = 1) {
  const specKey = slot === 1 ? 'vm_image_1_template_spec' : 'vm_image_2_template_spec';
  const idKey = slot === 1 ? 'vm_image_1_template_id' : 'vm_image_2_template_id';
  if (settings && Object.prototype.hasOwnProperty.call(settings, specKey)) {
    return String(settings[specKey] ?? '').trim();
  }
  return String(settings?.[idKey] ?? (slot === 1 ? '100' : '200')).trim();
}

function parseVmidSpec(spec, label = 'Template VMIDs') {
  const normalized = String(spec ?? '').trim();
  if (!normalized) return [];
  const vmids = new Set();
  for (const rawPart of normalized.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (start > end) throw new Error(`${label}: range start must be less than or equal to end (${part})`);
      if ((end - start) > 1000) throw new Error(`${label}: range too large (${part}); max span is 1001 VMIDs`);
      for (let vmid = start; vmid <= end; vmid += 1) vmids.add(vmid);
      continue;
    }
    if (/^\d+$/.test(part)) {
      vmids.add(Number.parseInt(part, 10));
      continue;
    }
    throw new Error(`${label}: invalid token "${part}"`);
  }
  return [...vmids].sort((a, b) => a - b);
}

function getTemplateCandidateVmids(settings = currentSettings, slot = 1) {
  try {
    const spec = getTemplateSpecValue(settings, slot);
    const parsed = parseVmidSpec(spec, slot === 1 ? 'VM Image 1 Template VMIDs' : 'VM Image 2 Template VMIDs');
    if (parsed.length > 0) return parsed.map((vmid) => String(vmid));
  } catch {
    // Fall back to the primary derived template ID if an old or invalid value slips through.
  }
  const idKey = slot === 1 ? 'vm_image_1_template_id' : 'vm_image_2_template_id';
  const fallback = String(settings?.[idKey] ?? '').trim();
  return fallback ? [fallback] : [];
}

function getConfiguredTemplateIds(settings = currentSettings) {
  return new Set([
    ...getTemplateCandidateVmids(settings, 1),
    ...getTemplateCandidateVmids(settings, 2),
  ]);
}

function getTemplateSpecValidationError(spec1 = vmImage1TemplateIdInput?.value ?? getTemplateSpecValue(currentSettings, 1), spec2 = vmImage2TemplateIdInput?.value ?? getTemplateSpecValue(currentSettings, 2)) {
  let parsed1 = [];
  let parsed2 = [];
  try {
    parsed1 = parseVmidSpec(spec1, 'VM Image 1 Template VMIDs');
    parsed2 = parseVmidSpec(spec2, 'VM Image 2 Template VMIDs');
  } catch (error) {
    return error.message;
  }
  if (!parsed1.length || !parsed2.length) return '';
  const parsed2Set = new Set(parsed2);
  const overlap = parsed1.filter((vmid) => parsed2Set.has(vmid));
  if (!overlap.length) return '';
  const preview = overlap.slice(0, 5).join(', ');
  return `VM Image 1 and VM Image 2 overlap at VMID(s): ${preview}${overlap.length > 5 ? '…' : ''}`;
}

function updateTemplateSpecValidation() {
  const message = getTemplateSpecValidationError();
  [vmImage1TemplateIdInput, vmImage2TemplateIdInput].forEach((input) => {
    if (input) input.setCustomValidity(message);
  });
  if (templateVmidSpecError) {
    showInlineMessage(templateVmidSpecError, message, Boolean(message), 0);
  }
  return message;
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
    tr.innerHTML = `<td>${escHtml(device.vidpid || '—')}</td><td>${escHtml(device.type || 'wireless')}</td><td>${escHtml(device.label || '—')}</td>`;
    const actionTd = document.createElement('td');
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);
    usbVidPidTbody.appendChild(tr);
  });
}

function renderIgnoredUsbList() {
  const ignored = parseJsonList(currentSettings.usb_ignored_vidpids);

  // Render into every ignored-list container (settings panel + T2 USB tab).
  const containers = [usbIgnoredList, usbT2IgnoredList].filter(Boolean);
  containers.forEach((container) => {
    container.innerHTML = '';
    if (!ignored.length) {
      container.textContent = 'No ignored devices.';
      return;
    }
    ignored.forEach((vidpid) => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-grey';
      badge.textContent = vidpid;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = ' ✕';
      button.title = `Un-ignore ${vidpid}`;
      button.addEventListener('click', async () => {
        const current = parseJsonList(currentSettings.usb_ignored_vidpids);
        currentSettings.usb_ignored_vidpids = serializeJsonList(current.filter((item) => item !== vidpid));
        // Reset unknown fingerprint so it re-renders with restored device
        _lastUnknownUsbFp = '';
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
      container.appendChild(badge);
    });
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
  currentSettings.usb_max_slots = String(data.max_slots ?? currentSettings.usb_max_slots ?? '24');
  currentSettings.vm_image_1_template_id = String(data.image1_template_id ?? currentSettings.vm_image_1_template_id ?? '100');
  currentSettings.vm_image_1_template_spec = String(data.image1_template_spec ?? currentSettings.vm_image_1_template_spec ?? currentSettings.vm_image_1_template_id ?? '100');
  currentSettings.vm_image_2_template_id = String(data.image2_template_id ?? currentSettings.vm_image_2_template_id ?? '200');
  currentSettings.vm_image_2_template_spec = String(data.image2_template_spec ?? currentSettings.vm_image_2_template_spec ?? currentSettings.vm_image_2_template_id ?? '200');
  currentSettings.vm_image_1_pct = String(data.image1_pct ?? currentSettings.vm_image_1_pct ?? '50');
  currentSettings.usb_auto_provision = data.auto_provision || 'off';
  if (usbAutoProvisionInput) usbAutoProvisionInput.checked = currentSettings.usb_auto_provision === 'on';
  if (usbMissingTimeoutInput && !usbMissingTimeoutInput.matches(':focus')) usbMissingTimeoutInput.value = currentSettings.usb_missing_timeout;
  if (usbMaxSlotsInput && !usbMaxSlotsInput.matches(':focus')) usbMaxSlotsInput.value = currentSettings.usb_max_slots ?? '24';
  if (vmImage1TemplateIdInput && !vmImage1TemplateIdInput.matches(':focus')) vmImage1TemplateIdInput.value = getTemplateSpecValue(currentSettings, 1);
  if (vmImage2TemplateIdInput && !vmImage2TemplateIdInput.matches(':focus')) vmImage2TemplateIdInput.value = getTemplateSpecValue(currentSettings, 2);
  updateTemplateSpecValidation();
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
  const vmImage1TemplateSpec = String(vmImage1TemplateIdInput?.value ?? getTemplateSpecValue(currentSettings, 1)).trim();
  const vmImage2TemplateSpec = String(vmImage2TemplateIdInput?.value ?? getTemplateSpecValue(currentSettings, 2)).trim();
  const parsedImage1 = parseVmidSpec(vmImage1TemplateSpec, 'VM Image 1 Template VMIDs');
  const parsedImage2 = parseVmidSpec(vmImage2TemplateSpec, 'VM Image 2 Template VMIDs');
  return {
    usb_vidpids: currentSettings.usb_vidpids,
    usb_missing_timeout: String(usbMissingTimeoutInput?.value || currentSettings.usb_missing_timeout || '60'),
    usb_max_slots: String(usbMaxSlotsInput?.value || currentSettings.usb_max_slots || '24'),
    cpu_provision_threshold: String(document.getElementById('cpu-provision-threshold')?.value ?? currentSettings.cpu_provision_threshold ?? '80'),
    cpu_delete_threshold:    String(document.getElementById('cpu-delete-threshold')?.value ?? currentSettings.cpu_delete_threshold ?? '90'),
    mem_provision_threshold: String(document.getElementById('mem-provision-threshold')?.value ?? currentSettings.mem_provision_threshold ?? '80'),
    mem_delete_threshold:    String(document.getElementById('mem-delete-threshold')?.value ?? currentSettings.mem_delete_threshold ?? '90'),
    vm_image_1_template_id: String(parsedImage1[0] ?? currentSettings.vm_image_1_template_id ?? '100'),
    vm_image_1_template_spec: vmImage1TemplateSpec,
    vm_image_2_template_id: String(parsedImage2[0] ?? currentSettings.vm_image_2_template_id ?? '200'),
    vm_image_2_template_spec: vmImage2TemplateSpec,
    vm_image_1_pct: String(vmImage1PctInput?.value ?? currentSettings.vm_image_1_pct ?? '50'),
    usb_auto_provision: usbAutoProvisionInput?.checked ? 'on' : 'off',
    usb_ignored_vidpids: currentSettings.usb_ignored_vidpids,
    vm_silent_timeout: String(vmSilentTimeoutInput?.value || currentSettings.vm_silent_timeout || '24'),
    reclone_schedule_enabled: recloneScheduleEnabledInput?.checked ? 'on' : 'off',
    reclone_schedule_cron: `${recloneScheduleDayInput?.value || 'sunday'} ${recloneScheduleTimeInput?.value || '02:00'}`,
    reclone_concurrency: String(recloneConcurrencyInput?.value ?? '1'),
    protected_vmids: String(document.getElementById('protected-vmids')?.value ?? currentSettings.protected_vmids ?? ''),
    l1_vlan_start: String(l1VlanStartInput?.value ?? currentSettings.l1_vlan_start ?? '100'),
    l1_vlan_end: String(l1VlanEndInput?.value ?? currentSettings.l1_vlan_end ?? '199'),
    guest_agent_watchdog_enabled: document.getElementById('guest-agent-watchdog-enabled')?.checked ? 'on' : 'off',
    guest_agent_grace_minutes: String(document.getElementById('guest-agent-grace-minutes')?.value ?? currentSettings.guest_agent_grace_minutes ?? '20'),
    guest_agent_check_interval_minutes: String(document.getElementById('guest-agent-check-interval-minutes')?.value ?? currentSettings.guest_agent_check_interval_minutes ?? '10'),
    guest_agent_reboot_after_minutes: String(document.getElementById('guest-agent-reboot-after-minutes')?.value ?? currentSettings.guest_agent_reboot_after_minutes ?? '10'),
    guest_agent_reclone_after_minutes: String(document.getElementById('guest-agent-reclone-after-minutes')?.value ?? currentSettings.guest_agent_reclone_after_minutes ?? '30'),
    watchdog_reboot_enabled: document.getElementById('watchdog-reboot-enabled')?.checked ? 'on' : 'off',
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
  // Reset fingerprints so both tables re-render to reflect the change immediately
  _lastCertifiedUsbFp = '';
  _lastUnknownUsbFp = '';
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

async function removeCertifiedDevice(vidpid) {
  if (!vidpid) return;
  const devices = parseJsonList(currentSettings.usb_vidpids).filter((item) => item?.vidpid !== vidpid);
  currentSettings.usb_vidpids = serializeJsonList(devices);
  // Reset fingerprints so the certified table re-renders immediately
  _lastCertifiedUsbFp = '';
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectUsbSettingsPayload())
    });
    renderUsbVidPidTable();
    renderUsbSummary(latestProxmoxData);
    showNotification(`${vidpid} removed from certified devices`, 'success');
  } catch (error) {
    showNotification(`Error removing device: ${error.message}`, 'error');
  }
}

function updateUsbCountdowns() {
  document.querySelectorAll('[data-missing-until]').forEach((node) => {
    const until = Number(node.dataset.missingUntil || 0) * 1000;
    const remaining = Math.max(0, Math.floor((until - Date.now()) / 1000));
    node.textContent = remaining > 0 ? `${Math.ceil(remaining / 60)}m remaining before decommission` : 'Ready to decommission';
  });
}

// ── Unknown USB devices from spokes ───────────────────────────────────────────
// Loads the aggregate Proxmox data for all spokes and renders a table of USB
// devices that are present on spoke hardware but not yet in the certified list.
// Each row gets a "Certify" button so the admin can add it to usb_vidpids
// directly from the hub, then push to all spokes with one click.

async function loadAndRenderSpokeUnknownUsb() {
  const tbody = document.getElementById('unknown-usb-spokes-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading…</td></tr>';
  try {
    // Reuse the same aggregate/proxmox endpoint used by the VM-server tab.
    const data = await loadAggregateData('proxmox');
    const hosts = data?.hosts || [];
    renderSpokeUnknownUsbTable(hosts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:var(--text-danger);">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderSpokeUnknownUsbTable(hosts) {
  const tbody = document.getElementById('unknown-usb-spokes-tbody');
  if (!tbody) return;
  // Collect all unknown USB entries from all spokes into a flat list with spoke info attached.
  const rows = [];
  hosts.forEach((host) => {
    const unknown = host.proxmox?.unknown_usb;
    if (!Array.isArray(unknown) || !unknown.length) return; // skip spokes with no unknown devices
    unknown.forEach((device) => {
      rows.push({
        spokeName: host.spoke_name || host.spoke_id || '—',
        spokeId: host.spoke_id,
        vidpid: device.vidpid || device.vid_pid || '',
        name: device.name || device.product || device.label || '',
      });
    });
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No unknown devices reported by any spoke.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    // Build the Certify button — clicking adds this VID:PID to the hub's certified list.
    const certBtn = document.createElement('button');
    certBtn.type = 'button';
    certBtn.className = 'btn btn-secondary btn-small';
    certBtn.textContent = '+ Certify';
    certBtn.title = 'Add to Certified Devices list (then push to all spokes)';
    certBtn.addEventListener('click', async () => {
      certBtn.disabled = true;
      certBtn.textContent = '…';
      // addUnknownToCertified adds to usb_vidpids in currentSettings and saves to hub.
      await addUnknownToCertified(row.vidpid, row.name);
      // Re-render so the certified row disappears from this table immediately.
      tr.remove();
      if (!tbody.childElementCount) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No unknown devices reported by any spoke.</td></tr>';
      }
    });
    tr.innerHTML = `<td>${escHtml(row.spokeName)}</td><td>${escHtml(row.vidpid || '—')}</td><td>${escHtml(row.name || '—')}</td>`;
    const td = document.createElement('td');
    td.appendChild(certBtn);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
}

function renderVhDevices(proxmoxData = latestProxmoxData) {
  const pills = document.getElementById('vh-stat-pills');
  const list = document.getElementById('vh-device-list');
  if (!pills || !list) return;

  const vh = proxmoxData?.vh_devices || {};
  const devices = Array.isArray(vh.devices) ? vh.devices : [];
  const svcActive = vh.vh_service_active;
  const connected = vh.vh_connected;
  const autoUseAll = vh.auto_use_all;
  const count = vh.count ?? devices.length;
  const inUse = devices.filter(d => d.auto_use).length;
  const available = devices.filter(d => !d.auto_use).length;

  const svcLabel = svcActive ? '🟢 Service running' : '🔴 Service stopped';
  const autoLabel = autoUseAll ? '⚡ Auto-Use All: ON' : '⚫ Auto-Use All: OFF';
  const countLabel = count > 0
    ? `🔌 ${count} device${count !== 1 ? 's' : ''} — ${inUse} in use, ${available} available`
    : '⚫ No VH devices detected';
  pills.innerHTML = [svcLabel, autoLabel, connected ? countLabel : '⚫ Not connected to VH server']
    .map(l => `<span class="server-stat-pill">${l}</span>`).join('');

  if (!devices.length) {
    list.innerHTML = '<p class="muted" style="padding:8px 0;">No VirtualHere adapters found. Ensure the VH client service is running and connected to a server.</p>';
  } else {
    const byServer = new Map();
    devices.forEach(d => {
      const srv = d.server || 'Unknown Server';
      if (!byServer.has(srv)) byServer.set(srv, []);
      byServer.get(srv).push(d);
    });
    let html = '';
    byServer.forEach((devs, server) => {
      html += `<div style="margin-bottom:16px;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Server: ${escHtml(server)}</div>
        <table class="data-table">
          <thead><tr><th>Adapter</th><th>Address</th><th>Vendor</th><th>VID:PID</th><th>Serial</th><th>Status</th></tr></thead>
          <tbody>${devs.map(d => `<tr>
            <td><strong>${escHtml(d.name || 'Unknown')}</strong></td>
            <td><code>${escHtml(d.address || '—')}</code></td>
            <td>${escHtml(d.vendor || '—')}</td>
            <td>${d.vendor_id && d.product_id ? `<code>${escHtml(d.vendor_id)}:${escHtml(d.product_id)}</code>` : '—'}</td>
            <td><code>${escHtml(d.serial || '—')}</code></td>
            <td>${d.auto_use
              ? `<span class="badge badge-green">In Use${d.in_use_by ? ` by ${escHtml(d.in_use_by)}` : ''}</span>`
              : '<span class="badge badge-grey">Available</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`;
    });
    list.innerHTML = html;
  }
}

function renderUsbSummary(proxmoxData = latestProxmoxData) {
  latestProxmoxData = proxmoxData || latestProxmoxData;
  if (!usbSummaryPanel || !usbSummaryTbody || !unknownUsbSection || !unknownUsbTbody) return;

  const certified = parseJsonList(currentSettings.usb_vidpids);
  const allUsbState = Array.isArray(latestProxmoxData.usb_state) ? latestProxmoxData.usb_state : [];
  const allUsbQuarantine = Array.isArray(latestProxmoxData.usb_quarantine) ? latestProxmoxData.usb_quarantine : [];
  const allPresentUsb = Array.isArray(latestProxmoxData.present_usb) ? latestProxmoxData.present_usb : [];
  const allUnknownUsb = Array.isArray(latestProxmoxData.unknown_usb) ? latestProxmoxData.unknown_usb : [];

  // Compute agentVms first — VMs are always tagged with _agent_hostname so this works without server restart.
  const allVms = Array.isArray(latestProxmoxData.vms) ? latestProxmoxData.vms : [];
  const agentVms = proxmoxServerSelected
    ? allVms.filter(v => !v._agent_hostname || v._agent_hostname === proxmoxServerSelected)
    : allVms;
  const agentVmids = new Set(agentVms.map(v => String(v.vmid)));

  // When viewing a specific Proxmox server, show only that server's USB data.
  // Primary filter: _agent_hostname (available after server restart with latest server.py).
  // Fallback: match by vmid against the agent's VMs (works immediately without restart).
  const usbState = proxmoxServerSelected
    ? allUsbState.filter(e => {
        if (e._agent_hostname) return e._agent_hostname === proxmoxServerSelected;
        return e.vmid != null && agentVmids.has(String(e.vmid));
      })
    : allUsbState;
  const usbQuarantine = proxmoxServerSelected
    ? allUsbQuarantine.filter(e => !e._agent_hostname || e._agent_hostname === proxmoxServerSelected)
    : allUsbQuarantine;
  const presentUsb = proxmoxServerSelected
    ? allPresentUsb.filter(e => !e._agent_hostname || e._agent_hostname === proxmoxServerSelected)
    : allPresentUsb;
  const filteredUnknownUsb = proxmoxServerSelected
    ? allUnknownUsb.filter(e => !e._agent_hostname || e._agent_hostname === proxmoxServerSelected)
    : allUnknownUsb;

  const USB_QUARANTINE_THRESHOLD = 3;
  const missingTimeoutSeconds = (parseInt(currentSettings.usb_missing_timeout, 10) || 60) * 60;

  // Compute present bus set first so the stat pill count is accurate
  const presentBusSet = new Set(presentUsb.map((item) => String(item?.bus_path || '').trim()).filter(Boolean));

  // VMs whose dongles are missing (removed) — exclude from running count since they
  // are being torn down and no longer represent an active provisioned client
  const missingVmids = new Set(
    usbState
      .filter((item) => item.missing_since && !presentBusSet.has(String(item?.bus_path || '').trim()))
      .map((item) => Number(item.vmid))
      .filter(Boolean)
  );

  // Running VM stats pill — only count provisioned VMs with their dongles still present
  const runningVms = agentVms.filter((v) => v.status === 'running' && !v.is_template && !missingVmids.has(Number(v.vmid)));
  const usbStatPills = document.getElementById('usb-vm-stat-pills');
  if (usbStatPills) {
    const simRunning = runningVms.filter((v) => v.name && v.name.startsWith('client-sim-')).length;
    const totalRunning = runningVms.length;
    const pillHtml = `<span class="server-stat-pill" title="Running VMs with dongles present">🟢 ${totalRunning} running VM${totalRunning !== 1 ? 's' : ''}</span>`
      + (simRunning > 0 ? `<span class="server-stat-pill" title="client-sim-* VMs running">${simRunning} sim client${simRunning !== 1 ? 's' : ''}</span>` : '');
    if (usbStatPills.innerHTML !== pillHtml) usbStatPills.innerHTML = pillHtml;
  }

  // Client-side filter: remove devices that are now certified or ignored, and skip empty vidpids.
  // This prevents stale server broadcasts from restoring a device the user just acted on.
  const certifiedSet = new Set(certified.map((d) => String(d?.vidpid || '').toLowerCase()).filter(Boolean));
  const ignoredSet = new Set(parseJsonList(currentSettings.usb_ignored_vidpids).map((v) => String(v || '').toLowerCase()).filter(Boolean));
  const unknownUsb = filteredUnknownUsb
    .filter((d) => {
      const v = String(d.vidpid || '').toLowerCase().trim();
      return v && !certifiedSet.has(v) && !ignoredSet.has(v);
    });

  // ── Certified devices table ────────────────────────────────────────────────
  // Only re-render if the certified list or active-VM/available data changed.
  // Sort all arrays so fingerprint is order-independent (server may reorder between ticks).
  const certifiedFp = certified.map(d => `${d.vidpid}|${d.label}|${d.type}`).join(',')
    + '|' + [...usbState].sort((a, b) => `${a.vidpid}:${a.vmid}`.localeCompare(`${b.vidpid}:${b.vmid}`))
        .map(e => `${e.vidpid}:${e.vmid}:${e.missing_since||''}:${e.fail_count||0}:${e.quarantined_at||''}`).join(',')
    + '|' + [...presentUsb].map(p => p.vidpid).sort().join(',');

  if (certifiedFp !== _lastCertifiedUsbFp) {
    _lastCertifiedUsbFp = certifiedFp;
    usbSummaryTbody.innerHTML = '';
    certified.forEach((device) => {
    const entries = usbState.filter((item) => (item.vidpid || '').toLowerCase() === String(device.vidpid || '').toLowerCase());
    const missingEntries = entries.filter((item) => item.missing_since && !presentBusSet.has(String(item?.bus_path || '').trim()));
    const activeEntries = entries.filter((item) => !missingEntries.includes(item));
    const missing = missingEntries.length;
    const total = presentUsb.filter((item) => (item.vidpid || '').toLowerCase() === String(device.vidpid || '').toLowerCase()).length;

    // Build VM name list for active entries
    const vmMap = new Map(agentVms.map((v) => [Number(v.vmid), v]));
    const activeVmHtml = activeEntries.length === 0 ? '—' : activeEntries.map((e) => {
      const vm = vmMap.get(Number(e.vmid));
      const name = escHtml(vm?.name || `VM ${e.vmid}`);
      const dot = vm?.status === 'running' ? '🟢' : '⚫';
      const failCount = Number(e.fail_count || 0);
      const isQuarantined = !!e.quarantined_at;
      const failBadge = isQuarantined
        ? ` <span class="badge badge-red" title="Bus ${escHtml(e.bus_path||'')} quarantined — will not reprovision until cleared">🔒</span>`
        : failCount > 0
          ? ` <span class="badge badge-yellow" title="Bus ${escHtml(e.bus_path||'')} has ${failCount} failure(s) — quarantine at ${USB_QUARANTINE_THRESHOLD}">⚠️ ${failCount}</span>`
          : '';
      return `<div style="white-space:nowrap">${dot} ${name}${failBadge}</div>`;
    }).join('');

    // Look up hardware-detected name from usb_state or present_usb
    const hwName = entries.find(e => e.name)?.name
      || presentUsb.find(p => (p.vidpid || '').toLowerCase() === String(device.vidpid || '').toLowerCase())?.name
      || '';

    const tr = document.createElement('tr');
    const available = Math.max(0, total - activeEntries.length);
    const missingHtml = missing
      ? `<div class="usb-missing-list">${missingEntries.map((item) => {
          const mvm = vmMap.get(Number(item.vmid));
          const mname = escHtml(mvm?.name || `VM ${item.vmid}`);
          return `<div class="usb-missing-item">🔴 ${mname} · <span data-missing-until="${Number(item.missing_since) + missingTimeoutSeconds}"></span></div>`;
        }).join('')}</div>`
      : '—';
    const vidpidHtml = hwName
      ? `${escHtml(device.vidpid || '—')}<div class="muted" style="font-size:0.78rem;margin-top:2px;">${escHtml(hwName)}</div>`
      : escHtml(device.vidpid || '—');
    tr.innerHTML = `
      <td>${escHtml(device.label || device.vidpid || '—')}</td>
      <td>${vidpidHtml}</td>
      <td class="usb-type-${device.type || 'wireless'}">${device.type || 'wireless'}</td>
      <td>${activeVmHtml}</td>
      <td>${missingHtml}</td>
      <td>${available > 0 ? `<span class="badge badge-green">${available}</span>` : '<span class="muted">—</span>'}</td>
      <td>${total}</td>
      <td><button type="button" class="btn btn-danger btn-small" data-action="remove-certified" data-vidpid="${escHtml(device.vidpid || '')}">✕ Remove</button></td>
    `;
    usbSummaryTbody.appendChild(tr);
    });

    // Event delegation for Remove buttons
    usbSummaryTbody.onclick = (e) => {
      const btn = e.target.closest('[data-action="remove-certified"]');
      if (!btn) return;
      const vidpid = btn.dataset.vidpid;
      if (vidpid) removeCertifiedDevice(vidpid);
    };
  }

  // ── Unknown USB table ──────────────────────────────────────────────────────
  // Skip re-render if the set of unknown devices hasn't changed — prevents
  // buttons from being destroyed mid-click on every telemetry update.

  // ── Unknown USB table ──────────────────────────────────────────────────────
  // Skip re-render if the set of unknown devices hasn't changed — prevents
  // buttons from being destroyed mid-click on every telemetry update.
  const unknownFp = unknownUsb.map(d => `${d.vidpid}|${d.name||''}`).sort().join(',');
  if (unknownFp !== _lastUnknownUsbFp) {
    _lastUnknownUsbFp = unknownFp;
    unknownUsbTbody.innerHTML = unknownUsb.map((device) => {
      const vid = escHtml(device.vidpid || '');
      const nameLabel = escHtml(device.name || device.bus_path || 'Unknown device');
      return `<tr>
        <td>${nameLabel}</td>
        <td>${vid || '—'}</td>
        <td class="usb-actions">
          <button type="button" class="btn btn-primary btn-small" data-action="certify" data-vidpid="${vid}" data-name="${nameLabel}">Add to certified</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="ignore" data-vidpid="${vid}">Ignore</button>
        </td>
      </tr>`;
    }).join('');
    // Use event delegation — one listener on the static tbody handles all button clicks
    unknownUsbTbody._delegated = true;
  }

  unknownUsbSection.classList.toggle('hidden', unknownUsb.length === 0);

  // ── Quarantined buses section ─────────────────────────────────────────────
  if (usbQuarantineSection && usbQuarantineTbody) {
    const quarantineFp = usbQuarantine.map(q => `${q.bus_path}:${q.fail_count}:${q.quarantined_at||''}`).sort().join(',');
    if (quarantineFp !== _lastQuarantineFp) {
      _lastQuarantineFp = quarantineFp;
      if (usbQuarantine.length > 0) {
        usbQuarantineTbody.innerHTML = usbQuarantine.map(q => {
          const bus = escHtml(q.bus_path || '—');
          const fc = Number(q.fail_count || 0);
          const qa = q.quarantined_at ? new Date(q.quarantined_at * 1000).toLocaleString() : '—';
          return `<tr>
            <td><code>${bus}</code></td>
            <td><span class="badge badge-red">${fc}</span></td>
            <td class="muted">${escHtml(qa)}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-small"
                      data-usb-quarantine-clear="${bus}">Clear Quarantine</button>
            </td>
          </tr>`;
        }).join('');
      }
      usbQuarantineSection.classList.toggle('hidden', usbQuarantine.length === 0);
    }
  }

  // Show the panel whenever Proxmox is connected; hide only before any data has arrived
  usbSummaryPanel.classList.toggle('hidden', !latestProxmoxData.connected && certified.length === 0 && unknownUsb.length === 0 && usbState.length === 0);

  // Restart countdown timer only when the set of missing entries changes
  const missingFp = usbState
    .filter(item => item.missing_since && !presentBusSet.has(String(item?.bus_path || '').trim()))
    .map(item => `${item.vmid}:${item.missing_since}`)
    .sort().join(',');
  if (missingFp !== _lastMissingFp) {
    _lastMissingFp = missingFp;
    if (usbCountdownTimer) window.clearInterval(usbCountdownTimer);
    usbCountdownTimer = null;
    updateUsbCountdowns();
    if (missingFp) usbCountdownTimer = window.setInterval(updateUsbCountdowns, 1000);
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
window.triggerRecloneAll = triggerRecloneAll;

async function clearRecloneState() {
  const btn = document.getElementById('reclone-clear-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Clearing…'; }
  try {
    await requestJson('/api/proxmox/reclone-state/clear', { method: 'POST' });
    showNotification('Reclone state cleared.', 'info');
  } catch (error) {
    showNotification(`Clear error: ${error.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✕ Clear Errors'; }
  }
}
window.clearRecloneState = clearRecloneState;

async function resetAutoprovStatus() {
  if (!confirm('Clear the auto-provisioning status panel?')) return;
  await fetch('/api/proxmox/autoprov/reset', { method: 'POST' });
}
window.resetAutoprovStatus = resetAutoprovStatus;

async function unlockTemplate() {
  const btn = document.getElementById('template-unlock-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
  }
  try {
    await requestJson('/api/proxmox/unlock-template', { method: 'POST' });
    showToast('Template unlock queued.', 'ok');
  } catch (error) {
    showToast(`Template unlock failed: ${error.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔓 Unlock Template';
    }
  }
}
window.unlockTemplate = unlockTemplate;

function recloneLogStatusMeta(status) {
  switch (String(status || '').toLowerCase()) {
    case 'completed':
      return { label: 'Done', className: 'status-online' };
    case 'failed':
      return { label: 'Failed', className: 'status-offline' };
    case 'queued':
      return { label: 'Queued', className: 'status-pending' };
    case 'in_progress':
      return { label: 'Running', className: 'status-pending' };
    default:
      return { label: 'Pending', className: 'status-pending' };
  }
}

function renderRecloneLogItems(entries = [], emptyHtml = '') {
  if (!entries.length) return emptyHtml;
  return entries.slice().reverse().map((entry) => {
    const meta = recloneLogStatusMeta(entry.status);
    return `
      <div class="autoprov-live-item reclone-live-item" title="${escHtml(entry.message || '')}">
        <div class="autoprov-live-item-main">
          <div class="autoprov-live-item-name">${escHtml(entry.name || `VM ${entry.vmid}`)}</div>
        </div>
        <span class="status-badge ${meta.className}">${meta.label}</span>
      </div>
    `;
  }).join('');
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
  // Show "Clear Error" button only when in a stale terminal state (not idle, not running)
  const recloneClearBtn = document.getElementById('reclone-clear-btn');
  if (recloneClearBtn) recloneClearBtn.classList.toggle('hidden', status === 'idle' || status === 'running');
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

  const logEntries = Array.isArray(state.log) ? state.log : [];
  if (logEntries.length === 0 && status !== 'idle') {
    recloneVmLog.innerHTML = `<div class="muted" style="padding:8px 0;font-size:13px;">No VMs processed yet.</div>`;
  } else {
    recloneVmLog.innerHTML = renderRecloneLogItems(logEntries);
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
    arLog.innerHTML = renderRecloneLogItems(autoLog, `<div class="muted" style="padding:8px 0;font-size:13px;">No auto-recovery activity.</div>`);
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

function getAutoProvisionRunState(proxmoxData = latestProxmoxData) {
  const run = proxmoxData?.prov_run;
  if (run && Array.isArray(run.items)) {
    const allItems = run.items
      .filter((item) => item && item.vmid != null)
      .map((item) => ({
        ...item,
        status: String(item.status || 'pending').toLowerCase(),
      }));
    // Show all active items — reclone_concurrency governs fleet reclone only,
    // not USB auto-provisioning which fires one clone per dongle in parallel.
    const terminalItems = allItems.filter(i => ['done', 'failed'].includes(i.status));
    const activeItems = allItems.filter(i => !['done', 'failed'].includes(i.status));
    const items = [...activeItems, ...terminalItems];
    return {
      running: Boolean(run.running),
      total: Number.isFinite(Number(run.total)) ? Number(run.total) : allItems.length,
      completed: Number.isFinite(Number(run.completed)) ? Number(run.completed) : allItems.filter((item) => item.status === 'done').length,
      failed: Number.isFinite(Number(run.failed)) ? Number(run.failed) : allItems.filter((item) => item.status === 'failed').length,
      startedAt: run.started_at || null,
      updatedAt: run.updated_at || null,
      completedAt: run.completed_at || null,
      items,
    };
  }

  const usbState = Array.isArray(proxmoxData?.usb_state) ? proxmoxData.usb_state : [];
  const vms = Array.isArray(proxmoxData?.vms) ? proxmoxData.vms : [];
  const vmByVmid = new Map(vms.map((vm) => [String(vm?.vmid), vm || {}]));
  // Show all provisioning entries — USB auto-provisioning fires one clone per dongle in parallel,
  // so reclone_concurrency (which governs fleet reclone) must not limit this list.
  const allProvisioningEntries = usbState
    .filter((entry) => entry && entry.vmid != null && entry.prov_status === 'provisioning')
    .map((entry) => {
      const vm = vmByVmid.get(String(entry.vmid)) || {};
      return {
        vmid: entry.vmid,
        vm_name: vm.name || null,
        usb_name: entry.name || null,
        bus_path: entry.bus_path || null,
        vidpid: entry.vidpid || null,
        status: vm.status === 'running' ? 'configuring' : 'cloning',
      };
    });
  // Sort: configuring (VM running) first, then cloning
  allProvisioningEntries.sort((a, b) => (a.status === 'configuring' ? -1 : b.status === 'configuring' ? 1 : 0));

  // Also include VMs that finished cloning but haven't checked into the API yet.
  // This keeps the live panel and "provisioning" badge visible through the
  // boot-up gap between clone-complete and first API check-in.
  const provisioningVmids = new Set(allProvisioningEntries.map((i) => String(i.vmid)));
  const pendingCheckinItems = vms
    .filter((vm) => vm && vm.pending_checkin === true && !provisioningVmids.has(String(vm.vmid)))
    .map((vm) => ({
      vmid: vm.vmid,
      vm_name: vm.name || null,
      usb_name: null,
      bus_path: null,
      vidpid: null,
      status: 'pending_checkin',
    }));

  const items = [...allProvisioningEntries, ...pendingCheckinItems];

  return {
    running: items.length > 0,
    total: items.length,
    completed: 0,
    failed: 0,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    items,
  };
}

function autoProvisionStatusMeta(status) {
  switch (String(status || '').toLowerCase()) {
    case 'cloning':
      return { label: 'Cloning', className: 'autoprov-phase-cloning' };
    case 'configuring':
      return { label: 'Configuring', className: 'autoprov-phase-configuring' };
    case 'pending_checkin':
      return { label: 'Waiting for check-in', className: 'autoprov-phase-configuring' };
    case 'done':
      return { label: 'Done', className: 'autoprov-phase-done' };
    case 'failed':
      return { label: 'Failed', className: 'autoprov-phase-failed' };
    default:
      return { label: 'Pending', className: 'autoprov-phase-pending' };
  }
}

async function toggleAutoProvisioning() {
  const nowOn = currentSettings.usb_auto_provision === 'on';
  const newVal = nowOn ? 'off' : 'on';
  currentSettings.usb_auto_provision = newVal;
  if (usbAutoProvisionInput) usbAutoProvisionInput.checked = newVal === 'on';
  renderAutoProvisionStatus();
  try {
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectUsbSettingsPayload()),
    });
    showNotification(`VM Auto-Provisioning ${newVal === 'on' ? 'enabled' : 'disabled'}`, 'success');
  } catch (e) {
    // Revert on failure
    currentSettings.usb_auto_provision = nowOn ? 'on' : 'off';
    if (usbAutoProvisionInput) usbAutoProvisionInput.checked = nowOn;
    renderAutoProvisionStatus();
    showNotification('Failed to save setting', 'error');
  }
}

function renderAutoProvisionStatus() {
  const autoProv = currentSettings.usb_auto_provision === 'on';
  const run = getAutoProvisionRunState(latestProxmoxData);
  const total = Math.max(run.total || 0, run.items.length);
  const completed = Math.min(run.completed || 0, total);
  const failed = Math.min(run.failed || 0, Math.max(0, total - completed));

  // ── VM page status bar (right side of tab nav) ─────────────────────────────
  const bar = document.getElementById('autoprov-status-bar');
  if (bar) {
    const iconEl = document.getElementById('autoprov-status-icon');
    const textEl = document.getElementById('autoprov-status-text');
    if (iconEl) iconEl.className = 'autoprov-status-icon';
    bar.classList.remove('is-active', 'is-idle', 'is-disabled', 'is-throttled');

    if (!autoProv) {
      bar.classList.add('is-disabled');
      if (iconEl) iconEl.innerHTML = '<span class="autoprov-dot" aria-hidden="true"></span>';
      if (textEl) textEl.textContent = 'Off';
    } else if (run.running && total > 0) {
      bar.classList.add('is-active');
      if (iconEl) iconEl.innerHTML = '<span class="autoprov-spinner" aria-hidden="true"></span>';
      if (textEl) {
        const text = [`Provisioning… ${completed}/${total}`];
        if (failed > 0) text.push(`${failed} failed`);
        textEl.textContent = text.join(' · ');
      }
    } else {
      bar.classList.add('is-idle');
      if (iconEl) iconEl.innerHTML = '<span class="autoprov-dot" aria-hidden="true"></span>';
      if (textEl) textEl.textContent = 'Idle';
    }

    // Make the status bar a clickable toggle (attach once)
    if (!bar._autoProvClickAttached) {
      bar._autoProvClickAttached = true;
      bar.style.cursor = 'pointer';
      bar.title = 'Click to enable/disable VM Auto-Provisioning';
      bar.addEventListener('click', toggleAutoProvisioning);
    }
  }

  // ── Right-side live panel ───────────────────────────────────────────────────
  const livePanel = document.getElementById('autoprov-live-panel');
  const liveSummary = document.getElementById('autoprov-live-summary');
  const logEl = document.getElementById('auto-prov-log');
  const lockBanner = document.getElementById('template-lock-banner');
  const lockReason = document.getElementById('template-lock-reason');
  const unlockBtn = document.getElementById('template-unlock-btn');
  if (!livePanel || !liveSummary || !logEl) return;

  const templateLock = String(latestProxmoxData?.template_lock || '').trim();
  if (lockBanner && lockReason) {
    lockReason.textContent = templateLock ? `(${templateLock})` : '';
    lockBanner.classList.toggle('hidden', !templateLock);
  }
  if (unlockBtn && !unlockBtn._boundTemplateUnlock) {
    unlockBtn._boundTemplateUnlock = true;
    unlockBtn.addEventListener('click', unlockTemplate);
  }

  // Panel is always visible — show idle/off state when not provisioning
  livePanel.classList.remove('hidden');

  const showPanel = run.running && total > 0;
  const resetBtn = document.getElementById('autoprov-reset-btn');
  if (resetBtn) resetBtn.style.display = run.running ? '' : 'none';
  if (!showPanel) {
    const idleMsg = autoProv
      ? 'Idle — dongles inserted will trigger auto-provisioning.'
      : 'Auto-provisioning is disabled. Enable it in the USB settings below.';
    liveSummary.innerHTML = `<div class="muted" style="padding:12px 0 4px;">${idleMsg}</div>`;
    logEl.innerHTML = '';
    return;
  }

  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const startedText = run.startedAt ? `Started ${formatRelativeTime(run.startedAt)}` : 'Provisioning in progress';
  const summaryBits = [`${completed} of ${total} complete`];
  if (failed > 0) summaryBits.push(`${failed} failed`);
  liveSummary.innerHTML = `
    <div class="autoprov-live-summary-main">
      <strong>${summaryBits.join(' · ')}</strong>
      <span class="muted">${completedPct}%</span>
    </div>
    <div class="progress-bar-wrap autoprov-progress-wrap"><div class="progress-bar" style="width:${completedPct}%;"></div></div>
    <div class="autoprov-live-summary-sub">${escHtml(startedText)}</div>
  `;

  // Show all in-progress and failed items. Done items drop off.
  // (reclone_concurrency governs fleet reclone, not USB auto-provisioning which is parallel per-dongle)
  const failedItems = run.items.filter(item => item.status === 'failed');
  const inProgressItems = run.items.filter(item => !['done', 'failed'].includes(item.status));
  const activeItems = [...inProgressItems, ...failedItems];
  logEl.innerHTML = activeItems.map((item) => {
    const meta = autoProvisionStatusMeta(item.status);
    // vm_name is the Proxmox VM name which equals the assigned hostname (e.g. amoran-90014).
    // Fall back to the slot number only before the clone command has named the VM.
    const hostname = item.vm_name || `Slot ${item.vmid ?? '—'}`;
    return `
      <div class="autoprov-live-item">
        <span class="autoprov-live-item-name">${escHtml(hostname)}</span>
        <span class="autoprov-phase ${meta.className}">${meta.label}</span>
      </div>
    `;
  }).join('');
}

function formatCentralDate(value) {
  if (value == null || value === '') return '—';
  const date = new Date(value > 1e12 ? value : value * 1000);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function updateCentralToolbar() {
  const mappings = currentSettings.site_mappings || {};
  const browseSites = Array.isArray(spokeCentralBrowseData?.sites) ? spokeCentralBrowseData.sites.length : null;
  const siteCount = browseSites ?? Object.keys(mappings).length;
  const centralMode = currentSettings.central_api?.mode === 'central' ? 'Central' : 'Classic';
  const updatedText = centralLastSyncedTs ? formatCentralDate(centralLastSyncedTs / 1000) : '—';

  if (centralModePill) {
    centralModePill.textContent = `${centralMode} mode`;
  }
  if (centralSitesPill) {
    centralSitesPill.textContent = `${siteCount} site${siteCount === 1 ? '' : 's'}`;
  }
  if (centralUpdatedPill) {
    centralUpdatedPill.textContent = centralLastSyncedTs ? `Updated ${updatedText}` : 'Updated —';
  }
  if (centralLastSynced) {
    centralLastSynced.textContent = centralLastSyncedTs
      ? `Last synced: ${updatedText}`
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
  // Don't wipe the table while the user has a select or input focused inside it —
  // that would destroy an open dropdown mid-interaction.
  const ae = document.activeElement;
  if (ae && siteMappingsBody.contains(ae)) return;
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

// ── Spoke Central browse cache helpers (localStorage + stale-while-revalidate) ─

function spokeCaBrowseCacheKey() { return 'spoke_ca_browse'; }

function normalizeSpokeCaBrowseData(data) {
  if (!data || typeof data !== 'object') return data;
  const normalized = { ...data };
  const clients = Array.isArray(data.clients) ? data.clients : [];
  // Detect legacy client summary rows (total/wired/wireless but no mac/hostname/ip)
  const hasIndividual = clients.some((c) => c && (c.mac || c.hostname || c.ip));
  const hasLegacySummary = clients.some((c) => c && !c.mac && !c.hostname && !c.ip && (c.total !== undefined || c.wired !== undefined));
  if (hasLegacySummary && !hasIndividual) {
    normalized.clients = [];
    if (!normalized.clients_by_site || typeof normalized.clients_by_site !== 'object') {
      normalized.clients_by_site = Object.fromEntries(clients.map((c) => {
        const site = String(c?.site || '—').trim() || '—';
        return [site, { total: Number(c?.total) || 0, wired: Number(c?.wired) || 0, wireless: Number(c?.wireless) || 0 }];
      }));
    }
  } else if (!Array.isArray(normalized.clients)) {
    normalized.clients = [];
  }
  return normalized;
}

function saveSpokeCaBrowseCache(data) {
  try { localStorage.setItem(spokeCaBrowseCacheKey(), JSON.stringify(normalizeSpokeCaBrowseData(data))); } catch (_) {}
}

function loadSpokeCaBrowseCache() {
  try {
    const raw = localStorage.getItem(spokeCaBrowseCacheKey());
    if (!raw) return null;
    return normalizeSpokeCaBrowseData(JSON.parse(raw));
  } catch (_) { return null; }
}

function updateSpokeCaBrowsePills(data) {
  if (centralModePill) centralModePill.textContent = `${data?.mode || '—'} mode`;
  if (centralSitesPill) centralSitesPill.textContent = `${(data?.sites || []).length} sites`;
  if (centralUpdatedPill) {
    centralUpdatedPill.textContent = data?.cached_at
      ? `Updated ${new Date(data.cached_at * 1000).toLocaleTimeString()}`
      : '—';
  }
}

function resetSpokeCaBrowsePills() {
  if (centralModePill) centralModePill.textContent = '— mode';
  if (centralSitesPill) centralSitesPill.textContent = '— sites';
  if (centralUpdatedPill) centralUpdatedPill.textContent = '—';
}

function scheduleSpokeCaBrowseRefresh() {
  clearTimeout(spokeCaBrowseRefreshTimer);
  spokeCaBrowseRefreshTimer = setTimeout(() => {
    // Only auto-refresh if the Central tab is actually visible
    const centralPanel = document.getElementById('tab-central');
    if (centralPanel && !centralPanel.classList.contains('hidden')) {
      fetchSpokeCentralBrowse(true).catch(() => {});
    }
  }, 5 * 60 * 1000);
}

async function fetchSpokeCentralBrowse(force = false) {
  const content = document.getElementById('central-browse-content');

  // Show localStorage cache immediately while fetching (stale-while-revalidate)
  if (!force) {
    const cached = loadSpokeCaBrowseCache();
    const cachedHasSites = cached && (cached.sites || []).length > 0;
    if (cachedHasSites) {
      spokeCentralBrowseData = cached;
      updateSpokeCaBrowsePills(cached);
      spokeCaMonitoredItems = currentSettings.spoke_monitored_items || [];
      renderSpokeCaBrowseTab();
      scheduleSpokeCaBrowseRefresh();
      // Revalidate in the background so data stays fresh
      fetchSpokeCentralBrowse(true).catch(() => {});
      return;
    }
  }

  // No cache, or forced refresh — fetch fresh data
  if (!spokeCentralBrowseData && content) {
    content.innerHTML = '<div class="empty-state">Loading Central data…</div>';
  }
  if (force) resetSpokeCaBrowsePills();

  try {
    const raw = await requestJson(`/api/central/browse${force ? '?force=true' : ''}`);
    const data = normalizeSpokeCaBrowseData(raw);
    spokeCentralBrowseData = data;
    saveSpokeCaBrowseCache(data);
    updateSpokeCaBrowsePills(data);
    spokeCaMonitoredItems = currentSettings.spoke_monitored_items || [];
    updateCentralToolbar();
    renderSpokeCaBrowseTab();
  } catch (err) {
    if (content && !spokeCentralBrowseData) {
      content.innerHTML = `<div class="empty-state" style="color:#c0392b;">Failed to load Central data: ${escHtml(err.message)}</div>`;
    }
  } finally {
    scheduleSpokeCaBrowseRefresh();
  }
}

function spokeCaMonitoredSiteNames() {
  const mappings = currentSettings.site_mappings || {};
  const values = Object.values(mappings)
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean);
  if (!values.length) return null;
  return new Set(values);
}

function spokeCaIsMonitored(type, name, site, identifier = '') {
  if (type === 'site') {
    const mappings = currentSettings.site_mappings || {};
    const lname = (name || '').toLowerCase().trim();
    return Object.values(mappings).some((value) => (value || '').toLowerCase().trim() === lname);
  }
  return spokeCaMonitoredItems.some((item) => {
    if (item.type !== type) return false;
    const iname = (identifier || name || '').toLowerCase().trim();
    const isite = (site || '').toLowerCase().trim();
    return (item.identifier || item.name || '').toLowerCase().trim() === iname
      && (item.site || '').toLowerCase().trim() === isite;
  });
}

function spokeCaMonitorBtn(type, payload = {}) {
  const name = payload.name || payload.hostname || payload.mac || '';
  const site = payload.site || '';
  const identifier = payload.identifier || payload.mac || payload.hostname || payload.name || '';
  const monitored = spokeCaIsMonitored(type, name, site, identifier);
  const dataAttrs = Object.entries(payload)
    .map(([key, value]) => `data-ca-${key.replace(/_/g, '-')}="${escHtml(String(value ?? ''))}"`)
    .join(' ');
  if (monitored) {
    return `<button class="btn btn-small btn-secondary spoke-ca-unmonitor-btn" type="button" data-ca-type="${escHtml(type)}" ${dataAttrs} title="Click to remove from monitoring">✓ Monitored</button>`;
  }
  return `<button class="btn btn-small btn-primary spoke-ca-monitor-btn" type="button" data-ca-type="${escHtml(type)}" ${dataAttrs}>Monitor</button>`;
}

function attachSpokeCaMonitorButtons(container) {
  if (!container) return;
  container.querySelectorAll('.spoke-ca-monitor-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.caType || '';
      const payload = {
        name: btn.dataset.caName || '',
        site: btn.dataset.caSite || '',
        central_site: btn.dataset.caCentralSite || '',
        identifier: btn.dataset.caIdentifier || '',
        mac: btn.dataset.caMac || '',
        hostname: btn.dataset.caHostname || '',
      };
      openSpokeCaMonitorModal(type, payload);
    });
  });
  container.querySelectorAll('.spoke-ca-unmonitor-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.caType || '';
      const payload = {
        name: btn.dataset.caName || '',
        site: btn.dataset.caSite || '',
        central_site: btn.dataset.caCentralSite || '',
        identifier: btn.dataset.caIdentifier || '',
      };
      spokeCaUnmonitorItem(type, payload, btn);
    });
  });
}

function openSpokeCaMonitorModal(type, payload) {
  const modal = document.getElementById('central-monitor-modal');
  const title = document.getElementById('central-modal-title');
  const sub = document.getElementById('central-modal-sub');
  const msg = document.getElementById('central-modal-msg');
  const confirmBtn = document.getElementById('central-modal-confirm');
  const cancelBtn = document.getElementById('central-modal-cancel');
  const closeBtn = document.getElementById('central-modal-close');
  if (!modal) return;

  const label = type === 'site' ? `site "${payload.name}"` : `${type} "${payload.name}"`;
  if (title) title.textContent = `Monitor ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  if (sub) sub.textContent = `Add ${label} to monitoring on this spoke.`;
  if (msg) msg.textContent = '';

  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  const close = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  };

  if (closeBtn) closeBtn.onclick = close;
  if (cancelBtn) cancelBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      if (msg) msg.textContent = '⏳ Adding…';
      confirmBtn.disabled = true;
      try {
        await spokeCaMonitorItem(type, payload);
        close();
        showToast(`"${payload.name}" added to monitoring.`, 'ok');
      } catch (err) {
        if (msg) msg.textContent = `Error: ${err.message}`;
      } finally {
        confirmBtn.disabled = false;
      }
    };
  }
}

async function spokeCaMonitorItem(type, payload) {
  if (type === 'site') {
    await requestJson('/api/central/monitor-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', central_site: payload.central_site || payload.name }),
    });
    const mappings = { ...(currentSettings.site_mappings || {}) };
    const csName = payload.central_site || payload.name;
    mappings[csName] = csName;
    currentSettings.site_mappings = mappings;
  } else {
    const resp = await requestJson('/api/central/monitored-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });
    if (!spokeCaMonitoredItems.some((item) => item.id === resp.item?.id)) {
      spokeCaMonitoredItems = [...spokeCaMonitoredItems, resp.item];
    }
    currentSettings.spoke_monitored_items = spokeCaMonitoredItems;
  }
  updateCentralToolbar();
  renderSpokeCaBrowseTab();
}

async function spokeCaUnmonitorItem(type, payload, button) {
  if (button) button.disabled = true;
  try {
    if (type === 'site') {
      await requestJson('/api/central/monitor-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', central_site: payload.central_site || payload.name }),
      });
      const mappings = { ...(currentSettings.site_mappings || {}) };
      const csName = (payload.central_site || payload.name || '').toLowerCase().trim();
      Object.keys(mappings).forEach((key) => {
        if ((mappings[key] || '').toLowerCase().trim() === csName || key.toLowerCase().trim() === csName) {
          delete mappings[key];
        }
      });
      currentSettings.site_mappings = mappings;
    } else {
      const item = spokeCaMonitoredItems.find((entry) =>
        entry.type === type
        && (entry.identifier || entry.name || '').toLowerCase() === (payload.identifier || payload.name || '').toLowerCase()
        && (entry.site || '').toLowerCase() === (payload.site || '').toLowerCase()
      );
      if (item) {
        await requestJson(`/api/central/monitored-items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        spokeCaMonitoredItems = spokeCaMonitoredItems.filter((entry) => entry.id !== item.id);
        currentSettings.spoke_monitored_items = spokeCaMonitoredItems;
      }
    }
    showToast(`"${payload.name}" removed from monitoring.`, 'ok');
    updateCentralToolbar();
    renderSpokeCaBrowseTab();
  } catch (err) {
    if (button) button.disabled = false;
    showToast(`Failed: ${err.message}`, 'error');
  }
}

function renderSpokeCaBrowseTab() {
  if (!spokeCentralBrowseData) return;
  const search = (document.getElementById('central-search')?.value || '').trim().toLowerCase();
  const tab = spokeCaBrowseActiveTab;
  if (tab === 'central-alerts-panel') {
    renderSpokeCaAlertsTab(document.getElementById('central-alerts-content') || document.getElementById('central-all-alerts-body'), spokeCentralBrowseData.alerts || [], search);
  } else if (tab === 'central-insights-panel') {
    renderSpokeCaInsightsTab(document.getElementById('central-insights-content'), spokeCentralBrowseData.insights || [], search);
  } else if (tab === 'central-clients-panel') {
    renderSpokeCaClientsTab(document.getElementById('central-clients-content'), spokeCentralBrowseData.clients_by_site || {}, search, spokeCentralBrowseData.clients || []);
  } else if (tab === 'central-devices-panel') {
    renderSpokeCaDevicesTab(document.getElementById('central-devices-content'), spokeCentralBrowseData.devices_by_site || {}, search);
  } else {
    renderSpokeCaSitesTab(document.getElementById('central-browse-content'), spokeCentralBrowseData.sites || [], search);
  }

  const content = tab === 'central-browse-panel'
    ? document.getElementById('central-browse-content')
    : tab === 'central-alerts-panel'
      ? document.getElementById('central-alerts-content')
      : tab === 'central-insights-panel'
        ? document.getElementById('central-insights-content')
        : tab === 'central-clients-panel'
          ? document.getElementById('central-clients-content')
          : document.getElementById('central-devices-content');
  if (spokeCentralBrowseData.warning && content && !content.querySelector('tbody') && !content.querySelector('.ca-browse-warning')) {
    content.insertAdjacentHTML('afterbegin', `<div class="empty-state ca-browse-warning" style="color:#c0392b;">${escHtml(spokeCentralBrowseData.warning)}</div>`);
  }
}

function renderSpokeCaSitesTab(container, sites, search) {
  if (!container) return;
  const filtered = sites.filter((site) => !search || JSON.stringify(site).toLowerCase().includes(search));
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${search ? 'No sites match your search.' : 'No sites returned from Central.'}</div>`;
    return;
  }
  const tdP = 'padding:6px 10px;';
  const rows = filtered.map((site) => {
    const score = site.health_score != null ? parseInt(site.health_score, 10) : null;
    const healthColor = score == null ? '#aaa' : score >= 80 ? '#27ae60' : score >= 50 ? '#f39c12' : '#e74c3c';
    const healthLabel = score == null ? '—' : score >= 80 ? 'Healthy' : score >= 50 ? 'Fair' : 'Poor';
    const healthDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:${healthColor};display:inline-block;flex-shrink:0;"></span>${healthLabel}</span>`;
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(site.name || '—')}</strong></td>
      <td style="${tdP}">${healthDot}</td>
      <td style="white-space:nowrap;${tdP}">${site.wireless_clients != null ? escHtml(String(site.wireless_clients)) : '—'}</td>
      <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn('site', { name: site.name || '', central_site: site.central_site || site.name || '' })}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <div class="setup-card" style="overflow-x:auto;padding:0;">
      <table class="data-table" style="font-size:0.82rem;margin:0;min-width:500px;width:100%;">
        <thead><tr>
          <th style="width:40%;padding:5px 10px;">Site</th>
          <th style="padding:5px 10px;white-space:nowrap;">Health</th>
          <th style="padding:5px 10px;white-space:nowrap;">Wireless Clients</th>
          <th style="padding:5px 10px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  attachSpokeCaMonitorButtons(container);
}

function _caTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString();
    return `<span style="display:block;font-size:0.78rem;color:var(--muted);">${escHtml(date)}</span><span style="display:block;font-size:0.78rem;color:var(--muted);">${escHtml(time)}</span>`;
  } catch (_) {
    return escHtml(String(ts));
  }
}

function _caSevDot(sev) {
  const s = (sev || '').toLowerCase();
  const color = s === 'critical' || s === 'red' || s === 'error' ? '#e74c3c'
    : s === 'major' || s === 'orange' ? '#e67e22'
      : s === 'minor' || s === 'warning' || s === 'yellow' ? '#f1c40f'
        : s === 'info' || s === 'good' || s === 'green' || s === 'clear' ? '#27ae60'
          : '#aaa';
  return `<span style="display:flex;justify-content:center;align-items:center;"><span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span></span>`;
}

function renderSpokeCaAlertsTab(container, alerts, search) {
  if (!container) return;
  const monitoredSites = spokeCaMonitoredSiteNames();
  if (monitoredSites) alerts = alerts.filter((alert) => monitoredSites.has((alert.site || '').toLowerCase().trim()));
  const activeCat = container._caCatFilter || 'All';
  const categories = ['All', ...new Set(alerts.map((alert) => alert.category).filter(Boolean))].sort((a, b) => (a === 'All' ? -1 : a.localeCompare(b)));
  let filtered = alerts;
  if (activeCat !== 'All') filtered = filtered.filter((alert) => alert.category === activeCat);
  if (search) filtered = filtered.filter((alert) => JSON.stringify(alert).toLowerCase().includes(search));
  const catPills = categories.map((cat) =>
    `<button class="btn btn-small ${activeCat === cat ? 'btn-primary' : 'btn-secondary'} ca-cat-filter" data-cat="${escHtml(cat)}" style="margin:0 2px 4px;">${escHtml(cat)}</button>`
  ).join('');
  const tdP = 'padding:6px 10px;';
  const rows = filtered.map((alert) => {
    const catBadge = alert.category ? `<span class="badge badge-grey" style="font-size:10px;margin-left:4px;">${escHtml(alert.category)}</span>` : '';
    const devType = alert.device_type ? escHtml(alert.device_type) : '—';
    const detailStr = alert.detail ? `<div style="font-size:11px;color:var(--muted);line-height:1.3;">${escHtml(alert.detail)}</div>` : '';
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(alert.name || '—')}</strong>${catBadge}${detailStr}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(alert.site || '—')}</td>
      <td style="white-space:nowrap;min-width:80px;text-align:center;${tdP}">${_caSevDot(alert.severity)}</td>
      <td style="font-size:11px;color:var(--muted);white-space:nowrap;${tdP}">${devType}</td>
      <td style="min-width:70px;${tdP}">${_caTs(alert.ts)}</td>
      <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn('alert', { name: alert.name || '', site: alert.site || '', identifier: alert.name || '' })}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <div style="margin-bottom:4px;">${catPills}</div>
    ${filtered.length ? `<div class="setup-card" style="overflow-x:auto;padding:0;">
      <table class="data-table" style="font-size:0.82rem;margin:0;min-width:700px;width:100%;">
        <thead><tr>
          <th style="width:40%;padding:5px 10px;">Alert</th>
          <th style="padding:5px 10px;white-space:nowrap;">Site</th>
          <th style="padding:5px 10px;white-space:nowrap;">Severity</th>
          <th style="padding:5px 10px;white-space:nowrap;">Device Type</th>
          <th style="padding:5px 10px;white-space:nowrap;">Time</th>
          <th style="padding:5px 10px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<div class="empty-state">${search || activeCat !== 'All' ? 'No alerts match the filter.' : 'No active alerts.'}</div>`}`;
  container.querySelectorAll('.ca-cat-filter').forEach((btn) => {
    btn.onclick = () => { container._caCatFilter = btn.dataset.cat; renderSpokeCaAlertsTab(container, alerts, search); };
  });
  attachSpokeCaMonitorButtons(container);
}

function renderSpokeCaInsightsTab(container, insights, search) {
  if (!container) return;
  const monitoredSites = spokeCaMonitoredSiteNames();
  if (monitoredSites) insights = insights.filter((insight) => monitoredSites.has((insight.site || '').toLowerCase().trim()));
  const activeCat = container._caCatFilter || 'All';
  const categories = ['All', ...new Set(insights.map((insight) => insight.category).filter(Boolean))].sort((a, b) => (a === 'All' ? -1 : a.localeCompare(b)));
  let filtered = insights;
  if (activeCat !== 'All') filtered = filtered.filter((insight) => insight.category === activeCat);
  if (search) filtered = filtered.filter((insight) => JSON.stringify(insight).toLowerCase().includes(search));
  const catPills = categories.map((cat) =>
    `<button class="btn btn-small ${activeCat === cat ? 'btn-primary' : 'btn-secondary'} ca-insight-cat-filter" data-cat="${escHtml(cat)}" style="margin:0 2px 4px;">${escHtml(cat)}</button>`
  ).join('');
  const tdP = 'padding:6px 10px;';
  const rows = filtered.map((insight) => {
    const catLabel = (insight.category || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const catBadge = catLabel ? `<span class="badge badge-grey" style="font-size:10px;margin-left:4px;">${escHtml(catLabel)}</span>` : '';
    const devCount = insight.device_count ? `${insight.device_count} dev` : '';
    const cliCount = insight.client_count ? `${insight.client_count} client${insight.client_count !== 1 ? 's' : ''}` : '';
    const impacted = [devCount, cliCount].filter(Boolean).join(', ');
    const descStr = insight.description ? `<div style="font-size:11px;color:var(--muted);line-height:1.3;">${escHtml(insight.description)}</div>` : '';
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(insight.name || '—')}</strong>${catBadge}${descStr}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(insight.site || '—')}</td>
      <td style="white-space:nowrap;font-size:11px;${tdP}">${escHtml(impacted || '—')}</td>
      <td style="min-width:70px;${tdP}">${_caTs(insight.ts)}</td>
      <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn('insight', { name: insight.name || '', site: insight.site || '', identifier: insight.name || '' })}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <div style="margin-bottom:4px;">${catPills}</div>
    ${filtered.length ? `<div class="setup-card" style="overflow-x:auto;padding:0;">
      <table class="data-table" style="font-size:0.82rem;margin:0;min-width:600px;width:100%;">
        <thead><tr>
          <th style="width:40%;padding:5px 10px;">Insight</th>
          <th style="padding:5px 10px;white-space:nowrap;">Site</th>
          <th style="padding:5px 10px;white-space:nowrap;">Impacted</th>
          <th style="padding:5px 10px;white-space:nowrap;">Time</th>
          <th style="padding:5px 10px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<div class="empty-state">${search || activeCat !== 'All' ? 'No insights match the filter.' : 'No AI insights returned from Central.'}</div>`}`;
  container.querySelectorAll('.ca-insight-cat-filter').forEach((btn) => {
    btn.onclick = () => { container._caCatFilter = btn.dataset.cat; renderSpokeCaInsightsTab(container, insights, search); };
  });
  attachSpokeCaMonitorButtons(container);
}

function _caClientIsWireless(c) {
  if (c.connection_type && typeof c.connection_type === 'string') {
    const ct = c.connection_type.toUpperCase();
    if (ct === 'WIRELESS' || ct === 'WIFI') return true;
    if (ct === 'WIRED' || ct === 'ETHERNET') return false;
  }
  return !!(c.ap && c.ap !== '—') || !!(c.ssid && c.ssid !== '—');
}

function spokeCaIsIndividualClientRecord(client) {
  if (!client || typeof client !== 'object') return false;
  return ['mac', 'hostname', 'ip', 'ap', 'ssid', 'status', 'os', 'vlan']
    .some((key) => Object.prototype.hasOwnProperty.call(client, key));
}

function renderSpokeCaClientsTab(container, clientsBySite, search, clientsLegacy = []) {
  if (!container) return;
  const tdP = 'padding:6px 10px;';
  const monitoredSites = spokeCaMonitoredSiteNames();
  const activeTab = container._caClientTab || 'all';
  const allClients = (clientsLegacy || []).filter((client) => spokeCaIsIndividualClientRecord(client));
  const clientSource = allClients.length > 0
    ? (monitoredSites ? allClients.filter((client) => monitoredSites.has((client.site || '').toLowerCase().trim())) : allClients)
    : null;
  const tabPills = `<div style="margin-bottom:8px;">
    <button class="btn btn-small ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'} ca-client-tab-btn" data-tab="all" style="margin:0 2px 4px;">All</button>
    <button class="btn btn-small ${activeTab === 'wireless' ? 'btn-primary' : 'btn-secondary'} ca-client-tab-btn" data-tab="wireless" style="margin:0 2px 4px;">Wireless</button>
    <button class="btn btn-small ${activeTab === 'wired' ? 'btn-primary' : 'btn-secondary'} ca-client-tab-btn" data-tab="wired" style="margin:0 2px 4px;">Wired</button>
  </div>`;
  if (clientSource) {
    const tabFiltered = activeTab === 'all' ? clientSource : clientSource.filter((client) => (activeTab === 'wireless' ? _caClientIsWireless(client) : !_caClientIsWireless(client)));
    const filtered = tabFiltered.filter((client) => !search || JSON.stringify(client).toLowerCase().includes(search));
    const emptyMsg = search ? 'No clients match your search.' : `No ${activeTab === 'all' ? '' : `${activeTab} `}clients returned from Central.`;
    if (!filtered.length) {
      container.innerHTML = tabPills + `<div class="empty-state">${emptyMsg}</div>`;
    } else {
      const isWireless = activeTab === 'wireless';
      const isAll = activeTab === 'all';
      const rows = filtered.map((client) => {
        const statusColor = (client.status || '').toLowerCase() === 'connected' ? '#27ae60'
          : (client.status || '').toLowerCase() === 'disconnected' ? '#e74c3c' : '#aaa';
        const statusDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>${escHtml(client.status || '—')}</span>`;
        const wirelessCells = isAll
          ? `<td style="white-space:nowrap;${tdP}">${escHtml(client.ap || '—')}</td>
             <td style="white-space:nowrap;${tdP}">${escHtml(client.ssid || '—')}</td>
             <td style="white-space:nowrap;${tdP}">${escHtml(client.vlan || '—')}</td>`
          : isWireless
            ? `<td style="white-space:nowrap;${tdP}">${escHtml(client.ap || '—')}</td>
               <td style="white-space:nowrap;${tdP}">${escHtml(client.ssid || '—')}</td>`
            : `<td style="white-space:nowrap;${tdP}">${escHtml(client.vlan || '—')}</td>`;
        return `<tr>
          <td style="width:28%;${tdP}"><strong>${escHtml(client.hostname !== '—' ? client.hostname : (client.username || '—'))}</strong>${client.username && client.hostname !== '—' ? `<div style="font-size:11px;color:var(--muted);margin-top:1px;">${escHtml(client.username)}</div>` : ''}<div style="font-size:11px;color:var(--muted);margin-top:2px;">${escHtml(client.mac || '')}</div></td>
          <td style="${tdP}"><span style="white-space:nowrap;">${escHtml(client.ip || '—')}</span>${client.site ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;">${escHtml(client.site)}</div>` : ''}</td>
          ${wirelessCells}
          <td style="white-space:nowrap;${tdP}">${statusDot}</td>
          <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn('client', {
            name: client.hostname || client.mac || 'Client',
            hostname: client.hostname || '',
            mac: client.mac || '',
            site: client.site || '',
          })}</td>
        </tr>`;
      }).join('');
      const extraHeaders = isAll
        ? `<th style="padding:5px 10px;white-space:nowrap;">AP</th>
           <th style="padding:5px 10px;white-space:nowrap;">SSID</th>
           <th style="padding:5px 10px;white-space:nowrap;">VLAN</th>`
        : isWireless
          ? `<th style="padding:5px 10px;white-space:nowrap;">AP</th>
             <th style="padding:5px 10px;white-space:nowrap;">SSID</th>`
          : `<th style="padding:5px 10px;white-space:nowrap;">VLAN</th>`;
      container.innerHTML = tabPills + `
        <div class="setup-card" style="overflow-x:auto;padding:0;">
          <table class="data-table" style="font-size:0.82rem;margin:0;min-width:${isAll ? 700 : isWireless ? 600 : 500}px;width:100%;">
            <thead><tr>
              <th style="width:28%;padding:5px 10px;">Client</th>
              <th style="padding:5px 10px;white-space:nowrap;">IP / Site</th>
              ${extraHeaders}
              <th style="padding:5px 10px;white-space:nowrap;">Status</th>
              <th style="padding:5px 10px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  } else {
    let entries = Object.entries(clientsBySite || {});
    if (monitoredSites) entries = entries.filter(([site]) => monitoredSites.has(site.toLowerCase().trim()));
    const filtered = entries.filter(([site]) => !search || site.toLowerCase().includes(search));
    const emptyMsg = search ? 'No clients match your search.' : 'No clients returned from Central.';
    if (!filtered.length) {
      container.innerHTML = tabPills + `<div class="empty-state">${emptyMsg}</div>`;
    } else {
      const isAll = activeTab === 'all';
      const countKey = activeTab === 'wired' ? 'wired' : 'wireless';
      const rows = filtered.sort((a, b) => (b[1].total || 0) - (a[1].total || 0)).map(([site, counts]) => `
        <tr>
          <td style="width:40%;${tdP}"><strong>${escHtml(site)}</strong></td>
          ${isAll ? `<td style="white-space:nowrap;${tdP}">${counts.total ?? '—'}</td>
          <td style="white-space:nowrap;${tdP}">${counts.wireless ?? counts.wireless_clients ?? '—'}</td>
          <td style="white-space:nowrap;${tdP}">${counts.wired ?? '—'}</td>`
          : `<td style="white-space:nowrap;${tdP}">${counts[countKey] ?? (countKey === 'wireless' ? counts.wireless_clients : '—') ?? '—'}</td>`}
          <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn('client', { name: `Client Count: ${site}`, site })}</td>
        </tr>`).join('');
      const countHeaders = isAll
        ? `<th style="padding:5px 10px;white-space:nowrap;">Total</th>
           <th style="padding:5px 10px;white-space:nowrap;">Wireless</th>
           <th style="padding:5px 10px;white-space:nowrap;">Wired</th>`
        : `<th style="padding:5px 10px;white-space:nowrap;">${activeTab === 'wired' ? 'Wired' : 'Wireless'} Clients</th>`;
      container.innerHTML = tabPills + `
        <div class="setup-card" style="overflow-x:auto;padding:0;">
          <table class="data-table" style="font-size:0.82rem;margin:0;min-width:${isAll ? 500 : 400}px;width:100%;">
            <thead><tr>
              <th style="width:40%;padding:5px 10px;">Site</th>
              ${countHeaders}
              <th style="padding:5px 10px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  }
  container.querySelectorAll('.ca-client-tab-btn').forEach((btn) => {
    btn.onclick = () => { container._caClientTab = btn.dataset.tab; renderSpokeCaClientsTab(container, clientsBySite, search, clientsLegacy); };
  });
  attachSpokeCaMonitorButtons(container);
}

function _caDeviceTabType(device) {
  const t = (device.type || '').toUpperCase();
  if (t === 'AP' || t === 'IAP' || t === 'CAP' || t.startsWith('AP-') || t.includes('IAP')) return 'ap';
  if (t === 'GATEWAY' || t === 'GW' || t === 'VGW' || t === 'BRANCH_GATEWAY' || t.includes('GATEWAY')) return 'gateway';
  if (t === 'SWITCH' || t === 'SW' || t === 'CX' || t.includes('SWITCH')) return 'switch';
  return 'other';
}

function renderSpokeCaDevicesTab(container, devicesBySite, search) {
  if (!container) return;
  const monitoredSites = spokeCaMonitoredSiteNames();
  const activeTab = container._caDeviceTab || 'all';
  const allDevices = Object.entries(devicesBySite || {})
    .filter(([site]) => !monitoredSites || monitoredSites.has(site.toLowerCase().trim()))
    .flatMap(([site, devices]) => devices.map((device) => ({ ...device, site })));
  const tabPills = `<div style="margin-bottom:8px;">
    <button class="btn btn-small ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'} ca-device-tab-btn" data-tab="all" style="margin:0 2px 4px;">All</button>
    <button class="btn btn-small ${activeTab === 'ap' ? 'btn-primary' : 'btn-secondary'} ca-device-tab-btn" data-tab="ap" style="margin:0 2px 4px;">Access Points</button>
    <button class="btn btn-small ${activeTab === 'gateway' ? 'btn-primary' : 'btn-secondary'} ca-device-tab-btn" data-tab="gateway" style="margin:0 2px 4px;">Gateway</button>
    <button class="btn btn-small ${activeTab === 'switch' ? 'btn-primary' : 'btn-secondary'} ca-device-tab-btn" data-tab="switch" style="margin:0 2px 4px;">Switch</button>
  </div>`;
  const tabDevices = activeTab === 'all' ? allDevices : allDevices.filter((device) => _caDeviceTabType(device) === activeTab);
  const filtered = tabDevices.filter((device) => !search || JSON.stringify(device).toLowerCase().includes(search));
  if (!filtered.length) {
    const emptyLabel = activeTab === 'all' ? 'devices' : activeTab === 'ap' ? 'access points' : activeTab === 'gateway' ? 'gateways' : 'switches';
    container.innerHTML = tabPills + `<div class="empty-state">${search ? 'No devices match your search.' : `No ${emptyLabel} returned from Central.`}</div>`;
    container.querySelectorAll('.ca-device-tab-btn').forEach((btn) => {
      btn.onclick = () => { container._caDeviceTab = btn.dataset.tab; renderSpokeCaDevicesTab(container, devicesBySite, search); };
    });
    return;
  }
  const tdP = 'padding:6px 10px;';
  const rows = filtered.map((device) => {
    const statusColor = (device.status || '').toUpperCase() === 'DOWN' || (device.status || '').toUpperCase() === 'OFFLINE' ? '#e74c3c'
      : (device.status || '').toUpperCase() === 'UP' || (device.status || '').toUpperCase() === 'ONLINE' ? '#27ae60'
        : '#aaa';
    const statusDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>${escHtml(device.status || '—')}</span>`;
    const deviceName = String(device.name || device.serial || device.type || 'Device').trim() || 'Device';
    const deviceIdentifier = String(device.name || device.serial || `${device.type || 'device'}:${device.site || ''}`).trim();
    const subLine = [device.model, device.serial].filter(Boolean).map(escHtml).join(' · ');
    const ipFw = [device.ip, device.firmware || device.version].filter(Boolean).map(escHtml).join(' · ');
    const monitorType = _caDeviceTabType(device) === 'other' ? 'gateway' : _caDeviceTabType(device);
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(device.name || '—')}</strong>${subLine ? `<div style="font-size:11px;color:var(--muted);">${subLine}</div>` : ''}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(device.site || '—')}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--muted);${tdP}">${escHtml(device.type || '—')}</td>
      <td style="white-space:nowrap;min-width:80px;${tdP}">${statusDot}</td>
      <td style="font-size:11px;color:var(--muted);${tdP}">${ipFw || '—'}</td>
      <td style="white-space:nowrap;${tdP}">${spokeCaMonitorBtn(monitorType, { name: deviceName, identifier: deviceIdentifier, site: device.site || '' })}</td>
    </tr>`;
  }).join('');
  container.innerHTML = tabPills + `
    <div class="setup-card" style="overflow-x:auto;padding:0;">
      <table class="data-table" style="font-size:0.82rem;margin:0;min-width:650px;width:100%;">
        <thead><tr>
          <th style="width:40%;padding:5px 10px;">Device</th>
          <th style="padding:5px 10px;white-space:nowrap;">Site</th>
          <th style="padding:5px 10px;white-space:nowrap;">Type</th>
          <th style="padding:5px 10px;white-space:nowrap;">Status</th>
          <th style="padding:5px 10px;white-space:nowrap;">IP / Firmware</th>
          <th style="padding:5px 10px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  container.querySelectorAll('.ca-device-tab-btn').forEach((btn) => {
    btn.onclick = () => { container._caDeviceTab = btn.dataset.tab; renderSpokeCaDevicesTab(container, devicesBySite, search); };
  });
  attachSpokeCaMonitorButtons(container);
}

function renderCentralSites() {
  const tbody = document.getElementById('central-sites-tbody');
  const centralEmpty = document.getElementById('central-empty');
  if (!centralOverview || !tbody || !centralEmpty) return;
  updateCentralToolbar();
  if (spokeCentralBrowseData) renderSpokeCaBrowseTab();
  tbody.textContent = '';

  const mappings = currentSettings.site_mappings || {};
  const entries = Object.entries(mappings);
  if (!entries.length) {
    centralEmpty.textContent = 'No Aruba Central site mappings configured yet.';
    centralEmpty.classList.remove('hidden');
    return;
  }

  const searchTerm = centralSearchInput?.value.trim().toLowerCase() || '';
  const monitoredChecks = currentSettings.monitored_checks || [];
  const clientValues = [...(clients instanceof Map ? clients.values() : Object.values(clients || {}))];
  const filteredEntries = entries.filter(([wsite, centralSite]) => {
    if (!searchTerm) return true;
    const siteChecks = centralStatusData[wsite] || {};
    const okCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'OK').length;
    const errorCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'ERROR').length;
    const unknownCount = Math.max(monitoredChecks.length - okCount - errorCount, 0);
    const wirelessCount = centralWirelessClients[wsite] ?? '—';
    const simCount = clientValues.filter((cl) => (cl.config?.wsite || cl.effective_config?.wsite || '') === wsite).length;
    return [wsite, centralSite, String(wirelessCount), String(simCount), String(okCount), String(errorCount), String(unknownCount)]
      .some((value) => String(value || '').toLowerCase().includes(searchTerm));
  });

  if (!filteredEntries.length) {
    centralEmpty.textContent = searchTerm ? 'No sites match your search.' : 'No Aruba Central site mappings configured yet.';
    centralEmpty.classList.remove('hidden');
    return;
  }

  centralEmpty.classList.add('hidden');

  filteredEntries.forEach(([wsite, centralSite]) => {
    const siteChecks = centralStatusData[wsite] || {};
    const okCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'OK').length;
    const errorCount = monitoredChecks.filter((c) => siteChecks[c.id]?.status === 'ERROR').length;
    const unknownCount = Math.max(monitoredChecks.length - okCount - errorCount, 0);
    const wirelessCount = centralWirelessClients[wsite] ?? '—';

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

function renderCentralOverview() {
  renderCentralSites();
  if (spokeCentralBrowseData) renderSpokeCaBrowseTab();
}

async function renderCentralAllAlerts() {
  const body = document.getElementById('central-all-alerts-body');
  const countBadge = document.getElementById('central-all-alerts-count');
  const browseBody = document.getElementById('central-alerts-content') || body;
  if (spokeCentralBrowseData && browseBody) {
    renderSpokeCaAlertsTab(browseBody, spokeCentralBrowseData.alerts || [], (centralSearchInput?.value || '').trim().toLowerCase());
    if (countBadge) countBadge.textContent = (spokeCentralBrowseData.alerts || []).length ? `(${(spokeCentralBrowseData.alerts || []).length})` : '';
    return;
  }
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
  const browseBody = document.getElementById('central-clients-content');
  if (spokeCentralBrowseData && browseBody) {
    renderSpokeCaClientsTab(browseBody, spokeCentralBrowseData.clients_by_site || {}, (centralSearchInput?.value || '').trim().toLowerCase(), spokeCentralBrowseData.clients || []);
    return;
  }
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


async function loadSiteDevices(wsite) {
  if (!centralSiteDevices) return;
  const isCnx = (currentSettings.central_api?.mode === 'central') ||
                (currentSettings.central_config?.api_version === 'new_central');
  // Show/hide the devices section based on mode
  document.querySelectorAll('.cnx-only').forEach((el) => {
    el.classList.toggle('hidden', !isCnx);
  });
  if (!isCnx) return;

  centralSiteDevices.textContent = 'Loading devices…';
  if (centralSiteDevicesCount) centralSiteDevicesCount.textContent = '';
  const centralSite = currentSettings.site_mappings?.[wsite] || wsite;
  try {
    const data = await requestJson(`/api/central/devices?site=${encodeURIComponent(centralSite)}`);
    renderSiteDevices(data.devices || [], data.warning, data.count || 0);
  } catch (err) {
    centralSiteDevices.textContent = `Could not load devices: ${err.message}`;
  }
}

function renderSiteDevices(devices, warning, total) {
  if (!centralSiteDevices) return;
  centralSiteDevices.textContent = '';
  if (centralSiteDevicesCount) {
    centralSiteDevicesCount.textContent = total ? `(${total})` : '';
  }

  if (warning && !devices.length) {
    const msg = document.createElement('div');
    msg.className = 'form-hint';
    msg.textContent = warning;
    centralSiteDevices.appendChild(msg);
    return;
  }
  if (warning) {
    const msg = document.createElement('div');
    msg.className = 'form-hint';
    msg.textContent = `⚠ ${warning}`;
    centralSiteDevices.appendChild(msg);
  }

  const table = document.createElement('table');
  table.className = 'history-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Status', 'Name', 'Type', 'Model', 'IP', 'Version'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  devices.forEach((dev) => {
    const row = document.createElement('tr');
    const statusUp = ['UP', 'ONLINE'].includes((dev.status || '').toUpperCase());
    [
      null,  // status dot handled separately
      dev.name || '—',
      (dev.type || '—').replace('_', ' '),
      dev.model || '—',
      dev.ip || '—',
      dev.version || '—',
    ].forEach((val, i) => {
      const td = document.createElement('td');
      if (i === 0) {
        const dot = document.createElement('span');
        dot.className = `status-dot ${statusUp ? 'online' : 'offline'}`;
        dot.title = dev.status || 'Unknown';
        td.appendChild(dot);
        td.appendChild(document.createTextNode(' ' + (dev.status || '—')));
        if (!statusUp) td.style.color = 'var(--color-error, #c0392b)';
      } else {
        td.textContent = val;
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  centralSiteDevices.appendChild(table);
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
  loadSiteDevices(wsite);
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
    await loadSpokeAuthSettings(settings).catch(() => {});
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
  const provider = document.getElementById('spoke-acme-dns-provider')?.value || 'cloudflare';
  const allFields = ['cloudflare', 'he', 'godaddy', 'do', 'porkbun', 'gcloud', 'dnsimple', 'azure', 'route53', 'namecheap'];
  allFields.forEach((p) => document.getElementById(`spoke-acme-${p}-fields`)?.classList.add('hidden'));
  const map = {
    cloudflare: 'spoke-acme-cloudflare-fields',
    hurricane_electric: 'spoke-acme-he-fields',
    godaddy: 'spoke-acme-godaddy-fields',
    digitalocean: 'spoke-acme-do-fields',
    porkbun: 'spoke-acme-porkbun-fields',
    gcloud: 'spoke-acme-gcloud-fields',
    dnsimple: 'spoke-acme-dnsimple-fields',
    azure_dns: 'spoke-acme-azure-fields',
    route53: 'spoke-acme-route53-fields',
    namecheap: 'spoke-acme-namecheap-fields',
  };
  const target = map[provider];
  if (target) document.getElementById(target)?.classList.remove('hidden');
}

function renderSpokeAcmeStatus(certInfo = {}, cfg = {}) {
  const container = document.getElementById('spoke-acme-cert-status');
  if (!container) return;
  if (!certInfo || certInfo.source === 'none') {
    container.innerHTML = `
      <div class="setup-status-item"><span class="setup-status-label">Certificate</span><span class="setup-status-value">Not configured</span></div>
      <div class="setup-status-item"><span class="setup-status-label">Challenge</span><span class="setup-status-value">DNS-01</span></div>
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
  const creds = data.dns_credentials || {};
  const configured = data.dns_credentials_configured || {};
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  setValue('spoke-acme-domain', data.domain || '');
  setValue('spoke-acme-email', data.email || '');
  setValue('spoke-acme-ca', data.ca || 'letsencrypt');
  setValue('spoke-acme-dns-provider', data.dns_provider || 'cloudflare');
  setValue('spoke-acme-gcloud-sa-json', configured.gcloud_service_account_json || creds.gcloud_service_account_json || '');
  setValue('spoke-acme-gcloud-zone', creds.gcloud_zone_name || '');
  setValue('spoke-acme-dnsimple-account-id', creds.dnsimple_account_id || '');
  setValue('spoke-acme-azure-tenant', creds.azure_tenant_id || '');
  setValue('spoke-acme-azure-client-id', creds.azure_client_id || '');
  setValue('spoke-acme-azure-sub', creds.azure_subscription_id || '');
  setValue('spoke-acme-azure-rg', creds.azure_resource_group || '');
  setValue('spoke-acme-azure-zone', creds.azure_zone_name || '');
  setValue('spoke-acme-r53-key', creds.route53_access_key || '');
  setValue('spoke-acme-r53-zone-id', creds.route53_zone_id || '');
  setValue('spoke-acme-nc-user', creds.namecheap_username || '');
  setValue('spoke-acme-nc-ip', creds.namecheap_client_ip || '');
  const enabled = document.getElementById('spoke-acme-enabled');
  if (enabled) enabled.checked = !!data.enabled;
  const tlsEnabled = document.getElementById('spoke-tls-enabled');
  if (tlsEnabled) tlsEnabled.checked = data.spoke_tls === 'on';
  setSecretInputConfigured(document.getElementById('spoke-acme-cf-token'), isConfiguredSecretValue(data.cf_api_token_set ?? configured.cf_api_token ?? creds.cf_api_token));
  setSecretInputConfigured(document.getElementById('spoke-acme-he-ddns-key'), isConfiguredSecretValue(data.he_ddns_key_set ?? configured.he_ddns_key ?? creds.he_ddns_key));
  setSecretInputConfigured(document.getElementById('spoke-acme-godaddy-key'), isConfiguredSecretValue(configured.godaddy_api_key ?? creds.godaddy_api_key));
  setSecretInputConfigured(document.getElementById('spoke-acme-godaddy-secret'), isConfiguredSecretValue(configured.godaddy_api_secret ?? creds.godaddy_api_secret));
  setSecretInputConfigured(document.getElementById('spoke-acme-do-token'), isConfiguredSecretValue(configured.do_token ?? creds.do_token));
  setSecretInputConfigured(document.getElementById('spoke-acme-porkbun-key'), isConfiguredSecretValue(configured.porkbun_api_key ?? creds.porkbun_api_key));
  setSecretInputConfigured(document.getElementById('spoke-acme-porkbun-secret'), isConfiguredSecretValue(configured.porkbun_secret_key ?? creds.porkbun_secret_key));
  setSecretInputConfigured(document.getElementById('spoke-acme-dnsimple-token'), isConfiguredSecretValue(configured.dnsimple_token ?? creds.dnsimple_token));
  setSecretInputConfigured(document.getElementById('spoke-acme-azure-client-secret'), isConfiguredSecretValue(configured.azure_client_secret ?? creds.azure_client_secret));
  setSecretInputConfigured(document.getElementById('spoke-acme-r53-secret'), isConfiguredSecretValue(configured.route53_secret_key ?? creds.route53_secret_key));
  setSecretInputConfigured(document.getElementById('spoke-acme-nc-key'), isConfiguredSecretValue(configured.namecheap_api_key ?? creds.namecheap_api_key));
  toggleSpokeAcmeDnsSection();
  renderSpokeAcmeStatus(data.cert_info || {}, data);
}

async function saveSpokeAcmeConfig() {
  const payload = {
    enabled: !!document.getElementById('spoke-acme-enabled')?.checked,
    domain: document.getElementById('spoke-acme-domain')?.value.trim() || '',
    email: document.getElementById('spoke-acme-email')?.value.trim() || '',
    ca: document.getElementById('spoke-acme-ca')?.value || 'letsencrypt',
    challenge: 'dns-01',
    dns_provider: document.getElementById('spoke-acme-dns-provider')?.value || '',
    dns_credentials: {},
    spoke_tls: document.getElementById('spoke-tls-enabled')?.checked ? 'on' : 'off'
  };
  const addSecret = (key, id) => {
    const secret = getSecretInputPayload(document.getElementById(id));
    if (secret.include) payload.dns_credentials[key] = secret.value;
  };
  const addValue = (key, id) => {
    const value = document.getElementById(id)?.value.trim();
    if (value) payload.dns_credentials[key] = value;
  };
  addSecret('cf_api_token', 'spoke-acme-cf-token');
  addSecret('he_ddns_key', 'spoke-acme-he-ddns-key');
  addSecret('godaddy_api_key', 'spoke-acme-godaddy-key');
  addSecret('godaddy_api_secret', 'spoke-acme-godaddy-secret');
  addSecret('do_token', 'spoke-acme-do-token');
  addSecret('porkbun_api_key', 'spoke-acme-porkbun-key');
  addSecret('porkbun_secret_key', 'spoke-acme-porkbun-secret');
  addValue('gcloud_service_account_json', 'spoke-acme-gcloud-sa-json');
  addValue('gcloud_zone_name', 'spoke-acme-gcloud-zone');
  addSecret('dnsimple_token', 'spoke-acme-dnsimple-token');
  addValue('dnsimple_account_id', 'spoke-acme-dnsimple-account-id');
  addValue('azure_tenant_id', 'spoke-acme-azure-tenant');
  addValue('azure_client_id', 'spoke-acme-azure-client-id');
  addSecret('azure_client_secret', 'spoke-acme-azure-client-secret');
  addValue('azure_subscription_id', 'spoke-acme-azure-sub');
  addValue('azure_resource_group', 'spoke-acme-azure-rg');
  addValue('azure_zone_name', 'spoke-acme-azure-zone');
  addValue('route53_access_key', 'spoke-acme-r53-key');
  addSecret('route53_secret_key', 'spoke-acme-r53-secret');
  addValue('route53_zone_id', 'spoke-acme-r53-zone-id');
  addSecret('namecheap_api_key', 'spoke-acme-nc-key');
  addValue('namecheap_username', 'spoke-acme-nc-user');
  addValue('namecheap_client_ip', 'spoke-acme-nc-ip');
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
    const creds = data.dns_credentials || {};
    const configured = data.dns_credentials_configured || {};
    setSecretInputConfigured(document.getElementById('spoke-acme-cf-token'), isConfiguredSecretValue(data.cf_api_token_set ?? configured.cf_api_token ?? creds.cf_api_token));
    setSecretInputConfigured(document.getElementById('spoke-acme-he-ddns-key'), isConfiguredSecretValue(data.he_ddns_key_set ?? configured.he_ddns_key ?? creds.he_ddns_key));
    setSecretInputConfigured(document.getElementById('spoke-acme-godaddy-key'), isConfiguredSecretValue(configured.godaddy_api_key ?? creds.godaddy_api_key));
    setSecretInputConfigured(document.getElementById('spoke-acme-godaddy-secret'), isConfiguredSecretValue(configured.godaddy_api_secret ?? creds.godaddy_api_secret));
    setSecretInputConfigured(document.getElementById('spoke-acme-do-token'), isConfiguredSecretValue(configured.do_token ?? creds.do_token));
    setSecretInputConfigured(document.getElementById('spoke-acme-porkbun-key'), isConfiguredSecretValue(configured.porkbun_api_key ?? creds.porkbun_api_key));
    setSecretInputConfigured(document.getElementById('spoke-acme-porkbun-secret'), isConfiguredSecretValue(configured.porkbun_secret_key ?? creds.porkbun_secret_key));
    setSecretInputConfigured(document.getElementById('spoke-acme-dnsimple-token'), isConfiguredSecretValue(configured.dnsimple_token ?? creds.dnsimple_token));
    setSecretInputConfigured(document.getElementById('spoke-acme-azure-client-secret'), isConfiguredSecretValue(configured.azure_client_secret ?? creds.azure_client_secret));
    setSecretInputConfigured(document.getElementById('spoke-acme-r53-secret'), isConfiguredSecretValue(configured.route53_secret_key ?? creds.route53_secret_key));
    setSecretInputConfigured(document.getElementById('spoke-acme-nc-key'), isConfiguredSecretValue(configured.namecheap_api_key ?? creds.namecheap_api_key));
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
  const centralStatusErrorPrefix = 'Could not load Central status:';
  try {
    const data = await requestJson('/api/central/status');
    applySettingsToUI({
      site_mappings: data.site_mappings || {},
      monitored_checks: data.monitored_checks || [],
      central_api: data.central_api || currentSettings.central_api || defaultCentralApiSettings(),
    });
    if (centralConfigMsg?.textContent?.startsWith(centralStatusErrorPrefix)) {
      showInlineMessage(centralConfigMsg, '', false, 0);
    }
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
    showInlineMessage(centralConfigMsg, `${centralStatusErrorPrefix} ${error.message}`, true, 0);
    if (centralEmpty) {
      centralEmpty.classList.add('hidden');
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

function renderControlPanel(hostname, cellOverride) {
  const client = clients.get(hostname);
  const cell = cellOverride || document.querySelector(`tr.control-row[data-hostname="${CSS.escape(hostname)}"] td`);
  if (!client || !cell) return;

  const baseConfig = client.effective_config || client.config || {};
  cell.textContent = '';

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
  saveOverridesButton.className = 'btn btn-primary';
  saveOverridesButton.style.marginLeft = 'auto';
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
  if (currentSettings.github_token_configured) {
    actions.appendChild(saveOverridesButton);
  }

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
  cell.appendChild(panel);
}

function toggleControlRow(hostname) {
  openControlHost = openControlHost === hostname ? null : hostname;
  renderClientRows();
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

function buildSimBoolCheckbox(section, key, val) {
  const lbl = document.createElement('label');
  lbl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;font-size:0.875rem;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.configSection = section;
  cb.dataset.configKey = key;
  cb.checked = normalizeFlagValue(val) === 'on';
  const span = document.createElement('span');
  span.textContent = _fmtConfigKey(key);
  lbl.appendChild(cb);
  lbl.appendChild(span);
  return lbl;
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
    const flagRow = document.createElement('div');
    flagRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 20px;padding:6px 0;';
    boolPairs.forEach(([key, val]) => flagRow.appendChild(buildSimBoolCheckbox(section, key, val)));
    form.appendChild(flagRow);
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
    summary.style.cssText = 'cursor:pointer;font-weight:600;';
    summary.textContent = `Simulation S${section.slice(1)}`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'setup-form';

    const fieldGrid = document.createElement('div');
    fieldGrid.className = 'form-grid';

    // Text inputs (preserve file order, skip booleans and sim_phy)
    Object.entries(values).forEach(([key, val]) => {
      if (key === 'sim_phy' || _isBoolVal(val)) return;
      const { group } = buildConfigInput(
        { section, key, type: PW_KEY_RE.test(key) ? 'password' : 'text' },
        val,
      );
      const lbl = group.querySelector('label');
      if (lbl) lbl.textContent = _fmtConfigKey(key);
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

    // Compact inline checkboxes (no Flags heading)
    const boolPairs = Object.entries(values).filter(([k, v]) => k !== 'sim_phy' && _isBoolVal(v));
    if (boolPairs.length) {
      const flagRow = document.createElement('div');
      flagRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 20px;padding:6px 0;';
      boolPairs.forEach(([key, val]) => flagRow.appendChild(buildSimBoolCheckbox(section, key, val)));
      body.appendChild(flagRow);
    }

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn btn-primary';
    saveButton.textContent = `Save S${section.slice(1)} to GitHub`;
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
        showInlineMessage(message, result?.pushed ? `Simulation S${section.slice(1)} saved and pushed to GitHub.` : `Simulation S${section.slice(1)} saved. GitHub push skipped.`, false, 7000);
        await loadConfigEditor(true);
      } catch (error) {
        showInlineMessage(message, `Error: ${error.message}`, true, 7000);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = `Save S${section.slice(1)} to GitHub`;
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

const cmdTarget       = document.getElementById('cmd-target');
const cmdAction       = document.getElementById('cmd-action');
const cmdSendBtn      = document.getElementById('cmd-send-btn');
const cmdClearBtn     = document.getElementById('cmd-clear-btn');
const cmdCancelAllBtn = document.getElementById('cmd-cancel-all-btn');
const cmdMsg          = document.getElementById('cmd-msg');
const cmdTbody        = document.getElementById('cmd-tbody');
const cmdEmpty        = document.getElementById('cmd-empty');

// Re-render on search input
document.getElementById('cmd-search')?.addEventListener('input', () => {
  if (window._lastCommands) renderCommandTable(window._lastCommands);
});

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
  config_update:        'Hub config update',
  config_clear:         'Hub config clear',
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
  const query = (document.getElementById('cmd-search')?.value || '').trim().toLowerCase();
  const filtered = query
    ? (cmds || []).filter(cmd =>
        (cmdTargetLabel(cmd) || '').toLowerCase().includes(query) ||
        (cmd.action || '').toLowerCase().includes(query) ||
        (cmdDescription(cmd) || '').toLowerCase().includes(query) ||
        (cmd.message || '').toLowerCase().includes(query) ||
        (cmd.status || '').toLowerCase().includes(query)
      )
    : (cmds || []);
  cmdTbody.innerHTML = '';
  if (!filtered.length) {
    cmdEmpty.style.display = '';
    return;
  }
  cmdEmpty.style.display = 'none';
  [...filtered].reverse().forEach((cmd) => {
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
    descTd.style.wordBreak = 'break-word';
    const descSpan = document.createElement('span');
    descSpan.textContent = cmdDescription(cmd);
    descTd.appendChild(descSpan);
    if (cmd.message) {
      const msgSpan = document.createElement('div');
      msgSpan.style.cssText = 'margin-top:4px;font-size:0.82em;color:var(--muted);word-break:break-word;white-space:normal;';
      msgSpan.textContent = cmd.message;
      descTd.appendChild(msgSpan);
    }
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

if (cmdCancelAllBtn) {
  cmdCancelAllBtn.addEventListener('click', async () => {
    const res = await fetch('/api/commands/cancel-all', { method: 'POST' });
    const data = res.ok ? await res.json() : null;
    const count = data?.cancelled ?? 0;
    if (cmdMsg) {
      cmdMsg.textContent = count > 0 ? `✅ Cancelled ${count} queued command(s).` : 'No pending commands to cancel.';
      cmdMsg.className = 'form-msg ' + (count > 0 ? 'success' : 'info');
      setTimeout(() => { cmdMsg.textContent = ''; cmdMsg.className = 'form-msg'; }, 4000);
    }
  });
}

const trblClearQueueBtn = document.getElementById('trbl-clear-queue-btn');
if (trblClearQueueBtn) {
  trblClearQueueBtn.addEventListener('click', async () => {
    trblClearQueueBtn.disabled = true;
    trblClearQueueBtn.textContent = 'Clearing…';
    try {
      const res = await fetch('/api/commands/cancel-all', { method: 'POST' });
      const data = res.ok ? await res.json() : null;
      const count = data?.cancelled ?? 0;
      trblClearQueueBtn.textContent = count > 0 ? `✅ Cleared ${count}` : '✅ Empty';
    } catch {
      trblClearQueueBtn.textContent = '❌ Error';
    } finally {
      setTimeout(() => { trblClearQueueBtn.disabled = false; trblClearQueueBtn.textContent = '🧹 Clear Message Queue'; }, 3000);
    }
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
    // Refresh the Proxmox Servers list if the Setup → Proxmox tab is visible
    if (document.getElementById('px-servers-tbody') && !document.getElementById('setup-proxmox')?.classList.contains('hidden')) {
      loadPxServersList().catch(() => {});
    }
    return;
  }

  if (message.type === 'proxmox_pending_update') {
    renderProxmoxPending(message.pending || []);
    // Refresh the Proxmox Servers list if the Setup → Proxmox tab is visible
    if (document.getElementById('px-servers-tbody') && !document.getElementById('setup-proxmox')?.classList.contains('hidden')) {
      loadPxServersList().catch(() => {});
    }
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

  if (message.type === 'server_pressure') {
    applyServerPressure(message);
    return;
  }

  if (['status_update', 'overrides_update', 'overrides_cleared'].includes(message.type) && message.client) {
    upsertClient(message.client);
    updateCmdTargetDropdown();
    return;
  }

  if (message.type === 'clients_purged') {
    clients.clear();
    openControlHost = null;
    renderClientRows();
    updateCmdTargetDropdown([]);
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const spokeWsToken = (typeof window.__SPOKE_WS_TOKEN__ !== 'undefined' && window.__SPOKE_WS_TOKEN__)
    ? `?token=${encodeURIComponent(window.__SPOKE_WS_TOKEN__)}` : '';
  socket = new WebSocket(`${protocol}://${window.location.host}/ws${spokeWsToken}`);
  setWsStatus(false, 'Connecting');

  socket.addEventListener('open', () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    setWsStatus(true, 'Connected');
    // Start msg/s refresh timer
    if (_msgRateTimer) clearInterval(_msgRateTimer);
    _msgRateTimer = setInterval(_updatePressureBadge, 2000);
    _updatePressureBadge();
    // Refresh all data on reconnect so stale state doesn't linger after a disconnect
    if (_spokeBooted) refreshAll().catch(() => {});
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
    _recordWsMsg();
    try {
      handleMessage(JSON.parse(event.data));
    } catch (error) {
      console.error('Invalid WS message', error);
    }
  });

  socket.addEventListener('close', () => {
    if (_msgRateTimer) { clearInterval(_msgRateTimer); _msgRateTimer = null; }
    if (serverPressureIndicator) serverPressureIndicator.style.display = 'none';
    setWsStatus(false, 'Disconnected');
    // If an update was running, the service is restarting — don't show an error
    if (updateWasInProgress && updateMsg) {
      updateWasInProgress = false;
      updateMsg.textContent = '🔄 Service restarting — reconnecting…';
      updateMsg.className = 'settings-message success';
      updateMsg.classList.remove('hidden');
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
const simTopPanels = ['simtop-checks', 'simtop-hardware', 'simtop-clients', 'simtop-sites', 'simtop-alerts', 'simtop-insights'];

// Hub-synced monitored items for spoke — populated by pollSpokeHubMonitoredItems()
let _spokeHubMonitoredItems = { items: [], has_sites: false, assigned_sites: [] };

async function pollSpokeHubMonitoredItems() {
  try {
    const res = await apiFetch('/api/relay/monitored-items');
    if (res?.ok) {
      const data = await readJson(res);
      if (data && Array.isArray(data.items)) {
        _spokeHubMonitoredItems = data;
        renderSpokeStatusTab();
        renderSpokeMonitoredItems();
      }
    }
  } catch (_) {}
}

function renderSpokeStatusTab() {
  const container = document.getElementById('spoke-status-content');
  if (!container) return;

  const now = new Date().toLocaleTimeString();
  const refreshEl = document.getElementById('spoke-status-last-refreshed');
  if (refreshEl) refreshEl.textContent = `Last refreshed: ${now}`;

  if (!_spokeHubMonitoredItems.has_sites) {
    container.innerHTML = `<div class="central-empty">No site assigned to this spoke. Assign a site in the hub to sync monitoring data.</div>`;
    return;
  }

  const tonePriority = { red: 0, yellow: 1, orange: 1, green: 2, gray: 3 };
  const sortByTone = (a, b) => (tonePriority[a._tone] ?? 3) - (tonePriority[b._tone] ?? 3);

  const dot = (tone) => {
    const cls = tone === 'green' ? 'dot-pass' : tone === 'red' ? 'dot-fail' : tone === 'yellow' || tone === 'orange' ? 'dot-warn' : 'dot-unknown';
    return `<span class="check-dot ${cls}"></span>`;
  };
  const badge = (tone, label) => {
    const cls = tone === 'green' ? 'sim-pass' : tone === 'red' ? 'sim-fail' : tone === 'yellow' || tone === 'orange' ? 'sim-warn' : 'sim-unknown';
    return `<span class="check-badge ${cls}">${escHtml(label)}</span>`;
  };

  const makeSection = (title, rows) => {
    if (!rows.length) return `
      <div class="setup-card" style="margin-bottom:0.75rem;">
        <div style="font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:0.5rem;">${escHtml(title)}</div>
        <div class="central-empty" style="padding:0.4rem 0;font-size:0.85rem;">None configured.</div>
      </div>`;
    const rowsHtml = rows.map((r) => `
      <div class="check-row" style="cursor:default;">
        ${dot(r._tone)}
        <span class="check-name">${r._name}</span>
        ${badge(r._tone, r._label)}
      </div>`).join('');
    return `
      <div class="setup-card" style="margin-bottom:0.75rem;">
        <div style="font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:0.5rem;">${escHtml(title)}</div>
        <div class="sim-checks-list" style="border:none;padding:0;">${rowsHtml}</div>
      </div>`;
  };

  const items = _spokeHubMonitoredItems.items || [];
  const monRows = (type) => items
    .filter((item) => item.type === type)
    .map((item) => {
      const isOk = item.status === 'ok' || !item.consecutive_failures;
      const tone = isOk ? 'green' : 'red';
      const label = isOk ? 'OK' : `Missing (${item.consecutive_failures || 0})`;
      return { _tone: tone, _label: label, _name: escHtml(item.name || item.identifier || '—') };
    })
    .sort(sortByTone);

  container.innerHTML =
    makeSection('Sites', monRows('site')) +
    makeSection('Alerts', monRows('alert')) +
    makeSection('Insights', monRows('insight')) +
    makeSection('Clients', monRows('client'));
}

function renderSpokeMonitoredItems() {
  // Use hub-synced items if available, fall back to local monitored_checks
  const checks = _spokeHubMonitoredItems.has_sites
    ? (_spokeHubMonitoredItems.items || [])
    : (currentSettings.monitored_checks || []);
  const DEST = {
    site:    'spoke-monitored-sites-content',
    alert:   'spoke-monitored-alerts-content',
    client:  'spoke-monitored-clients-content',
    insight: 'spoke-monitored-insights-content',
  };
  const LABELS = { site: 'Monitored Sites', alert: 'Monitored Alerts', client: 'Monitored Clients', insight: 'Monitored Insights' };
  const EMPTY  = { site: 'No monitored sites configured.', alert: 'No monitored alerts configured.', client: 'No monitored clients configured.', insight: 'No monitored insights configured.' };
  const byType = { site: [], alert: [], client: [], insight: [] };
  checks.forEach((c) => { if (byType[c.type]) byType[c.type].push(c); });

  const makeTable = (items, type) => {
    if (!items.length) return '';
    const rows = items.map((item) => {
      const isOk = !item.consecutive_failures;
      const dot  = isOk ? 'check-dot dot-pass' : 'check-dot dot-fail';
      const lastSeen = item.last_seen ? new Date(item.last_seen * 1000).toLocaleString() : '—';
      const badge = isOk
        ? `<span class="badge badge-success">Reporting</span>`
        : `<span class="badge badge-failure">Missing (${item.consecutive_failures || 0})</span>`;
      return `<tr>
        <td><span class="${dot}"></span></td>
        <td><strong>${escHtml(item.name || item.identifier || '—')}</strong></td>
        <td>${escHtml(item.identifier || '—')}</td>
        <td>${badge}</td>
        <td style="color:var(--muted);font-size:0.8rem;">${escHtml(lastSeen)}</td>
      </tr>`;
    }).join('');
    return `<div class="setup-card" style="margin-bottom:1rem;">
      <h4 style="margin:0 0 0.5rem;color:var(--muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;">${escHtml(LABELS[type])}</h4>
      <div style="overflow-x:auto;"><table class="data-table">
        <thead><tr><th></th><th>Name</th><th>Identifier</th><th>Status</th><th>Last Seen</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  };

  Object.entries(DEST).forEach(([type, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const html = makeTable(byType[type], type);
    el.innerHTML = html || `<div class="central-empty">${escHtml(EMPTY[type])}</div>`;
  });
}

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
  if (tabId === 'simtop-checks') renderSpokeStatusTab();
  if (tabId === 'simtop-hardware') renderHwPanel();
  if (tabId === 'simtop-clients') renderCcPanel();
  renderSpokeMonitoredItems();
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
  'ssidpw_fail', 'auth_fail',
];
const SIM_TEST_LABELS = {
  dns_fail:    'DNS Fail',
  assoc_fail:  'Association Fail',
  dhcp_fail:   'DHCP Fail',
  port_flap:   'Port Flap',
  iperf:       'iPerf',
  www_traffic: 'Web Traffic',
  download:    'Download',
  ping_test:   'Ping Test',
  ssidpw_fail: 'Bad SSID Password',
  auth_fail:   'Auth Fail',
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

// ─── Demo Scenario UI ────────────────────────────────────────────────────────

const DEMO_SCENARIO_LABELS = {
  normal:      { label: 'Normal',    icon: '✓', cls: 'demo-btn-normal'   },
  dns_fail:    { label: 'DNS Fail',  icon: '✗', cls: 'demo-btn-fail'    },
  dhcp_fail:   { label: 'DHCP Fail', icon: '✗', cls: 'demo-btn-fail'    },
  assoc_fail:  { label: 'Assoc Fail',icon: '✗', cls: 'demo-btn-fail'    },
  auth_fail:   { label: 'Auth Fail', icon: '✗', cls: 'demo-btn-fail'    },
  ssidpw_fail: { label: 'SSID PW',   icon: '✗', cls: 'demo-btn-fail'    },
  port_flap:   { label: 'Port Flap', icon: '⚡', cls: 'demo-btn-fail'    },
};

const DEMO_SCENARIOS_LIST = [
  { key: 'normal',      label: '— Normal (no failure) —' },
  { key: 'dns_fail',    label: 'DNS Fail'    },
  { key: 'dhcp_fail',   label: 'DHCP Fail'   },
  { key: 'assoc_fail',  label: 'Assoc Fail'  },
  { key: 'auth_fail',   label: 'Auth Fail'   },
  { key: 'ssidpw_fail', label: 'SSID PW Fail' },
  { key: 'port_flap',   label: 'Port Flap'   },
];

async function _loadDemoActive() {
  try {
    const r = await fetch('/api/demo/active');
    if (!r.ok) return;
    const d = await r.json();
    _demoActiveMap = {};
    (d.active || []).forEach((e) => { _demoActiveMap[e.hostname] = e; });
  } catch (_) {}
}

async function _triggerDemoScenario(hostname, scenario) {
  try {
    const r = await fetch(`/api/demo/client/${encodeURIComponent(hostname)}/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Request failed'); }
    const d = await r.json();
    if (scenario === 'normal') {
      delete _demoActiveMap[hostname];
    } else {
      _demoActiveMap[hostname] = { hostname, scenario, minutes_remaining: 120 };
    }
    return d;
  } catch (e) {
    showNotification(`Demo scenario failed: ${e.message}`, 'error');
    return null;
  }
}

function _buildDemoScenarioSelect(hostname) {
  const active = _demoActiveMap[hostname];
  const activeScenario = active?.scenario || 'normal';

  const sel = document.createElement('select');
  sel.className = 'demo-scenario-select' + (activeScenario !== 'normal' ? ' demo-scenario-select--active' : '');
  sel.title = 'Select a failure scenario to simulate on this client';
  DEMO_SCENARIOS_LIST.forEach(({ key, label }) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    if (key === activeScenario) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', async () => {
    const scenario = sel.value;
    sel.disabled = true;
    const result = await _triggerDemoScenario(hostname, scenario);
    sel.disabled = false;
    if (result) {
      sel.className = 'demo-scenario-select' + (scenario !== 'normal' ? ' demo-scenario-select--active' : '');
    } else {
      sel.value = activeScenario; // revert on failure
    }
  });
  return sel;
}

async function openSimClients(simId, wsite, testKey, alertPf, checkLabel) {
  simDetail.classList.add('hidden');
  simClientsPanel.classList.remove('hidden');

  if (simClientsTitle) simClientsTitle.textContent = checkLabel || 'Clients';
  if (simClientsSub)  simClientsSub.textContent  = `Site: ${wsite}`;
  if (simClientsList) simClientsList.innerHTML = '<div class="sim-clients-loading">Loading…</div>';

  // Alert polarity: alert PRESENT in Central = GREEN (sim is working)
  const alertMonitored = alertPf !== null && alertPf !== undefined;
  const alertFiring    = alertMonitored && alertPf.firing === true;

  try {
    const isAdmin = spokeCurrentUser?.role === 'admin';
    if (isAdmin) await _loadDemoActive();

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

      // Demo scenario select (admin only on spoke)
      if (isAdmin) {
        card.appendChild(_buildDemoScenarioSelect(c.hostname));
      }

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
      purgeHistoryBtn.textContent = '🗑 Purge Clients';
    }
  });
}

simTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    loadSimulations();
  });
});

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

centralTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!centralStatusInitialized || !Object.keys(centralStatusData).length) {
      loadCentralStatus().catch(() => {});
    } else {
      renderCentralOverview();
    }
    if (!spokeCentralBrowseData) {
      fetchSpokeCentralBrowse().catch(() => {});
    } else {
      renderSpokeCaBrowseTab();
    }
  });
});

// configSimulationSaveBtn removed — each section now has its own per-section Save button

// ─── Hub-managed conf overrides (spoke side) ───────────────────────────────

let _spokeConfOverrideState = { simContent: null, userContent: null, loading: false };

function _escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _setOverrideMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--hpe-green, #01A982)' : 'var(--danger, #c00)';
  el.style.display = text ? '' : 'none';
}

async function loadSpokeConfOverrides(force = false) {
  const container = document.getElementById('spoke-conf-overrides-content');
  if (!container) return;
  if (!force && _spokeConfOverrideState.simContent !== null) {
    renderSpokeConfOverrides();
    return;
  }
  _spokeConfOverrideState.loading = true;
  container.innerHTML = '<div class="empty-state">Loading overrides…</div>';
  const [simRes, userRes] = await Promise.all([
    fetch('/api/config/hub-sim-override'),
    fetch('/api/config/hub-user-override'),
  ]);
  _spokeConfOverrideState = {
    simContent: simRes.ok ? await simRes.text() : '',
    userContent: userRes.ok ? await userRes.text() : '',
    loading: false,
  };
  renderSpokeConfOverrides();
}

function renderSpokeConfOverrides() {
  const container = document.getElementById('spoke-conf-overrides-content');
  if (!container) return;
  const hubManaged = currentSettings.hub_managed;
  const { simContent, userContent } = _spokeConfOverrideState;
  const simActive = simContent !== null && simContent !== '';
  const userActive = userContent !== null && userContent !== '';
  const readonlyNote = hubManaged
    ? '<p class="muted" style="font-size:0.85rem;">⚠ This spoke is hub-managed. Overrides are set by the hub and distributed automatically. Edits here apply in standalone mode only if the hub is unreachable.</p>'
    : '';

  container.innerHTML = `
    <div class="setup-section-gap">
      ${readonlyNote}
      <section class="setup-card">
        <div class="setup-card-header">
          <h2>simulation.conf Override
            <span class="site-status-pill ${simActive ? 'site-ok' : 'site-unknown'}" style="margin-left:8px;font-size:0.75rem;">${simActive ? 'ACTIVE' : 'NOT SET'}</span>
          </h2>
          <p>Override values from <code>simulation.conf</code> without pushing to GitHub. Uses the same INI format.
             When connected to a hub, the hub manages this file; edits here are for standalone use only.</p>
        </div>
        <div class="setup-form">
          <div class="form-group">
            <textarea id="spoke-sim-override-textarea" class="form-input code-textarea" rows="12" spellcheck="false"
              placeholder="[simulation]&#10;simulation_count = 10&#10;&#10;[server]&#10;some_key = value">${_escHtml(simContent || '')}</textarea>
          </div>
          <div class="form-actions">
            <button id="spoke-sim-override-save-btn" class="btn btn-primary" type="button">Save Override</button>
            <button id="spoke-sim-override-clear-btn" class="btn btn-secondary" type="button">Clear Override</button>
            <span id="spoke-sim-override-msg" class="form-msg" style="display:none;margin-left:8px;"></span>
          </div>
        </div>
      </section>

      <section class="setup-card">
        <div class="setup-card-header">
          <h2>user-overrides.conf Override
            <span class="site-status-pill ${userActive ? 'site-ok' : 'site-unknown'}" style="margin-left:8px;font-size:0.75rem;">${userActive ? 'ACTIVE' : 'NOT SET'}</span>
          </h2>
          <p>Override per-user simulation flags from <code>user-overrides.conf</code> without pushing to GitHub.
             Uses the same INI format. In hub-managed mode this is delivered by the hub.</p>
        </div>
        <div class="setup-form">
          <div class="form-group">
            <textarea id="spoke-user-override-textarea" class="form-input code-textarea" rows="12" spellcheck="false"
              placeholder="[simulation]&#10;some_flag = value&#10;&#10;[alice]&#10;some_flag = alice-value">${_escHtml(userContent || '')}</textarea>
          </div>
          <div class="form-actions">
            <button id="spoke-user-override-save-btn" class="btn btn-primary" type="button">Save Override</button>
            <button id="spoke-user-override-clear-btn" class="btn btn-secondary" type="button">Clear Override</button>
            <span id="spoke-user-override-msg" class="form-msg" style="display:none;margin-left:8px;"></span>
          </div>
        </div>
      </section>
    </div>
  `;

  document.getElementById('spoke-sim-override-save-btn')?.addEventListener('click', () => saveSpokeConfOverride('sim'));
  document.getElementById('spoke-sim-override-clear-btn')?.addEventListener('click', () => clearSpokeConfOverride('sim'));
  document.getElementById('spoke-user-override-save-btn')?.addEventListener('click', () => saveSpokeConfOverride('user'));
  document.getElementById('spoke-user-override-clear-btn')?.addEventListener('click', () => clearSpokeConfOverride('user'));
}

async function saveSpokeConfOverride(type) {
  const isSimType = type === 'sim';
  const textareaId = isSimType ? 'spoke-sim-override-textarea' : 'spoke-user-override-textarea';
  const msgId = isSimType ? 'spoke-sim-override-msg' : 'spoke-user-override-msg';
  const endpoint = `/api/config/hub-${isSimType ? 'sim' : 'user'}-override`;
  const content = document.getElementById(textareaId)?.value ?? '';
  _setOverrideMsg(msgId, 'Saving…', true);
  try {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      _setOverrideMsg(msgId, d?.detail || 'Unable to save.', false);
      return;
    }
    if (isSimType) _spokeConfOverrideState.simContent = content;
    else _spokeConfOverrideState.userContent = content;
    _setOverrideMsg(msgId, 'Saved.', true);
    renderSpokeConfOverrides();
  } catch (e) {
    _setOverrideMsg(msgId, `Error: ${e.message}`, false);
  }
}

async function clearSpokeConfOverride(type) {
  const isSimType = type === 'sim';
  const msgId = isSimType ? 'spoke-sim-override-msg' : 'spoke-user-override-msg';
  const endpoint = `/api/config/hub-${isSimType ? 'sim' : 'user'}-override`;
  _setOverrideMsg(msgId, 'Clearing…', true);
  try {
    const res = await fetch(endpoint, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      _setOverrideMsg(msgId, d?.detail || 'Unable to clear.', false);
      return;
    }
    if (isSimType) _spokeConfOverrideState.simContent = '';
    else _spokeConfOverrideState.userContent = '';
    _setOverrideMsg(msgId, 'Cleared.', true);
    renderSpokeConfOverrides();
  } catch (e) {
    _setOverrideMsg(msgId, `Error: ${e.message}`, false);
  }
}


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
    hub_tls_verify: relayHubTlsVerifyInput?.checked ? 'on' : 'off',
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
if (relayHubTlsVerifyInput) relayHubTlsVerifyInput.addEventListener('change', _autoSaveRelay);
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
      const displayLines = logLines.length ? [...logLines].reverse() : [];
      serviceLogsOutputEl.textContent = displayLines.length ? displayLines.join('\n') : '(no service logs available)';
      serviceLogsOutputEl.scrollTop = 0;
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

// ── Push USB Allowlist to All Spokes ─────────────────────────────────────────
// Fetches all approved spokes for the current tenant and sends the hub's
// usb_vidpids list to each one via the spoke config push API.
// This makes the hub the authority for USB allowlist on every managed spoke.
const pushUsbAllowlistBtn = document.getElementById('push-usb-allowlist-btn');
if (pushUsbAllowlistBtn) {
  pushUsbAllowlistBtn.addEventListener('click', async () => {
    const msgEl = document.getElementById('push-usb-allowlist-msg');
    const tenantId = currentTenantId;
    if (!tenantId) {
      if (msgEl) msgEl.textContent = 'No tenant selected.';
      return;
    }
    // Collect the current allowlist from hub settings — this is what we will push.
    const vidpids = currentSettings.usb_vidpids;
    pushUsbAllowlistBtn.disabled = true;
    if (msgEl) msgEl.textContent = 'Pushing…';
    try {
      // Fetch all spokes for this tenant so we can push to each approved one.
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
      const data = await readJson(res);
      if (!res || !res.ok) throw new Error(data?.detail || 'Unable to load spokes.');
      const spokes = (data.spokes || data || []).filter((s) => s.status === 'approved');
      if (!spokes.length) {
        if (msgEl) msgEl.textContent = 'No approved spokes found.';
        return;
      }
      // Push usb_vidpids to each approved spoke sequentially; collect any errors.
      const errors = [];
      for (const spoke of spokes) {
        try {
          await pushSpokeConfig(tenantId, spoke.id, { usb_vidpids: vidpids });
        } catch (err) {
          errors.push(`${spoke.name || spoke.id}: ${err.message}`);
        }
      }
      if (errors.length) {
        if (msgEl) msgEl.textContent = `Pushed with errors: ${errors.join('; ')}`;
      } else {
        if (msgEl) msgEl.textContent = `✓ Pushed to ${spokes.length} spoke${spokes.length !== 1 ? 's' : ''}`;
        // Clear the success message after 4 seconds so the UI doesn't feel stale.
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 4000);
      }
    } catch (err) {
      if (msgEl) msgEl.textContent = `Error: ${err.message}`;
    } finally {
      // Always re-enable the button so the user can retry if something failed.
      pushUsbAllowlistBtn.disabled = false;
    }
  });
}

// Wire the refresh button for the unknown-USB-from-spokes table.
const refreshUnknownUsbBtn = document.getElementById('refresh-unknown-usb-btn');
if (refreshUnknownUsbBtn) {
  refreshUnknownUsbBtn.addEventListener('click', () => {
    // Re-fetch spoke telemetry and re-render the unknown device table.
    loadAndRenderSpokeUnknownUsb().catch(() => {});
  });
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
  const validationError = updateTemplateSpecValidation();
  if (validationError) {
    showInlineMessage(msgEl, validationError, true, 0);
    return;
  }
  try {
    const payload = collectUsbSettingsPayload();
    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    currentSettings.vm_image_1_template_id = payload.vm_image_1_template_id;
    currentSettings.vm_image_1_template_spec = payload.vm_image_1_template_spec;
    currentSettings.vm_image_2_template_id = payload.vm_image_2_template_id;
    currentSettings.vm_image_2_template_spec = payload.vm_image_2_template_spec;
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
[usbMissingTimeoutInput, usbMaxSlotsInput, vmImage1PctInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveUsb(usbSettingsMsg));
});
[vmImage1TemplateIdInput, vmImage2TemplateIdInput].forEach((el) => {
  if (!el) return;
  el.addEventListener('input', updateTemplateSpecValidation);
  el.addEventListener('blur', () => _autoSaveUsb(usbSettingsMsg));
});
// Protected VMIDs — save on blur (was missing, causing value to not persist)
const protectedVmidsInput = document.getElementById('protected-vmids');
if (protectedVmidsInput) protectedVmidsInput.addEventListener('blur', () => _autoSaveUsb(usbSettingsMsg));

// Layer 1 VLAN — save on blur
[l1VlanStartInput, l1VlanEndInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveUsb(l1VlanMsg));
});

// VM Agent Watchdog — save on change/blur
['guest-agent-watchdog-enabled', 'watchdog-reboot-enabled'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => _autoSaveUsb(agentWatchdogMsg));
});
['guest-agent-grace-minutes', 'guest-agent-check-interval-minutes',
 'guest-agent-reboot-after-minutes', 'guest-agent-reclone-after-minutes'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('blur', () => _autoSaveUsb(agentWatchdogMsg));
});

// VM Maintenance — checkboxes/selects: save on change; number/time inputs: save on blur.
if (recloneScheduleEnabledInput) recloneScheduleEnabledInput.addEventListener('change', () => _autoSaveVmMaintenance(vmMaintenanceMsg));
if (recloneScheduleDayInput)     recloneScheduleDayInput.addEventListener('change',  () => _autoSaveVmMaintenance(vmMaintenanceMsg));
[vmSilentTimeoutInput, recloneScheduleTimeInput, recloneConcurrencyInput].forEach((el) => {
  if (el) el.addEventListener('blur', () => _autoSaveVmMaintenance(vmMaintenanceMsg));
});
// VM Server card concurrency — keep in sync with Settings panel input and auto-save
if (vmRecloneConcurrencyInput) {
  vmRecloneConcurrencyInput.addEventListener('change', () => {
    if (recloneConcurrencyInput) recloneConcurrencyInput.value = vmRecloneConcurrencyInput.value;
    _autoSaveVmMaintenance(vmMaintenanceMsg);
  });
  vmRecloneConcurrencyInput.addEventListener('blur', () => {
    if (recloneConcurrencyInput) recloneConcurrencyInput.value = vmRecloneConcurrencyInput.value;
    _autoSaveVmMaintenance(vmMaintenanceMsg);
  });
}

if (centralRefreshBtn) {
  centralRefreshBtn.addEventListener('click', async () => {
    const originalLabel = centralRefreshBtn.textContent;
    centralRefreshBtn.disabled = true;
    centralRefreshBtn.textContent = 'Refreshing…';
    try {
      await requestJson('/api/central/poll', { method: 'POST' });
      await loadCentralStatus();
      await fetchSpokeCentralBrowse(true);
    } catch (error) {
      if (centralLastSynced) centralLastSynced.textContent = `Refresh failed: ${error.message}`;
      if (centralUpdatedPill) centralUpdatedPill.textContent = 'Refresh failed';
    } finally {
      centralRefreshBtn.disabled = false;
      centralRefreshBtn.textContent = originalLabel;
    }
  });
}

if (centralSearchInput) {
  centralSearchInput.addEventListener('input', () => {
    if (spokeCentralBrowseData) renderSpokeCaBrowseTab();
    else renderCentralSites();
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
  // Auto-add rows for any local wsites not yet mapped so user sees dropdowns immediately
  const existingMappings = currentSettings.site_mappings || {};
  localWsites.forEach(wsite => {
    if (!(wsite in existingMappings)) addMappingRow(wsite, '');
  });

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
if (saveEmailBtn) saveEmailBtn.addEventListener('click', _autoSaveEmail);
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
if (saveTeamsBtn) saveTeamsBtn.addEventListener('click', _autoSaveTeams);
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
  const systemHealthMsg = document.getElementById('syshealth-msg');
  try {
    const r = await fetch('/api/system/health');
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`);
    }
    const d = await r.json();
    showInlineMessage(systemHealthMsg, '', false, 0);

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
  } catch (error) {
    showInlineMessage(systemHealthMsg, `Could not load system health: ${error.message}`, true, 0);
  }
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
  if (!confirm('Clear all server-side cache?\n\nThis resets Proxmox state, VM list, pending auto-provisioning queue, command history, and reclone logs. No restart is required.')) return;
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
    // Bulk bar hidden for templates (read-only) and viewer sessions
    const bulkBar = document.getElementById('vm-bulk-bar');
    if (bulkBar) bulkBar.classList.toggle('hidden', activeVmCat === 'templates' || spokeCurrentUser?.role === 'viewer');
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

      if (op === 'reclone') {
        const autoProvOn = currentSettings.usb_auto_provision === 'on';
        if (autoProvOn) {
          // Auto-provisioning will redeploy — just delete to avoid race conditions
          const results = await Promise.allSettled(eligible.map((entry) => deleteProxmoxVm(entry.vmid)));
          const failed = results.filter((r) => r.status === 'rejected');
          const successCount = results.length - failed.length;
          if (successCount) {
            showNotification(`Deleted ${successCount} guest(s) — auto-provisioning will redeploy`, 'info');
            scheduleProxmoxRefresh();
          }
          if (failed.length) throw new Error(failed[0].reason?.message || 'One or more deletes failed');
        } else {
          await Promise.all(eligible.map((entry) => sendProxmoxCommand('reclone_vm', entry.vmid, {
            type: entry.vmType || 'qemu',
            source_vmid: entry.sourceVmid ? parseInt(entry.sourceVmid, 10) : undefined,
          })));
          const skipped = selected.length - eligible.length;
          showNotification(`Reclone sent for ${eligible.length} VM(s)${skipped ? ` (${skipped} skipped)` : ''}`, 'info');
        }
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

document.getElementById('server-delete-all-sim')?.addEventListener('click', async () => {
  updateTemplateSpecValidation();
  const configuredTemplateIds = getConfiguredTemplateIds(currentSettings);
  // Parse user-configured protected VMIDs from settings (comma-separated)
  const protectedVmids = new Set(
    String(currentSettings.protected_vmids || '').split(',')
      .map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n))
  );
  // Always protect the webui container VMID
  if (webuiVmid != null) protectedVmids.add(Number(webuiVmid));

  const allVms = Array.isArray(latestProxmoxData?.vms) ? latestProxmoxData.vms : [];
  const scopedVms = proxmoxServerSelected
    ? allVms.filter(v => !v._agent_hostname || v._agent_hostname === proxmoxServerSelected)
    : allVms;
  const simVms = scopedVms.filter(v =>
    Number(v.vmid) > 90000 &&
    v.type !== 'lxc' &&
    !v.is_template &&
    !configuredTemplateIds.has(String(v.vmid)) &&
    !protectedVmids.has(Number(v.vmid)) &&
    v.status !== 'deleting'
  );
  const skippedProtected = scopedVms.filter(v =>
    Number(v.vmid) > 90000 && v.type !== 'lxc' && !v.is_template &&
    protectedVmids.has(Number(v.vmid))
  );
  if (!simVms.length) {
    showNotification(skippedProtected.length
      ? `No simulation VMs to delete (${skippedProtected.length} protected).`
      : 'No simulation client VMs to delete.', 'warning');
    return;
  }
  const serverLabel = proxmoxServerSelected ? ` on ${proxmoxServerSelected}` : '';
  const protectedNote = skippedProtected.length ? `\n\n${skippedProtected.length} protected VM(s) will be skipped.` : '';
  if (!confirm(`Delete all ${simVms.length} simulation client VM(s)${serverLabel}?${protectedNote}\n\nThis cannot be undone. Disable auto-provisioning first if you do not want them re-created.`)) return;
  try {
    const results = await Promise.allSettled(simVms.map(v => deleteProxmoxVm(v.vmid)));
    const failed = results.filter(r => r.status === 'rejected');
    const ok = results.length - failed.length;
    if (ok) { showNotification(`Delete queued for ${ok} simulation VM(s)${skippedProtected.length ? ` (${skippedProtected.length} protected, skipped)` : ''}.`, 'info'); scheduleProxmoxRefresh(); }
    if (failed.length) throw new Error(failed[0].reason?.message || 'One or more deletes failed');
  } catch (err) {
    showNotification(`Error: ${err.message}`, 'error');
  }
});

updateCentralToolbar();
activateSetupSubtab('setup-github');
const updateAllBtn = document.getElementById('update-all-btn');
if (updateAllBtn && !updateAllBtn._bound) {
  updateAllBtn.addEventListener('click', triggerUpdateAll);
  updateAllBtn._bound = true;
}

// ── Spoke authentication ───────────────────────────────────────────────────────
let spokeCurrentUser = null;
let _spokeBooted = false;

async function bootSpokeRuntime() {
  if (_spokeBooted || WEBUI_MODE !== 'spoke') return;
  _spokeBooted = true;
  connectWebSocket();
  loadSimulations();
  // Poll hub for monitored items every relay cycle (default 60s)
  pollSpokeHubMonitoredItems();
  setInterval(() => pollSpokeHubMonitoredItems(), 60_000);
  // Wire spoke Status tab refresh button
  document.getElementById('spoke-status-refresh-btn')?.addEventListener('click', () => pollSpokeHubMonitoredItems());
  try {
    const init = consumeInitPayload() || await requestJson('/api/init');
    if (init.proxmox) {
      if (init.proxmox.webui_vmid != null) webuiVmid = init.proxmox.webui_vmid;
      renderServerTab(init.proxmox);  // always show tab if proxmox block present
    }
    if (init.reclone) renderRecloneStatus(init.reclone);
    if (init.update_all) handleUpdateAllProgress(init.update_all);
    if (init.settings) applySettingsToUI(init.settings);
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
    const fWebui = document.getElementById('footer-cswebui-version');
    const fRepo  = document.getElementById('footer-repo-version');
    const fHost  = document.getElementById('footer-hostname');
    if (fWebui) {
      const ver = init.app_version || init.installer_version || '—';
      fWebui.textContent = `CS-WebUI v${ver}`;
      fWebui.title = `cs-webui frontend version: v${ver}`;
    }
    if (fRepo) {
      const rver = init.installer_version || '—';
      fRepo.textContent = `GitHub Repo v${rver}`;
      fRepo.title = `Installer/repo version: v${rver}`;
    }
    if (fHost && init.hostname) {
      fHost.textContent = init.hostname;
      fHost.title = `Spoke hostname: ${init.hostname}`;
      fHost.style.display = '';
    }
    applySpokeViewerMode();
  } catch (_) { /* silent — WS will provide live state */ }
}

(function initSpokeAuth() {
  if (WEBUI_MODE !== 'spoke') return;

  const overlay = document.getElementById('spoke-login-overlay');
  const loginBtn = document.getElementById('spoke-login-btn');
  const logoutBtn = document.getElementById('spoke-logout-btn');
  const usernameInput = document.getElementById('spoke-login-username');
  const pwInput = document.getElementById('spoke-login-password');
  const errEl = document.getElementById('spoke-login-error');
  const authRequired = !!window.__SPOKE_AUTH_REQUIRED__;
  const provider = normalizeSpokeAuthProvider(String(window.__SPOKE_AUTH_PROVIDER__ || 'local').trim().toLowerCase());

  updateSpokeLoginProviderUi(provider);

  async function doSpokeLogin() {
    const username = usernameInput?.value?.trim() || '';
    const password = pwInput?.value || '';
    if (errEl) errEl.textContent = '';
    if (loginBtn) loginBtn.disabled = true;
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        spokeCurrentUser = {
          username: data.username || username || 'admin',
          role: data.role || 'admin',
          auth_provider: provider,
        };
        window.__SPOKE_AUTHENTICATED__ = true;
        updateSpokeUserUi();
        applySpokeViewerMode();
        if (overlay) overlay.classList.add('hidden');
        if (pwInput) pwInput.value = '';
        await refreshSpokeAuthState().catch(() => {});
        await bootSpokeRuntime();
      } else {
        if (errEl) errEl.textContent = data.detail || (provider === 'local' ? 'Invalid password' : 'Invalid username or password');
        if (pwInput) pwInput.value = '';
        (provider === 'local' ? pwInput : usernameInput)?.focus();
      }
    } catch (_) {
      if (errEl) errEl.textContent = 'Login failed — try again';
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  }

  if (loginBtn && !loginBtn._spokeBound) {
    loginBtn._spokeBound = true;
    loginBtn.addEventListener('click', doSpokeLogin);
  }
  [usernameInput, pwInput].forEach((input) => {
    if (!input || input._spokeBound) return;
    input._spokeBound = true;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doSpokeLogin();
    });
  });

  if (logoutBtn && !logoutBtn._spokeBound) {
    logoutBtn._spokeBound = true;
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      spokeCurrentUser = null;
      updateSpokeUserUi();
      window.location.reload();
    });
  }

  if (!authRequired) {
    updateSpokeUserUi();
    applySpokeViewerMode();
    bootSpokeRuntime();
    return;
  }

  if (!window.__SPOKE_AUTHENTICATED__) {
    if (overlay) overlay.classList.remove('hidden');
    setTimeout(() => (provider === 'local' ? pwInput : usernameInput)?.focus(), 100);
    return;
  }

  refreshSpokeAuthState().catch(() => {});
  bootSpokeRuntime();
})();

const _origFetch = window.fetch;
if (WEBUI_MODE === 'spoke' && window.__SPOKE_AUTH_REQUIRED__) {
  window.fetch = async function (...args) {
    const resp = await _origFetch(...args);
    if (resp.status === 401) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (!url.includes('/api/auth/')) {
        spokeCurrentUser = null;
        updateSpokeUserUi();
        applySpokeViewerMode();
        window.location.reload();
      }
    }
    return resp;
  };
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
let _refreshTimer = null;

async function refreshAll() {
  try {
    const init = await requestJson('/api/init');
    if (init.proxmox) {
      if (init.proxmox.webui_vmid != null) webuiVmid = init.proxmox.webui_vmid;
      renderServerTab(init.proxmox);  // always show tab if proxmox block present
    }
    if (init.reclone) renderRecloneStatus(init.reclone);
    if (init.update_all) handleUpdateAllProgress(init.update_all);
    if (init.settings) applySettingsToUI(init.settings);
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
    // Skip auto-refresh while user is interacting with an input/select/textarea
    // so open dropdowns and text boxes are not destroyed mid-edit.
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) {
      updateRefreshCountdownDisplay('Paused', true);
      return;
    }
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

  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function applyLogFilter() {
    const filter = filterInput.value.trim();
    const normalizedFilter = filter.toLowerCase();
    output.querySelectorAll('.log-line').forEach((line) => {
      const rawText = line._rawText ?? line.textContent ?? '';
      const match = !normalizedFilter || rawText.toLowerCase().includes(normalizedFilter);
      line.style.display = match ? '' : 'none';
      if (match) line.innerHTML = highlight(rawText, filter) + '\n';
    });
  }

  function appendLine(text) {
    const filter = filterInput.value.trim();
    const normalizedText = text.toLowerCase();
    const match = !filter || normalizedText.includes(filter.toLowerCase());

    const span = document.createElement('span');
    span.className = 'log-line ' + classify(text);
    span._rawText = text;
    span.style.display = match ? '' : 'none';
    span.innerHTML = highlight(text, match ? filter : '') + '\n';
    output.prepend(span);

    while (output.children.length > MAX_LINES) output.removeChild(output.lastChild);
    if (autoScroll.checked) output.scrollTop = 0;
  }

  function clearOutput() { output.innerHTML = ''; }

  async function loadHistory() {
    const lines  = linesSelect.value;
    const source = sourceSelect ? sourceSelect.value : 'journal';
    clearOutput();
    try {
      const resp = await fetch(`/api/logs/history?lines=${lines}&source=${source}`);
      const text = await resp.text();
      const allLines = text.split('\n').filter(l => l);
      for (const l of [...allLines].reverse()) appendLine(l);
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
  filterInput.addEventListener('input', debounce(applyLogFilter, 150));

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

document.getElementById('spoke-acme-dns-provider')?.addEventListener('change', toggleSpokeAcmeDnsSection);
document.getElementById('clients-search')?.addEventListener('input', () => renderClientRows());
document.getElementById('clients-status-filter')?.addEventListener('change', () => renderClientRows());

document.querySelectorAll('[data-clienttype]').forEach(button => {
  button.addEventListener('click', () => setClientTypeFilter(button.dataset.clienttype || 'all'));
});



export {
  activateCentralSubtab,
  activateServerSubtab,
  activateSetupSubtab,
  activateSimSubtab,
  connectWebSocket,
  handleMessage,
  loadAgentLogs,
  appendAgentLogLines,
  renderAgentLog,
  loadCentralStatus,
  updateRefreshPausedState,
  applyRefreshInterval,
};
