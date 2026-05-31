// Hub application module extracted from static/app.js.

"use strict";

import { escHtml, showInlineMessage } from '../utils.js';

let authToken = sessionStorage.getItem("hub_token") || null;
// Timer handle for the silent token-refresh scheduler (cleared on logout).
let tokenRefreshTimer = null;
let currentUser = null;
let currentTenantId = null;
let tenants = [];
let spokeCache = {};
let activeSpokeModal = null;
let ws = null;
let wsReconnectTimer = null;
let wsOfflineTimer = null;
let activeTab = "dashboard";
let autoRefreshTimer = null;
let autoRefreshCountdownTimer = null;
let autoRefreshSecondsLeft = 10;
let refreshPaused = false;
let tenantContextActive = false;
const autoRefreshActiveTabs = new Set(["dashboard", "simulations", "clients", "central", "spokes", "vm-server", "reseed", "commands", "setup", "tenant-setup", "config", "superadmin"]);
const autoRefreshActiveSuperadminTabs = new Set(["sa-pending", "sa-tenants", "sa-users", "sa-security", "sa-gkill", "sa-global-usb"]);
let superadminActiveSubtab = "sa-pending";
let tenantDetailState = { open: false, tenantId: null, activeTab: "dashboard", data: {} };
const hubAdminTabIds = new Set(["dashboard", "setup", "superadmin"]);
let tenantUserCounts = {};
let aggregateDashboardData = null;
let aggregateClientRows = [];
let aggregateProxmoxHosts = [];
let aggregateFleetRecloneStatus = null;
let aggregateUsbProvisioningStatus = null;
let aggregateCentralData = null;
let centralWebhookStatus = null;
let hubCentralData = null;
let hubCentralTopSubtab = "hcm-config";
let hubCentralActiveSubtab = "hcs-sites";
let hubTenantSetupActiveSubtab = "ts-central-api";
let hubCentralSiteOpen = null;
let hubConfigDraft = "";
let hubConfigActiveSubtab = "api";
let hubSimulationConfState = { tenantId: null, loaded: false, loading: false, rawContent: "", sha: "", fetchedAt: "", sections: {}, sectionOrder: [], keyOrder: {}, error: "", mode: "github" };
let hubUserOverridesConfState = { tenantId: null, loaded: false, loading: false, rawContent: "", fetchedAt: "", sections: {}, sectionOrder: [], keyOrder: {}, error: "" };
let hubUserOverrideModalState = { open: false, hostname: "", simId: "", autoSave: false };
let hubUserOverridesSearch = ""; // preserved across re-renders
let hubConfOverrideState = { tenantId: null, simContent: null, userContent: null, loading: false, error: "" };
// Hub demo scenario state: tenantId → { hostname → {scenario, minutes_remaining} }
let hubDemoActiveMap = {};
let hubDemoTenantId = null;
// Hub-managed permanent sim overrides: hostname → [sim, ...] (admin only, no GitHub needed)
let hubClientSimOverrides = {};
let hubSimActiveTab = "hub-simtop-checks";
let hubSimChecksFilter = "failing";
let hubSimChecksSearch = "";
let hubSimOpenCheckId = null;
let hubHwOpenCheckId = null;
let hubCcOpenWsite = null;
const hubClientUiState = { search: "", status: "all", expandedByTenant: {}, seenSitesByTenant: {} };
let hubVmServerSelectedSpoke = null;
let gkillState = null;
let hubVmServerFleetPollTimer = null;
let hubVmServerFleetConcurrencyDraft = 3;
let hubVmServerFleetConcurrencyTenant = null;
let hubClientTypeFilter = "all";
let dashboardTenantRows = [];
const tenantDashboardSort = { key: "name", direction: "asc" };

const PROCESSING_FEATURES = ["aruba_polling", "teams_webhook", "email", "heartbeat", "gkill", "schedules", "repo_sync"];
const FAILURE_SIMS = new Set(['dns_fail', 'ssidpw_fail', 'auth_fail', 'dhcp_fail', 'port_flap', 'assoc_fail']);
const TRAFFIC_SIMS = new Set(['iperf', 'download', 'www_traffic', 'ping_test']);
// All known simulations in display order (failures first, then traffic)
const ALL_KNOWN_SIMS = ['dns_fail', 'ssidpw_fail', 'auth_fail', 'dhcp_fail', 'port_flap', 'assoc_fail', 'iperf', 'download', 'www_traffic', 'ping_test'];
const IMPACT_LABELS = {
  dns_fail: '⚠ DNS Failure', ssidpw_fail: '⚠ Auth Failure', auth_fail: '⚠ Auth Failure',
  dhcp_fail: '⚠ DHCP Failure', assoc_fail: '⚠ Assoc Failure', port_flap: '⚠ Port Flap',
  iperf: 'ℹ iPerf Traffic', download: 'ℹ Download Traffic', www_traffic: 'ℹ Web Traffic', ping_test: 'ℹ Ping Traffic',
};
const spokeUiState = { expandedByTenant: {}, search: "" };
const renderTokens = {};
const scheduledReloads = {};
let superadminBackupConfig = null;
const superadminBackupState = {
  open: false,
  activeTab: "backup",
  step: "confirm",
  loading: false,
  configLoading: false,
  configSaving: false,
  configMessage: "",
  configMessageOk: true,
  backupError: "",
  selectedSpokeId: "",
  jobId: "",
  vmProgress: {},
  completionNotified: false,
};
const HUB_AUTH_DEFAULTS = {
  auth_provider: "local",
  auth_ldap_url: "",
  auth_ldap_bind_dn: "",
  auth_ldap_bind_password_configured: false,
  auth_ldap_user_base: "",
  auth_ldap_user_filter: "(&(objectClass=user)(sAMAccountName={username}))",
  auth_ldap_group_superadmin: "",
  auth_ldap_group_tenant_admin: "",
  auth_ldap_tenant_id: "",
  auth_radius_host: "",
  auth_radius_port: 1812,
  auth_radius_secret_configured: false,
  auth_radius_role_attr: "Filter-Id",
  auth_radius_superadmin_val: "superadmin",
  auth_tacacs_host: "",
  auth_tacacs_port: 49,
  auth_tacacs_secret_configured: false,
  auth_tacacs_superadmin_priv: 15,
  auth_default_role: "superadmin",
};
let hubAuthConfig = { ...HUB_AUTH_DEFAULTS };
let hubAuthConfigLoaded = false;

const HUB_RESEED_VM_ID = 100;
const hubReseedState = {
  tenantId: null,
  loading: false,
  templatesLoading: false,
  templates: [],
  templatesError: "",
  selectedTemplateKey: "",
  selectedSpokeIds: [],
  submitting: false,
  error: "",
  step: "select",
  jobId: "",
  progressTemplateName: "",
  progressRows: {},
  completionNotified: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const SECRET_CONFIGURED_PLACEHOLDER = '**********';

function hubAuthEl(id) {
  return document.getElementById(id);
}

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


function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 4) return (b / 1024 ** 4).toFixed(1) + ' TB';
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(1) + ' GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(0) + ' MB';
  return b + ' B';
}

function fmtSizeKB(kb) { return fmtSize(Number(kb) * 1024); }

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
  const cls = (level === "error") ? "error" : (level === "warn") ? "warn" : (level === "info") ? "info" : "success";
  toast.className = `settings-message ${cls}`;
  toast.textContent = message;
  toast.style.cssText = "min-width:240px;max-width:420px;box-shadow:0 4px 16px rgba(0,0,0,0.15);cursor:pointer;";
  toast.addEventListener("click", () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Hub-IIFE local copy replaced by import from utils.js
function isOnline(lastSeenIso) {
  if (!lastSeenIso) return false;
  const ts = new Date(lastSeenIso).getTime();
  return !Number.isNaN(ts) && Date.now() - ts < 90000;
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
  if (tenant?.name) return tenant.name;
  const roleTenant = currentUser?.tenant_roles?.find(role => role.tenant_id === tenantId);
  return roleTenant?.tenant_name || roleTenant?.name || tenantId;
}

function normalizeTenantRole(role) {
  const value = String(role || "").toLowerCase();
  return value === "operator" ? "viewer" : value;
}

function currentRoleForTenant(tenantId = currentTenantId) {
  if (!currentUser) return "";
  if (currentUser.is_superadmin) return "superadmin";
  return normalizeTenantRole(currentUser.tenant_roles.find(role => role.tenant_id === tenantId)?.role || "");
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
  return res.json().catch(() => null);
}

function summarizeTenantAlerts(summary, aggregate) {
  const checks = aggregate?.checks_summary || {};
  const alertCount = Number(checks.fail || 0) + Number(checks.warning || 0);
  if (alertCount > 0) return { tone: "alert", text: `${alertCount} active ${alertCount === 1 ? "alert" : "alerts"}` };
  if ((summary?.offlineCount ?? 0) > 0) return { tone: "alert", text: `${summary.offlineCount} offline ${summary.offlineCount === 1 ? "spoke" : "spokes"}` };
  return { tone: "ok", text: "OK" };
}

function compareTenantDashboardValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function tenantDashboardSortValue(row, key) {
  if (key === "approvedCount") return row.summary?.approvedCount ?? -1;
  if (key === "clientCount") return row.summary?.clientCount ?? -1;
  if (key === "vmCount") return row.summary?.vmCount ?? -1;
  if (key === "lastSync") {
    const v = row.summary?.lastSync ?? row.lastSync;
    return v ? new Date(v).getTime() : 0;
  }
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

function renderTenantDashboardEmptyState() {
  const canAddTenant = Boolean(currentUser?.is_superadmin);
  return canAddTenant
    ? 'No tenants yet. Create your first tenant to get started.<div class="tenant-empty-action"><button class="btn btn-primary btn-small" data-add-tenant type="button">Add Tenant</button></div>'
    : 'No tenants are available yet. Contact a hub administrator to add one.';
}

function renderDashboardTenantTable(rows) {
  const sortedRows = sortDashboardTenantRows(rows);
  const body = sortedRows.length ? sortedRows.map(row => {
    const summary = row.summary || {};
    const alert = row.alert || {};
    const lastSync = summary.lastSync ?? row.lastSync;
    return `
    <tr class="tenant-list-row" data-enter-tenant="${escHtml(row.id)}" tabindex="0" role="button">
      <td>${statusDot((summary.onlineCount ?? 0) > 0 || (summary.approvedCount ?? 0) === 0)}</td>
      <td><strong>${escHtml(row.name || row.id)}</strong><div class="tenant-card-subtitle">${escHtml(row.id)}</div></td>
      <td>${summary.approvedCount ?? '—'}</td>
      <td>${summary.clientCount ?? '—'}</td>
      <td>${lastSync ? escHtml(relativeTime(lastSync)) : '<span class="muted">—</span>'}</td>
      <td>${alert.text ? `<span class="tenant-alert-pill ${alert.tone}">${escHtml(alert.text)}</span>` : ''}</td>
      <td class="tenant-card-cta">Open →</td>
    </tr>`;
  }).join("") : '<tr><td colspan="7" class="empty-state">No tenants available.</td></tr>';
  return `
    <section class="setup-card tenant-list-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>${renderDashboardTenantSortHeader("Tenant", "name")}</th>
              <th>${renderDashboardTenantSortHeader("Spokes", "approvedCount")}</th>
              <th>${renderDashboardTenantSortHeader("Clients", "clientCount")}</th>
              <th>${renderDashboardTenantSortHeader("Last Sync", "lastSync")}</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
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

function simulationStatusSortValue(status) {
  return String(status || "").toLowerCase().includes("running") ? 0 : 1;
}

// ── T3 PCI device section for hub Clients tab ─────────────────────────────────
// Renders a small table above the client list showing T3 PCI devices detected on
// the Proxmox node for this spoke group. Shown only when the T3 tab is active.
// Receives a site object whose clients share spoke-level t3_pci_devices data.
function renderHubT3PciSection(site) {
  // All clients on the same spoke share the same node-level t3_pci_devices list;
  // take it from the first client that has it.
  const firstWithT3 = (site.clients || []).find(c => Array.isArray(c.t3_pci_devices) && c.t3_pci_devices.length);
  const devices = firstWithT3?.t3_pci_devices || [];
  if (!devices.length) return "";

  const rows = devices.map(d => `
    <tr>
      <td><code>${escHtml(d.id || "—")}</code></td>
      <td><code>${escHtml(d.vidpid || "—")}</code></td>
      <td>${escHtml(d.name || "—")}</td>
      <td><span class="badge badge-green">Present</span></td>
    </tr>`).join("");

  return `
    <div style="margin-bottom:12px;padding:10px 16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;">
      <div style="font-weight:700;color:var(--hpe-navy);margin-bottom:6px;">📡 T3 IoT PCI Devices on this node</div>
      <div class="table-scroll">
        <table class="data-table" style="font-size:0.85rem;">
          <thead><tr><th>PCI Address</th><th>VID:PID</th><th>Device</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderHubSimulationBadges(activeSims = [], emptyLabel = "—", demoScenario = null, opts = {}) {
  const { hostname = "", spokeId = "", isAdmin = false, overrides = [] } = opts;
  const activeSet   = new Set((activeSims || []).filter(Boolean));
  const overrideSet = new Set((overrides  || []).filter(Boolean));
  // Show all known sims; active = colored, overridden = colored + 🔒, demo = colored + ⚡, inactive = dim
  return `<div class="badge-list sim-badge-list">${ALL_KNOWN_SIMS.map(sim => {
    const isActive   = activeSet.has(sim);
    const isOverride = overrideSet.has(sim);
    const isDemo     = Boolean(demoScenario && sim === demoScenario);
    const lockIcon   = isOverride ? `<span style="font-size:0.72em;margin-right:2px;opacity:0.85;">🔒</span>` : "";
    if (isDemo) {
      const cls = hubSimulationBadgeClass(sim) + ' badge-demo-active';
      return `<span class="${cls}" title="${escHtml(sim)}">${escHtml(sim)} ⚡</span>`;
    }
    if (isAdmin && hostname) {
      // Colored if globally active OR overridden; lock icon if overridden
      const cls = (isActive || isOverride)
        ? hubSimulationBadgeClass(sim)
        : 'badge badge-sim-inactive';
      const titleStr = isOverride
        ? `Remove override for ${escHtml(sim)}`
        : `Override: force-enable ${escHtml(sim)} for ${escHtml(hostname)}`;
      return `<button type="button" class="sim-toggle-btn ${cls}" data-hostname="${escHtml(hostname)}" data-spoke-id="${escHtml(spokeId)}" data-sim="${escHtml(sim)}" data-overridden="${isOverride ? '1' : '0'}" title="${titleStr}">${lockIcon}${escHtml(sim)}</button>`;
    }
    if (isActive) {
      return `<span class="${hubSimulationBadgeClass(sim)}" title="${escHtml(sim)}">${escHtml(sim)}</span>`;
    }
    return `<span class="badge badge-sim-inactive" title="${escHtml(sim)}">${escHtml(sim)}</span>`;
  }).join("")}</div>`;
}

function spokeDisplayName(spoke = {}, fallback = "—") {
  return String(spoke?.spoke_name || spoke?.spoke_hostname || spoke?.hostname || spoke?.id || spoke?.spoke_id || fallback);
}

function hubClientSiteName(row = {}) {
  return spokeDisplayName(row, "Unknown site");
}

function hubClientSiteKey(row = {}) {
  return String(row.spoke_id || row.id || row.spoke_hostname || row.spoke_name || "unknown-site");
}

function primeHubClientExpandedSet(siteKeys = [], tenantId = currentTenantId) {
  if (!tenantId) return;
  if (!hubClientUiState.seenSitesByTenant[tenantId]) hubClientUiState.seenSitesByTenant[tenantId] = new Set();
  const seen = hubClientUiState.seenSitesByTenant[tenantId];
  // Mark sites as seen without auto-expanding; user must manually expand
  siteKeys.filter(Boolean).forEach(key => seen.add(key));
}

function normalizeHubClientActiveSimulations(value) {
  if (Array.isArray(value)) {
    return value
      .map((simulation) => String(simulation || "").trim())
      .filter(Boolean);
  }
  const simulation = String(value || "").trim();
  return simulation ? [simulation] : [];
}

function normalizeAggregateClientRow(row = {}) {
  return {
    ...row,
    active_simulations: normalizeHubClientActiveSimulations(row.active_simulations),
    online: typeof row.online === "boolean" ? row.online : isOnline(row.last_seen),
  };
}

function normalizeAggregateClientRows(data) {
  const rows = Array.isArray(data?.clients)
    ? data.clients
    : Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data)
        ? data
        : [];
  return rows.map((row) => normalizeAggregateClientRow(row));
}

function getHubClientExpandedSet(tenantId = currentTenantId) {
  if (!tenantId) return new Set();
  if (!hubClientUiState.expandedByTenant[tenantId]) hubClientUiState.expandedByTenant[tenantId] = new Set();
  return hubClientUiState.expandedByTenant[tenantId];
}

function classifyHubClient(client = {}) {
  // T3: node has a qualifying PCI IoT device (168c:0034 Qualcomm Atheros adapter).
  // T3 takes precedence because those nodes are a superset — they may also have USB.
  if (client?.has_t3_pci) return 't3';
  // T2: node has a USB dongle actively assigned in Proxmox.
  if (client?.has_usb) return 't2';
  return Array.isArray(client?.usb_devices) && client.usb_devices.length ? 't2' : 't1';
}

function syncHubClientTypeTabs() {
  document.querySelectorAll('[data-hubclienttype]').forEach((button) => {
    button.classList.toggle('active', button.dataset.hubclienttype === hubClientTypeFilter);
  });
}

function updateHubClientTypeCounts(allClients = aggregateClientRows) {
  // Count clients per type (t1/t2/t3) and update the badge numbers in the tab bar.
  const counts = { all: allClients.length, t1: 0, t2: 0, t3: 0 };
  allClients.forEach((client) => {
    const type = classifyHubClient(client);
    if (counts[type] !== undefined) counts[type] += 1;
  });
  const countAll = document.getElementById('hub-client-type-count-all');
  const countT1 = document.getElementById('hub-client-type-count-t1');
  const countT2 = document.getElementById('hub-client-type-count-t2');
  const countT3 = document.getElementById('hub-client-type-count-t3');
  if (countAll) countAll.textContent = String(counts.all);
  if (countT1) countT1.textContent = String(counts.t1);
  if (countT2) countT2.textContent = String(counts.t2);
  if (countT3) countT3.textContent = String(counts.t3);
}

function setHubClientTypeFilter(nextFilter = 'all') {
  // Accept all, t1, t2, and t3 as valid filter values; fall back to 'all'.
  hubClientTypeFilter = ['t1', 't2', 't3'].includes(nextFilter) ? nextFilter : 'all';
  syncHubClientTypeTabs();
  renderClientRowsForHub();
}

function toggleHubSiteExpand(siteKey) {
  const normalizedKey = String(siteKey || "");
  if (!normalizedKey) return;
  const expanded = getHubClientExpandedSet();
  if (expanded.has(normalizedKey)) expanded.delete(normalizedKey);
  else expanded.add(normalizedKey);
  renderClientRowsForHub();
}
window.toggleHubSiteExpand = toggleHubSiteExpand;

const HUB_STATUS_PRIORITY = { fail: 3, warning: 2, degraded: 3, no_data: 2, pass: 1, ok: 1 };
const hubSimTopPanels = ["hub-simtop-checks", "hub-simtop-hardware", "hub-simtop-clients", "hub-simtop-sites", "hub-simtop-alerts", "hub-simtop-insights"];

function hubWorstStatus(a, b) {
  const pa = HUB_STATUS_PRIORITY[String(a || "").toLowerCase()] || 0;
  const pb = HUB_STATUS_PRIORITY[String(b || "").toLowerCase()] || 0;
  if (pb > pa) return b;
  return a || b || "unknown";
}

function hubStatusLabel(status) {
  return String(status || "unknown").replace(/_/g, " ").toUpperCase();
}

function hubCheckStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "fail" || s === "degraded") return "sim-fail";
  if (s === "warning" || s === "no_data") return "sim-warn";
  if (s === "pass" || s === "ok") return "sim-pass";
  return "sim-unknown";
}

function hubCheckDotClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "fail" || s === "degraded") return "dot-err";
  if (s === "warning" || s === "no_data") return "dot-warn";
  if (s === "pass" || s === "ok") return "dot-ok";
  return "dot-unknown";
}

function hubFormatCheckTs(ts) {
  return ts ? new Date(ts * 1000).toLocaleTimeString() : "";
}

function hubCentralBadge(label, tone = "gray", title = "") {
  const styles = {
    green: "background:rgba(46, 204, 113, 0.14);color:#1e8449;",
    red: "background:rgba(192, 57, 43, 0.14);color:#c0392b;",
    gray: "background:rgba(127, 140, 141, 0.16);color:#6c7a89;",
  };
  return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:0.78rem;font-weight:700;${styles[tone] || styles.gray}"${title ? ` title="${escHtml(title)}"` : ""}>${escHtml(label)}</span>`;
}

function hubCentralNormalizeCheckStatus(status) {
  const normalized = String(status || "").toUpperCase();
  return ["OK", "ERROR"].includes(normalized) ? normalized : "UNKNOWN";
}

function hubCentralNormalizeClientStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PASS") return "OK";
  if (["OK", "DEGRADED", "ERROR", "NO_DATA"].includes(normalized)) return normalized;
  return "NO_DATA";
}

function hubCentralAggregateCheckStatus(statusMap = {}) {
  const checks = Object.values(statusMap).filter((value) => value && typeof value === "object");
  if (!checks.length) return { label: "UNKNOWN", tone: "gray", hasError: false };
  const statuses = checks.map((value) => hubCentralNormalizeCheckStatus(value.status));
  if (statuses.includes("ERROR")) return { label: "ERROR", tone: "red", hasError: true };
  if (statuses.every((value) => value === "OK")) return { label: "OK", tone: "green", hasError: false };
  return { label: "UNKNOWN", tone: "gray", hasError: false };
}

function hubCentralClientStatusMeta(info = null) {
  const label = hubCentralNormalizeClientStatus(info?.status);
  const isIssue = label === "DEGRADED" || label === "ERROR";
  return {
    label,
    tone: label === "OK" ? "green" : (isIssue ? "red" : "gray"),
    isIssue,
  };
}

function hubCentralMonitorSummary(data = hubCentralData) {
  const source = data || {};
  const siteMappings = source?.central_sites_config?.site_mappings && typeof source.central_sites_config.site_mappings === "object"
    ? source.central_sites_config.site_mappings
    : {};
  const fallbackSites = {};
  const derivedStatusBySite = {};
  const derivedWirelessBySite = {};
  const derivedClientCountBySite = {};
  (Array.isArray(source.spokes) ? source.spokes : []).forEach((spoke) => {
    (Array.isArray(spoke?.sites) ? spoke.sites : []).forEach((site) => {
      const wsite = String(site?.wsite || "").trim();
      if (!wsite) return;
      if (!fallbackSites[wsite]) fallbackSites[wsite] = String(site?.central_site || "").trim();
      if (!derivedStatusBySite[wsite]) derivedStatusBySite[wsite] = {};
      Object.entries(site?.status_map || {}).forEach(([checkId, info]) => {
        if (!info || typeof info !== "object") return;
        if (!derivedStatusBySite[wsite][checkId] || hubCentralNormalizeCheckStatus(info.status) === "ERROR") {
          derivedStatusBySite[wsite][checkId] = info;
        }
      });
      if (derivedWirelessBySite[wsite] == null && Number.isFinite(Number(site?.wireless_clients))) {
        derivedWirelessBySite[wsite] = Number(site.wireless_clients);
      }
    });
    const spokeClientCounts = spoke?.client_count_status && typeof spoke.client_count_status === "object" ? spoke.client_count_status : {};
    Object.entries(spokeClientCounts).forEach(([wsite, info]) => {
      if (!derivedClientCountBySite[wsite] && info && typeof info === "object") derivedClientCountBySite[wsite] = info;
    });
  });
  const statusBySite = source?.status && typeof source.status === "object" ? source.status : derivedStatusBySite;
  const wirelessBySite = source?.wireless_clients && typeof source.wireless_clients === "object" ? source.wireless_clients : derivedWirelessBySite;
  const clientCountBySite = source?.client_count_status && typeof source.client_count_status === "object" ? source.client_count_status : derivedClientCountBySite;
  const spokes = (Array.isArray(source.spokes) ? source.spokes : []).map((spoke) => ({
    ...spoke,
    display_name: spokeDisplayName(spoke, "Spoke"),
    assigned_sites: Array.isArray(spoke?.assigned_sites) ? spoke.assigned_sites.map((s) => String(s).trim()).filter(Boolean)
      : (spoke?.assigned_site ? [String(spoke.assigned_site).trim()] : []),
    spoke_online: typeof spoke?.spoke_online === "boolean" ? spoke.spoke_online : Boolean(spoke?.online),
  }));
  // Map wsite → Set of spoke ids to avoid duplicates, with ordered list
  const assignedBySite = new Map(); // wsite → Spoke[] (all assigned spokes)
  const _addToAssigned = (wsite, spoke) => {
    if (!wsite) return;
    const list = assignedBySite.get(wsite) || [];
    if (!list.find((s) => s.spoke_id === spoke.spoke_id)) list.push(spoke);
    assignedBySite.set(wsite, list);
  };
  for (const spoke of spokes) {
    for (const site of spoke.assigned_sites) _addToAssigned(site, spoke);
  }
  // Also add any spoke that is actively reporting a site (live sites data),
  // so all monitoring spokes appear — not just the explicitly-assigned one.
  for (const spoke of spokes) {
    for (const siteObj of (Array.isArray(spoke?.sites) ? spoke.sites : [])) {
      const wsite = String(siteObj?.wsite || "").trim();
      if (!wsite) continue;
      _addToAssigned(wsite, spoke);
    }
  }
  const knownSites = new Set(
    [...assignedBySite.keys(), ...Object.keys(siteMappings)].filter(Boolean)
  );
  // In centralized mode guarantee every site has at least one spoke shown.
  if (source.mode === "centralized" && spokes.length) {
    const fallbackSpoke = spokes.find((s) => s.spoke_online) || spokes[0];
    for (const wsite of knownSites) {
      if (!assignedBySite.has(wsite)) _addToAssigned(wsite, fallbackSpoke);
    }
  }
  const sites = [...knownSites]
    .sort((left, right) => String(left).localeCompare(String(right), undefined, { sensitivity: "base" }))
    .map((wsite) => {
      const assignedSpokes = assignedBySite.get(wsite) || [];
      // Primary spoke: first online, or first in list
      const assignedSpoke = assignedSpokes.find((s) => s.spoke_online) || assignedSpokes[0] || null;
      const statusMap = statusBySite[wsite] && typeof statusBySite[wsite] === "object" ? statusBySite[wsite] : {};
      const checkStatus = hubCentralAggregateCheckStatus(statusMap);
      const clientCount = clientCountBySite[wsite] && typeof clientCountBySite[wsite] === "object" ? clientCountBySite[wsite] : null;
      const clientStatus = hubCentralClientStatusMeta(clientCount);
      const allOffline = assignedSpokes.length > 0 && assignedSpokes.every((s) => !s.spoke_online);
      return {
        wsite,
        central_site: String(siteMappings[wsite] || fallbackSites[wsite] || "").trim(),
        assigned_spoke: assignedSpoke,
        assigned_spokes: assignedSpokes,
        wireless_clients: Number.isFinite(Number(wirelessBySite[wsite])) ? Number(wirelessBySite[wsite]) : null,
        status_map: statusMap,
        check_status: checkStatus,
        client_count: clientCount,
        client_status: clientStatus,
        alerts_suppressed: allOffline,
        has_active_check_issue: !allOffline && checkStatus.hasError,
        has_active_client_issue: !allOffline && clientStatus.isIssue,
      };
    });
  const checkFailures = sites
    .flatMap((site) => Object.entries(site.status_map || {})
      .filter(([, info]) => info && typeof info === "object" && hubCentralNormalizeCheckStatus(info.status) === "ERROR")
      .map(([checkId, info]) => ({
        check_id: checkId,
        check_name: info.check_name || checkId,
        site: site.wsite,
        error_count: Number(info.count || 0),
        ts: info.ts || null,
        suppressed: site.alerts_suppressed,
      })))
    .sort((left, right) => Number(right.ts || 0) - Number(left.ts || 0) || String(left.site || "").localeCompare(String(right.site || ""), undefined, { sensitivity: "base" }));
  const activeIssueCount = sites.filter((site) => site.has_active_check_issue || site.has_active_client_issue).length;
  return { sites, checkFailures, activeIssueCount };
}

function hubCentralBannerHtml(summary) {
  if (!summary.sites.length) {
    return '<div class="setup-card" style="margin-bottom:12px;border-left:4px solid #95a5a6;background:rgba(149,165,166,0.08);"><div style="font-weight:700;color:#6c7a89;">No monitored sites configured.</div></div>';
  }
  if (summary.activeIssueCount > 0) {
    return `<div class="setup-card" style="margin-bottom:12px;border-left:4px solid #c0392b;background:rgba(192,57,43,0.08);"><div style="font-weight:700;color:#c0392b;">${summary.activeIssueCount} active Central issue${summary.activeIssueCount === 1 ? "" : "s"}</div></div>`;
  }
  return '<div class="setup-card" style="margin-bottom:12px;border-left:4px solid #1e8449;background:rgba(46,204,113,0.08);"><div style="font-weight:700;color:#1e8449;">All sites healthy</div></div>';
}

function hubAggregateChecks(spokes) {
  const byCheckId = new Map();
  for (const spoke of (spokes || [])) {
    const statusMap = spoke?.central_status?.status || {};
    for (const [wsite, checks] of Object.entries(statusMap)) {
      if (!checks || typeof checks !== "object") continue;
      for (const [checkId, info] of Object.entries(checks)) {
        if (!info || typeof info !== "object") continue;
        if (!byCheckId.has(checkId)) {
          byCheckId.set(checkId, {
            check_id: checkId,
            check_name: info.check_name || checkId,
            check_type: info.check_type || "simulation",
            worst_status: info.status || "unknown",
            ts: info.ts || null,
            details: [],
          });
        }
        const agg = byCheckId.get(checkId);
        agg.worst_status = hubWorstStatus(agg.worst_status, info.status);
        if (!agg.ts || (info.ts && info.ts > agg.ts)) agg.ts = info.ts;
        agg.details.push({
          spoke_id: spoke.spoke_id,
          spoke_name: spoke.spoke_name || spoke.spoke_id || "Unknown spoke",
          spoke_online: spoke.spoke_online,
          wsite,
          status: info.status || "unknown",
          count: Number(info.count || 0),
          ts: info.ts || null,
        });
      }
    }
  }
  return [...byCheckId.values()].sort((left, right) => {
    const statusDiff = (HUB_STATUS_PRIORITY[String(right.worst_status || "").toLowerCase()] || 0)
      - (HUB_STATUS_PRIORITY[String(left.worst_status || "").toLowerCase()] || 0);
    if (statusDiff) return statusDiff;
    return String(left.check_name || left.check_id).localeCompare(String(right.check_name || right.check_id), undefined, { sensitivity: "base" });
  });
}

function hubAggregateHardware(spokes) {
  const byId = new Map();
  for (const spoke of (spokes || [])) {
    const hwAlerts = spoke?.central_status?.hardware_alerts || [];
    for (const alert of hwAlerts) {
      if (!alert || !alert.id) continue;
      if (!byId.has(alert.id)) {
        byId.set(alert.id, {
          id: alert.id,
          name: alert.name || alert.id,
          device_type: alert.device_type || "",
          total: 0,
          spoke_breakdown: [],
        });
      }
      const agg = byId.get(alert.id);
      agg.total += Number(alert.total || 0);
      agg.spoke_breakdown.push({
        spoke_id: spoke.spoke_id,
        spoke_name: spoke.spoke_name || spoke.spoke_id || "Unknown spoke",
        spoke_online: spoke.spoke_online,
        total: Number(alert.total || 0),
        sites: alert.sites || {},
      });
    }
  }
  return [...byId.values()].sort((left, right) => right.total - left.total || String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, { sensitivity: "base" }));
}

function hubAggregateClientCount(spokes) {
  const byWsite = new Map();
  for (const spoke of (spokes || [])) {
    const ccStatus = spoke?.central_status?.client_count_status || spoke?.client_count_status || {};
    for (const [wsite, info] of Object.entries(ccStatus)) {
      if (!info || typeof info !== "object") continue;
      if (!byWsite.has(wsite)) {
        byWsite.set(wsite, {
          wsite,
          site_name: info.site_name || wsite,
          worst_status: info.status || "unknown",
          ts: info.ts || null,
          spoke_breakdown: [],
        });
      }
      const agg = byWsite.get(wsite);
      agg.worst_status = hubWorstStatus(agg.worst_status, info.status);
      if (!agg.ts || (info.ts && info.ts > agg.ts)) agg.ts = info.ts;
      agg.spoke_breakdown.push({
        spoke_id: spoke.spoke_id,
        spoke_name: spoke.spoke_name || spoke.spoke_id || "Unknown spoke",
        spoke_online: spoke.spoke_online,
        current: info.current,
        hourly_avg: info.hourly_avg,
        baseline_7day: info.baseline_7day ?? null,
        baseline_source: info.baseline_source ?? "hourly",
        drop_pct: info.drop_pct,
        status: info.status || "unknown",
        ts: info.ts || null,
        baseline_stale: Boolean(info.baseline_stale),
      });
    }
  }
  return [...byWsite.values()].sort((left, right) => {
    const statusDiff = (HUB_STATUS_PRIORITY[String(right.worst_status || "").toLowerCase()] || 0)
      - (HUB_STATUS_PRIORITY[String(left.worst_status || "").toLowerCase()] || 0);
    if (statusDiff) return statusDiff;
    return String(left.site_name || left.wsite).localeCompare(String(right.site_name || right.wsite), undefined, { sensitivity: "base" });
  });
}

// (client count history removed — now tracked server-side via Central API polling)

function getMonitoredItemStatusMeta(item) {
  const status = item.status || "ok";
  const missingSince = item.missing_since ? (Date.now() / 1000 - Number(item.missing_since)) : 0;
  const missingMins = Math.round(missingSince / 60);

  // Determine staleness from the most recent timestamp available
  let lastSeenMs = null;
  if (item.central_last_seen) lastSeenMs = new Date(item.central_last_seen).getTime();
  else if (item.last_seen) lastSeenMs = Number(item.last_seen) * 1000;

  const ageHours = lastSeenMs ? (Date.now() - lastSeenMs) / 3600000 : null;

  // If backend says missing, honour that
  if (status === "missing") {
    return { status, missingMins, tone: "red", label: `✗ ${missingMins}m absent` };
  }
  if (status === "warning") {
    return { status, missingMins, tone: "yellow", label: `⚠ ${missingMins}m absent` };
  }

  // Override to stale if last_seen is old
  if (ageHours !== null && ageHours > 0.75) {
    return { status: "stale", missingMins: 0, tone: "red", label: "Failed" };
  }
  if (ageHours !== null && ageHours > 0.25) {
    return { status: "stale", missingMins: 0, tone: "yellow", label: "Warning" };
  }

  return { status, missingMins, tone: "green", label: "Ok" };
}

function renderHubStatusTab() {
  const container = document.getElementById("hub-status-content");
  if (!container) return;

  const now = new Date().toLocaleTimeString();
  const refreshEl = document.getElementById("hub-status-last-refreshed");
  if (refreshEl) refreshEl.textContent = `Last refreshed: ${now}`;

  const tenantId = getActiveTenantId();

  const tonePriority = { red: 0, yellow: 1, orange: 1, green: 2, gray: 3 };
  const sortByTone = (a, b) => (tonePriority[a._tone] ?? 3) - (tonePriority[b._tone] ?? 3);

  const statusBadge = (tone, label) => {
    const color = tone === "green" ? "#01A982" : tone === "red" ? "#FC5A5A" : tone === "yellow" || tone === "orange" ? "#f39c12" : "#aaa";
    return `<span style="display:inline-flex;align-items:center;gap:5px;color:${color};font-weight:600;font-size:0.82rem;">` +
      `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${escHtml(label)}</span>`;
  };

  const tdP = "padding:6px 10px;";

  // Build a section card with a table. extraCol = optional extra column header.
  // rows: array of {_tone, _label, _name, _detail, _lastSeen, _itemId}
  // showRemove: wire Remove buttons if true
  const makeSection = (title, rows, extraColHeader = "", showRemove = false, showLastSeen = true) => {
    const emptyMsg = `<div class="central-empty" style="padding:8px 16px;font-size:0.85rem;">None configured.</div>`;
    if (!rows.length) return `
      <div class="setup-card" style="margin-bottom:1rem;padding:0;">
        <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);">
          <h4 style="margin:0;color:var(--muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">${escHtml(title)}</h4>
        </div>${emptyMsg}</div>`;

    const extraHeader = extraColHeader ? `<th style="padding:5px 10px;white-space:nowrap;">${escHtml(extraColHeader)}</th>` : "";
    const removeHeader = showRemove ? `<th style="padding:5px 10px;width:100px;text-align:right;"></th>` : "";
    const lastSeenHeader = showLastSeen ? `<th style="padding:5px 10px;white-space:nowrap;">Last Seen</th>` : "";
    const rowsHtml = rows.map((r) => {
      const extraCell = extraColHeader
        ? `<td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;vertical-align:top;${tdP}">${r._detail ? escHtml(r._detail) : "—"}</td>`
        : "";
      const lastSeenCell = showLastSeen ? `<td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;vertical-align:top;${tdP}">${r._lastSeen ? escHtml(r._lastSeen) : "—"}</td>` : "";
      const removeCell = showRemove && r._itemId
        ? `<td style="white-space:nowrap;vertical-align:top;width:100px;text-align:right;${tdP}"><button class="btn btn-small btn-secondary hub-monitored-remove-btn" data-item-id="${escHtml(r._itemId)}" type="button">Remove</button></td>`
        : (showRemove ? `<td style="width:100px;"></td>` : "");
      return `<tr>
        <td style="font-weight:600;word-break:break-word;width:260px;vertical-align:top;${tdP}">${r._name}</td>
        <td style="white-space:nowrap;width:180px;vertical-align:top;${tdP}">${statusBadge(r._tone, r._label)}</td>
        ${extraCell}${lastSeenCell}${removeCell}
      </tr>`;
    }).join("");

    return `
      <div class="setup-card" style="margin-bottom:1rem;padding:0;">
        <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);">
          <h4 style="margin:0;color:var(--muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">${escHtml(title)}</h4>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="margin:0;width:100%;font-size:0.85rem;table-layout:fixed;">
            <thead><tr>
              <th style="padding:5px 10px;width:260px;">Name</th>
              <th style="padding:5px 10px;white-space:nowrap;width:180px;">Status</th>
              ${extraHeader}
              ${lastSeenHeader}
              ${removeHeader}
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  };

  // — Sites — status driven by sim client count per wsite (25% drop = red); Central wireless count used when available
  const summary = hubCentralMonitorSummary(hubCentralData);
  const siteRows = (summary?.sites || []).map((site) => {
    const cs = site.client_status || {};
    const cc = site.client_count || {};
    const spokeNames = (site.assigned_spokes || []).map((s) => s.display_name).filter(Boolean).join(", ") || "Unassigned";
    const dropPct = Number.isFinite(Number(cc.drop_pct)) ? Math.round(cc.drop_pct) : 0;
    const rawLabel = cs.label || "NO_DATA";
    const displayLabel = rawLabel === "NO_DATA" ? "Collecting" : rawLabel === "DEGRADED" ? `↓${dropPct}% clients` : rawLabel;
    const displayTone = rawLabel === "NO_DATA" ? "yellow" : cs.tone || "gray";
    // Use wireless_clients from Central API directly; fall back to tracked metric current
    const wirelessClients = Number.isFinite(Number(site.wireless_clients)) ? Number(site.wireless_clients) : null;
    const fallbackCurrent = Number.isFinite(Number(cc.current)) ? Number(cc.current) : null;
    const clientNum = wirelessClients ?? fallbackCurrent;
    const detail = clientNum !== null ? `${clientNum} clients` : null;
    const lastSeen = cc.ts ? new Date(cc.ts * 1000).toLocaleString() : null;
    return {
      _tone: displayTone,
      _label: displayLabel,
      _name: `${escHtml(site.wsite)}<div style="font-size:0.75rem;color:var(--muted);font-weight:400;margin-top:2px;white-space:normal;line-height:1.4;" title="${escHtml(spokeNames)}">${escHtml(spokeNames)}</div>`,
      _detail: detail,
      _lastSeen: lastSeen,
    };
  }).sort(sortByTone);

  // — Monitored items (alerts, insights, clients) —
  const items = Array.isArray(_hubMonitoredItemsData) ? _hubMonitoredItemsData : [];
  const monRows = (type) => items
    .filter((item) => item.type === type)
    .map((item) => {
      const { tone, label } = getMonitoredItemStatusMeta(item);
      // Use Central API timestamps (when the alert actually fired), not polling time.
      const centralLast = item.central_last_seen ? new Date(item.central_last_seen).toLocaleString() : null;
      const centralFirst = item.central_first_seen ? new Date(item.central_first_seen).toLocaleString() : null;
      const pollLast = item.last_seen ? new Date(item.last_seen * 1000).toLocaleString() : null;
      const lastSeen = centralLast || pollLast || (tone === "green" ? "Online" : null);
      // Show first_seen whenever available — even when equal to last_seen (single occurrence).
      const detail = centralFirst || null;
      return {
        _tone: tone,
        _label: label,
        _name: escHtml(item.name || item.identifier || "—"),
        _detail: detail,
        _lastSeen: lastSeen,
        _itemId: item.id || "",
      };
    }).sort(sortByTone);

  // — Hardware — auto hardware alerts from spokes + manually monitored gateway devices
  const hwChecks = hubAggregateHardware(hubCentralData?.spokes || []);
  const hwRows = [
    ...hwChecks.map((hw) => ({
      _tone: hw.total > 0 ? "red" : "green",
      _label: hw.total > 0 ? `${hw.total} DOWN` : "CLEAR",
      _name: escHtml(hw.name),
      _detail: "",
      _lastSeen: null,
    })),
    ...monRows("gateway"),
  ].sort(sortByTone);

  container.innerHTML =
    makeSection("Sites", siteRows, "Clients", false, false) +
    makeSection("Hardware", hwRows, "", true) +
    makeSection("Alerts", monRows("alert"), "First Seen", true) +
    makeSection("Insights", monRows("insight"), "First Seen", true) +
    makeSection("Clients", monRows("client"), "", true);

  // Wire Remove buttons
  container.querySelectorAll(".hub-monitored-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.itemId;
      if (!itemId || !tenantId) return;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
        if (!res?.ok) { const err = await readJson(res); throw new Error(err?.detail || "Failed to remove."); }
        showToast("Monitored item removed.", "ok");
        await loadAndRenderHubMonitoredItems(true);
      } catch (error) {
        showToast(error.message || "Failed to remove item.", "error");
        btn.disabled = false;
      }
    });
  });
}

function renderHubSitesTab() {
  const container = document.getElementById("hub-monitored-sites-content");
  if (!container) return;

  const now = new Date().toLocaleTimeString();
  const refreshEl = document.getElementById("hub-monitored-sites-refreshed");
  if (refreshEl) refreshEl.textContent = `Last refreshed: ${now}`;

  const summary = hubCentralMonitorSummary(hubCentralData);
  const sites = summary?.sites || [];

  if (!sites.length) {
    container.innerHTML = `<div class="central-empty">No sites assigned to spokes yet. Assign sites in Setup → Central API → Sites.</div>`;
    return;
  }

  const rows = sites.map((site) => {
    const assignedSpokes = site.assigned_spokes || (site.assigned_spoke ? [site.assigned_spoke] : []);
    const spokeName = assignedSpokes.length
      ? assignedSpokes.map((s) => escHtml(s.display_name || "—")).join(", ")
      : '<span style="color:var(--muted)">Unassigned</span>';
    const anyOnline = assignedSpokes.some((s) => s.spoke_online);
    const spokeStatus = assignedSpokes.length
      ? (anyOnline
          ? `<span class="badge badge-success">Online</span>`
          : `<span class="badge badge-failure">Offline</span>`)
      : `<span class="badge" style="background:var(--muted-bg);color:var(--muted);">—</span>`;
    const checkTone = site.check_status?.tone || "gray";
    const checkLabel = site.check_status?.label || "UNKNOWN";
    const checkBadge = checkTone === "green"
      ? `<span class="badge badge-success">${escHtml(checkLabel)}</span>`
      : checkTone === "red"
        ? `<span class="badge badge-failure">${escHtml(checkLabel)}</span>`
        : `<span class="badge" style="background:var(--muted-bg);color:var(--muted);">${escHtml(checkLabel)}</span>`;
    const centralSite = site.central_site ? escHtml(site.central_site) : `<span style="color:var(--muted)">—</span>`;
    return `
      <tr>
        <td><strong>${escHtml(site.wsite)}</strong></td>
        <td>${centralSite}</td>
        <td>${spokeName}</td>
        <td>${spokeStatus}</td>
        <td>${checkBadge}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="setup-card" style="margin-bottom:1rem;">
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Site</th><th>Central Site</th><th>Assigned Spoke</th><th>Spoke</th><th>Checks</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function activateHubSimTopTab(tabId = "hub-simtop-checks") {
  document.querySelectorAll(".hub-simtop-subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.hubsimtop === tabId);
  });
  hubSimTopPanels.forEach((id) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.toggle("active", id === tabId);
    panel.classList.toggle("hidden", id !== tabId);
  });
  hubSimActiveTab = tabId;
  if (tabId === "hub-simtop-checks") renderHubStatusTab();
  if (tabId === "hub-simtop-hardware") { renderHubHwPanel(); }
  if (tabId === "hub-simtop-clients") {
    const myRole = currentRoleForTenant(currentTenantId);
    if (myRole === 'admin' || myRole === 'demo' || myRole === 'superadmin') {
      Promise.all([
        loadHubDemoActive(),
        (myRole === 'admin' || myRole === 'superadmin') ? loadHubClientSimOverrides() : Promise.resolve(),
      ]).then(() => renderClientRowsForHub());
    } else {
      loadAndRenderHubMonitoredItems();
    }
  }
  if (tabId === "hub-simtop-sites") renderHubSitesTab();
  if (tabId === "hub-simtop-alerts" || tabId === "hub-simtop-insights") loadAndRenderHubMonitoredItems();
}

function renderHubSimChecksList() {
  const container = document.getElementById("hub-sim-checks-list");
  const emptyEl = document.getElementById("hub-sim-checks-empty");
  if (!container) return;

  container.textContent = "";
  if (emptyEl) {
    emptyEl.textContent = "No check data reported by any spoke.";
    emptyEl.classList.add("hidden");
    container.appendChild(emptyEl);
  }

  const allChecks = hubAggregateChecks(hubCentralData?.spokes || []);
  const failing = allChecks.filter((check) => String(check.worst_status || "").toLowerCase() === "fail").length;
  const warning = allChecks.filter((check) => String(check.worst_status || "").toLowerCase() === "warning").length;
  const functional = allChecks.filter((check) => ["pass", "ok"].includes(String(check.worst_status || "").toLowerCase())).length;
  const countById = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };
  countById("hub-sim-tab-failing-count", failing);
  countById("hub-sim-tab-warning-count", warning);
  countById("hub-sim-tab-functional-count", functional);

  let filtered = allChecks;
  if (hubSimChecksFilter === "failing") filtered = allChecks.filter((check) => String(check.worst_status || "").toLowerCase() === "fail");
  else if (hubSimChecksFilter === "warning") filtered = allChecks.filter((check) => String(check.worst_status || "").toLowerCase() === "warning");
  else if (hubSimChecksFilter === "functional") filtered = allChecks.filter((check) => ["pass", "ok"].includes(String(check.worst_status || "").toLowerCase()));

  if (hubSimChecksSearch) {
    const q = hubSimChecksSearch.toLowerCase();
    filtered = filtered.filter((check) => {
      const detailText = check.details.map((detail) => `${detail.spoke_name} ${detail.wsite}`).join(" ").toLowerCase();
      return String(check.check_name || check.check_id).toLowerCase().includes(q)
        || String(check.check_type || "").toLowerCase().includes(q)
        || detailText.includes(q);
    });
  }

  const totalCount = document.getElementById("hub-checks-count");
  if (totalCount) totalCount.textContent = `${filtered.length} check${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    if (emptyEl) {
      emptyEl.textContent = allChecks.length ? "No checks match the current filter." : "No check data reported by any spoke.";
      emptyEl.classList.remove("hidden");
    }
    return;
  }

  for (const check of filtered) {
    const row = document.createElement("div");
    const uniqueSpokes = [...new Set(check.details.map((detail) => detail.spoke_name).filter(Boolean))];
    row.className = "check-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `
      <span class="check-dot ${hubCheckDotClass(check.worst_status)}"></span>
      <span class="check-name">${escHtml(check.check_name || check.check_id)}</span>
      <span class="check-badge ${hubCheckStatusClass(check.worst_status)}">${escHtml(hubStatusLabel(check.worst_status))}</span>
      <span class="check-detail">${uniqueSpokes.length} spoke${uniqueSpokes.length === 1 ? "" : "s"} · ${check.details.length} site${check.details.length === 1 ? "" : "s"}</span>
      <span class="check-ts">${escHtml(hubFormatCheckTs(check.ts))}</span>
    `;
    row.addEventListener("click", () => openHubSimDetail(check.check_id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHubSimDetail(check.check_id);
      }
    });
    container.appendChild(row);
  }
}

let _hubMonitoredItemsData = null;

async function loadAndRenderHubMonitoredItems(force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  try {
    const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items`);
    const data = await readJson(res);
    if (!res?.ok) throw new Error(data?.detail || "Failed to load monitored items.");
    _hubMonitoredItemsData = Array.isArray(data?.items) ? data.items : [];
    hubCaBrowseMonitoredItems = _hubMonitoredItemsData;
    renderHubMonitoredItems(_hubMonitoredItemsData, tenantId);
    if (hubCentralBrowseData) renderHubCaBrowseTab();
  } catch (error) {
    ["hub-monitored-sites-content", "hub-monitored-alerts-content", "hub-monitored-insights-content"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="central-empty" style="color:var(--error);">${escHtml(error.message || "Failed to load.")}</div>`;
    });
  }
}

function renderHubMonitoredItems(items = [], tenantId = "") {
  // Distribute items into dedicated tab containers by type:
  //   site    → Sites tab    (hub-monitored-sites-content)
  //   alert   → Alerts tab   (hub-monitored-alerts-content)
  //   client  → Client Count (hub-monitored-clients-content)
  //   insight → Insights tab (hub-monitored-insights-content)
  const DEST = {
    site:    "hub-monitored-sites-content",
    alert:   "hub-monitored-alerts-content",
    client:  "hub-monitored-clients-content",
    insight: "hub-monitored-insights-content",
  };
  const LABELS = { site: "Monitored Sites", alert: "Monitored Alerts", insight: "Monitored Insights", client: "Monitored Clients" };
  const EMPTY  = { site: "No monitored sites configured.", alert: "No monitored alerts configured.", insight: "No monitored insights configured.", client: "No monitored clients configured." };

  const now = new Date().toLocaleTimeString();
  ["hub-monitored-last-refreshed", "hub-monitored-sites-refreshed", "hub-monitored-alerts-refreshed", "hub-monitored-clients-refreshed"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `Last refreshed: ${now}`;
  });

  // Group by type
  const byType = { site: [], alert: [], client: [], insight: [] };
  items.forEach((item) => { if (byType[item.type]) byType[item.type].push(item); });

  const makeTable = (typeItems, type) => {
    if (!typeItems.length) return "";
    // Only show Identifier column if at least one item has a distinct identifier
    const showIdent = typeItems.some((item) => {
      const n = (item.name || item.identifier || "").trim();
      const id = (item.identifier || "").trim();
      return id && id !== n;
    });
    const rows = typeItems.map((item) => {
      const { status, missingMins, tone, label } = getMonitoredItemStatusMeta(item);
      const isOk = status === "ok";
      // Use Central API timestamps when available, fall back to polling time
      const centralLast = item.central_last_seen ? new Date(item.central_last_seen).toLocaleString() : null;
      const centralFirst = item.central_first_seen ? new Date(item.central_first_seen).toLocaleString() : null;
      const lastSeenDisplay = centralLast || (item.last_seen ? new Date(item.last_seen * 1000).toLocaleString() : "—");
      const firstSeenDisplay = centralFirst || "—";
      const dotColor = tone === "green" ? "#01A982" : tone === "yellow" ? "#f39c12" : "#FC5A5A";
      const dotTitle = isOk
        ? `Last fired: ${lastSeenDisplay}${centralFirst ? ` · First fired: ${firstSeenDisplay}` : ""}`
        : `Absent for ${missingMins} min · Last fired: ${lastSeenDisplay}`;
      const statusBadge = `<span style="display:inline-flex;align-items:center;gap:5px;color:${dotColor};font-weight:600;font-size:0.82rem;" title="${escHtml(dotTitle)}"><span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>${escHtml(label)}</span>`;
      const name = item.name || item.identifier || "—";
      const ident = item.identifier || "—";
      const identCell = showIdent ? `<td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;">${escHtml(ident)}</td>` : "";
      return `
        <tr>
          <td style="font-weight:600;word-break:break-word;min-width:160px;">${escHtml(name)}</td>
          ${identCell}
          <td style="white-space:nowrap;">${statusBadge}</td>
          <td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;">${escHtml(lastSeenDisplay)}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-small btn-secondary hub-monitored-remove-btn"
              data-item-id="${escHtml(item.id)}" type="button">Remove</button>
          </td>
        </tr>`;
    }).join("");
    const identHeader = showIdent ? `<th style="padding:5px 10px;">Identifier</th>` : "";
    return `
      <div class="setup-card" style="margin-bottom:1rem;padding:0;">
        <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);">
          <h4 style="margin:0;color:var(--muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">${escHtml(LABELS[type])}</h4>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="margin:0;width:100%;">
            <thead><tr>
              <th style="padding:5px 10px;">Name</th>
              ${identHeader}
              <th style="padding:5px 10px;">Status</th>
              <th style="padding:5px 10px;white-space:nowrap;">Last Seen</th>
              <th style="padding:5px 10px;"></th>
            </tr></thead>
            <tbody style="font-size:0.85rem;">${rows}</tbody>
          </table>
        </div>
      </div>`;
  };

  Object.entries(DEST).forEach(([type, containerId]) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const html = makeTable(byType[type], type);
    el.innerHTML = html || `<div class="central-empty">${escHtml(EMPTY[type])}</div>`;
  });

  // Wire up Remove buttons across all containers
  document.querySelectorAll(".hub-monitored-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.itemId;
      if (!itemId || !tenantId) return;
      btn.disabled = true;
      try {
        const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
        if (!res?.ok) {
          const err = await readJson(res);
          throw new Error(err?.detail || "Failed to remove item.");
        }
        showToast("Monitored item removed.", "ok");
        await loadAndRenderHubMonitoredItems(true);
      } catch (error) {
        showToast(error.message || "Failed to remove item.", "error");
        btn.disabled = false;
      }
    });
  });
}


function openHubSimDetail(checkId) {
  const check = hubAggregateChecks(hubCentralData?.spokes || []).find((item) => item.check_id === checkId);
  const overview = document.getElementById("hub-sim-overview");
  const detail = document.getElementById("hub-sim-detail");
  const title = document.getElementById("hub-sim-detail-title");
  const sub = document.getElementById("hub-sim-detail-sub");
  const badge = document.getElementById("hub-sim-detail-badge");
  const siteList = document.getElementById("hub-sim-site-list");
  if (!check || !overview || !detail || !siteList) return;
  hubSimOpenCheckId = checkId;
  overview.classList.add("hidden");
  detail.classList.remove("hidden");
  if (title) title.textContent = check.check_name || check.check_id;
  if (sub) sub.textContent = `${check.details.length} spoke/site result${check.details.length === 1 ? "" : "s"}`;
  if (badge) {
    badge.textContent = hubStatusLabel(check.worst_status);
    badge.className = `sim-status-badge ${hubCheckStatusClass(check.worst_status)}`;
  }
  siteList.textContent = "";
  check.details
    .slice()
    .sort((left, right) => {
      const statusDiff = (HUB_STATUS_PRIORITY[String(right.status || "").toLowerCase()] || 0)
        - (HUB_STATUS_PRIORITY[String(left.status || "").toLowerCase()] || 0);
      if (statusDiff) return statusDiff;
      return `${left.spoke_name} ${left.wsite}`.localeCompare(`${right.spoke_name} ${right.wsite}`, undefined, { sensitivity: "base" });
    })
    .forEach((detailItem) => {
      const row = document.createElement("div");
      row.className = "sim-site-row";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "12px";
      row.style.padding = "12px 16px";
      row.style.cursor = "default";
      row.innerHTML = `
        <span class="sim-site-name">${escHtml(detailItem.spoke_name)} — ${escHtml(detailItem.wsite)}</span>
        <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <span style="font-size:0.82rem;color:var(--muted);">${detailItem.count} event${detailItem.count === 1 ? "" : "s"}</span>
          <span class="sim-status-badge ${hubCheckStatusClass(detailItem.status)}">${escHtml(hubStatusLabel(detailItem.status))}</span>
        </span>
      `;
      siteList.appendChild(row);
    });
}

function renderHubHwPanel() {
  const container = document.getElementById("hub-hw-checks-list");
  if (!container) return;
  const tenantId = getActiveTenantId();
  const hwChecks = hubAggregateHardware(hubCentralData?.spokes || []);
  const gatewayItems = (Array.isArray(_hubMonitoredItemsData) ? _hubMonitoredItemsData : [])
    .filter((item) => item.type === "gateway");

  if (!hwChecks.length && !gatewayItems.length) {
    container.innerHTML = '<div class="central-empty">No hardware data available.</div>';
    return;
  }

  const tdP = "padding:6px 10px;";

  // ── Gateway devices card (manually monitored, same style as Alerts) ────────
  let gatewayHtml = "";
  if (gatewayItems.length) {
    const rows = gatewayItems.map((item) => {
      const { tone, label } = getMonitoredItemStatusMeta(item);
      const dotColor = tone === "red" ? "var(--text-danger,#e74c3c)" : tone === "yellow" ? "var(--text-warn,#e67e22)" : "var(--accent-green,#00b388)";
      const badge = `<span style="display:inline-flex;align-items:center;gap:5px;color:${dotColor};font-weight:600;font-size:0.82rem;"><span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>${escHtml(label)}</span>`;
      const lastSeen = item.central_last_seen
        ? new Date(item.central_last_seen).toLocaleString()
        : item.last_seen ? new Date(item.last_seen * 1000).toLocaleString()
        : tone === "green" ? "Online" : "—";
      const removeBtn = item.id
        ? `<button class="btn btn-small btn-secondary hub-monitored-remove-btn" data-item-id="${escHtml(item.id)}" type="button">Remove</button>`
        : "";
      return `<tr>
        <td style="font-weight:600;word-break:break-word;width:260px;vertical-align:top;${tdP}">${escHtml(item.name || item.identifier || "—")}</td>
        <td style="white-space:nowrap;width:180px;vertical-align:top;${tdP}">${badge}</td>
        <td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;vertical-align:top;${tdP}">${escHtml(lastSeen)}</td>
        <td style="white-space:nowrap;width:100px;text-align:right;vertical-align:top;${tdP}">${removeBtn}</td>
      </tr>`;
    }).join("");
    gatewayHtml = `
      <div class="setup-card" style="margin-bottom:1rem;padding:0;">
        <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);">
          <h4 style="margin:0;color:var(--muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">Gateway Devices</h4>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="margin:0;width:100%;font-size:0.85rem;table-layout:fixed;">
            <thead><tr>
              <th style="padding:5px 10px;width:260px;">Name</th>
              <th style="padding:5px 10px;width:180px;">Status</th>
              <th style="padding:5px 10px;white-space:nowrap;">Last Seen</th>
              <th style="padding:5px 10px;width:100px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Auto-detected hardware alerts card ─────────────────────────────────────
  let hwAlertsHtml = "";
  if (hwChecks.length) {
    const rows = hwChecks.map((hw) => {
      const dotColor = hw.total > 0 ? "var(--text-danger,#e74c3c)" : "var(--accent-green,#00b388)";
      const badgeLabel = hw.total > 0 ? `${hw.total} DOWN` : "CLEAR";
      const badge = `<span style="display:inline-flex;align-items:center;gap:5px;color:${dotColor};font-weight:600;font-size:0.82rem;"><span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>${escHtml(badgeLabel)}</span>`;
      const siteCount = hw.spoke_breakdown.reduce((s, sp) => s + Object.keys(sp.sites || {}).length, 0);
      const detail = `${hw.spoke_breakdown.length} spoke${hw.spoke_breakdown.length === 1 ? "" : "s"} · ${siteCount} site${siteCount === 1 ? "" : "s"}`;
      return `<tr class="hub-hw-alert-row" data-hw-id="${escHtml(hw.id)}" style="cursor:pointer;">
        <td style="font-weight:600;word-break:break-word;width:260px;vertical-align:top;${tdP}">${escHtml(hw.name)}</td>
        <td style="white-space:nowrap;width:180px;vertical-align:top;${tdP}">${badge}</td>
        <td style="color:var(--muted);font-size:0.8rem;white-space:nowrap;vertical-align:top;${tdP}">${escHtml(detail)}</td>
      </tr>`;
    }).join("");
    hwAlertsHtml = `
      <div class="setup-card" style="margin-bottom:1rem;padding:0;">
        <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);">
          <h4 style="margin:0;color:var(--muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">Hardware Alerts</h4>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table" style="margin:0;width:100%;font-size:0.85rem;table-layout:fixed;">
            <thead><tr>
              <th style="padding:5px 10px;width:260px;">Name</th>
              <th style="padding:5px 10px;width:180px;">Status</th>
              <th style="padding:5px 10px;white-space:nowrap;">Spokes / Sites</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  container.innerHTML = gatewayHtml + hwAlertsHtml;

  // Wire Remove buttons for gateway items
  container.querySelectorAll(".hub-monitored-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.itemId;
      if (!itemId || !tenantId) return;
      btn.disabled = true;
      btn.textContent = "Removing…";
      try {
        const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/central/monitored-items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
        if (res?.ok) {
          _hubMonitoredItemsData = (_hubMonitoredItemsData || []).filter((i) => i.id !== itemId);
          renderHubHwPanel();
        } else {
          btn.disabled = false;
          btn.textContent = "Remove";
        }
      } catch {
        btn.disabled = false;
        btn.textContent = "Remove";
      }
    });
  });

  // Wire click-to-detail for hardware alert rows
  container.querySelectorAll(".hub-hw-alert-row[data-hw-id]").forEach((row) => {
    row.addEventListener("click", () => openHubHwDetail(row.dataset.hwId));
  });
}

function openHubHwDetail(checkId) {
  const hw = hubAggregateHardware(hubCentralData?.spokes || []).find((item) => item.id === checkId);
  const overview = document.getElementById("hub-hw-overview");
  const detail = document.getElementById("hub-hw-detail");
  const title = document.getElementById("hub-hw-detail-title");
  const sub = document.getElementById("hub-hw-detail-sub");
  const badge = document.getElementById("hub-hw-detail-badge");
  const siteList = document.getElementById("hub-hw-site-list");
  if (!hw || !overview || !detail || !siteList) return;
  hubHwOpenCheckId = checkId;
  overview.classList.add("hidden");
  detail.classList.remove("hidden");
  if (title) title.textContent = hw.name;
  if (sub) sub.textContent = hw.total > 0 ? `${hw.total} device(s) affected across ${hw.spoke_breakdown.length} spoke${hw.spoke_breakdown.length === 1 ? "" : "s"}` : "No active alerts";
  if (badge) {
    badge.textContent = hw.total > 0 ? `${hw.total} DOWN` : "CLEAR";
    badge.className = `sim-status-badge ${hw.total > 0 ? "sim-fail" : "sim-pass"}`;
  }
  siteList.textContent = "";
  if (!hw.spoke_breakdown.length) {
    siteList.innerHTML = '<div class="central-empty">No device breakdown available.</div>';
    return;
  }
  hw.spoke_breakdown
    .slice()
    .sort((left, right) => Number(right.total || 0) - Number(left.total || 0) || String(left.spoke_name || "").localeCompare(String(right.spoke_name || ""), undefined, { sensitivity: "base" }))
    .forEach((spoke) => {
      const spokeRow = document.createElement("div");
      spokeRow.className = "sim-site-row";
      spokeRow.style.display = "flex";
      spokeRow.style.flexDirection = "column";
      spokeRow.style.gap = "6px";
      spokeRow.style.padding = "12px 16px";
      spokeRow.style.cursor = "default";
      spokeRow.innerHTML = `<strong>${escHtml(spoke.spoke_name)}</strong><span style="font-size:0.82rem;color:var(--muted);">${spoke.total} device(s) affected</span>`;
      siteList.appendChild(spokeRow);
      const siteEntries = Object.entries(spoke.sites || {});
      if (!siteEntries.length) {
        const empty = document.createElement("div");
        empty.className = "sim-site-row";
        empty.style.display = "flex";
        empty.style.justifyContent = "space-between";
        empty.style.padding = "10px 16px 10px 32px";
        empty.style.cursor = "default";
        empty.innerHTML = '<span class="sim-site-name">No site breakdown</span><span style="font-size:0.82rem;color:var(--muted);">—</span>';
        siteList.appendChild(empty);
        return;
      }
      siteEntries
        .sort((left, right) => String(left[1]?.site_name || left[0]).localeCompare(String(right[1]?.site_name || right[0]), undefined, { sensitivity: "base" }))
        .forEach(([wsite, info]) => {
          const devices = Array.isArray(info?.devices) ? info.devices : [];
          const siteRow = document.createElement("div");
          siteRow.className = "sim-site-row";
          siteRow.style.display = "flex";
          siteRow.style.justifyContent = "space-between";
          siteRow.style.alignItems = "center";
          siteRow.style.gap = "12px";
          siteRow.style.padding = "10px 16px 10px 32px";
          siteRow.style.cursor = "default";
          siteRow.innerHTML = `
            <span class="sim-site-name">${escHtml(info?.site_name || wsite)}</span>
            <span class="sim-status-badge sim-fail">${devices.length} device${devices.length === 1 ? "" : "s"}</span>
          `;
          siteList.appendChild(siteRow);
        });
    });
}

function renderHubCcPanel() {
  const container = document.getElementById("hub-cc-checks-list");
  if (!container) return;
  container.textContent = "";
  const ccData = hubAggregateClientCount(hubCentralData?.spokes || []);
  if (!ccData.length) {
    container.innerHTML = '<div class="central-empty">No client count data from any spoke.</div>';
    return;
  }
  for (const site of ccData) {
    const row = document.createElement("div");
    row.className = "check-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `
      <span class="check-dot ${hubCheckDotClass(site.worst_status)}"></span>
      <span class="check-name">${escHtml(site.site_name || site.wsite)}</span>
      <span class="check-badge ${hubCheckStatusClass(site.worst_status)}">${escHtml(hubStatusLabel(site.worst_status))}</span>
      <span class="check-detail">${site.spoke_breakdown.length} spoke${site.spoke_breakdown.length === 1 ? "" : "s"} reporting</span>
      <span class="check-ts">${escHtml(hubFormatCheckTs(site.ts))}</span>
    `;
    row.addEventListener("click", () => openHubCcDetail(site.wsite));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHubCcDetail(site.wsite);
      }
    });
    container.appendChild(row);
  }
}

function openHubCcDetail(wsite) {
  const site = hubAggregateClientCount(hubCentralData?.spokes || []).find((item) => item.wsite === wsite);
  const overview = document.getElementById("hub-cc-overview");
  const detail = document.getElementById("hub-cc-detail");
  const title = document.getElementById("hub-cc-detail-title");
  const sub = document.getElementById("hub-cc-detail-sub");
  const badge = document.getElementById("hub-cc-detail-badge");
  const siteDetail = document.getElementById("hub-cc-site-detail");
  if (!site || !overview || !detail || !siteDetail) return;
  hubCcOpenWsite = wsite;
  overview.classList.add("hidden");
  detail.classList.remove("hidden");
  if (title) title.textContent = site.site_name || site.wsite;
  if (sub) sub.textContent = `${site.spoke_breakdown.length} spoke${site.spoke_breakdown.length === 1 ? "" : "s"} reporting`;
  if (badge) {
    badge.textContent = hubStatusLabel(site.worst_status);
    badge.className = `sim-status-badge ${hubCheckStatusClass(site.worst_status)}`;
  }
  siteDetail.textContent = "";
  site.spoke_breakdown
    .slice()
    .sort((left, right) => {
      const statusDiff = (HUB_STATUS_PRIORITY[String(right.status || "").toLowerCase()] || 0)
        - (HUB_STATUS_PRIORITY[String(left.status || "").toLowerCase()] || 0);
      if (statusDiff) return statusDiff;
      return String(left.spoke_name || "").localeCompare(String(right.spoke_name || ""), undefined, { sensitivity: "base" });
    })
    .forEach((spoke) => {
      const dropValue = Number(spoke.drop_pct);
      const baselineValue = spoke.baseline_source === "7day" ? Number(spoke.baseline_7day) : Number(spoke.hourly_avg);
      const drop = Number.isFinite(dropValue) ? formatClientCountDelta(dropValue) : "—";
      const baselineLabel = spoke.baseline_source === "7day" ? "7d avg" : "1h avg";
      const baseline = Number.isFinite(baselineValue) ? baselineValue.toFixed(1) : "—";
      const row = document.createElement("div");
      row.className = "sim-site-row";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = "12px";
      row.style.padding = "12px 16px";
      row.style.cursor = "default";
      row.innerHTML = `
        <span>
          <span class="sim-site-name">${escHtml(spoke.spoke_name)}</span>
          <span style="display:block;font-size:0.82rem;color:var(--muted);margin-top:4px;">Current: ${spoke.current ?? "—"} / ${baselineLabel}: ${baseline} / Δ: ${drop}${spoke.baseline_stale ? " · baseline stale" : ""}</span>
        </span>
        <span class="sim-status-badge ${hubCheckStatusClass(spoke.status)}">${escHtml(hubStatusLabel(spoke.status))}</span>
      `;
      siteDetail.appendChild(row);
    });
}

function updateClientSpokeFilterOptions() {
  const select = $("#hub-clients-spoke-filter");
  if (!select) return;
  const currentValue = select.value || "all";
  const options = [...new Set(aggregateClientRows.map(row => hubClientSiteName(row)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  select.innerHTML = '<option value="all">All spokes</option>' + options.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join("");
  select.value = options.includes(currentValue) ? currentValue : "all";
}

function renderClientRowsForHub() {
  const container = $("#hub-clients-sites-list");
  if (!container) return;
  syncHubClientTypeTabs();
  updateHubClientTypeCounts(aggregateClientRows);
  const search = hubClientUiState.search.trim().toLowerCase();
  const myRole = currentRoleForTenant(currentTenantId);
  const showDemoButtons = myRole === 'admin' || myRole === 'demo' || myRole === 'superadmin';
  const rows = aggregateClientRows.filter(client => {
    const typeMatch = hubClientTypeFilter === "all" || classifyHubClient(client) === hubClientTypeFilter;
    if (!typeMatch) return false;
    const statusMatch = hubClientUiState.status === "all"
      || (hubClientUiState.status === "online" && client.online)
      || (hubClientUiState.status === "offline" && !client.online);
    if (!statusMatch) return false;
    if (!search) return true;
    const haystack = [
      client.hostname,
      hubClientSiteName(client),
      client.platform,
      client.hw_type,
      client.simulation_id,
      client.connected_ssid,
      ...normalizeHubClientActiveSimulations(client.active_simulations),
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
  const onlineCount = rows.filter(client => client.online).length;
  const groupedRows = new Map();
  rows.forEach(client => {
    const siteKey = hubClientSiteKey(client);
    if (!groupedRows.has(siteKey)) groupedRows.set(siteKey, { name: hubClientSiteName(client), clients: [] });
    groupedRows.get(siteKey).clients.push(client);
  });
  const sites = [...groupedRows.entries()]
    .map(([siteKey, group]) => {
      const clients = [...group.clients].sort((left, right) => {
        const onlineDiff = Number(Boolean(right.online)) - Number(Boolean(left.online));
        if (onlineDiff) return onlineDiff;
        return String(left.hostname || "").localeCompare(String(right.hostname || ""), undefined, { sensitivity: "base" });
      });
      return {
        siteKey,
        name: group.name,
        clients,
        onlineCount: clients.filter(client => client.online).length,
        errorCount: clients.reduce((sum, client) => sum + Number(client.error_count || 0), 0),
        activeSimulations: [...new Set(clients.flatMap(client => normalizeHubClientActiveSimulations(client.active_simulations)).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
        // T3: take the node-level t3_pci_count from the first client with the field set.
        // All clients on the same spoke share the same Proxmox node value.
        t3PciCount: clients.reduce((max, c) => Math.max(max, Number(c.t3_pci_count || 0)), 0),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  $("#hub-clients-pill") && ($("#hub-clients-pill").textContent = `${rows.length} clients`);
  $("#hub-clients-online-pill") && ($("#hub-clients-online-pill").textContent = `${onlineCount} online`);
  $("#hub-clients-spokes-pill") && ($("#hub-clients-spokes-pill").textContent = `${sites.length} spokes`);
  if (!sites.length) {
    container.innerHTML = `<div class="empty-state">${aggregateClientRows.length ? "No clients match the current filters." : "No client telemetry reported for this tenant."}</div>`;
    return;
  }
  primeHubClientExpandedSet(sites.map(site => site.siteKey));
  const expanded = getHubClientExpandedSet();
  try {
    container.innerHTML = sites.map(site => {
      const siteKey = String(site.siteKey || "");
      const isExpanded = expanded.has(siteKey);
      return `
        <section class="hub-client-site-group">
          <button class="hub-client-site-header" type="button" data-site-key="${escHtml(siteKey)}" aria-expanded="${isExpanded ? "true" : "false"}">
            <div class="hub-client-site-top-row">
              <span class="hub-client-site-name">${escHtml(site.name)}</span>
              <span class="badge badge-grey">${site.clients.length} clients</span>
              <span class="badge badge-green">${site.onlineCount} online</span>
              ${site.errorCount > 0 ? `<span class="badge badge-red">${site.errorCount} errors</span>` : ""}
              ${site.t3PciCount > 0 ? `<span class="badge badge-purple" title="T3 IoT PCI devices on this node">📡 ${site.t3PciCount} T3</span>` : ""}
              <span class="hub-client-site-chevron" aria-hidden="true">${isExpanded ? "▼" : "▶"}</span>
            </div>
            <div class="hub-client-site-simulations">${renderHubSimulationBadges(site.activeSimulations, "")}</div>
          </button>
          ${isExpanded ? `
            <div class="hub-client-site-rows">
              ${hubClientTypeFilter === 't3' ? renderHubT3PciSection(site) : ""}
              <div class="table-scroll">
                <table class="data-table hub-client-site-table">
                  <thead><tr><th>Status</th><th>Hostname</th><th>Platform</th><th style="min-width:120px;white-space:nowrap">SSID</th><th style="white-space:nowrap">Last Seen</th><th>Errors</th><th>Sim</th>${showDemoButtons ? '<th>Demo Scenario</th>' : ''}</tr></thead>
                  <tbody>
                    ${site.clients.map(client => {
                      const sims = normalizeHubClientActiveSimulations(client.active_simulations);
                      const demoScenario = hubDemoActiveMap[client.hostname]?.scenario || null;
                      const isAdminRole = myRole === 'admin' || myRole === 'superadmin';
                      const colSpan = showDemoButtons ? 7 : 6;
                      const overrides = hubClientSimOverrides[client.hostname] || [];
                      const simsRow = `<tr class="hub-client-sims-row"><td colspan="${colSpan + 1}" class="hub-client-sims-cell">
                        ${renderHubSimulationBadges(sims, "", demoScenario, { hostname: client.hostname || '', spokeId: client.spoke_id || '', isAdmin: isAdminRole, overrides })}
                      </td></tr>`;
                      return `
                        <tr class="hub-client-main-row">
                          <td class="status-cell">${statusDot(Boolean(client.online))}</td>
                          <td class="hostname-cell">${escHtml(client.hostname || "—")}</td>
                          <td>${escHtml(client.platform || client.hw_type || "—")}</td>
                          <td style="white-space:nowrap">${escHtml(client.connected_ssid || "—")}</td>
                          <td class="nowrap-cell"><span title="${escHtml(fmtDate(client.last_seen))}">${escHtml(relativeTime(client.last_seen))}</span></td>
                          <td>${Number(client.error_count || 0)}</td>
                          <td style="font-family:monospace;font-size:0.85em;white-space:nowrap">${escHtml(client.simulation_id || "—")}</td>
                          ${showDemoButtons ? `<td class="hub-demo-btn-cell" data-hostname="${escHtml(client.hostname || '')}" data-spoke-id="${escHtml(client.spoke_id || '')}"></td>` : ''}
                        </tr>${simsRow}`;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ""}
        </section>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to render hub client rows", err);
    container.innerHTML = `<div class="empty-state">Unable to render client rows: ${escHtml(err?.message || "Unknown error")}</div>`;
    return;
  }
  container.querySelectorAll(".hub-client-site-header[data-site-key]").forEach(button => {
    button.addEventListener("click", () => toggleHubSiteExpand(button.dataset.siteKey || ""));
  });
  // Populate demo scenario buttons in empty cells
  if (showDemoButtons) {
    container.querySelectorAll("td.hub-demo-btn-cell[data-hostname]").forEach(cell => {
      buildHubDemoSelect({ hostname: cell.dataset.hostname, spoke_id: cell.dataset.spokeId }, cell);
    });
  }
  // Wire admin sim toggle buttons — event delegation per container render
  const isAdminRole = myRole === 'admin' || myRole === 'superadmin';
  if (isAdminRole) {
    container.querySelectorAll("button.sim-toggle-btn[data-sim]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const { hostname, sim } = btn.dataset;
        const isCurrentlyOverridden = btn.dataset.overridden === "1";
        btn.disabled = true;
        await toggleHubClientSimOverride(currentTenantId, hostname, sim, !isCurrentlyOverridden);
        btn.disabled = false;
        renderClientRowsForHub(); // re-render after state update
      });
    });
  }
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

function setTenantDetailVisible(open) {
  $("#hub-dashboard-overview")?.classList.toggle("hidden", open);
  $("#hub-tenant-detail")?.classList.toggle("hidden", !open);
}

function resetTenantDetail() {
  tenantDetailState.open = false;
  tenantDetailState.tenantId = null;
  tenantDetailState.activeTab = "dashboard";
  setTenantDetailVisible(false);
  updateHubRefreshPausedState();
}

function scheduleReload(key, callback, delay = 250) {
  if (scheduledReloads[key]) clearTimeout(scheduledReloads[key]);
  scheduledReloads[key] = window.setTimeout(() => {
    scheduledReloads[key] = null;
    callback();
  }, delay);
}

// Tracks whether the user is actively interacting with a form element.
// Auto-refresh is suppressed while true so in-progress edits are never lost.
let _formInteractionActive = false;
let _formInteractionBlurTimer = null;

document.addEventListener('focusin', e => {
  if (e.target.matches('input, textarea, select')) {
    _formInteractionActive = true;
    if (_formInteractionBlurTimer) { clearTimeout(_formInteractionBlurTimer); _formInteractionBlurTimer = null; }
  }
});
document.addEventListener('focusout', e => {
  if (e.target.matches('input, textarea, select')) {
    // Short delay so tabbing between fields doesn't briefly clear the flag
    _formInteractionBlurTimer = setTimeout(() => {
      _formInteractionActive = false;
      _formInteractionBlurTimer = null;
    }, 500);
  }
});

// Returns true when the user is actively editing a field or has checkboxes
// selected — auto-refresh should be skipped to avoid disrupting their work.
// Set when the remote log viewer has fetched output — cleared on Clear click.
// Prevents auto-refresh from wiping log content while the user is reading it.
let _vmLogPinned = false;

function _hasActiveInteraction() {
  if (_formInteractionActive) return true;
  if (document.querySelectorAll('.hub-vm-check:checked').length > 0) return true;
  if (_vmLogPinned) return true;
  return false;
}

// Kept for backwards-compat — delegates to the full interaction check.
function _hasActiveSelection() {
  return _hasActiveInteraction();
}

// Silently fetch fresh data for a tab and update in-memory caches without
// touching the DOM. Called for background (inactive) tabs on WS telemetry
// events so switching tabs always shows fresh data.
async function _bgFetchTab(tab) {
  if (!currentTenantId || !currentUser) return;
  try {
    if (tab === "vm-server") {
      const [fresh] = await Promise.all([
        loadAggregateData("proxmox"),
        loadHubVmServerAggregateStatus(),
      ]);
      if (fresh?.hosts) {
        aggregateProxmoxHosts = fresh.hosts;
        try { localStorage.setItem(`hub_vmserver_${currentTenantId}`, JSON.stringify(fresh.hosts)); } catch (_) {}
      }
    } else if (tab === "simulations") {
      const data = await loadAggregateData("central");
      if (data) { hubCentralData = data; aggregateCentralData = data; }
    } else if (tab === "clients") {
      const data = await loadAggregateData("clients");
      if (data) {
        aggregateClientRows = normalizeAggregateClientRows(data);
        primeHubClientExpandedSet([...new Set(aggregateClientRows.map(hubClientSiteKey))]);
        saveHubClientsCache(aggregateClientRows);
      }
    } else if (tab === "spokes") {
      await ensureSpokes(true);
    }
  } catch (_) { /* silent — background fetch, never surface errors */ }
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
    // Only call loadDashboard (which auto-enters tenant context) if not already in a tenant context.
    // When already in context, the navigation would redirect away from the current page.
    if (!currentTenantId) {
      await loadDashboard(true);
    }
    if (tenantId === currentTenantId) {
      await loadHubSimulations(true);
      await loadClients(true);
      await loadVmServer(true);
      await loadHubCentralMonitoring(true);
      await loadSpokes(true);
      await loadTenantSetup(true);
      await loadConfig(true);
      if (activeTab === "reseed") await loadHubReseedPanel(true);
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
    return null;
  }
  updateApiStatus(true, "Connected");
  if (response.status === 401 && authToken) {
    logout(false);
    return null;
  }
  return response;
}

// QA-specific fetch: includes auth header but NEVER triggers logout on 401.
// QA checks can legitimately call endpoints that return 401 (unconfigured
// services, superadmin-only endpoints, etc.) — treating those as session
// expiry would log the admin out mid-run and cascade-fail all later checks.
async function _qaFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const init = { ...options, headers };
  if (init.body && !(init.body instanceof FormData) && typeof init.body !== "string") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  return fetch(url, init).catch(() => null);
}

async function readJson(response) {
  if (!response) return null;
  return response.json().catch(() => null);
}

function formatBackupBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= 1024 ** 4) return `${(value / (1024 ** 4)).toFixed(1)} TB`;
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function parseBackupVmIds(value) {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => Number.parseInt(item, 10))
    .filter(item => Number.isFinite(item))));
}

function listSuperadminBackupSpokes() {
  return tenants.flatMap(tenant => (spokeCache[tenant.id] || [])
    .filter(spoke => spoke.status === "approved")
    .map(spoke => ({ ...spoke, tenant_id: spoke.tenant_id || tenant.id })))
    .sort((left, right) => {
      const tenantCmp = tenantName(left.tenant_id).localeCompare(tenantName(right.tenant_id), undefined, { numeric: true, sensitivity: "base" });
      if (tenantCmp !== 0) return tenantCmp;
      return spokePrimaryLabel(left).localeCompare(spokePrimaryLabel(right), undefined, { numeric: true, sensitivity: "base" });
    });
}

function listScopedSuperadminBackupSpokes(tenantId = currentTenantId) {
  const allSpokes = listSuperadminBackupSpokes();
  if (!tenantId) return allSpokes;
  const scoped = allSpokes.filter(spoke => spoke.tenant_id === tenantId);
  return scoped.length ? scoped : allSpokes;
}

function getSelectedSuperadminBackupSpoke() {
  const spokes = listScopedSuperadminBackupSpokes();
  if (superadminBackupState.selectedSpokeId) {
    const selected = spokes.find(spoke => spoke.id === superadminBackupState.selectedSpokeId);
    if (selected) return selected;
  }
  const preferred = spokes.find(spoke => spoke.tenant_id === currentTenantId) || spokes[0] || null;
  superadminBackupState.selectedSpokeId = preferred?.id || "";
  return preferred;
}

function getSuperadminBackupVmIds(spokeId = superadminBackupState.selectedSpokeId) {
  const values = superadminBackupConfig?.spokes?.[spokeId]?.vm_ids;
  return Array.isArray(values) ? values.map(value => Number.parseInt(value, 10)).filter(value => Number.isFinite(value)) : [];
}

function getSuperadminBackupRows() {
  const configured = getSuperadminBackupVmIds();
  const knownIds = Object.keys(superadminBackupState.vmProgress);
  const ordered = Array.from(new Set([...configured.map(String), ...knownIds])).sort((left, right) => Number(left) - Number(right));
  return ordered.map(id => {
    const row = superadminBackupState.vmProgress[id] || {};
    return {
      vm_id: row.vm_id ?? (Number.parseInt(id, 10) || id),
      status: String(row.status || "queued").toLowerCase(),
      pct: Number.isFinite(Number(row.pct)) ? Number(row.pct) : null,
      size: row.size,
      file: row.file || "",
    };
  });
}

function isSuperadminBackupComplete() {
  const rows = getSuperadminBackupRows();
  return rows.length > 0 && rows.every(row => ["done", "error"].includes(row.status));
}

function backupStatusMeta(status) {
  const value = String(status || "queued").toLowerCase();
  if (value === "done") return { label: "✅ done", className: "status-online" };
  if (value === "error") return { label: "❌ error", className: "status-offline" };
  if (value === "running") return { label: "⏳ running", className: "status-unknown" };
  return { label: "⌛ queued", className: "status-unknown" };
}

function ensureSuperadminBackupUi() {
  if (!document.getElementById("hub-superadmin-btn")) {
    document.body.insertAdjacentHTML("beforeend", `<button id="hub-superadmin-btn" title="Superadmin" style="
  position:fixed; bottom:18px; right:18px; z-index:9999;
  background:none; border:none; cursor:pointer; font-size:18px; opacity:0.3;
  transition:opacity 0.2s;
" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.3'">🔒</button>`);
  }
  if (!document.getElementById("sa-backup-modal")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="sa-backup-modal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="sa-backup-modal-title">
        <div class="modal-box modal-box-large">
          <div class="modal-header">
            <h2 id="sa-backup-modal-title">Upload Template to Azure</h2>
            <button id="sa-backup-modal-x" class="btn btn-secondary btn-small" type="button">✕ Close</button>
          </div>
          <nav class="setup-subnav" style="margin-top:12px;">
            <button class="setup-subtab sa-backup-tab active" data-sa-backup-tab="backup" type="button">Upload</button>
            <button class="setup-subtab sa-backup-tab" data-sa-backup-tab="config" type="button">⚙️ Config</button>
          </nav>
          <div id="sa-backup-modal-body" class="setup-subpanel" style="margin-top:12px;"></div>
        </div>
      </div>
    `);
  }
}

function syncSuperadminBackupAccess() {
  const btn = document.getElementById("hub-superadmin-btn");
  if (!currentUser?.is_superadmin || !authToken) {
    btn?.remove();
    if (document.getElementById("sa-backup-modal")) closeSuperadminBackupModal(true);
    return;
  }
  ensureSuperadminBackupUi();
}

function renderSuperadminBackupModal() {
  ensureSuperadminBackupUi();
  const modal = document.getElementById("sa-backup-modal");
  const body = document.getElementById("sa-backup-modal-body");
  const title = document.getElementById("sa-backup-modal-title");
  const closeX = document.getElementById("sa-backup-modal-x");
  if (!modal || !body || !title || !closeX) return;

  modal.classList.toggle("hidden", !superadminBackupState.open);
  if (!superadminBackupState.open) return;

  $$(".sa-backup-tab").forEach(button => button.classList.toggle("active", button.dataset.saBackupTab === superadminBackupState.activeTab));
  const canClose = superadminBackupState.step !== "status" || isSuperadminBackupComplete();
  closeX.disabled = !canClose;

  if (superadminBackupState.activeTab === "config") {
    title.textContent = "Upload Configuration";
    const configRows = listSuperadminBackupSpokes();
    body.innerHTML = `
      <div class="setup-card">
        <div class="setup-card-header">
          <h3>Superadmin Upload Settings</h3>
          <p>Configure VM IDs per spoke and Azure destination settings for template uploads.</p>
        </div>
        ${superadminBackupState.configLoading ? '<div class="empty-state">Loading upload configuration…</div>' : `
          <div class="form-group">
            <label class="form-label" for="sa-backup-config-retention">Retention count</label>
            <input id="sa-backup-config-retention" type="number" min="1" class="form-input" value="${escHtml(superadminBackupConfig?.retention ?? 3)}">
          </div>
          <div class="form-group">
            <label class="form-label" for="sa-backup-config-account">Azure account name</label>
            <input id="sa-backup-config-account" type="text" class="form-input" value="${escHtml(superadminBackupConfig?.azure_account || "")}">
          </div>
          <div class="form-group">
            <label class="form-label" for="sa-backup-config-container">Azure container</label>
            <input id="sa-backup-config-container" type="text" class="form-input" value="${escHtml(superadminBackupConfig?.azure_container || "")}">
          </div>
          <div class="table-scroll-v" style="max-height:45vh;margin-top:12px;">
            <table class="data-table">
              <thead><tr><th>Tenant</th><th>Spoke</th><th>VM IDs</th></tr></thead>
              <tbody>${configRows.length ? configRows.map(spoke => `
                <tr>
                  <td>${escHtml(tenantName(spoke.tenant_id))}</td>
                  <td><strong>${escHtml(spokePrimaryLabel(spoke))}</strong><div class="tenant-card-subtitle">${escHtml(spoke.id)}</div></td>
                  <td><input class="form-input form-input-sm sa-backup-config-vms" data-spoke-id="${escHtml(spoke.id)}" type="text" value="${escHtml(getSuperadminBackupVmIds(spoke.id).join(", "))}" placeholder="100, 101, 102"></td>
                </tr>
              `).join("") : '<tr><td colspan="3" class="empty-state">No approved spokes found.</td></tr>'}</tbody>
            </table>
          </div>
          <div id="sa-backup-config-msg" class="form-msg ${superadminBackupState.configMessage ? (superadminBackupState.configMessageOk ? "msg-ok" : "msg-error") : ""}">${escHtml(superadminBackupState.configMessage)}</div>
          <div class="form-actions" style="margin-top:16px;">
            <button id="sa-backup-config-save-btn" class="btn btn-primary" type="button"${superadminBackupState.configSaving ? " disabled" : ""}>Save</button>
          </div>
        `}
      </div>
    `;
    return;
  }

  if (superadminBackupState.step === "status") {
    const rows = getSuperadminBackupRows();
    title.textContent = "Upload in Progress";
    body.innerHTML = `
      <div class="setup-card">
        <div class="setup-card-header">
          <h3>Upload in Progress</h3>
          <p>Job ID: ${escHtml(superadminBackupState.jobId || "pending")}</p>
        </div>
        <div class="table-scroll-v" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th>VM ID</th><th>Status</th><th>Progress</th><th>Size</th><th>File</th></tr></thead>
            <tbody>${rows.length ? rows.map(row => {
              const meta = backupStatusMeta(row.status);
              return `<tr>
                <td>${escHtml(row.vm_id)}</td>
                <td><span class="status-badge ${meta.className}">${meta.label}</span></td>
                <td>${row.pct === null ? "-" : `${escHtml(row.pct)}%`}</td>
                <td>${escHtml(formatBackupBytes(row.size))}</td>
                <td>${escHtml(row.file || "-")}</td>
              </tr>`;
            }).join("") : '<tr><td colspan="5" class="empty-state">Waiting for upload updates…</td></tr>'}</tbody>
          </table>
        </div>
        <div class="form-actions" style="margin-top:16px;">
          <button id="sa-backup-close-btn" class="btn btn-secondary" type="button"${canClose ? "" : " disabled"}>Close</button>
        </div>
      </div>
    `;
    return;
  }

  const spokes = listScopedSuperadminBackupSpokes();
  const selectedSpoke = getSelectedSuperadminBackupSpoke();
  const vmIds = getSuperadminBackupVmIds(selectedSpoke?.id);
  const proceedDisabled = !selectedSpoke || !vmIds.length || superadminBackupState.loading || superadminBackupState.configLoading;
  if (superadminBackupState.step === "key") {
    title.textContent = "Enter Azure Storage Key";
    body.innerHTML = `
      <div class="setup-card">
        <div class="setup-card-header">
          <h3>Enter Azure Storage Key</h3>
          <p>${selectedSpoke ? `${escHtml(tenantName(selectedSpoke.tenant_id))} — ${escHtml(spokePrimaryLabel(selectedSpoke))}` : "No spoke selected."}</p>
        </div>
        <p>Key will be used for this upload only and never stored.</p>
        <input type="password" id="sa-azure-key" placeholder="Azure storage account key" class="form-input" style="width:100%">
        <div class="form-actions" style="margin-top:16px;">
          <button id="sa-backup-back-btn" class="btn btn-secondary" type="button">← Back</button>
          <button id="sa-backup-start-btn" class="btn btn-primary" type="button"${superadminBackupState.loading ? " disabled" : ""}>Start Upload</button>
        </div>
        <div class="form-msg ${superadminBackupState.backupError ? "msg-error" : ""}">${escHtml(superadminBackupState.backupError)}</div>
      </div>
    `;
    document.getElementById("sa-azure-key")?.focus();
    return;
  }

  title.textContent = "Upload Template to Azure";
  body.innerHTML = `
    <div class="setup-card">
      <div class="setup-card-header">
        <h3>Upload Template to Azure</h3>
        <p>Select source spoke to upload:</p>
      </div>
      <div class="form-group">
        <label class="form-label" for="sa-spoke-select">Spoke</label>
        <select id="sa-spoke-select" class="form-input">
          ${spokes.length ? spokes.map(spoke => `<option value="${escHtml(spoke.id)}"${selectedSpoke?.id === spoke.id ? " selected" : ""}>${escHtml(tenantName(spoke.tenant_id))} — ${escHtml(spokePrimaryLabel(spoke))}</option>`).join("") : '<option value="">No approved spokes available</option>'}
        </select>
      </div>
      <div class="setup-card" style="margin-top:12px;">
        <div><strong>VMs configured:</strong> ${vmIds.length ? escHtml(vmIds.join(", ")) : "—"}</div>
        <div style="margin-top:8px;"><strong>Azure:</strong> ${escHtml(superadminBackupConfig?.azure_account || "—")} / ${escHtml(superadminBackupConfig?.azure_container || "—")}</div>
        <div style="margin-top:8px;"><strong>Retention:</strong> keep last ${escHtml(superadminBackupConfig?.retention ?? "—")}</div>
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button id="sa-backup-cancel-btn" class="btn btn-secondary" type="button">Cancel</button>
        <button id="sa-backup-proceed-btn" class="btn btn-primary" type="button"${proceedDisabled ? " disabled" : ""}>Proceed →</button>
      </div>
      <div class="form-msg ${superadminBackupState.backupError ? "msg-error" : ""}">${escHtml(superadminBackupState.backupError || (!vmIds.length && selectedSpoke ? "No VM IDs configured for this spoke." : ""))}</div>
    </div>
  `;
}

async function loadSuperadminBackupConfig(force = false) {
  if (!currentUser?.is_superadmin) return superadminBackupConfig;
  if (superadminBackupConfig && !force) return superadminBackupConfig;
  superadminBackupState.configLoading = true;
  superadminBackupState.configMessage = "";
  if (superadminBackupState.open) renderSuperadminBackupModal();
  const res = await apiFetch("/api/backup/config");
  const data = await readJson(res);
  if (!res || !res.ok) {
    superadminBackupConfig = superadminBackupConfig || { spokes: {}, retention: 3, azure_account: "", azure_container: "" };
    superadminBackupState.configMessage = data?.detail || "Failed to load upload configuration.";
    superadminBackupState.configMessageOk = false;
  } else {
    superadminBackupConfig = {
      spokes: data?.spokes || {},
      retention: data?.retention ?? 3,
      azure_account: data?.azure_account || "",
      azure_container: data?.azure_container || "",
    };
  }
  superadminBackupState.configLoading = false;
  if (superadminBackupState.open) renderSuperadminBackupModal();
  return superadminBackupConfig;
}

async function openSuperadminBackupModal() {
  if (!currentUser?.is_superadmin) return;
  ensureSuperadminBackupUi();
  superadminBackupState.open = true;
  superadminBackupState.activeTab = "backup";
  superadminBackupState.step = "confirm";
  superadminBackupState.loading = true;
  superadminBackupState.backupError = "";
  superadminBackupState.jobId = "";
  superadminBackupState.vmProgress = {};
  superadminBackupState.completionNotified = false;
  renderSuperadminBackupModal();
  await Promise.all([
    Promise.all(tenants.map(tenant => ensureTenantSpokesFor(tenant.id, false))),
    loadSuperadminBackupConfig(true),
  ]);
  getSelectedSuperadminBackupSpoke();
  superadminBackupState.loading = false;
  renderSuperadminBackupModal();
}

function closeSuperadminBackupModal(force = false) {
  if (!force && superadminBackupState.step === "status" && !isSuperadminBackupComplete()) return;
  superadminBackupState.open = false;
  superadminBackupState.activeTab = "backup";
  superadminBackupState.step = "confirm";
  superadminBackupState.loading = false;
  superadminBackupState.backupError = "";
  superadminBackupState.jobId = "";
  superadminBackupState.vmProgress = {};
  superadminBackupState.completionNotified = false;
  document.getElementById("sa-backup-modal")?.classList.add("hidden");
}

async function saveSuperadminBackupConfig() {
  if (!currentUser?.is_superadmin || superadminBackupState.configSaving) return;
  const retention = Number.parseInt(document.getElementById("sa-backup-config-retention")?.value || "", 10);
  if (!Number.isFinite(retention) || retention < 1) {
    superadminBackupState.configMessage = "Retention count must be at least 1.";
    superadminBackupState.configMessageOk = false;
    renderSuperadminBackupModal();
    return;
  }
  const payload = {
    spokes: JSON.parse(JSON.stringify(superadminBackupConfig?.spokes || {})),
    retention,
    azure_account: document.getElementById("sa-backup-config-account")?.value.trim() || "",
    azure_container: document.getElementById("sa-backup-config-container")?.value.trim() || "",
  };
  document.querySelectorAll(".sa-backup-config-vms").forEach(input => {
    const spokeId = input.dataset.spokeId;
    if (!spokeId) return;
    payload.spokes[spokeId] = { ...(payload.spokes[spokeId] || {}), vm_ids: parseBackupVmIds(input.value) };
  });
  superadminBackupState.configSaving = true;
  superadminBackupState.configMessage = "Saving…";
  superadminBackupState.configMessageOk = true;
  renderSuperadminBackupModal();
  const res = await apiFetch("/api/backup/config", { method: "POST", body: payload });
  const data = await readJson(res);
  superadminBackupState.configSaving = false;
  if (!res || !res.ok) {
    superadminBackupState.configMessage = data?.detail || "Failed to save upload configuration.";
    superadminBackupState.configMessageOk = false;
    renderSuperadminBackupModal();
    return;
  }
  superadminBackupConfig = {
    spokes: data?.spokes || payload.spokes,
    retention: data?.retention ?? payload.retention,
    azure_account: data?.azure_account ?? payload.azure_account,
    azure_container: data?.azure_container ?? payload.azure_container,
  };
  superadminBackupState.configMessage = "Upload configuration saved.";
  superadminBackupState.configMessageOk = true;
  renderSuperadminBackupModal();
}

function updateSuperadminBackupProgress(message) {
  if (!superadminBackupState.jobId || message.job_id !== superadminBackupState.jobId) return;
  const vmId = String(message.vm_id ?? "");
  if (!vmId) return;
  const current = superadminBackupState.vmProgress[vmId] || { vm_id: Number.parseInt(vmId, 10) || vmId, status: "queued", pct: 0, size: null, file: "" };
  superadminBackupState.vmProgress[vmId] = {
    ...current,
    vm_id: message.vm_id ?? current.vm_id,
    status: message.status || current.status,
    pct: Number.isFinite(Number(message.pct)) ? Number(message.pct) : current.pct,
    size: message.size ?? current.size,
    file: message.file ?? current.file,
  };
  if (superadminBackupState.open && superadminBackupState.step === "status") renderSuperadminBackupModal();
  if (!superadminBackupState.completionNotified && isSuperadminBackupComplete()) {
    superadminBackupState.completionNotified = true;
    showToast("Template upload finished.", "ok");
  }
}

async function startSuperadminBackup() {
  const spoke = getSelectedSuperadminBackupSpoke();
  if (!spoke) {
    superadminBackupState.backupError = "Select a spoke first.";
    renderSuperadminBackupModal();
    return;
  }
  const configuredVmIds = getSuperadminBackupVmIds(spoke.id);
  if (!configuredVmIds.length) {
    superadminBackupState.backupError = "No VM IDs configured for this spoke.";
    superadminBackupState.step = "confirm";
    renderSuperadminBackupModal();
    return;
  }
  let keyValue = document.getElementById("sa-azure-key")?.value || "";
  if (!keyValue) {
    superadminBackupState.backupError = "Azure storage account key is required.";
    renderSuperadminBackupModal();
    return;
  }
  superadminBackupState.loading = true;
  superadminBackupState.backupError = "";
  const responsePromise = apiFetch(`/api/backup/trigger/${encodeURIComponent(spoke.tenant_id)}/${encodeURIComponent(spoke.id)}`, {
    method: "POST",
    body: { azure_key: keyValue },
  });
  const keyInput = document.getElementById("sa-azure-key");
  if (keyInput) keyInput.value = "";
  keyValue = "";
  renderSuperadminBackupModal();
  const res = await responsePromise;
  const data = await readJson(res);
  superadminBackupState.loading = false;
  if (!res || !res.ok) {
    superadminBackupState.backupError = data?.detail || "Unable to start upload.";
    renderSuperadminBackupModal();
    return;
  }
  superadminBackupState.step = "status";
  superadminBackupState.jobId = data?.job_id || "";
  superadminBackupState.vmProgress = Object.fromEntries(configuredVmIds.map(vmId => [String(vmId), { vm_id: vmId, status: "queued", pct: 0, size: null, file: "" }]));
  superadminBackupState.completionNotified = false;
  renderSuperadminBackupModal();
  showToast(`Upload started for ${spokePrimaryLabel(spoke)}.`, "ok");
}

function resetHubReseedState({ preserveTemplates = true } = {}) {
  hubReseedState.tenantId = currentTenantId || null;
  hubReseedState.loading = false;
  hubReseedState.submitting = false;
  hubReseedState.error = "";
  hubReseedState.step = "select";
  hubReseedState.jobId = "";
  hubReseedState.progressTemplateName = "";
  hubReseedState.progressRows = {};
  hubReseedState.completionNotified = false;
  hubReseedState.selectedSpokeIds = [];
  if (!preserveTemplates) {
    hubReseedState.templatesLoading = false;
    hubReseedState.templates = [];
    hubReseedState.templatesError = "";
    hubReseedState.selectedTemplateKey = "";
  }
}

function syncHubReseedTenantState() {
  if (hubReseedState.tenantId !== currentTenantId) resetHubReseedState({ preserveTemplates: true });
}

function ensureHubReseedUi() {
  const tenantNav = document.querySelector("#tenant-context-nav .tenant-context-nav-row2");
  if (tenantNav && !tenantNav.querySelector('[data-tab="hub-reseed"]')) {
    const button = document.createElement("button");
    button.className = "tab";
    button.type = "button";
    button.dataset.tab = "hub-reseed";
    button.textContent = "Reseed";
    const anchor = tenantNav.querySelector(".tab-nav-sep");
    tenantNav.insertBefore(button, anchor || null);
  }
  const hubRoot = document.getElementById("hub-root");
  if (hubRoot && !document.getElementById("tab-hub-reseed")) {
    const panel = document.createElement("main");
    panel.id = "tab-hub-reseed";
    panel.className = "page tab-content hidden";
    panel.innerHTML = '<div id="hub-reseed-panel"><div class="empty-state">Loading reseed options…</div></div>';
    const anchor = document.getElementById("tab-hub-config") || document.getElementById("tab-hub-tenant-setup");
    hubRoot.insertBefore(panel, anchor || null);
  }
}

function titleCaseWords(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase()) || "Unknown";
}

function formatBackupTemplateUpdatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeBackupTemplates(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.templates)
      ? payload.templates
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  return items.map((item, index) => {
    const value = typeof item === "string" ? { template_name: item, latest_blob: item } : (item || {});
    const templateName = value.template_name || value.name || value.template || value.label || value.blob_name || `template-${index + 1}`;
    const latestBlob = value.latest_blob || value.blob_name || value.blob || templateName;
    const sizeValue = value.size_bytes ?? value.latest_size_bytes ?? value.latest_blob_size ?? value.bytes ?? value.size ?? null;
    const updatedAt = value.updated_at || value.last_updated || value.modified || value.last_modified || value.created_at || value.timestamp || "";
    return {
      template_name: String(templateName),
      latest_blob: String(latestBlob),
      size_bytes: Number.isFinite(Number(sizeValue)) ? Number(sizeValue) : null,
      updated_at: updatedAt,
    };
  }).filter(item => item.template_name && item.latest_blob).sort((left, right) => {
    const updatedCmp = String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
    if (updatedCmp !== 0) return updatedCmp;
    return left.template_name.localeCompare(right.template_name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function backupTemplateKey(template) {
  if (!template) return "";
  return String(template.latest_blob || template.template_name || "");
}

function renderBackupTemplateOptionLabel(template) {
  const size = template.size_bytes ? ` (${formatBackupBytes(template.size_bytes)})` : "";
  const updated = formatBackupTemplateUpdatedAt(template.updated_at);
  return `${template.template_name}${size}${updated ? ` — updated ${updated}` : ""}`;
}

function getSelectedHubReseedTemplate() {
  if (!hubReseedState.templates.length) return null;
  const selected = hubReseedState.templates.find(template => backupTemplateKey(template) === hubReseedState.selectedTemplateKey);
  if (selected) return selected;
  const fallback = hubReseedState.templates[0] || null;
  hubReseedState.selectedTemplateKey = backupTemplateKey(fallback);
  return fallback;
}

function listTenantReseedSpokes() {
  return getTenantSpokes()
    .filter(spoke => spoke.status === "approved")
    .sort((left, right) => spokePrimaryLabel(left).localeCompare(spokePrimaryLabel(right), undefined, { numeric: true, sensitivity: "base" }));
}

function setHubReseedSelectedSpokeIds(ids = []) {
  const allowed = new Set(listTenantReseedSpokes().map(spoke => spoke.id));
  hubReseedState.selectedSpokeIds = Array.from(new Set(ids.filter(id => allowed.has(id))));
}

function getHubReseedRows() {
  return Object.values(hubReseedState.progressRows).sort((left, right) => {
    const orderDiff = (left.order ?? 0) - (right.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(left.spoke_name || left.spoke_id || "").localeCompare(String(right.spoke_name || right.spoke_id || ""), undefined, { numeric: true, sensitivity: "base" });
  });
}

function isHubReseedComplete() {
  const rows = getHubReseedRows();
  return rows.length > 0 && rows.every(row => ["done", "error"].includes(String(row.status || "").toLowerCase()));
}

function reseedStatusMeta(status) {
  const value = String(status || "queued").toLowerCase();
  if (value === "done") return { icon: "✅", label: "Done", className: "status-online" };
  if (value === "error") return { icon: "❌", label: "Error", className: "status-offline" };
  if (["queued", "pending", "offline", "offline_queued"].includes(value)) return { icon: "⏱", label: "Queued", className: "status-unknown" };
  if (["downloading", "restoring", "recloning", "running", "in_progress"].includes(value)) {
    return { icon: "⏳", label: titleCaseWords(value), className: "status-unknown" };
  }
  return { icon: "⏳", label: titleCaseWords(value), className: "status-unknown" };
}

async function loadHubReseedTemplates(force = false) {
  if (!currentUser) return hubReseedState.templates;
  if (hubReseedState.templatesLoading) return hubReseedState.templates;
  if (!force && hubReseedState.templates.length) return hubReseedState.templates;
  hubReseedState.templatesLoading = true;
  hubReseedState.templatesError = "";
  if (activeTab === "reseed") renderHubReseedPanel();
  const res = await apiFetch("/api/backup/templates");
  const data = await readJson(res);
  if (!res || !res.ok) {
    hubReseedState.templates = [];
    hubReseedState.selectedTemplateKey = "";
    hubReseedState.templatesError = data?.detail || "Unable to load Azure templates.";
  } else {
    hubReseedState.templates = normalizeBackupTemplates(data);
    const selectedKey = hubReseedState.selectedTemplateKey;
    if (!hubReseedState.templates.find(template => backupTemplateKey(template) === selectedKey)) {
      hubReseedState.selectedTemplateKey = backupTemplateKey(hubReseedState.templates[0]);
    }
  }
  hubReseedState.templatesLoading = false;
  if (activeTab === "reseed") renderHubReseedPanel();
  return hubReseedState.templates;
}

function renderHubReseedPanel() {
  ensureHubReseedUi();
  const container = document.getElementById("hub-reseed-panel");
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = '<div class="empty-state">Sign in to reseed spokes.</div>';
    return;
  }
  if (!currentTenantId) {
    container.innerHTML = '<div class="empty-state">Select a tenant to reseed spokes.</div>';
    return;
  }
  syncHubReseedTenantState();
  const tenantLabel = tenantName(currentTenantId) || currentTenantId;
  const spokes = listTenantReseedSpokes();
  const selectedTemplate = getSelectedHubReseedTemplate();
  if (hubReseedState.step === "progress") {
    const rows = getHubReseedRows();
    const canClose = isHubReseedComplete();
    container.innerHTML = `
      <div class="setup-card">
        <div class="setup-card-header">
          <h2>Reseed Template</h2>
          <p>${escHtml(tenantLabel)}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <span class="stat-pill">Template ${escHtml(hubReseedState.progressTemplateName || "—")}</span>
          <span class="stat-pill">Job ${escHtml(hubReseedState.jobId || "pending")}</span>
        </div>
      </div>
      <div class="setup-card" style="margin-top:16px;">
        <div class="setup-card-header">
          <h3>Step 3 — Progress</h3>
          <p>Tracking reseed progress for selected spokes.</p>
        </div>
        <div class="table-scroll-v" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th>Spoke</th><th>Template</th><th>Step</th><th>Status</th></tr></thead>
            <tbody>${rows.length ? rows.map(row => {
              const meta = reseedStatusMeta(row.status);
              return `<tr>
                <td><strong>${escHtml(row.spoke_name || row.spoke_id)}</strong><div class="tenant-card-subtitle">${escHtml(row.spoke_id || "")}</div></td>
                <td>${escHtml(row.template_name || "—")}</td>
                <td>${escHtml(row.step || meta.label)}</td>
                <td><span class="status-badge ${meta.className}">${meta.icon} ${escHtml(meta.label)}</span></td>
              </tr>`;
            }).join("") : '<tr><td colspan="4" class="empty-state">Waiting for reseed updates…</td></tr>'}</tbody>
          </table>
        </div>
        <div class="form-actions" style="margin-top:16px;">
          <button id="reseed-close-btn" class="btn btn-secondary" type="button"${canClose ? "" : " disabled"}>Close</button>
        </div>
      </div>
    `;
    return;
  }

  const selectedCount = hubReseedState.selectedSpokeIds.length;
  const startDisabled = !selectedTemplate || !selectedCount || hubReseedState.submitting || hubReseedState.loading;
  container.innerHTML = `
    <div class="setup-card">
      <div class="setup-card-header">
        <h2>Reseed Template</h2>
        <p>${escHtml(tenantLabel)}</p>
      </div>
      <div class="form-group" style="margin-top:12px;">
        <label class="form-label" for="reseed-template-select">Step 1 — Pick template</label>
        <div style="font-size:0.92rem;color:var(--muted);margin-bottom:8px;">Available templates in Azure:</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="reseed-template-select" class="form-input" style="flex:1;min-width:280px;">
            ${hubReseedState.templatesLoading ? '<option value="">Loading…</option>' : hubReseedState.templates.length ? hubReseedState.templates.map(template => `<option value="${escHtml(backupTemplateKey(template))}"${selectedTemplate && backupTemplateKey(template) === backupTemplateKey(selectedTemplate) ? ' selected' : ''}>${escHtml(renderBackupTemplateOptionLabel(template))}</option>`).join("") : '<option value="">No templates available</option>'}
          </select>
          <button id="reseed-refresh-templates-btn" class="btn btn-secondary btn-small" type="button"${hubReseedState.templatesLoading ? " disabled" : ""}>Refresh</button>
        </div>
        <div class="form-msg ${hubReseedState.templatesError ? "msg-error" : ""}">${escHtml(hubReseedState.templatesError)}</div>
      </div>
    </div>
    <div class="setup-card" style="margin-top:16px;">
      <div class="setup-card-header">
        <h3>Step 2 — Pick target spokes</h3>
        <p>Select one or more spokes in this tenant. Offline spokes will queue automatically.</p>
      </div>
      <div class="form-actions" style="justify-content:flex-start;margin-top:12px;">
        <button id="reseed-select-all-btn" class="btn btn-secondary btn-small" type="button">Select All</button>
        <button id="reseed-clear-btn" class="btn btn-secondary btn-small" type="button">Clear</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px;">
        ${spokes.length ? spokes.map(spoke => {
          const online = isOnline(spoke.last_seen);
          const checked = hubReseedState.selectedSpokeIds.includes(spoke.id);
          return `<label style="border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;gap:10px;align-items:flex-start;background:var(--card-bg,#fff);">
            <input type="checkbox" data-reseed-spoke-id="${escHtml(spoke.id)}"${checked ? " checked" : ""}>
            <span>
              <strong>${escHtml(spokePrimaryLabel(spoke))}</strong>${online ? "" : ' <span style="color:var(--muted);">(offline — queued)</span>'}
              <div class="tenant-card-subtitle">${escHtml(spoke.id)} · ${escHtml(relativeTime(spoke.last_seen))}</div>
            </span>
          </label>`;
        }).join("") : '<div class="empty-state" style="grid-column:1 / -1;">No approved spokes found for this tenant.</div>'}
      </div>
      <div class="form-actions" style="margin-top:16px;">
        <button id="reseed-cancel-btn" class="btn btn-secondary" type="button">Cancel</button>
        <button id="reseed-start-btn" class="btn btn-primary" type="button"${startDisabled ? " disabled" : ""}>Reseed Selected Spokes →</button>
      </div>
      <div class="form-msg ${hubReseedState.error ? "msg-error" : ""}">${escHtml(hubReseedState.error || (!selectedCount ? "Select at least one spoke." : ""))}</div>
    </div>
  `;
}

async function loadHubReseedPanel(force = false) {
  ensureHubReseedUi();
  syncHubReseedTenantState();
  if (!currentUser || !currentTenantId) {
    renderHubReseedPanel();
    return;
  }
  hubReseedState.loading = true;
  if (activeTab === "reseed") renderHubReseedPanel();
  await Promise.all([
    ensureSpokes(force),
    loadHubReseedTemplates(force),
  ]);
  hubReseedState.loading = false;
  if (activeTab === "reseed") renderHubReseedPanel();
}

async function startHubReseed() {
  if (hubReseedState.submitting) return;
  const template = getSelectedHubReseedTemplate();
  const spokeIds = hubReseedState.selectedSpokeIds.slice();
  if (!currentTenantId) {
    hubReseedState.error = "Select a tenant first.";
    renderHubReseedPanel();
    return;
  }
  if (!template) {
    hubReseedState.error = "Select an Azure template first.";
    renderHubReseedPanel();
    return;
  }
  if (!spokeIds.length) {
    hubReseedState.error = "Select at least one spoke.";
    renderHubReseedPanel();
    return;
  }
  hubReseedState.submitting = true;
  hubReseedState.error = "";
  renderHubReseedPanel();
  const res = await apiFetch("/api/backup/reseed", {
    method: "POST",
    body: {
      tenant_id: currentTenantId,
      template_name: template.template_name,
      latest_blob: template.latest_blob,
      spoke_ids: spokeIds,
      vm_id: HUB_RESEED_VM_ID,
    },
  });
  const data = await readJson(res);
  hubReseedState.submitting = false;
  if (!res || !res.ok) {
    hubReseedState.error = data?.detail || "Unable to start reseed.";
    renderHubReseedPanel();
    return;
  }
  const spokeById = Object.fromEntries(listTenantReseedSpokes().map((spoke, index) => [spoke.id, { spoke, index }]));
  hubReseedState.step = "progress";
  hubReseedState.jobId = data?.job_id || "";
  hubReseedState.progressTemplateName = template.template_name;
  hubReseedState.progressRows = Object.fromEntries(spokeIds.map((spokeId, order) => {
    const match = spokeById[spokeId];
    const spoke = match?.spoke;
    const online = isOnline(spoke?.last_seen);
    return [spokeId, {
      order: match?.index ?? order,
      spoke_id: spokeId,
      spoke_name: spoke ? spokePrimaryLabel(spoke) : spokeId,
      template_name: template.template_name,
      step: online ? "Queued" : "Queued (offline)",
      status: "queued",
      retries: 0,
    }];
  }));
  hubReseedState.completionNotified = false;
  renderHubReseedPanel();
  showToast(`Reseed started for ${spokeIds.length} spoke${spokeIds.length === 1 ? "" : "s"}.`, "ok");
}

function updateHubReseedProgress(message) {
  const spokeId = String(message.spoke_id || "");
  if (!spokeId) return;
  if (hubReseedState.jobId && message.job_id && message.job_id !== hubReseedState.jobId) return;
  if (!hubReseedState.jobId && message.job_id) hubReseedState.jobId = message.job_id;
  const knownSpoke = listTenantReseedSpokes().find(spoke => spoke.id === spokeId);
  const current = hubReseedState.progressRows[spokeId] || {
    order: getHubReseedRows().length,
    spoke_id: spokeId,
    spoke_name: knownSpoke ? spokePrimaryLabel(knownSpoke) : spokeId,
    template_name: hubReseedState.progressTemplateName || getSelectedHubReseedTemplate()?.template_name || "—",
    step: "Queued",
    status: "queued",
    retries: 0,
  };
  hubReseedState.step = "progress";
  hubReseedState.progressRows[spokeId] = {
    ...current,
    spoke_name: knownSpoke ? spokePrimaryLabel(knownSpoke) : current.spoke_name,
    template_name: message.template_name || current.template_name,
    step: message.step || current.step,
    status: message.status || current.status,
    retries: Number.isFinite(Number(message.retries)) ? Number(message.retries) : current.retries,
  };
  if (message.template_name) hubReseedState.progressTemplateName = message.template_name;
  if (activeTab === "reseed") renderHubReseedPanel();
  if (!hubReseedState.completionNotified && isHubReseedComplete()) {
    hubReseedState.completionNotified = true;
    showToast("Reseed job finished.", "ok");
  }
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
    const footerVersion = $("#footer-cswebui-version");
    if (footerVersion && data?.version) {
      footerVersion.textContent = `CS-WebUI v${data.version}`;
      footerVersion.title = `cs-webui version: v${data.version} | Branch: ${data.branch || "?"} | SHA: ${data.sha || "?"}`;
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

function setLoginOverlayVisible(visible) {
  $("#hub-login-overlay")?.classList.toggle("hidden", !visible);
  document.body.classList.toggle("hub-logged-out", visible);
  document.body.classList.toggle("hub-logged-in", !visible);
}

function openLoginModal() {
  setLoginOverlayVisible(true);
  setFormMessage("login-error", "", false);
  const password = $("#login-password");
  if (password) password.value = "";
  const username = $("#login-username");
  if (username && !username.value.trim()) {
    username.focus();
  } else {
    password?.focus();
  }
}

function closeLoginModal() {
  setLoginOverlayVisible(false);
  setFormMessage("login-error", "", false);
}

function buildTenantSelector() {}

function clearDynamicTenantTabs() {}

function buildSuperadminTenantTabs() {}

function syncTenantContextChrome() {
  const active = Boolean(currentUser && authToken && tenantContextActive && currentTenantId);
  $("#hub-admin-nav")?.classList.toggle("hidden", active);
  $("#tenant-context-nav")?.classList.toggle("hidden", !active);
  $("#tenant-context-indicator")?.classList.toggle("hidden", !active);
  $("#tenant-context-name") && ($("#tenant-context-name").textContent = tenantName(currentTenantId) || currentTenantId || "—");
  document.body.classList.toggle("tenant-context-active", active);
  // Show SA subtab items in left sidebar only when the superadmin tab is active
  const saActive = !active && activeTab === "superadmin";
  const saContextNav = $("#sa-context-nav");
  if (saContextNav) {
    saContextNav.classList.toggle("hidden", !saActive);
    if (saActive) {
      saContextNav.querySelectorAll(".sa-subtab[data-subtab]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.subtab === superadminActiveSubtab);
      });
    }
  }
}

function syncHubPermissionUI() {
  ensureHubReseedUi();
  const isSuperadmin = Boolean(currentUser?.is_superadmin);
  const myRole = currentRoleForTenant(currentTenantId);
  const isDemo = tenantContextActive && myRole === 'demo';
  [
    '#hub-admin-nav .tab[data-tab="hub-setup"]',
    '#tenant-context-nav .tab-back[data-tab="hub-setup"]',
  ].forEach(selector => {
    $$(selector).forEach(el => el.classList.toggle("hidden", !isSuperadmin));
  });
  // Hide the entire dark row1 nav bar for non-superadmins (all buttons inside are superadmin-only)
  $$(".tenant-context-nav-row1").forEach(el => el.classList.toggle("hidden", !isSuperadmin));
  $("#dashboard-add-tenant-btn")?.classList.toggle("hidden", !isSuperadmin);
  syncSuperadminBackupAccess();

  // Demo role: hide all tenant tabs except Simulations → Clients
  const demoHideSelectors = [
    '#tenant-context-nav .tab[data-tab="hub-spokes"]',
    '#tenant-context-nav .tab[data-tab="hub-config"]',
    '#tenant-context-nav .tab[data-tab="hub-central"]',
    '#tenant-context-nav .tab[data-tab="hub-vm-server"]',
    '#tenant-context-nav .tab[data-tab="hub-commands"]',
  ];
  demoHideSelectors.forEach(sel => {
    $$(sel).forEach(el => el.classList.toggle("hidden", isDemo));
  });
  // Auto-redirect demo users to simulations → clients on tab load
  if (isDemo && tenantContextActive && activeTab !== 'simulations' && activeTab !== 'clients') {
    showTab('simulations', { source: 'tenant' });
    setTimeout(() => activateHubSimTopTab('hub-simtop-clients'), 200);
  }
}

function exitTenantContext() {
  tenantContextActive = false;
  resetTenantDetail();
  syncTenantContextChrome();
}

async function enterTenantContext(tenantId, tabId = "simulations", force = true) {
  if (!tenantId) return;
  if (!currentUser) {
    openLoginModal();
    return;
  }
  tenantContextActive = true;
  await setCurrentTenant(tenantId, false);
  syncTenantContextChrome();
  // Demo role always goes to simulations → clients
  const myRole = currentRoleForTenant(tenantId);
  const targetTab = myRole === 'demo' ? 'simulations' : tabId;
  showTab(targetTab, { source: "tenant" });
  if (myRole === 'demo') {
    setTimeout(() => activateHubSimTopTab('hub-simtop-clients'), 300);
  }
  if (force) refreshCurrentView(true).catch(() => {});
}

function applyAuthUI() {
  const loggedIn = Boolean(currentUser && authToken);
  const userPill = $("#hub-user-pill");
  if (userPill) userPill.style.display = loggedIn ? "flex" : "none";
  $("#hub-user-name") && ($("#hub-user-name").textContent = currentUser?.username || "—");
  $$(".auth-tab").forEach(tab => tab.classList.toggle("hidden", !loggedIn));
  $$(".superadmin-tab").forEach(tab => tab.classList.toggle("hidden", !(loggedIn && currentUser?.is_superadmin)));
  syncSuperadminBackupAccess();
  if (!loggedIn) {
    openLoginModal();
    currentTenantId = null;
    tenantContextActive = false;
    tenants = [];
    spokeCache = {};
    tenantUserCounts = {};
    dashboardTenantRows = [];
    aggregateDashboardData = null;
    hubCentralData = null;
    hubCentralSiteOpen = null;
    hubHwOpenCheckId = null;
    hubCcOpenWsite = null;
    aggregateClientRows = [];
    aggregateProxmoxHosts = [];
    aggregateCentralData = null;
    hubConfigDraft = "";
    resetHubSimulationConfState(null);
    resetHubUserOverridesConfState(null);
    hubClientUiState.expandedByTenant = {};
    hubClientUiState.seenSitesByTenant = {};
    hubVmServerSelectedSpoke = null;
    resetTenantDetail();
    syncTenantContextChrome();
    if (activeTab === "spokes" || activeTab !== "dashboard") showTab("dashboard");
    return;
  }
  closeLoginModal();
  syncRoleBadge();
  syncTenantContextChrome();
  syncHubPermissionUI();
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
    tenants = (currentUser.tenant_roles || []).map(role => ({
      id: role.tenant_id,
      name: role.tenant_name || role.name || role.tenant_id,
      raw: role,
    }));
    tenantUserCounts = {};
  }
  if (tenants.length && !tenants.some(tenant => tenant.id === currentTenantId)) {
    currentTenantId = tenants[0].id;
  }
  applyAuthUI();
  syncHubPermissionUI();
  populateCommandSpokeSelect();
  // Eagerly load pending spokes for tenant admins so approval notice
  // appears immediately on login without needing to open Hub Setup first.
  if (currentTenantId && canManageTenant()) {
    loadTenantPendingSpokes();
  }
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
  sessionStorage.setItem("hub_token", authToken);
  await loadUserContext();
  connectHubWebSocket();
  await refreshCurrentView(true);
  showToast("Signed in successfully.", "ok");
}

function disconnectWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsOfflineTimer) {
    clearTimeout(wsOfflineTimer);
    wsOfflineTimer = null;
  }
  if (ws) {
    const socket = ws;
    ws = null;
    socket.onclose = null;
    socket.close();
  }
  updateApiStatus(false, "Disconnected");
}

function logout(showMessage = true) {
  closeSuperadminBackupModal(true);
  resetHubReseedState({ preserveTemplates: false });
  authToken = null;
  currentUser = null;
  currentTenantId = null;
  tenants = [];
  spokeCache = {};
  aggregateDashboardData = null;
  hubCentralData = null;
  hubSimOpenCheckId = null;
  hubHwOpenCheckId = null;
  hubCcOpenWsite = null;
  aggregateClientRows = [];
  aggregateProxmoxHosts = [];
  aggregateCentralData = null;
  hubConfigDraft = "";
  resetHubSimulationConfState(currentTenantId);
  resetHubUserOverridesConfState(currentTenantId);
  hubClientUiState.expandedByTenant = {};
  hubClientUiState.seenSitesByTenant = {};
  hubVmServerSelectedSpoke = null;
  resetTenantDetail();
  // Clear all per-tenant localStorage caches on logout
  try {
    Object.keys(localStorage).filter(k => k.startsWith("hub_central_") || k.startsWith("hub_clients_") || k.startsWith("hub_sites_") || k.startsWith("hub_vmserver_") || k.startsWith("hub_superadmin_"))
      .forEach(k => localStorage.removeItem(k));
  } catch (_) {}
  sessionStorage.removeItem("hub_token");
  disconnectWebSocket();
  applyAuthUI();
  closeSpokeModal();
  if (showMessage) showToast("Signed out.", "ok");
}

async function setCurrentTenant(tenantId, reload = true) {
  currentTenantId = tenantId;
  if (!currentTenantId && activeTab === "spokes") {
    activeTab = "dashboard";
  }
  aggregateDashboardData = null;
  hubCentralData = null;
  hubSimOpenCheckId = null;
  hubHwOpenCheckId = null;
  hubCcOpenWsite = null;
  aggregateClientRows = [];
  aggregateProxmoxHosts = [];
  aggregateCentralData = null;
  hubConfigDraft = "";
  resetHubSimulationConfState(tenantId);
  resetHubUserOverridesConfState(tenantId);
  delete hubClientUiState.seenSitesByTenant[tenantId];
  hubVmServerSelectedSpoke = null;
  syncRoleBadge();
  syncTenantContextChrome();
  syncHubPermissionUI();
  populateCommandSpokeSelect();
  if (reload && ["simulations", "clients", "vm-server", "central", "spokes", "reseed", "setup", "tenant-setup", "config", "commands"].includes(activeTab)) await refreshCurrentView(true);
}

function showTab(rawTabId, opts = {}) {
  const tabId = rawTabId.startsWith('hub-') ? rawTabId.slice(4) : rawTabId;
  if (["simulations", "clients", "vm-server", "central", "spokes", "reseed", "setup", "tenant-setup", "config", "commands", "superadmin"].includes(tabId) && !currentUser) {
    openLoginModal();
    return;
  }
  if (tabId === "spokes" && (!tenantContextActive || !currentTenantId)) {
    showTab("dashboard", { source: "admin" });
    return;
  }
  if (opts.source === "admin") {
    tenantContextActive = false;
    resetTenantDetail();
  } else if (opts.source === "tenant") {
    tenantContextActive = true;
  }
  activeTab = tabId;
  // Clear the log pin whenever the user navigates away from vm-server
  if (tabId !== "vm-server") _vmLogPinned = false;
  $("#hub-root")?.querySelectorAll(".tab-content").forEach(panel => panel.classList.add("hidden"));
  const panel = $("#hub-root")?.querySelector(`#tab-hub-${CSS.escape(tabId)}`);
  if (panel) panel.classList.remove("hidden");
  $$("#tab-nav .hub-only .tab").forEach(button => {
    button.classList.remove("active");
    if (button.hasAttribute("role")) button.setAttribute("aria-selected", "false");
  });
  if (opts.button) {
    opts.button.classList.add("active");
    if (opts.button.hasAttribute("role")) opts.button.setAttribute("aria-selected", "true");
  } else {
    const selector = hubAdminTabIds.has(tabId) && !tenantContextActive
      ? `#hub-admin-nav .tab[data-tab="hub-${tabId}"]`
      : `#tenant-context-nav .tab[data-tab="hub-${tabId}"]`;
    const activeButton = $(selector);
    activeButton?.classList.add("active");
    if (activeButton?.hasAttribute("role")) activeButton.setAttribute("aria-selected", "true");
  }
  syncTenantContextChrome();
  syncHubPermissionUI();
  updateHubRefreshPausedState();
  // When navigating to the Clients tab, reset which spoke groups have been "seen"
  // so that all groups auto-expand on arrival (preserving user collapse state only
  // while they stay on the tab — a fresh navigation always shows expanded rows).
  if (tabId === "clients" && currentTenantId) {
    if (hubClientUiState.seenSitesByTenant[currentTenantId]) {
      hubClientUiState.seenSitesByTenant[currentTenantId].clear();
    }
    if (hubClientUiState.expandedByTenant[currentTenantId]) {
      hubClientUiState.expandedByTenant[currentTenantId].clear();
    }
  }
  refreshCurrentView();
}

async function refreshCurrentView(force = false) {
  if (activeTab === "dashboard") {
    await loadDashboard(force);
  } else if (activeTab === "simulations") {
    await loadHubSimulations(force);
  } else if (activeTab === "clients") {
    await loadClients(force);
  } else if (activeTab === "vm-server") {
    await loadVmServer(force);
  } else if (activeTab === "central") {
    await loadHubCentralMonitoring(force);
  } else if (activeTab === "spokes") {
    await loadSpokes(force);
  } else if (activeTab === "reseed") {
    await loadHubReseedPanel(force);
  } else if (activeTab === "commands") {
    await loadCommands();
  } else if (activeTab === "setup") {
    await loadSetup(force);
  } else if (activeTab === "tenant-setup") {
    await loadTenantSetup(force);
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
  return spokeDisplayName(spoke, "—");
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

const HUB_SIM_BOOL_VALUES = new Set(["on", "off", "yes", "no", "true", "false"]);
const HUB_SIM_PASSWORD_KEY_RE = /pw$|password|secret/i;
const HUB_SIM_FIXED_SECTION_ORDER = ["simulation", "server", "address", ...Array.from({ length: 10 }, (_, idx) => `s${idx}`)];
const HUB_SIM_SLOT_KEYS = ["wsite", "ssid", "ssidpw", "dhcp_fail", "dns_fail", "assoc_fail", "port_flap", "ping_test", "download", "www_traffic", "iperf", "sim_phy", "l1"];
const HUB_SIM_SELECT_FIELDS = { sim_phy: ["wireless", "ethernet"] };

function resetHubSimulationConfState(tenantId = currentTenantId) {
  hubSimulationConfState = { tenantId, loaded: false, loading: false, rawContent: "", sha: "", fetchedAt: "", sections: {}, sectionOrder: [], keyOrder: {}, error: "", mode: "github" };
}

function resetHubUserOverridesConfState(tenantId = currentTenantId) {
  hubUserOverridesConfState = { tenantId, loaded: false, loading: false, rawContent: "", fetchedAt: "", sections: {}, sectionOrder: [], keyOrder: {}, error: "" };
}

function hubSimFieldLabel(key) {
  return String(key || "").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
}

function hubSimIsBoolValue(value) {
  return HUB_SIM_BOOL_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function hubSimBoolPair(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "no") return ["yes", "no"];
  if (normalized === "true" || normalized === "false") return ["true", "false"];
  return ["on", "off"];
}

function parseHubSimulationIni(content = "") {
  const sections = {};
  const sectionOrder = [];
  const keyOrder = {};
  let currentSection = null;
  String(content || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) return;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections[currentSection]) {
        sections[currentSection] = {};
        sectionOrder.push(currentSection);
        keyOrder[currentSection] = [];
      }
      return;
    }
    if (!currentSection) return;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) return;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(sections[currentSection], key)) keyOrder[currentSection].push(key);
    sections[currentSection][key] = value;
  });
  return { sections, sectionOrder, keyOrder };
}

function serializeHubSimulationIni(sections = {}, sectionOrder = [], keyOrder = {}) {
  const seen = new Set();
  const orderedSections = [];
  HUB_SIM_FIXED_SECTION_ORDER.forEach((section) => {
    if (Object.prototype.hasOwnProperty.call(sections, section)) {
      orderedSections.push(section);
      seen.add(section);
    }
  });
  sectionOrder.forEach((section) => {
    if (!seen.has(section) && Object.prototype.hasOwnProperty.call(sections, section)) {
      orderedSections.push(section);
      seen.add(section);
    }
  });
  Object.keys(sections).forEach((section) => {
    if (!seen.has(section)) orderedSections.push(section);
  });
  return orderedSections.map((section) => {
    const values = sections[section] || {};
    const keys = [];
    const seenKeys = new Set();
    (keyOrder[section] || []).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        keys.push(key);
        seenKeys.add(key);
      }
    });
    Object.keys(values).forEach((key) => {
      if (!seenKeys.has(key)) keys.push(key);
    });
    return `[${section}]\n${keys.map((key) => `${key}=${values[key] ?? ""}`).join("\n")}`;
  }).join("\n\n");
}

function hubSimulationSectionKeys(section, values = {}) {
  const ordered = hubSimulationConfState.keyOrder?.[section] || [];
  if (String(section).match(/^s\d+$/)) {
    const seen = new Set();
    const keys = [];
    HUB_SIM_SLOT_KEYS.forEach((key) => {
      keys.push(key);
      seen.add(key);
    });
    [...ordered, ...Object.keys(values || {})].forEach((key) => {
      if (!seen.has(key)) {
        keys.push(key);
        seen.add(key);
      }
    });
    return keys;
  }
  return ordered.length ? ordered : Object.keys(values || {});
}

function renderHubSimulationField(section, key, rawValue = "") {
  const value = String(rawValue ?? "");
  const label = hubSimFieldLabel(key);
  if (hubSimIsBoolValue(value)) {
    const [onValue, offValue] = hubSimBoolPair(value);
    return `
      <label class="toggle-label" style="justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px;gap:12px;">
        <span>${escHtml(label)}</span>
        <input type="checkbox" data-section="${escHtml(section)}" data-key="${escHtml(key)}" data-on="${escHtml(onValue)}" data-off="${escHtml(offValue)}"${value.toLowerCase() === onValue ? " checked" : ""}>
      </label>
    `;
  }
  if (HUB_SIM_SELECT_FIELDS[key]) {
    return `
      <label class="form-group">
        <span class="form-label">${escHtml(label)}</span>
        <select class="form-input" data-section="${escHtml(section)}" data-key="${escHtml(key)}">
          ${HUB_SIM_SELECT_FIELDS[key].map((option) => `<option value="${escHtml(option)}"${option === value ? " selected" : ""}>${escHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  return `
    <label class="form-group">
      <span class="form-label">${escHtml(label)}</span>
      <input class="form-input" type="text" value="${escHtml(value)}" data-section="${escHtml(section)}" data-key="${escHtml(key)}">
    </label>
  `;
}

function renderHubSimulationSection(section, values = {}, { open = false } = {}) {
  const keys = hubSimulationSectionKeys(section, values);
  const isSlot = Boolean(String(section).match(/^s\d+$/));
  const title = isSlot ? `Simulation S${section.slice(1)}` : `[${section}]`;

  // All sections use the same layout: text/select fields in a responsive grid,
  // boolean fields as compact inline checkbox+label rows beneath (Sx style).
  const textKeys = keys.filter(k => !hubSimIsBoolValue(String(values[k] ?? "")) && !HUB_SIM_SELECT_FIELDS[k]);
  const selectKeys = keys.filter(k => HUB_SIM_SELECT_FIELDS[k]);
  const boolKeys = keys.filter(k => hubSimIsBoolValue(String(values[k] ?? "")));

  const minColWidth = isSlot ? "160px" : "220px";
  const inputKeys = [...textKeys, ...selectKeys];
  const inputFields = inputKeys.map((key) => renderHubSimulationField(section, key, values[key] ?? "")).join("");
  const boolFields = boolKeys.map((key) => {
    const value = String(values[key] ?? "");
    const [onValue, offValue] = hubSimBoolPair(value);
    const checked = value.toLowerCase() === onValue ? " checked" : "";
    const label = hubSimFieldLabel(key);
    return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;font-size:0.875rem;">
      <input type="checkbox" data-section="${escHtml(section)}" data-key="${escHtml(key)}" data-on="${escHtml(onValue)}" data-off="${escHtml(offValue)}"${checked}>
      <span>${escHtml(label)}</span>
    </label>`;
  }).join("");

  if (!keys.length) {
    return `
      <details class="setup-card setup-section-gap"${open ? " open" : ""}>
        <summary style="cursor:pointer;font-weight:600;">${escHtml(title)}</summary>
        <div class="setup-form setup-section-gap"><div class="muted">No fields found in this section.</div></div>
      </details>
    `;
  }

  return `
    <details class="setup-card setup-section-gap"${open ? " open" : ""}>
      <summary style="cursor:pointer;font-weight:600;">${escHtml(title)}</summary>
      <div class="setup-form setup-section-gap">
        ${inputKeys.length ? `<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(${minColWidth},1fr));gap:8px;">${inputFields}</div>` : ""}
        ${boolKeys.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:6px 0;">${boolFields}</div>` : ""}
      </div>
    </details>
  `;
}

function renderHubSimulationConfigPanel() {
  const container = $("#hub-sim-config-panel");
  if (!container) return;
  const disabled = canManageTenant() ? "" : " disabled";
  const fetched = hubSimulationConfState.fetchedAt ? fmtDate(hubSimulationConfState.fetchedAt) : "—";
  const infoBar = `
    <section class="setup-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:600;">configs/simulation.conf ${helpIcon('simulation-conf')}</div>
          <div class="muted" style="font-size:0.85rem;">Last fetched from GitHub: ${escHtml(fetched)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="hub-sim-config-refresh-btn" class="btn btn-secondary btn-small" type="button">Refresh</button>
          <button id="hub-sim-config-save-btn" class="btn btn-primary btn-small" type="button"${disabled}>Save to GitHub</button>
        </div>
      </div>
      <div id="hub-sim-config-msg" class="form-msg" style="margin-top:10px;"></div>
    </section>
  `;
  if (hubSimulationConfState.loading) {
    container.innerHTML = `${infoBar}<div class="empty-state">Loading simulation.conf from GitHub…</div>`;
    return;
  }
  if (hubSimulationConfState.error) {
    container.innerHTML = `
      ${infoBar}
      <section class="setup-card">
        <div class="empty-state">${escHtml(hubSimulationConfState.error)}</div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">
          <button class="btn btn-secondary btn-small" type="button" data-open-tenant-setup="true">Open Setup</button>
        </div>
      </section>
    `;
    return;
  }
  const sections = hubSimulationConfState.sections || {};
  const orderedSections = ["simulation", "server", "address"].filter((section) => Object.prototype.hasOwnProperty.call(sections, section));
  const slotSections = HUB_SIM_FIXED_SECTION_ORDER.filter((section) => /^s\d+$/.test(section));
  container.innerHTML = `
    ${infoBar}
    <div id="hub-sim-config-form">
      ${orderedSections.map((section, index) => renderHubSimulationSection(section, sections[section] || {}, { open: index === 0 })).join("")}
      ${slotSections.map((section, index) => renderHubSimulationSection(section, sections[section] || {}, { open: index === 0 && orderedSections.length === 0 })).join("")}
    </div>
  `;
}

async function loadHubSimulationConf(force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !currentUser) return null;
  if (hubSimulationConfState.tenantId !== tenantId) resetHubSimulationConfState(tenantId);
  if (!force && hubSimulationConfState.loaded) {
    renderHubSimulationConfigPanel();
    return hubSimulationConfState;
  }
  hubSimulationConfState.loading = true;
  hubSimulationConfState.error = "";
  renderHubSimulationConfigPanel();
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/simulation-conf`);
  const data = await readJson(res);
  if (!res || !res.ok) {
    hubSimulationConfState.loading = false;
    hubSimulationConfState.loaded = false;
    hubSimulationConfState.error = data?.detail || "Unable to load simulation.conf from GitHub.";
    renderHubSimulationConfigPanel();
    return null;
  }
  const parsed = parseHubSimulationIni(data?.content || "");
  hubSimulationConfState = {
    tenantId,
    loaded: true,
    loading: false,
    rawContent: data?.content || "",
    sha: data?.sha || "",
    fetchedAt: data?.fetched_at || "",
    sections: parsed.sections,
    sectionOrder: parsed.sectionOrder,
    keyOrder: parsed.keyOrder,
    error: "",
  };
  renderHubSimulationConfigPanel();
  return hubSimulationConfState;
}

function collectHubSimulationConfContent() {
  const form = $("#hub-sim-config-form");
  if (!form) return hubSimulationConfState.rawContent || "";
  const sections = JSON.parse(JSON.stringify(hubSimulationConfState.sections || {}));
  form.querySelectorAll("[data-section][data-key]").forEach((input) => {
    const section = input.dataset.section;
    const key = input.dataset.key;
    if (!sections[section]) sections[section] = {};
    if (input.type === "checkbox") {
      sections[section][key] = input.checked ? (input.dataset.on || "on") : (input.dataset.off || "off");
      return;
    }
    sections[section][key] = input.value.trim();
  });
  return serializeHubSimulationIni(sections, hubSimulationConfState.sectionOrder, hubSimulationConfState.keyOrder);
}

async function saveHubSimulationConf() {
  if (!canManageTenant()) {
    setFormMessage("hub-sim-config-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  setFormMessage("hub-sim-config-msg", "Saving to GitHub…", true);
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/simulation-conf`, {
    method: "PUT",
    body: { content: collectHubSimulationConfContent() },
  });
  const data = await readJson(res);
  if (!res || !res.ok) {
    setFormMessage("hub-sim-config-msg", data?.detail || "Unable to save simulation.conf.", false);
    return;
  }
  await loadHubSimulationConf(true);
  setFormMessage("hub-sim-config-msg", `Saved to GitHub. Repo sync queued for ${data?.synced_spokes ?? 0} spoke(s).`, true);
}

// ─── Hub-managed conf overrides (sim + user) ───────────────────────────────

function renderHubConfOverridesPanel() {
  const container = $("#hub-conf-overrides-panel");
  if (!container) return;
  const disabled = canManageTenant() ? "" : " disabled";
  const readonly = canManageTenant() ? "" : " readonly";
  const { simContent, userContent, loading, error } = hubConfOverrideState;
  const simActive = simContent !== null && simContent !== "";
  const userActive = userContent !== null && userContent !== "";

  if (loading) {
    container.innerHTML = '<div class="empty-state">Loading overrides…</div>';
    return;
  }
  if (error) {
    container.innerHTML = `<div class="empty-state">${escHtml(error)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="setup-section-gap">
      <section class="setup-card">
        <div class="setup-card-header">
          <h2>simulation.conf Override ${helpIcon('conf-overrides')}
            <span class="site-status-pill ${simActive ? "site-ok" : "site-unknown"}" style="margin-left:8px;font-size:0.75rem;">${simActive ? "ACTIVE" : "NOT SET"}</span>
          </h2>
          <p>Override specific values from <code>simulation.conf</code> without pushing to GitHub.
            Uses the same INI format as the file — only the keys you define here will be overridden on connected spokes.
            Leave blank or click <strong>Clear</strong> to revert spokes to the GitHub version.</p>
        </div>
        <div class="setup-form">
          <div class="form-group">
            <textarea id="hub-sim-override-textarea" class="form-input code-textarea" rows="12" spellcheck="false"
              placeholder="[simulation]&#10;simulation_count = 10&#10;&#10;[server]&#10;some_key = value"${readonly}>${escHtml(simContent || "")}</textarea>
          </div>
          <div class="form-actions">
            <button id="hub-sim-override-save-btn" class="btn btn-primary" type="button"${disabled}>Save Override</button>
            <button id="hub-sim-override-clear-btn" class="btn btn-secondary" type="button"${disabled}>Clear Override</button>
            <span id="hub-sim-override-msg" class="form-msg"></span>
          </div>
        </div>
      </section>

      <section class="setup-card">
        <div class="setup-card-header">
          <h2>user-overrides.conf Override ${helpIcon('conf-overrides')}
            <span class="site-status-pill ${userActive ? "site-ok" : "site-unknown"}" style="margin-left:8px;font-size:0.75rem;">${userActive ? "ACTIVE" : "NOT SET"}</span>
          </h2>
          <p>Override per-user simulation flags from <code>user-overrides.conf</code> without pushing to GitHub.
            Uses the same INI format. Only the keys you define will be overridden on connected spokes.</p>
        </div>
        <div class="setup-form">
          <div class="form-group">
            <textarea id="hub-user-override-textarea" class="form-input code-textarea" rows="12" spellcheck="false"
              placeholder="[simulation]&#10;some_flag = value&#10;&#10;[alice]&#10;some_flag = alice-value"${readonly}>${escHtml(userContent || "")}</textarea>
          </div>
          <div class="form-actions">
            <button id="hub-user-override-save-btn" class="btn btn-primary" type="button"${disabled}>Save Override</button>
            <button id="hub-user-override-clear-btn" class="btn btn-secondary" type="button"${disabled}>Clear Override</button>
            <span id="hub-user-override-msg" class="form-msg"></span>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function loadHubConfOverrides(force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !currentUser) return;
  if (!force && hubConfOverrideState.tenantId === tenantId &&
      (hubConfOverrideState.simContent !== null || hubConfOverrideState.userContent !== null)) {
    renderHubConfOverridesPanel();
    return;
  }
  hubConfOverrideState = { tenantId, simContent: null, userContent: null, loading: true, error: "" };
  renderHubConfOverridesPanel();
  const [simRes, userRes] = await Promise.all([
    apiFetch(`/api/${encodeURIComponent(tenantId)}/config/sim-conf-override`),
    apiFetch(`/api/${encodeURIComponent(tenantId)}/config/user-conf-override`),
  ]);
  if (!simRes?.ok || !userRes?.ok) {
    hubConfOverrideState.loading = false;
    hubConfOverrideState.error = "Unable to load conf overrides.";
    renderHubConfOverridesPanel();
    return;
  }
  const [simData, userData] = await Promise.all([readJson(simRes), readJson(userRes)]);
  hubConfOverrideState = {
    tenantId,
    simContent: simData?.content ?? "",
    userContent: userData?.content ?? "",
    loading: false,
    error: "",
  };
  renderHubConfOverridesPanel();
}

async function saveHubConfOverride(type) {
  if (!canManageTenant()) return;
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  const isSimType = type === "sim";
  const textareaId = isSimType ? "hub-sim-override-textarea" : "hub-user-override-textarea";
  const msgId = isSimType ? "hub-sim-override-msg" : "hub-user-override-msg";
  const endpoint = `/api/${encodeURIComponent(tenantId)}/config/${isSimType ? "sim" : "user"}-conf-override`;
  const content = $("#" + textareaId)?.value ?? "";
  setFormMessage(msgId, "Saving…", true);
  const res = await apiFetch(endpoint, { method: "PUT", body: { content } });
  const data = await readJson(res);
  if (!res?.ok) {
    setFormMessage(msgId, data?.detail || "Unable to save override.", false);
    return;
  }
  if (isSimType) hubConfOverrideState.simContent = content;
  else hubConfOverrideState.userContent = content;
  setFormMessage(msgId, `Saved. Pushed to ${data?.pushed_to_spokes ?? 0} spoke(s).`, true);
  renderHubConfOverridesPanel();
}

async function clearHubConfOverride(type) {
  if (!canManageTenant()) return;
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  const isSimType = type === "sim";
  const msgId = isSimType ? "hub-sim-override-msg" : "hub-user-override-msg";
  const endpoint = `/api/${encodeURIComponent(tenantId)}/config/${isSimType ? "sim" : "user"}-conf-override`;
  setFormMessage(msgId, "Clearing…", true);
  const res = await apiFetch(endpoint, { method: "DELETE" });
  const data = await readJson(res);
  if (!res?.ok) {
    setFormMessage(msgId, data?.detail || "Unable to clear override.", false);
    return;
  }
  if (isSimType) hubConfOverrideState.simContent = "";
  else hubConfOverrideState.userContent = "";
  setFormMessage(msgId, "Override cleared.", true);
  renderHubConfOverridesPanel();
}

// ─── Hub Demo Scenario Functions ─────────────────────────────────────────────

const HUB_DEMO_SCENARIOS = [
  { key: 'normal',      label: '— Normal —' },
  { key: 'dns_fail',    label: 'DNS Fail'   },
  { key: 'dhcp_fail',   label: 'DHCP Fail'  },
  { key: 'assoc_fail',  label: 'Assoc Fail' },
  { key: 'auth_fail',   label: 'Auth Fail'  },
  { key: 'ssidpw_fail', label: 'SSID PW Fail' },
  { key: 'port_flap',   label: 'Port Flap'  },
];

async function loadHubDemoActive(tenantId = currentTenantId) {
  if (hubDemoTenantId !== tenantId) {
    hubDemoActiveMap = {};
    hubDemoTenantId = tenantId;
  }
}

async function loadHubClientSimOverrides(tenantId = currentTenantId) {
  try {
    const d = await apiFetch(`/api/${encodeURIComponent(tenantId)}/clients/sim-overrides`);
    hubClientSimOverrides = d?.client_sim_overrides || {};
  } catch { hubClientSimOverrides = {}; }
}

async function toggleHubClientSimOverride(tenantId, hostname, simulation, enabled) {
  try {
    await apiFetch(`/api/${encodeURIComponent(tenantId)}/clients/${encodeURIComponent(hostname)}/sim-override`, {
      method: "PUT", body: { simulation, enabled },
    });
    // Update local cache optimistically so next render is immediate
    if (!hubClientSimOverrides[hostname]) hubClientSimOverrides[hostname] = [];
    if (enabled) {
      if (!hubClientSimOverrides[hostname].includes(simulation)) hubClientSimOverrides[hostname].push(simulation);
    } else {
      hubClientSimOverrides[hostname] = hubClientSimOverrides[hostname].filter(s => s !== simulation);
    }
    showToast(`${enabled ? "Enabled" : "Disabled"} ${simulation} for ${hostname}`, "success");
    // Always reload user-overrides.conf so the editor below is never stale
    loadSetupUserOverridesConf(tenantId, true);
  } catch (e) {
    showToast(`Failed to update simulation: ${e.message}`, "error");
  }
}

async function triggerHubDemoScenario(tenantId, spokeId, hostname, scenario) {
  try {
    const r = await fetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/clients/${encodeURIComponent(hostname)}/demo-scenario`, {
      method: scenario === 'normal' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(scenario !== 'normal' ? { body: JSON.stringify({ scenario }) } : {}),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Request failed'); }
    if (scenario === 'normal') {
      delete hubDemoActiveMap[hostname];
    } else {
      hubDemoActiveMap[hostname] = { hostname, scenario, minutes_remaining: 120, spoke_id: spokeId };
    }
    return true;
  } catch (e) {
    showToast(`Demo scenario failed: ${e.message}`, 'error');
    return false;
  }
}

function buildHubDemoSelect(client, cell) {
  const hostname = client.hostname;
  const spokeId = client.spoke_id;
  const active = hubDemoActiveMap[hostname];
  const activeScenario = active?.scenario || 'normal';

  const sel = document.createElement('select');
  sel.className = 'demo-scenario-select' + (activeScenario !== 'normal' ? ' demo-scenario-select--active' : '');
  sel.title = 'Select a failure scenario to simulate';
  HUB_DEMO_SCENARIOS.forEach(({ key, label }) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    if (key === activeScenario) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', async () => {
    const scenario = sel.value;
    sel.disabled = true;
    const ok = await triggerHubDemoScenario(currentTenantId, spokeId, hostname, scenario);
    sel.disabled = false;
    if (ok) {
      sel.className = 'demo-scenario-select' + (scenario !== 'normal' ? ' demo-scenario-select--active' : '');
    } else {
      sel.value = activeScenario; // revert
    }
  });
  cell.appendChild(sel);
}

function getTenantGithubSettingsElements() {
  const candidates = [
    {
      repoUrl: $("#hub-github-sim-repo-url"),
      repoBranch: $("#hub-github-sim-repo-branch"),
      token: $("#hub-github-token"),
      tokenStatus: $("#hub-github-token-status"),
      messageId: "hub-github-msg",
    },
    {
      repoUrl: $("#tenant-sim-repo-url"),
      repoBranch: $("#tenant-sim-repo-branch"),
      token: $("#tenant-github-token"),
      tokenStatus: $("#tenant-github-token-status"),
      messageId: "tenant-github-msg",
    },
  ];
  return candidates.find((item) => item.repoUrl || item.repoBranch || item.token) || candidates[0];
}

function collectTenantGithubSettingsPayload() {
  const fields = getTenantGithubSettingsElements();
  const payload = {
    sim_repo_url: fields.repoUrl?.value.trim() || "",
    sim_repo_branch: fields.repoBranch?.value.trim() || "main",
  };
  const tokenSecret = getSecretInputPayload(fields.token);
  if (tokenSecret.include) payload.github_token = tokenSecret.value;
  return { payload, tokenSecret, fields };
}

function extractTenantGithubSettings(data, fallback = {}) {
  if (data?.settings?.github && typeof data.settings.github === "object") return data.settings.github;
  if (data?.settings && typeof data.settings === "object" && ("sim_repo_url" in data.settings || "sim_repo_branch" in data.settings || "github_token_configured" in data.settings)) return data.settings;
  if (data?.github && typeof data.github === "object") return data.github;
  if (data && typeof data === "object" && ("sim_repo_url" in data || "sim_repo_branch" in data || "github_token_configured" in data)) return data;
  return fallback;
}

async function postTenantGithubSettings(tenantId, payload) {
  const endpoints = [
    { url: `/api/${encodeURIComponent(tenantId)}/settings`, body: payload },
    { url: `/api/${encodeURIComponent(tenantId)}/settings`, body: { github: payload } },
    { url: `/api/${encodeURIComponent(tenantId)}/settings/github`, body: payload },
  ];
  let lastResult = { res: null, data: null };
  for (const request of endpoints) {
    const res = await apiFetch(request.url, { method: "POST", body: request.body });
    const data = await readJson(res);
    if (res?.ok) return { res, data };
    lastResult = { res, data };
    if (res && ![400, 404, 405, 422].includes(res.status)) break;
  }
  return lastResult;
}

async function saveTenantGithubSettings() {
  const { fields } = collectTenantGithubSettingsPayload();
  if (!canManageTenant()) {
    setFormMessage(fields.messageId, "Tenant Viewer access is read-only.", false);
    return;
  }
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  const { payload, tokenSecret } = collectTenantGithubSettingsPayload();
  const currentGithub = tenantDetailState.data[tenantId]?.settings?.github || {};
  const repoUnchanged = (payload.sim_repo_url || "") === (currentGithub.sim_repo_url || "")
    && (payload.sim_repo_branch || "main") === (currentGithub.sim_repo_branch || "main");
  if (repoUnchanged && !tokenSecret.include) return;
  setFormMessage(fields.messageId, "Saving GitHub settings…", true);
  const { res, data } = await postTenantGithubSettings(tenantId, payload);
  if (!res || !res.ok) {
    setFormMessage(fields.messageId, data?.detail || "Unable to save GitHub settings.", false);
    return;
  }
  const githubData = extractTenantGithubSettings(data, {
    ...currentGithub,
    ...payload,
    github_token_configured: tokenSecret.include ? Boolean(payload.github_token) : currentGithub.github_token_configured,
  });
  const settingsData = data?.settings && typeof data.settings === "object" && !(("sim_repo_url" in data.settings) || ("sim_repo_branch" in data.settings) || ("github_token_configured" in data.settings))
    ? data.settings
    : (data?.github && typeof data.github === "object" ? { github: data.github } : null);
  if (tenantDetailState.data[tenantId]?.settings) {
    tenantDetailState.data[tenantId].settings = settingsData
      ? { ...tenantDetailState.data[tenantId].settings, ...settingsData, github: githubData }
      : { ...tenantDetailState.data[tenantId].settings, github: githubData };
  }
  resetSecretInput(fields.token);
  hydrateTenantSetupPanel({ settings: { github: githubData } });
  resetHubSimulationConfState(tenantId);
  resetHubUserOverridesConfState(tenantId);
  const pushedToSpokes = Number.isFinite(data?.pushed_to_spokes) ? data.pushed_to_spokes : null;
  setFormMessage(fields.messageId, pushedToSpokes === null ? "GitHub settings saved." : `GitHub settings saved. Queued ${pushedToSpokes} spoke${pushedToSpokes === 1 ? "" : "s"}.`, true);
}
window.saveTenantGithubSettings = saveTenantGithubSettings;

async function _loadTsOnboardingStatus(tenantId) {
  const listEl = $("#ts-onboarding-psk-list");
  const statusEl = $("#ts-onboarding-status");
  const res = await apiFetch(`/api/tenant/${encodeURIComponent(tenantId)}/onboarding-psk`);
  if (!res?.ok) {
    const detail = await readJson(res);
    if (statusEl) statusEl.textContent = detail?.detail || "Unable to load PSK status.";
    return;
  }
  const d = await res.json();
  const psks = d.psks || [];
  if (statusEl) statusEl.textContent = psks.length ? "" : "No PSKs configured — spokes require manual approval.";
  if (!listEl) return;
  if (psks.length === 0) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = psks.map((psk) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <code style="flex:1;font-size:12px;word-break:break-all;background:var(--bg-2,#f4f4f4);padding:4px 6px;border-radius:4px;">${escHtml(psk)}</code>
      <button class="btn btn-sm btn-secondary ts-psk-copy-btn" data-psk="${escHtml(psk)}" type="button">Copy</button>
      <button class="btn btn-sm btn-danger ts-psk-revoke-btn" data-psk="${escHtml(psk)}" type="button">Revoke</button>
    </div>
    <div class="form-hint" style="margin-bottom:8px;font-size:11px;">sudo bash &lt;(curl -fsSL https://raw.githubusercontent.com/solutions-hpe/client-sim/main/install-lxc.sh) --hub-url ${escHtml(window.location.origin)} --hub-tenant ${escHtml(tenantId)} --hub-psk ${escHtml(psk)}</div>
  `).join("");
  listEl.querySelectorAll(".ts-psk-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.psk).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
      });
    });
  });
  listEl.querySelectorAll(".ts-psk-revoke-btn").forEach((btn) => {
    btn.addEventListener("click", () => _revokeTsOnboardingPsk(tenantId, btn.dataset.psk));
  });
}

async function _generateTsOnboardingPsk(tenantId) {
  const btn = $("#ts-onboarding-generate-btn");
  const statusEl = $("#ts-onboarding-status");
  if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
  try {
    const res = await apiFetch(`/api/tenant/${encodeURIComponent(tenantId)}/onboarding-psk`, { method: "POST" });
    if (!res?.ok) {
      const detail = await readJson(res);
      if (statusEl) statusEl.textContent = detail?.detail || "Unable to generate PSK.";
      return;
    }
    await _loadTsOnboardingStatus(tenantId);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Add PSK"; }
  }
}

async function _revokeTsOnboardingPsk(tenantId, psk) {
  const statusEl = $("#ts-onboarding-status");
  try {
    const res = await apiFetch(`/api/tenant/${encodeURIComponent(tenantId)}/onboarding-psk`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ psk }),
    });
    if (!res?.ok) {
      const d = await readJson(res);
      if (statusEl) statusEl.textContent = d?.detail || "Failed to revoke PSK.";
      return;
    }
    await _loadTsOnboardingStatus(tenantId);
  } catch (e) {
    if (statusEl) statusEl.textContent = "Failed to revoke PSK.";
  }
}

function hydrateTenantSetupPanel(data = {}) {
  const github = data?.settings?.github || {};
  const configured = isConfiguredSecretValue(github.github_token_configured);
  const fields = getTenantGithubSettingsElements();
  setSecretInputConfigured(fields.token, configured);
  if (fields.tokenStatus) fields.tokenStatus.textContent = configured ? "Token configured" : "Token not configured";
  
  // Wire up PSK onboarding controls
  const tenantId = data?.tenantId || currentTenantId;
  const generateBtn = $("#ts-onboarding-generate-btn");
  if (tenantId && canManageTenant(tenantId) && generateBtn) {
    _loadTsOnboardingStatus(tenantId);
    if (!generateBtn._bound) {
      generateBtn._bound = true;
      generateBtn.addEventListener("click", () => _generateTsOnboardingPsk(tenantId));
    }
  }
}

async function loadTenantDetailData(force = false) {
  const tenantId = tenantDetailState.open ? tenantDetailState.tenantId : currentTenantId;
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
      <article class="tenant-metric-card"><span class="tenant-metric-label">Online / Offline</span><strong class="tenant-metric-value">${summary.onlineCount} / ${summary.offlineCount}</strong><span class="tenant-metric-hint">Based on 300s heartbeat</span></article>
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
  const tenantId = data.tenantId;
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
        <td>${spoke.status === "approved" ? `<button class="btn btn-primary btn-small" data-open-spoke-modal="${escHtml(spoke.id)}" type="button">Open Detail</button>` : '<span class="muted">—</span>'}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Tenant Spokes</h2><p>Status, heartbeat, and telemetry summary for every spoke assigned to this tenant.</p></div>
        <table class="data-table">
          <thead><tr><th>Spoke</th><th>Status</th><th>Spoke ID</th><th>Last Sync</th><th>Clients</th><th>VMs</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="empty-state">No spokes assigned to this tenant.</td></tr>'}</tbody>
        </table>
      </section>
      ${canManageTenant(tenantId) ? `
      <section class="setup-card" id="ts-pending-card" style="display:none;">
        <div class="setup-card-header"><h2>⏳ Pending Spokes</h2><p>Spokes waiting to be approved for this tenant.</p></div>
        <div id="ts-pending-key-banner" class="key-once-banner hidden"></div>
        <table class="data-table">
          <thead><tr><th>Name</th><th>Hostname</th><th>Registered</th><th>Action</th></tr></thead>
          <tbody id="ts-pending-tbody"></tbody>
        </table>
      </section>
      <section class="setup-card">
        <div class="setup-card-header">
          <h2>Spoke Onboarding ${helpIcon('spoke-onboarding')}</h2>
          <p>Generate a Pre-Shared Key to allow spokes to self-register without manual approval.</p>
        </div>
        <div id="ts-onboarding-psk-list"></div>
        <div class="form-actions" style="margin-top:8px;">
          <button id="ts-onboarding-generate-btn" class="btn btn-sm btn-secondary" type="button">Add PSK</button>
        </div>
        <p id="ts-onboarding-status" class="form-hint" style="margin-top:6px;"></p>
      </section>` : ""}
    </div>
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
  const github = data.settings?.github || {};
  const notifications = data.settings?.notifications || {};
  const accessNote = data.settingsError ? `<div class="tenant-detail-note">${escHtml(data.settingsError)}</div>` : "";

  const arubaStatus = aruba.configured
    ? `<span style="color:var(--success)">✓ Configured</span>`
    : `<span style="color:var(--muted)">✗ Not configured</span>`;
  const githubStatus = github.configured
    ? `<span style="color:var(--success)">✓ Configured</span>`
    : `<span style="color:var(--muted)">✗ Not configured</span>`;
  const notifParts = [];
  if (notifications.teams_webhook_configured) notifParts.push("Teams");
  if (notifications.smtp_host) notifParts.push("Email");
  const notifStatus = notifParts.length
    ? `<span style="color:var(--success)">✓ ${notifParts.join(", ")}</span>`
    : `<span style="color:var(--muted)">✗ Not configured</span>`;

  return `
    ${accessNote}
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Tenant Info</h2><p>Hub-managed settings for this tenant.</p></div>
        <div class="setup-status-grid">
          <div class="setup-status-item"><span class="setup-status-label">Tenant Name</span><span class="setup-status-value">${escHtml(tenant.name || tenantId)}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Tenant ID</span><span class="setup-status-value"><code>${escHtml(tenant.id || tenantId)}</code></span></div>
          <div class="setup-status-item"><span class="setup-status-label">Aruba CID</span><span class="setup-status-value">${escHtml(tenant.aruba_cid || "—")}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Created</span><span class="setup-status-value">${escHtml(fmtDate(tenant.created_at))}</span></div>
        </div>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Configuration Status</h2><p>Current state of all integrations for this tenant.</p></div>
        <div class="setup-status-grid">
          <div class="setup-status-item"><span class="setup-status-label">Central API</span><span class="setup-status-value">${arubaStatus}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">GitHub</span><span class="setup-status-value">${githubStatus}</span></div>
          <div class="setup-status-item"><span class="setup-status-label">Notifications</span><span class="setup-status-value">${notifStatus}</span></div>
        </div>
      </section>
    </div>
  `;
}

function renderSetupSimulationConfigEditor() {
  const container = $("#setup-sim-config-editor");
  if (!container) return;
  const tenantId = currentTenantId || getActiveTenantId();
  if (!tenantId) {
    container.innerHTML = '<div class="empty-state">No tenant selected.</div>';
    return;
  }
  const disabled = canManageTenant(tenantId) ? "" : " disabled";
  const isOverride = hubSimulationConfState.mode === "override";
  const saveLabel = isOverride ? "Save" : "Save to GitHub";
  const sourceLabel = isOverride ? "Hub-managed override (no GitHub API key)" : `Last fetched from GitHub: ${escHtml(hubSimulationConfState.fetchedAt ? fmtDate(hubSimulationConfState.fetchedAt) : "—")}`;
  
  if (hubSimulationConfState.loading) {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div style="font-weight:600;">configs/simulation.conf ${helpIcon('simulation-conf')}</div>
          <div class="muted" style="font-size:0.85rem;">${sourceLabel}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="setup-sim-config-refresh-btn" class="btn btn-secondary btn-small" type="button">Refresh</button>
          <button id="setup-sim-config-save-btn" class="btn btn-primary btn-small" type="button"${disabled}>${escHtml(saveLabel)}</button>
        </div>
      </div>
      <div id="setup-sim-config-msg" class="form-msg" style="margin-bottom:10px;"></div>
      <div class="empty-state">Loading simulation.conf…</div>
    `;
    return;
  }
  
  if (hubSimulationConfState.error) {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div style="font-weight:600;">configs/simulation.conf ${helpIcon('simulation-conf')}</div>
          <div class="muted" style="font-size:0.85rem;">${sourceLabel}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="setup-sim-config-refresh-btn" class="btn btn-secondary btn-small" type="button">Refresh</button>
          <button id="setup-sim-config-save-btn" class="btn btn-primary btn-small" type="button"${disabled}>${escHtml(saveLabel)}</button>
        </div>
      </div>
      <div id="setup-sim-config-msg" class="form-msg" style="margin-bottom:10px;"></div>
      <div class="empty-state">${escHtml(hubSimulationConfState.error)}</div>
    `;
    wireSetupSimConfigButtons(tenantId);
    return;
  }
  
  const sections = hubSimulationConfState.sections || {};
  const orderedSections = ["simulation", "server", "address"].filter((section) => Object.prototype.hasOwnProperty.call(sections, section));
  const slotSections = HUB_SIM_FIXED_SECTION_ORDER.filter((section) => /^s\d+$/.test(section));
  
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <div style="font-weight:600;">configs/simulation.conf ${helpIcon('simulation-conf')}</div>
        <div class="muted" style="font-size:0.85rem;">${sourceLabel}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button id="setup-sim-config-refresh-btn" class="btn btn-secondary btn-small" type="button">Refresh</button>
        <button id="setup-sim-config-save-btn" class="btn btn-primary btn-small" type="button"${disabled}>${escHtml(saveLabel)}</button>
      </div>
    </div>
    <div id="setup-sim-config-msg" class="form-msg" style="margin-bottom:10px;"></div>
    <div id="setup-sim-config-form">
      ${orderedSections.map((section, index) => renderHubSimulationSection(section, sections[section] || {}, { open: index === 0 })).join("")}
      ${slotSections.map((section, index) => renderHubSimulationSection(section, sections[section] || {}, { open: index === 0 && orderedSections.length === 0 })).join("")}
    </div>
  `;
  
  wireSetupSimConfigButtons(tenantId);
  // Also render the user-overrides section below
  renderSetupUserOverridesEditor();
}

function hubUserOverrideIsBoolField(key, value = "") {
  return hubSimIsBoolValue(String(value ?? "")) || FAILURE_SIMS.has(key) || TRAFFIC_SIMS.has(key) || key === "github_repo" || key === "site_based_ssid" || key === "kill_switch";
}

function renderUserOverrideFieldGroups(section, values = {}, orderedKeys = []) {
  const keys = orderedKeys.length ? orderedKeys : Object.keys(values || {});
  const textKeys = keys.filter((key) => !hubUserOverrideIsBoolField(key, values[key]) && !HUB_SIM_SELECT_FIELDS[key]);
  const selectKeys = keys.filter((key) => HUB_SIM_SELECT_FIELDS[key]);
  const boolKeys = keys.filter((key) => hubUserOverrideIsBoolField(key, values[key]));
  const inputKeys = [...textKeys, ...selectKeys];
  const inputFields = inputKeys.map((key) => renderHubSimulationField(section, key, values[key] ?? "")).join("");
  const boolFields = boolKeys.map((key) => {
    const rawValue = String(values[key] ?? "");
    const value = hubSimIsBoolValue(rawValue) ? rawValue : "off";
    const [onValue, offValue] = hubSimBoolPair(value);
    const checked = value.toLowerCase() === onValue ? " checked" : "";
    return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;font-size:0.875rem;">
      <input type="checkbox" data-section="${escHtml(section)}" data-key="${escHtml(key)}" data-on="${escHtml(onValue)}" data-off="${escHtml(offValue)}"${checked}>
      <span>${escHtml(hubSimFieldLabel(key))}</span>
    </label>`;
  }).join("");
  return { keys, inputKeys, boolKeys, inputFields, boolFields };
}

function renderUserOverrideCard(username, values = {}) {
  const canEdit = canManageTenant(currentTenantId || getActiveTenantId());
  const preferredKeys = hubUserOverridesConfState.keyOrder?.[username] || [];
  const orderedKeys = [...preferredKeys, ...Object.keys(values || {})].filter((key, index, arr) => key && arr.indexOf(key) === index);
  const { inputKeys, boolKeys, inputFields, boolFields } = renderUserOverrideFieldGroups(username, values || {}, orderedKeys);
  return `
    <div class="setup-card setup-section-gap" data-override-username="${escHtml(username)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="font-weight:600;">👤 ${escHtml(username)}</div>
        <button type="button" class="btn btn-secondary btn-small user-override-delete-btn" data-username="${escHtml(username)}"${canEdit ? "" : " disabled"}>✕ Remove</button>
      </div>
      <div class="setup-form setup-section-gap">
        ${inputKeys.length ? `<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">${inputFields}</div>` : ""}
        ${boolKeys.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:6px 0;">${boolFields}</div>` : ""}
        ${!inputKeys.length && !boolKeys.length ? '<div class="muted">No fields found in this override.</div>' : ""}
      </div>
    </div>
  `;
}

function renderUserOverrideModalBody(username, values = {}, orderedKeys = [], readOnly = false) {
  const { inputKeys, boolKeys, inputFields, boolFields } = renderUserOverrideFieldGroups("__uom__", values || {}, orderedKeys);
  return `
    <div class="setup-form setup-section-gap">
      <label class="form-group" style="display:block;">
        <span class="form-label">Hostname</span>
        <input id="hub-uom-username" class="form-input" type="text" value="${escHtml(username || "")}"${readOnly ? " readonly" : ""}>
      </label>
      ${inputKeys.length ? `<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">${inputFields}</div>` : ""}
      ${boolKeys.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:6px 0;">${boolFields}</div>` : ""}
    </div>
  `;
}

function ensureUserOverrideModal() {
  let modal = document.getElementById("hub-user-override-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "hub-user-override-modal";
  modal.className = "modal-overlay hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "hub-uom-title");
  modal.innerHTML = `
    <div class="modal-box modal-box-large">
      <div class="modal-header">
        <h2 id="hub-uom-title">Add User Override</h2>
        <button id="hub-uom-x" class="btn btn-secondary btn-small" type="button">✕ Close</button>
      </div>
      <div id="hub-uom-body" style="max-height:65vh;overflow-y:auto;"></div>
      <div id="hub-uom-slot-row" class="setup-section-gap" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;">
        <label class="form-group" style="margin:0;min-width:220px;">
          <span class="form-label">Copy from Simulation Client slot</span>
          <select id="hub-uom-slot-select" class="form-input">
            <option value="">Do not copy a slot</option>
            ${HUB_SIM_FIXED_SECTION_ORDER.filter((section) => /^s\d+$/.test(section)).map((section) => `<option value="${escHtml(section)}">${escHtml(section.toUpperCase())}</option>`).join("")}
          </select>
        </label>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;">
        <span id="hub-uom-msg" class="form-msg"></span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="hub-uom-cancel" class="btn btn-secondary btn-small" type="button">Cancel</button>
          <button id="hub-uom-save" class="btn btn-primary btn-small" type="button">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openUserOverrideModal(hostname, simId, opts = {}) {
  const modal = ensureUserOverrideModal();
  const body = $("#hub-uom-body", modal);
  const title = $("#hub-uom-title", modal);
  const slotRow = $("#hub-uom-slot-row", modal);
  const slotSelect = $("#hub-uom-slot-select", modal);
  const existing = Boolean(hostname && Object.prototype.hasOwnProperty.call(hubUserOverridesConfState.sections || {}, hostname));
  const renderBody = (selectedSimId) => {
    const currentUsername = hostname || $("#hub-uom-username", modal)?.value || "";
    const mergedValues = {
      ...((selectedSimId && hubSimulationConfState.sections?.[selectedSimId]) || {}),
      ...((hostname && hubUserOverridesConfState.sections?.[hostname]) || {}),
    };
    const orderedKeys = [...new Set([...HUB_SIM_SLOT_KEYS, ...Object.keys(mergedValues || {})])];
    body.innerHTML = renderUserOverrideModalBody(currentUsername, mergedValues, orderedKeys, Boolean(hostname));
  };

  hubUserOverrideModalState = { open: true, hostname: hostname || "", simId: simId || "", autoSave: Boolean(opts.autoSave) };
  title.textContent = existing ? `Edit Override: ${hostname}` : "Add User Override";
  slotRow.classList.toggle("hidden", Boolean(hostname));
  slotRow.style.display = hostname ? "none" : "flex";
  slotSelect.value = hostname ? "" : (simId || "");
  setFormMessage("hub-uom-msg", "", true);
  renderBody(hostname ? simId || "" : slotSelect.value || "");
  slotSelect.onchange = hostname ? null : () => {
    hubUserOverrideModalState.simId = slotSelect.value || "";
    renderBody(hubUserOverrideModalState.simId);
  };
  modal.classList.remove("hidden");
}

function closeUserOverrideModal() {
  document.getElementById("hub-user-override-modal")?.classList.add("hidden");
  hubUserOverrideModalState.open = false;
}

async function saveUserOverrideFromModal(tenantId) {
  const modal = ensureUserOverrideModal();
  const username = String($("#hub-uom-username", modal)?.value || "").trim();
  if (!username) {
    setFormMessage("hub-uom-msg", "Hostname is required.", false);
    return;
  }

  const values = {};
  const orderedKeys = [];
  modal.querySelectorAll('[data-section="__uom__"][data-key]').forEach((input) => {
    const key = input.dataset.key;
    if (!key) return;
    orderedKeys.push(key);
    values[key] = input.type === "checkbox"
      ? (input.checked ? (input.dataset.on || "on") : (input.dataset.off || "off"))
      : input.value.trim();
  });

  if (!hubUserOverridesConfState.sections || typeof hubUserOverridesConfState.sections !== "object") hubUserOverridesConfState.sections = {};
  if (!Array.isArray(hubUserOverridesConfState.sectionOrder)) hubUserOverridesConfState.sectionOrder = [];
  if (!hubUserOverridesConfState.keyOrder || typeof hubUserOverridesConfState.keyOrder !== "object") hubUserOverridesConfState.keyOrder = {};

  hubUserOverridesConfState.sections[username] = values;
  if (!hubUserOverridesConfState.sectionOrder.includes(username)) hubUserOverridesConfState.sectionOrder.push(username);
  hubUserOverridesConfState.keyOrder[username] = orderedKeys;
  hubUserOverridesConfState.loaded = true;
  hubUserOverridesConfState.error = "";

  if (hubUserOverrideModalState.autoSave) {
    await saveSetupUserOverridesConf(tenantId);
    closeUserOverrideModal();
    renderSetupUserOverridesEditor();
    return;
  }

  closeUserOverrideModal();
  renderSetupUserOverridesEditor();
}

function renderSetupUserOverridesEditor() {
  let container = $("#setup-user-overrides-editor");
  if (!container) {
    const simEditor = $("#setup-sim-config-editor");
    if (!simEditor) return;
    container = document.createElement("div");
    container.id = "setup-user-overrides-editor";
    container.style.marginTop = "24px";
    simEditor.parentNode.insertBefore(container, simEditor.nextSibling);
  }
  const tenantId = currentTenantId || getActiveTenantId();
  if (!tenantId) { container.innerHTML = ""; return; }
  const canEdit = canManageTenant(tenantId);
  const disabled = canEdit ? "" : " disabled";
  const fetched = hubUserOverridesConfState.fetchedAt ? fmtDate(hubUserOverridesConfState.fetchedAt) : "—";
  const headerButtons = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      ${canEdit ? '<button id="setup-user-overrides-add-btn" class="btn btn-secondary btn-small" type="button">＋ Add User</button>' : ""}
      <button id="setup-user-overrides-refresh-btn" class="btn btn-secondary btn-small" type="button">Refresh</button>
      <button id="setup-user-overrides-save-btn" class="btn btn-primary btn-small" type="button"${disabled}>Save</button>
    </div>
  `;

  if (hubUserOverridesConfState.loading) {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div style="font-weight:600;">configs/user-overrides.conf</div>
          <div class="muted" style="font-size:0.85rem;">Per-user simulation overrides — pin a hostname to specific sim settings · Last fetched: ${escHtml(fetched)}</div>
        </div>
        ${headerButtons}
      </div>
      <div id="setup-user-overrides-msg" class="form-msg" style="margin-bottom:10px;"></div>
      <div class="empty-state">Loading user-overrides.conf…</div>
    `;
    wireSetupUserOverridesButtons(tenantId);
    $("#setup-user-overrides-add-btn")?.addEventListener("click", () => openUserOverrideModal("", null, { autoSave: false }));
    return;
  }

  if (hubUserOverridesConfState.error) {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <div style="font-weight:600;">configs/user-overrides.conf</div>
          <div class="muted" style="font-size:0.85rem;">Per-user simulation overrides — pin a hostname to specific sim settings · Last fetched: ${escHtml(fetched)}</div>
        </div>
        ${headerButtons}
      </div>
      <div id="setup-user-overrides-msg" class="form-msg" style="margin-bottom:10px;"></div>
      <div class="empty-state">${escHtml(hubUserOverridesConfState.error)}</div>
    `;
    wireSetupUserOverridesButtons(tenantId);
    $("#setup-user-overrides-add-btn")?.addEventListener("click", () => openUserOverrideModal("", null, { autoSave: false }));
    return;
  }

  const sections = hubUserOverridesConfState.sections || {};
  const orderedSections = (hubUserOverridesConfState.sectionOrder || []).filter((section) => Object.prototype.hasOwnProperty.call(sections, section));
  Object.keys(sections).forEach((section) => {
    if (!orderedSections.includes(section)) orderedSections.push(section);
  });

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <div style="font-weight:600;">configs/user-overrides.conf</div>
        <div class="muted" style="font-size:0.85rem;">Per-user simulation overrides — pin a hostname to specific sim settings · Last fetched: ${escHtml(fetched)}</div>
      </div>
      ${headerButtons}
    </div>
    <div id="setup-user-overrides-msg" class="form-msg" style="margin-bottom:10px;"></div>
    ${orderedSections.length > 5 ? `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <input id="setup-user-overrides-search" class="form-input" type="search"
          placeholder="Filter by hostname…" value="${escHtml(hubUserOverridesSearch)}"
          style="max-width:320px;">
        <span id="setup-user-overrides-count" class="muted" style="font-size:0.85rem;white-space:nowrap;"></span>
      </div>` : ""}
    <div id="setup-user-overrides-form">
      ${orderedSections.map((username) => renderUserOverrideCard(username, sections[username] || {})).join("")}
      ${!orderedSections.length ? '<div class="muted" style="padding:12px 0">No overrides configured. Click <strong>＋ Add User</strong> or use the ↗ Override button in Simulation Clients.</div>' : ""}
    </div>
  `;

  container.querySelectorAll(".user-override-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!canManageTenant(tenantId)) return;
      const username = btn.dataset.username || "";
      if (!username) return;
      delete hubUserOverridesConfState.sections[username];
      delete hubUserOverridesConfState.keyOrder[username];
      hubUserOverridesConfState.sectionOrder = (hubUserOverridesConfState.sectionOrder || []).filter((section) => section !== username);
      renderSetupUserOverridesEditor();
    });
  });

  // Live hostname search filter
  function applyUserOverrideSearch(term) {
    hubUserOverridesSearch = term;
    const q = term.trim().toLowerCase();
    const cards = container.querySelectorAll("[data-override-username]");
    let visible = 0;
    cards.forEach(card => {
      const match = !q || card.dataset.overrideUsername.toLowerCase().includes(q);
      card.style.display = match ? "" : "none";
      if (match) visible++;
    });
    const countEl = document.getElementById("setup-user-overrides-count");
    if (countEl) countEl.textContent = q ? `${visible} of ${cards.length} shown` : `${cards.length} user${cards.length !== 1 ? "s" : ""}`;
  }

  const searchInput = document.getElementById("setup-user-overrides-search");
  if (searchInput) {
    applyUserOverrideSearch(hubUserOverridesSearch); // apply preserved filter on render
    searchInput.addEventListener("input", () => applyUserOverrideSearch(searchInput.value));
  } else {
    hubUserOverridesSearch = ""; // reset if search box not shown (≤5 users)
  }
  $("#setup-user-overrides-add-btn")?.addEventListener("click", () => openUserOverrideModal("", null, { autoSave: false }));
  wireSetupUserOverridesButtons(tenantId);
}

function wireSetupUserOverridesButtons(tenantId) {
  const refreshBtn = $("#setup-user-overrides-refresh-btn");
  const saveBtn = $("#setup-user-overrides-save-btn");
  if (refreshBtn && !refreshBtn._bound) {
    refreshBtn._bound = true;
    refreshBtn.addEventListener("click", async () => { await loadSetupUserOverridesConf(tenantId, true); });
  }
  if (saveBtn && !saveBtn._bound) {
    saveBtn._bound = true;
    saveBtn.addEventListener("click", async () => { await saveSetupUserOverridesConf(tenantId); });
  }
}

function wireSetupSimConfigButtons(tenantId) {
  const refreshBtn = $("#setup-sim-config-refresh-btn");
  const saveBtn = $("#setup-sim-config-save-btn");
  
  if (refreshBtn && !refreshBtn._bound) {
    refreshBtn._bound = true;
    refreshBtn.addEventListener("click", async () => {
      await loadSetupSimulationConf(tenantId, true);
    });
  }
  
  if (saveBtn && !saveBtn._bound) {
    saveBtn._bound = true;
    saveBtn.addEventListener("click", async () => {
      await saveSetupSimulationConf(tenantId);
    });
  }
}

async function loadSetupSimulationConf(tenantId, force = false) {
  if (!tenantId || !currentUser) return null;
  if (hubSimulationConfState.tenantId !== tenantId) resetHubSimulationConfState(tenantId);
  if (!force && hubSimulationConfState.loaded) {
    renderSetupSimulationConfigEditor();
    return hubSimulationConfState;
  }
  hubSimulationConfState.loading = true;
  hubSimulationConfState.error = "";
  renderSetupSimulationConfigEditor();
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/simulation-conf`);
  const data = await readJson(res);
  if (!res || !res.ok) {
    hubSimulationConfState.loading = false;
    hubSimulationConfState.loaded = false;
    hubSimulationConfState.error = data?.detail || "Unable to load simulation.conf.";
    renderSetupSimulationConfigEditor();
    return null;
  }
  const parsed = parseHubSimulationIni(data?.content || "");
  hubSimulationConfState = {
    tenantId,
    loaded: true,
    loading: false,
    rawContent: data?.content || "",
    sha: data?.sha || "",
    fetchedAt: data?.fetched_at || "",
    sections: parsed.sections,
    sectionOrder: parsed.sectionOrder,
    keyOrder: parsed.keyOrder,
    error: "",
    mode: data?.mode || "github",
  };
  renderSetupSimulationConfigEditor();
  return hubSimulationConfState;
}

async function loadSetupUserOverridesConf(tenantId, force = false) {
  if (!tenantId || !currentUser) return null;
  if (hubUserOverridesConfState.tenantId !== tenantId) resetHubUserOverridesConfState(tenantId);
  if (!force && hubUserOverridesConfState.loaded) {
    renderSetupUserOverridesEditor();
    return hubUserOverridesConfState;
  }
  hubUserOverridesConfState.loading = true;
  hubUserOverridesConfState.error = "";
  renderSetupUserOverridesEditor();
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/user-overrides-conf`);
  const data = await readJson(res);
  if (!res || !res.ok) {
    hubUserOverridesConfState.loading = false;
    hubUserOverridesConfState.loaded = false;
    hubUserOverridesConfState.error = data?.detail || "Unable to load user-overrides.conf.";
    renderSetupUserOverridesEditor();
    return null;
  }
  const parsed = parseHubSimulationIni(data?.content || "");
  hubUserOverridesConfState = {
    tenantId,
    loaded: true,
    loading: false,
    rawContent: data?.content || "",
    fetchedAt: data?.fetched_at || "",
    sections: parsed.sections,
    sectionOrder: parsed.sectionOrder,
    keyOrder: parsed.keyOrder,
    error: "",
  };
  renderSetupUserOverridesEditor();
  return hubUserOverridesConfState;
}

function collectSetupSimulationConfContent() {
  const form = $("#setup-sim-config-form");
  if (!form) return hubSimulationConfState.rawContent || "";
  const sections = JSON.parse(JSON.stringify(hubSimulationConfState.sections || {}));
  form.querySelectorAll("[data-section][data-key]").forEach((input) => {
    const section = input.dataset.section;
    const key = input.dataset.key;
    if (!sections[section]) sections[section] = {};
    if (input.type === "checkbox") {
      sections[section][key] = input.checked ? (input.dataset.on || "on") : (input.dataset.off || "off");
      return;
    }
    sections[section][key] = input.value.trim();
  });
  return serializeHubSimulationIni(sections, hubSimulationConfState.sectionOrder, hubSimulationConfState.keyOrder);
}

function collectSetupUserOverridesContent() {
  const form = $("#setup-user-overrides-form");
  const sections = JSON.parse(JSON.stringify(hubUserOverridesConfState.sections || {}));
  if (form) {
    form.querySelectorAll("[data-section][data-key]").forEach((input) => {
      const section = input.dataset.section;
      const key = input.dataset.key;
      if (!sections[section]) sections[section] = {};
      if (input.type === "checkbox") {
        sections[section][key] = input.checked ? (input.dataset.on || "on") : (input.dataset.off || "off");
        return;
      }
      sections[section][key] = input.value.trim();
    });
  }
  return serializeHubSimulationIni(sections, hubUserOverridesConfState.sectionOrder, hubUserOverridesConfState.keyOrder);
}

async function saveSetupSimulationConf(tenantId) {
  if (!canManageTenant(tenantId)) {
    setFormMessage("setup-sim-config-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  if (!tenantId) return;
  const isOverride = hubSimulationConfState.mode === "override";
  setFormMessage("setup-sim-config-msg", isOverride ? "Saving…" : "Saving to GitHub…", true);
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/simulation-conf`, {
    method: "PUT",
    body: { content: collectSetupSimulationConfContent() },
  });
  const data = await readJson(res);
  if (!res || !res.ok) {
    setFormMessage("setup-sim-config-msg", data?.detail || "Unable to save simulation.conf.", false);
    return;
  }
  await loadSetupSimulationConf(tenantId, true);
  if (isOverride) {
    setFormMessage("setup-sim-config-msg", `Saved. Pushed to ${data?.pushed_to_spokes ?? 0} spoke(s).`, true);
  } else {
    setFormMessage("setup-sim-config-msg", `Saved to GitHub. Repo sync queued for ${data?.synced_spokes ?? 0} spoke(s).`, true);
  }
}

async function saveSetupUserOverridesConf(tenantId) {
  if (!canManageTenant(tenantId)) {
    setFormMessage("setup-user-overrides-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  if (!tenantId) return;
  setFormMessage("setup-user-overrides-msg", "Saving…", true);
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/config/user-overrides-conf`, {
    method: "PUT",
    body: { content: collectSetupUserOverridesContent() },
  });
  const data = await readJson(res);
  if (!res || !res.ok) {
    setFormMessage("setup-user-overrides-msg", data?.detail || "Unable to save user-overrides.conf.", false);
    return;
  }
  await loadSetupUserOverridesConf(tenantId, true);
  setFormMessage("setup-user-overrides-msg", `Saved. Pushed to ${data?.pushed_to_spokes ?? 0} spoke(s).`, true);
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
  hydrateTenantSetupPanel(data);  // For Setup tab and Spokes tab PSK onboarding

  ["dashboard", "spokes", "commands", "setup"].forEach(tabId => {
    $(`.tenant-detail-tab[data-tenant-detail-tab="${tabId}"]`)?.classList.toggle("active", tenantDetailState.activeTab === tabId);
    $("#tenant-detail-" + tabId + "-panel")?.classList.toggle("hidden", tenantDetailState.activeTab !== tabId);
  });
  setTenantDetailVisible(true);
  updateHubRefreshPausedState();
}

async function openTenantDetail(tenantId, tabId = "dashboard", force = false) {
  if (!tenantId || !currentUser) return;
  await setCurrentTenant(tenantId, false);
  tenantDetailState.open = true;
  tenantDetailState.tenantId = tenantId;
  tenantDetailState.activeTab = tabId;
  setTenantDetailVisible(true);
  updateHubRefreshPausedState();
  ["dashboard", "spokes", "commands", "setup"].forEach(panelId => {
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
  $("#dashboard-add-tenant-btn")?.classList.toggle("hidden", !currentUser?.is_superadmin);
  if (!currentUser) {
    if (grid) grid.innerHTML = "";
    if (empty) { empty.innerHTML = ""; empty.classList.add("hidden"); }
    return;
  }
  if (!grid || !empty) return;
  if (!tenants.length) {
    dashboardTenantRows = [];
    grid.innerHTML = "";
    empty.innerHTML = renderTenantDashboardEmptyState();
    empty.classList.remove("hidden");
    return;
  }
  // Auto-enter tenant context if user has exactly one tenant assigned
  if (tenants.length === 1 && !currentUser?.is_superadmin) {
    await enterTenantContext(tenants[0].id, "simulations", false);
    return;
  }
  try {
    // Render immediately from the tenants list (no per-tenant fetch needed for basic list).
    const rows = tenants.map(tenant => ({
      id: tenant.id,
      name: tenant.name || tenant.id,
      summary: summarizeTenantSpokes(spokeCache[tenant.id] || []),
      alert: summarizeTenantAlerts(summarizeTenantSpokes(spokeCache[tenant.id] || []), null),
    }));
    rows.sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, { numeric: true, sensitivity: "base" }));
    dashboardTenantRows = rows;
    if (canManageTenant()) loadTenantPendingSpokes();
    empty.classList.add("hidden");
    empty.innerHTML = "";
    grid.innerHTML = renderDashboardTenantTable(rows);
    // Refresh spoke data in background and re-render with counts.
    if (force) {
      Promise.all(tenants.map(tenant => ensureTenantSpokesFor(tenant.id, true))).then(() => {
        const refreshed = tenants.map(tenant => ({
          id: tenant.id,
          name: tenant.name || tenant.id,
          summary: summarizeTenantSpokes(spokeCache[tenant.id] || []),
          alert: summarizeTenantAlerts(summarizeTenantSpokes(spokeCache[tenant.id] || []), null),
        }));
        refreshed.sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, { numeric: true, sensitivity: "base" }));
        dashboardTenantRows = refreshed;
        if (grid) grid.innerHTML = renderDashboardTenantTable(refreshed);
      }).catch(() => {});
    }
  } catch (err) {
    console.error("loadDashboard error", err);
    grid.innerHTML = `<div class="empty-state">Error loading tenant list: ${escHtml(err?.message || "Unknown error")}</div>`;
  }
}

async function loadHubSimulations(force = false) {
  if (!currentTenantId || !currentUser) {
    hubCentralData = null;
    renderHubStatusTab();
    renderHubHwPanel();
    return;
  }
  try {
    const cached = hubCentralData || aggregateCentralData;
    const data = force || !cached ? await loadAggregateData("central") : cached;
    hubCentralData = data || { mode: "distributed", hub_central_config: {}, spokes: [] };
    aggregateCentralData = hubCentralData;
    // Load monitored items if not yet loaded (needed for Status tab)
    if (_hubMonitoredItemsData === null || force) {
      await loadAndRenderHubMonitoredItems(force);
    }
    if (hubSimActiveTab === "hub-simtop-hardware") {
      renderHubHwPanel();
      if (hubHwOpenCheckId) openHubHwDetail(hubHwOpenCheckId);
    } else if (hubSimActiveTab === "hub-simtop-sites") {
      renderHubSitesTab();
    } else {
      renderHubStatusTab();
    }
  } catch (err) {
    const emptyEl = document.getElementById("hub-sim-checks-empty");
    if (emptyEl) {
      emptyEl.textContent = `Error loading simulation data: ${err.message}`;
      emptyEl.classList.remove("hidden");
    }
  }
}

// ── Hub Clients localStorage cache helpers ─────────────────────────────────
function hubClientsCacheKey() { return `hub_clients_${currentTenantId}`; }

function saveHubClientsCache(rows) {
  try { localStorage.setItem(hubClientsCacheKey(), JSON.stringify(rows)); } catch (_) {}
}

function loadHubClientsCache() {
  try { const s = localStorage.getItem(hubClientsCacheKey()); return s ? JSON.parse(s) : null; }
  catch (_) { return null; }
}

async function loadClients(force = false) {
  if (!currentTenantId) {
    aggregateClientRows = [];
    renderClientRowsForHub();
    return;
  }

  // In-memory cache still valid — render immediately, revalidate silently.
  if (!force && aggregateClientRows.length) {
    renderClientRowsForHub();
    loadAggregateData("clients").then(data => {
      if (data) {
        aggregateClientRows = normalizeAggregateClientRows(data);
        primeHubClientExpandedSet([...new Set(aggregateClientRows.map(hubClientSiteKey))]);
        saveHubClientsCache(aggregateClientRows);
        renderClientRowsForHub();
      }
    }).catch(() => {});
    return;
  }

  // Show localStorage cache immediately while fetching fresh data.
  const cached = normalizeAggregateClientRows(loadHubClientsCache());
  if (cached && cached.length) {
    aggregateClientRows = cached;
    primeHubClientExpandedSet([...new Set(aggregateClientRows.map(hubClientSiteKey))]);
    renderClientRowsForHub();
    loadAggregateData("clients").then(data => {
      if (data) {
        aggregateClientRows = normalizeAggregateClientRows(data);
        primeHubClientExpandedSet([...new Set(aggregateClientRows.map(hubClientSiteKey))]);
        saveHubClientsCache(aggregateClientRows);
        renderClientRowsForHub();
      }
    }).catch(() => {});
    return;
  }

  // No cache — blocking fetch.
  const data = await loadAggregateData("clients");
  aggregateClientRows = normalizeAggregateClientRows(data);
  primeHubClientExpandedSet([...new Set(aggregateClientRows.map(hubClientSiteKey))]);
  if (aggregateClientRows.length) saveHubClientsCache(aggregateClientRows);
  renderClientRowsForHub();
}

function summarizeHubConfigState(spoke) {
  if (!spoke || spoke.status !== "approved") return { label: spoke?.status || "pending", className: "pending" };
  const desired = Number(spoke.config_version || 0);
  const applied = Number(spoke.applied_config_version || 0);
  if (desired > applied) return { label: `Pending v${desired}`, className: "pending" };
  if (desired > 0) return { label: `Applied v${applied}`, className: "approved" };
  return { label: "No push yet", className: "offline" };
}

function defaultFleetRecloneStatus() {
  return { any_running: false, total_vms: 0, completed: 0, failed: 0, default_concurrency: 3, spokes: [] };
}

function defaultUsbProvisioningStatus() {
  return { total_slots: 0, used_slots: 0, auto_provision_on: false, spokes: [] };
}

function normalizeHubVmServerConcurrency(value, fallback = 3) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, parsed));
}

function syncHubVmServerConcurrencyFromStatus() {
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  const status = aggregateFleetRecloneStatus || defaultFleetRecloneStatus();
  if (hubVmServerFleetConcurrencyTenant !== tenantId) {
    hubVmServerFleetConcurrencyTenant = tenantId;
    hubVmServerFleetConcurrencyDraft = normalizeHubVmServerConcurrency(status.default_concurrency, 3);
  }
}

function hubVmServerFleetStatusMeta(status) {
  if (status?.any_running) return { label: "Running", className: "badge-blue" };
  if (Number(status?.total_vms || 0) > 0 && Number(status?.completed || 0) + Number(status?.failed || 0) >= Number(status?.total_vms || 0)) {
    return { label: "Done", className: "badge-grey" };
  }
  return { label: "Idle", className: "badge-grey" };
}

function scheduleHubVmServerFleetPoll() {
  if (hubVmServerFleetPollTimer) {
    clearTimeout(hubVmServerFleetPollTimer);
    hubVmServerFleetPollTimer = null;
  }
  if (activeTab !== "vm-server" || hubVmServerSelectedSpoke || !(aggregateFleetRecloneStatus?.any_running)) return;
  hubVmServerFleetPollTimer = window.setTimeout(async () => {
    hubVmServerFleetPollTimer = null;
    if (activeTab !== "vm-server" || hubVmServerSelectedSpoke) return;
    await loadHubVmServerAggregateStatus();
    renderHubVmServer();
  }, 10000);
}

async function loadHubVmServerAggregateStatus() {
  const tenantId = getActiveTenantId();
  if (!currentUser || !tenantId) {
    aggregateFleetRecloneStatus = defaultFleetRecloneStatus();
    aggregateUsbProvisioningStatus = defaultUsbProvisioningStatus();
    return;
  }
  const [fleetRes, usbRes] = await Promise.all([
    apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/fleet-reclone-status`),
    apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/usb-provisioning-status`),
  ]);
  aggregateFleetRecloneStatus = fleetRes?.ok ? ((await fleetRes.json()) || defaultFleetRecloneStatus()) : (aggregateFleetRecloneStatus || defaultFleetRecloneStatus());
  aggregateUsbProvisioningStatus = usbRes?.ok ? ((await usbRes.json()) || defaultUsbProvisioningStatus()) : (aggregateUsbProvisioningStatus || defaultUsbProvisioningStatus());
  syncHubVmServerConcurrencyFromStatus();
}

async function startHubFleetReclone() {
  const tenantId = getActiveTenantId();
  if (!tenantId || !canManageTenant(tenantId)) {
    showToast("Tenant Viewer access is read-only.", "warn");
    return;
  }
  const input = $("#hub-fleet-reclone-concurrency");
  const concurrency = normalizeHubVmServerConcurrency(input?.value, hubVmServerFleetConcurrencyDraft || 3);
  hubVmServerFleetConcurrencyDraft = concurrency;
  if (input) input.value = String(concurrency);
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/fleet-reclone`, {
    method: "POST",
    body: { concurrency },
  });
  const data = await readJson(res);
  if (!res?.ok) {
    showToast(data?.detail || "Unable to queue fleet reclone.", "error");
    return;
  }
  showToast(`Queued fleet reclone for ${data?.queued || 0} spoke(s).`, "ok");
  await loadVmServer(true);
}

function renderHubVmServer() {
  const container = $("#hub-vm-server-content");
  if (!container) return;
  const tenantId = getActiveTenantId();
  const hosts = aggregateProxmoxHosts || [];
  const fleet = aggregateFleetRecloneStatus || defaultFleetRecloneStatus();
  const usbProvisioning = aggregateUsbProvisioningStatus || defaultUsbProvisioningStatus();
  const vmCount = hosts.reduce((sum, h) => sum + Number(h.vm_count || 0), 0);
  const usbCount = hosts.reduce((sum, h) => sum + Number(h.usb_count || 0), 0);
  $("#hub-vm-hosts-pill") && ($("#hub-vm-hosts-pill").textContent = `${hosts.length} hosts`);
  $("#hub-vm-vms-pill") && ($("#hub-vm-vms-pill").textContent = `${vmCount} VMs`);
  $("#hub-vm-usb-pill") && ($("#hub-vm-usb-pill").textContent = `${usbCount} USB devices`);

  if (hubVmServerSelectedSpoke) {
    const host = hosts.find(h => h.spoke_id === hubVmServerSelectedSpoke) || hubVmServerSelectedSpoke;
    renderHubVmServerDetail(container, host);
    return;
  }

  const fleetMeta = hubVmServerFleetStatusMeta(fleet);
  const fleetPct = Number(fleet.total_vms || 0) > 0 ? Math.max(0, Math.min(100, Math.round((Number(fleet.completed || 0) / Number(fleet.total_vms || 0)) * 100))) : 0;
  const usbPct = Number(usbProvisioning.total_slots || 0) > 0 ? Math.max(0, Math.min(100, Math.round((Number(usbProvisioning.used_slots || 0) / Number(usbProvisioning.total_slots || 0)) * 100))) : 0;
  const disabled = fleet.any_running || !canManageTenant(tenantId);
  const readonlyNote = canManageTenant(tenantId) ? "" : '<div class="tenant-detail-note">Tenant Viewer access: fleet controls are read-only.</div>';
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px;">
      <section class="setup-card">
        <div class="setup-card-header" style="display:flex;align-items:center;gap:12px;justify-content:space-between;">
          <div><h2>Fleet Reclone ${helpIcon('fleet-reclone')}</h2><p>Queue a rolling reclone on every approved spoke.</p></div>
          <span class="badge ${fleetMeta.className}">${escHtml(fleetMeta.label)}</span>
        </div>
        <div style="font-weight:600;margin-bottom:6px;">${escHtml(String(fleet.completed || 0))} / ${escHtml(String(fleet.total_vms || 0))} VMs recloned</div>
        <div class="progress-bar-wrap" style="margin-bottom:8px;"><div class="progress-bar" style="width:${fleetPct}%"></div></div>
        <div class="muted" style="font-size:0.82rem;margin-bottom:12px;">${fleet.any_running ? "Polling every 10s while fleet reclone is running." : `Failed: ${escHtml(String(fleet.failed || 0))}`}</div>
        ${readonlyNote}
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;">
          <label class="form-group" style="margin:0;min-width:100px;">
            <span class="form-label">Concurrency</span>
            <input id="hub-fleet-reclone-concurrency" class="form-input" type="number" min="1" max="10" value="${escHtml(String(hubVmServerFleetConcurrencyDraft || 3))}"${canManageTenant(tenantId) ? "" : " disabled"}>
          </label>
          <button id="hub-fleet-reclone-btn" class="btn btn-primary" type="button"${disabled ? " disabled" : ""}>🔄 Reclone Fleet</button>
          ${fleet.failed > 0 && !fleet.any_running && canManageTenant(tenantId) ? `<button id="hub-fleet-reclone-clear-btn" class="btn btn-secondary" type="button">✕ Clear Error</button>` : ""}
        </div>
      </section>
       <section class="setup-card">
        <div class="setup-card-header" style="display:flex;align-items:center;gap:12px;justify-content:space-between;">
          <div><h2>Auto-Provisioning</h2><p>USB provisioning capacity reported across approved spokes.</p></div>
          <div id="hub-autoprov-pill"
               class="autoprov-status-bar ${usbProvisioning.auto_provision_on ? "is-idle" : "is-disabled"}"
               role="button" tabindex="0"
               style="${canManageTenant(tenantId) ? "cursor:pointer;" : "cursor:default;pointer-events:none;"}"
               title="${canManageTenant(tenantId) ? (usbProvisioning.auto_provision_on ? "Click to disable" : "Click to enable") + " auto-provisioning on all spokes" : ""}">
            <span class="autoprov-status-icon"><span class="autoprov-dot"></span></span>
            <span>VM Auto-Provisioning: ${usbProvisioning.auto_provision_on ? "On" : "Off"}</span>
          </div>
        </div>
        <div style="font-weight:600;margin-bottom:6px;">${escHtml(String(usbProvisioning.used_slots || 0))} / ${escHtml(String(usbProvisioning.total_slots || 0))} slots in use</div>
        <div class="progress-bar-wrap" style="margin-bottom:8px;"><div class="progress-bar" style="width:${usbPct}%"></div></div>
        <div class="muted" style="font-size:0.82rem;">${escHtml(String((usbProvisioning.spokes || []).filter(spoke => spoke.auto_provision).length))} spoke(s) with auto-provisioning enabled.</div>
      </section>
    </div>
    ${hosts.length ? `
      <div class="hub-vmserver-list">
        ${hosts.map(host => {
          const online = host.spoke_online;
          const reclone = host.reclone_state || {};
          const recloneStatus = reclone.status || "idle";
          return `
            <div class="setup-card hub-vmserver-spoke-card" role="button" tabindex="0"
                 data-spoke-id="${escHtml(host.spoke_id)}" style="cursor:pointer;">
              <div class="panel-header">
                <span class="server-node-name">${escHtml(spokeDisplayName(host, "Spoke"))}</span>
                <span class="stat-pill ${online ? "online" : "offline"}">${online ? "Online" : "Offline"}</span>
                <span class="stat-pill">${escHtml(String(host.vm_count || 0))} VMs</span>
                <span class="stat-pill">${escHtml(String(host.usb_count || 0))} USB</span>
                ${recloneStatus !== "idle" ? `<span class="stat-pill badge-${recloneStatus === "running" ? "blue" : "grey"}">${escHtml(recloneStatus)}</span>` : ""}
                <span class="stat-pill" style="margin-left:auto;">Click to open →</span>
              </div>
              <div style="padding:8px 16px;font-size:0.82rem;color:var(--muted);">
                Agent ${escHtml(host.proxmox?.agent_version || "—")} &nbsp;·&nbsp;
                PVE ${escHtml(host.proxmox?.pve_version || "—")} &nbsp;·&nbsp;
                ${host.proxmox?.connected && host.spoke_online
                  ? "🟢 Proxmox connected"
                  : (host.spoke_online ? "⚠️ Proxmox agent not reporting" : "⚫ Spoke offline")}
              </div>
            </div>`;
        }).join("")}
      </div>`
      : '<div class="empty-state">No Proxmox telemetry reported for this tenant.</div>'}
  `;

  $("#hub-fleet-reclone-concurrency", container)?.addEventListener("input", event => {
    hubVmServerFleetConcurrencyDraft = normalizeHubVmServerConcurrency(event.target.value, hubVmServerFleetConcurrencyDraft || 3);
  });
  $("#hub-fleet-reclone-btn", container)?.addEventListener("click", () => {
    startHubFleetReclone().catch(err => showToast(err?.message || "Unable to queue fleet reclone.", "error"));
  });
  $("#hub-fleet-reclone-clear-btn", container)?.addEventListener("click", async () => {
    const btn = $("#hub-fleet-reclone-clear-btn", container);
    if (btn) { btn.disabled = true; btn.textContent = "Clearing…"; }
    try {
      const data = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/aggregate/fleet-reclone-clear`, { method: "POST" });
      showToast(`Queued reclone state clear for ${data?.queued || 0} spoke(s).`, "ok");
      setTimeout(() => loadVmServer(true), 3000);
    } catch (err) {
      showToast(err?.message || "Unable to clear reclone state.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✕ Clear Error"; }
    }
  });
  $("#hub-autoprov-pill", container)?.addEventListener("click", async () => {
    if (!canManageTenant(tenantId)) return;
    const pill = $("#hub-autoprov-pill", container);
    const enable = !usbProvisioning.auto_provision_on;
    if (pill) { pill.style.pointerEvents = "none"; pill.style.opacity = "0.6"; }
    try {
      const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/aggregate/toggle-auto-provision`, {
        method: "POST", body: { enable },
      });
      const data = await readJson(res);
      if (!res?.ok) { showToast(data?.detail || "Failed to update auto-provisioning.", "error"); }
      else { showToast(`Auto-provisioning ${enable ? "enabled" : "disabled"} on ${data?.updated_spokes ?? 0} spoke(s).`, "ok"); await loadVmServer(true); }
    } catch (err) {
      showToast(err?.message || "Failed to update auto-provisioning.", "error");
    } finally {
      if (pill) { pill.style.pointerEvents = ""; pill.style.opacity = ""; }
    }
  });
  container.querySelectorAll(".hub-vmserver-spoke-card").forEach(card => {
    const openCard = () => {
      hubVmServerActiveSubtab = "vms"; // always open on VMs tab
      hubVmServerSelectedSpoke = card.dataset.spokeId;
      renderHubVmServer();
    };
    card.addEventListener("click", openCard);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openCard(); });
  });
  scheduleHubVmServerFleetPoll();
}

// ── Hub VM Server drill-in view ──────────────────────────────────────────────
let hubVmServerActiveSubtab = "vms";

function renderHubVmServerDetail(container, host) {
  const spokeId = host.spoke_id;
  const tenantId = host.tenant_id || getActiveTenantId();
  const spokeName = escHtml(spokeDisplayName(host, "Spoke"));
  // proxmox_vms has full data (cpu, mem, maxmem) from the Proxmox agent.
  // proxmox.vms is stripped (vmid/name/status/type only) — use as fallback only.
  const px = host.proxmox || {};
  const templateLock = String(px.template_lock || '').trim();
  const canUnlockTemplate = canManageTenant(tenantId);
  const vms = (Array.isArray(host.proxmox_vms) && host.proxmox_vms.length ? host.proxmox_vms : null)
    || (Array.isArray(px.vms) ? px.vms : []);
  const usb = Array.isArray(host.usb_devices) ? host.usb_devices : [];
  const reclone = host.reclone_state || {};

  // Categorise VMs to match the spoke
  const configuredTemplateIds = new Set([
    String(px.vm_image_1_template_id || (host.spoke_config || {}).vm_image_1_template_id || "100"),
    String(px.vm_image_2_template_id || (host.spoke_config || {}).vm_image_2_template_id || "200"),
  ]);
  const templateVms = vms.filter(v =>
    v.is_template === true || v.is_template === "true" || configuredTemplateIds.has(String(v.vmid))
  );
  const nonTpl = vms.filter(v => !templateVms.includes(v));
  const containerVms = nonTpl.filter(v => v.type === "lxc");
  const qemuVms = nonTpl.filter(v => v.type !== "lxc");
  const simVms = qemuVms.filter(v => Number(v.vmid) > 90000);
  const nonSimQemu = qemuVms.filter(v => !simVms.includes(v));
  // T3: qemu VMs whose PCI passthrough addresses match a T3 device on this node
  const t3AddrSet = new Set((px.t3_pci_devices || []).map(d => String(d.id || "").toLowerCase()));
  const iotVms = t3AddrSet.size
    ? nonSimQemu.filter(v => (v.pci_passthrough_addrs || []).some(a => t3AddrSet.has(String(a).toLowerCase())))
    : [];
  const otherVms = [...nonSimQemu.filter(v => !iotVms.includes(v)), ...containerVms];

  // Use the physically-present dongle count for the USB badge, falling back to
  // usb_devices (usb_state) length when present_usb is not yet available.
  const presentUsbCount = Array.isArray(px.present_usb) ? px.present_usb.length : usb.length;
  const subtabs = [
    { id: "vms",      label: `VMs <span class="badge-count">${vms.length}</span>` },
    { id: "usb",      label: `USB (T2) <span class="badge-count">${presentUsbCount}</span>` },
    { id: "iot",      label: `IoT (T3) <span class="badge-count">${iotVms.length}</span>` },
    { id: "other",    label: `Other <span class="badge-count">${otherVms.length}</span>` },
    { id: "vh",       label: "VirtualHere" },
    { id: "commands", label: "Command Queue" },
    { id: "details",  label: "Details" },
  ];

  // Proxmox agent approval state
  const pendingAgents = Array.isArray(px.pending_proxmox) ? px.pending_proxmox : [];
  const approvedAgents = Array.isArray(px.approved_proxmox) ? px.approved_proxmox : [];
  const agentPending = pendingAgents[0] || null;
  const agentApproved = approvedAgents[0] || null;
  let agentBtnLabel = "";
  let agentBtnHostname = "";
  let agentBtnAction = "";
  if (agentPending) {
    agentBtnLabel = `✓ Approve Agent`;
    agentBtnHostname = agentPending.hostname || "";
    agentBtnAction = "approve";
  } else if (agentApproved) {
    agentBtnLabel = `✕ Revoke Agent`;
    agentBtnHostname = agentApproved.hostname || "";
    agentBtnAction = "revoke";
  }

  container.innerHTML = `
    <div class="hub-vmserver-detail">
      <div class="hub-vmserver-detail-header" style="display:flex;align-items:center;gap:12px;padding:10px 0 12px;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-small" id="hub-vmserver-back-btn" type="button">← Back</button>
        <strong style="font-size:1rem;">${spokeName}</strong>
        <span class="stat-pill ${host.spoke_online ? "online" : "offline"}">${host.spoke_online ? "Online" : "Offline"}</span>
        <span class="stat-pill">${escHtml(String(host.vm_count || 0))} VMs</span>
        <span class="stat-pill">${escHtml(String(host.usb_count || 0))} USB</span>
        ${agentBtnLabel ? `<button id="hub-vmserver-agent-approve-btn" class="btn btn-secondary btn-small" type="button" data-hostname="${escHtml(agentBtnHostname)}" data-action="${agentBtnAction}">${escHtml(agentBtnLabel)}</button>` : ""}
      </div>
      ${templateLock ? `
        <div class="setup-card setup-section-gap" style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid #f59e0b;background:rgba(245,158,11,.12);">
          <div style="font-weight:600;">🔓 Template Locked: ${escHtml(templateLock)}</div>
          ${canUnlockTemplate ? '<button id="hub-vmserver-unlock-template-btn" class="btn btn-warning btn-small" type="button">Unlock</button>' : ''}
        </div>` : ''}
      <nav class="setup-subnav" role="tablist" id="hub-vmserver-subnav">
        ${subtabs.map(t => `
          <button class="setup-subtab hub-vmserver-subtab ${t.id === hubVmServerActiveSubtab ? "active" : ""}"
                  data-hvmsubtab="${t.id}" role="tab" type="button">${t.label}</button>`).join("")}
      </nav>
      <div id="hub-vmserver-subpanel"></div>
    </div>`;

  document.getElementById("hub-vmserver-back-btn").addEventListener("click", () => {
    hubVmServerSelectedSpoke = null;
    renderHubVmServer();
  });
  document.getElementById("hub-vmserver-unlock-template-btn")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = "Unlocking…";
    try {
      await queueHubTemplateUnlock(tenantId, spokeId);
    } catch (error) {
      showToast(error?.message || "Unable to queue template unlock.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  });
  document.getElementById("hub-vmserver-agent-approve-btn")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const hostname = btn.dataset.hostname;
    if (!hostname) return;
    if (action === "revoke" && !confirm(`Revoke Proxmox agent key for ${hostname}?`)) return;
    btn.disabled = true;
    btn.textContent = action === "approve" ? "Approving…" : "Revoking…";
    try {
      const endpoint = action === "approve" ? "proxmox-approve-agent" : "proxmox-revoke-agent";
      const resp = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/${endpoint}`, {
        method: "POST",
        body: { spoke_id: spokeId, hostname },
      });
      if (!resp?.ok) throw new Error(`HTTP ${resp?.status ?? "?"}`);
      showToast(action === "approve" ? `Queued agent approval for ${hostname}.` : `Queued agent revoke for ${hostname}.`, "ok");
      setTimeout(() => loadVmServer(true), 3000);
    } catch (err) {
      showToast(err?.message || "Action failed.", "error");
      btn.disabled = false;
      btn.textContent = agentBtnLabel;
    }
  });

  const ctx = { tenantId, spokeId, simVms, iotVms, otherVms, containerVms, templateVms, usb, reclone, px, host };
  document.querySelectorAll(".hub-vmserver-subtab").forEach(btn => {
    btn.addEventListener("click", () => {
      hubVmServerActiveSubtab = btn.dataset.hvmsubtab;
      document.querySelectorAll(".hub-vmserver-subtab").forEach(b => b.classList.toggle("active", b === btn));
      renderHubVmServerSubpanel(ctx);
    });
  });
  renderHubVmServerSubpanel(ctx);
}

function renderHubVmServerSubpanel({ tenantId, spokeId, simVms, iotVms, otherVms, containerVms, templateVms, usb, reclone, px, host }) {
  const panel = document.getElementById("hub-vmserver-subpanel");
  if (!panel) return;
  const subtab = hubVmServerActiveSubtab;

  if (subtab === "vms") {
    panel.innerHTML = renderHubVmServerVmsPanel(tenantId, spokeId, { simVms, otherVms: iotVms.concat(otherVms), containerVms, templateVms, reclone, px, host });
    wireHubVmsPanelActions(panel, tenantId, spokeId);
  } else if (subtab === "usb") {
    // Pass the full context so the USB panel can access proxmox state and spoke config.
    panel.innerHTML = renderHubVmServerUsbPanel(host);
    wireHubVmServerUsbPanel(panel, tenantId, spokeId, host);
  } else if (subtab === "iot") {
    panel.innerHTML = renderHubVmServerIoTPanel(spokeId, iotVms);
    wireHubVmPerRowActions(panel, tenantId, spokeId);
  } else if (subtab === "other") {
    panel.innerHTML = renderHubVmServerOtherPanel(spokeId, otherVms);
    wireHubVmPerRowActions(panel, tenantId, spokeId);
  } else if (subtab === "vh") {
    panel.innerHTML = renderHubVmServerVhPanel(px);
  } else if (subtab === "commands") {
    panel.innerHTML = renderHubVmServerCommandQueuePanel();
    wireHubCommandQueuePanel(panel, tenantId, spokeId);
    loadHubSpokeCommands(tenantId, spokeId);
  } else if (subtab === "details") {
    panel.innerHTML = renderHubVmServerDetailsPanel(px, host);
    wireHubVmServerDetailsPanel(panel, tenantId, spokeId);
  }
}

// ── VM status dot helper ─────────────────────────────────────────────────────

function _hubVmStatusDot(vm) {
  if (vm.status === "deleting")                return "🟡";
  if (vm.prov_status === "provisioning")       return "🔵";
  if (vm.prov_status === "post_prov_retry")    return "🔁";
  if (vm.prov_status === "agent_rebooting")    return "🔄";
  if (vm.prov_status === "agent_unresponsive") return "⚠️";
  if (vm.status === "running") return "🟢";
  if (vm.status === "paused") return "🟡";
  return "⚫";
}

function _hubVmStatusLabel(vm) {
  if (vm.prov_status === "provisioning")       return "provisioning";
  if (vm.prov_status === "post_prov_retry")    return "retrying…";
  if (vm.prov_status === "agent_rebooting")    return "agent rebooting…";
  if (vm.prov_status === "agent_unresponsive") return "agent down";
  return vm.status || "unknown";
}

// ── VMs tab ──────────────────────────────────────────────────────────────────

function renderHubVmServerVmsPanel(tenantId, spokeId, { simVms, otherVms, containerVms, templateVms, reclone, px, host }) {
  const canManage = canManageTenant(tenantId);
  const recloneStatus = reclone.status || "idle";
  const recloneColor = recloneStatus === "running" ? "badge-blue"
    : recloneStatus === "completed" ? "badge-green"
    : recloneStatus === "failed"    ? "badge-red"
    : "badge-grey";
  const recloneDone = (reclone.completed || 0) + (reclone.failed || 0);
  const reclonePct = reclone.total > 0 ? Math.min(100, Math.round((recloneDone / reclone.total) * 100)) : 0;

  // USB auto-provisioning summary for this spoke
  const usbDevices = Array.isArray(host?.usb_devices) ? host.usb_devices : [];
  const usbSlots = usbDevices.filter(d => d.vmid != null).length;
  const maxSlots = parseInt((host?.spoke_config || {}).usb_max_slots || px.usb_max_slots || "24", 10) || 24;
  const autoprovPct = maxSlots > 0 ? Math.min(100, Math.round((usbSlots / maxSlots) * 100)) : 0;
  const autoprovOn = (host?.spoke_config || {}).usb_auto_provision === "on" || px.usb_auto_provision === "on";

  const cats = [
    { id: "sim",        label: "Simulation Clients", vms: simVms },
    { id: "other",      label: "Other Clients",       vms: otherVms },
    { id: "containers", label: "Containers",           vms: containerVms },
    { id: "templates",  label: "Templates",            vms: templateVms },
  ];

  return `
    <div class="reclone-autoprov-grid setup-section-gap">
      <div class="setup-card vm-server-status-tile">
        <div class="autoprov-two-col">
          <div class="autoprov-left">
            <div class="setup-card-header" style="margin-bottom:8px;">
              <h2 style="font-size:1rem;margin:0;">Fleet Reclone</h2>
            </div>
            <div class="reclone-action-stack">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button id="hub-spoke-reclone-now-btn" class="btn btn-primary btn-small" type="button">⟳ Reclone All Now</button>
                ${canManage && recloneStatus !== "idle" && recloneStatus !== "running" ? '<button id="hub-spoke-reclone-clear-btn" class="btn btn-secondary btn-small" type="button">✕ Clear Errors</button>' : ""}
              </div>
              <div class="badge ${recloneColor}">${escHtml(recloneStatus === "idle" ? "Idle" : recloneStatus.charAt(0).toUpperCase() + recloneStatus.slice(1))}</div>
            </div>
            ${recloneStatus === "running" ? `
              <div style="margin-top:8px;">
                <div class="progress-bar-wrap"><div class="progress-bar" style="width:${reclonePct}%"></div></div>
                <div style="font-size:0.82rem;color:var(--muted);">${recloneDone} / ${reclone.total || 0} VMs</div>
              </div>` : ""}
            ${reclone.last_run ? `<div class="reclone-last-run" style="font-size:0.82rem;margin-top:6px;">Last run: ${relativeTime(reclone.last_run)}</div>` : ""}
          </div>
          <div class="autoprov-right">
            <div class="autoprov-live-list" style="font-size:0.82rem;color:var(--muted);"></div>
          </div>
        </div>
      </div>
      <div class="setup-card vm-server-status-tile">
        <div class="autoprov-two-col">
          <div class="autoprov-left">
            <div class="setup-card-header" style="margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <h2 style="font-size:1rem;margin:0;">VM Auto-Provisioning</h2>
                <span class="badge ${autoprovOn ? "badge-blue" : "badge-grey"}">${autoprovOn ? "On" : "Off"}</span>
              </div>
            </div>
            <div class="autoprov-live-summary">
              <div style="font-weight:600;margin-bottom:4px;">${usbSlots} / ${maxSlots} slots in use</div>
              <div class="progress-bar-wrap" style="margin-bottom:4px;"><div class="progress-bar" style="width:${autoprovPct}%"></div></div>
            </div>
          </div>
          <div class="autoprov-right">
            <div style="font-size:0.82rem;color:var(--muted);padding:8px 0;">
              ${autoprovOn ? "Auto-provisioning is enabled." : "Auto-provisioning is disabled."}
            </div>
            ${canManage ? `<button id="hub-spoke-autoprov-toggle-btn" class="btn btn-secondary btn-small" type="button" data-current="${autoprovOn ? "on" : "off"}">${autoprovOn ? "Disable" : "Enable"}</button>` : ""}
          </div>
        </div>
      </div>
    </div>

    <div class="vm-cat-tab-nav setup-section-gap">
      ${cats.map((c, i) => `
        <button class="vm-cat-tab setup-subtab ${i === 0 ? "active" : ""}" data-hvmcat="${c.id}" type="button">
          ${c.label} <span class="badge-count">${c.vms.length}</span>
        </button>`).join("")}
    </div>

    <div class="server-bulk-bar" id="hub-vm-bulk-bar">
      <label><input type="checkbox" id="hub-server-select-all"> Select All</label>
      <button class="btn btn-primary btn-small" id="hub-server-bulk-start"   type="button">▶ Start</button>
      <button class="btn btn-primary btn-small" id="hub-server-bulk-stop"    type="button">■ Stop</button>
      <button class="btn btn-warning btn-small" id="hub-server-bulk-reclone" type="button">↺ Reclone</button>
      <button class="btn btn-danger  btn-small" id="hub-server-bulk-delete"  type="button">✕ Delete</button>
    </div>

    ${cats.map((c, i) => `
      <div id="hub-vm-cat-panel-${c.id}" class="setup-card ${i !== 0 ? "hidden" : ""}">
        <div class="table-scroll">
          ${c.id === "templates" ? _hubVmTemplateTable(c.vms) : _hubVmFullTable(spokeId, c.vms, c.id)}
        </div>
        <div id="hub-vm-empty-${c.id}" class="empty-state"
             style="${c.vms.length ? "display:none;" : ""}padding:32px;text-align:center;color:var(--muted);">
          ${c.id === "sim" ? (px.last_seen ? "No Deployed VMs" : "Waiting for Proxmox agent to check in…") : c.label + ": none."}
        </div>
      </div>`).join("")}`;
}

function _hubVmFullTable(spokeId, vms, catId) {
  if (!vms.length) return "";
  const sorted = [...vms].sort((a, b) => {
    const aRun = a.status === "running" ? 1 : 0;
    const bRun = b.status === "running" ? 1 : 0;
    if (aRun !== bRun) return aRun - bRun;
    return Number(a.vmid) - Number(b.vmid);
  });
  const colId = catId === "containers" ? "CT ID" : "VM ID";
  const rows = sorted.map(vm => {
    const isDeleting = vm.status === "deleting";
    const dot = _hubVmStatusDot(vm);
    const statusLabel = isDeleting ? `🟡 deleting…` : `${dot} ${escHtml(_hubVmStatusLabel(vm))}`;
    const cpu = (!isDeleting && vm.status === "running" && vm.cpu != null && !Number.isNaN(Number(vm.cpu)))
      ? Number(vm.cpu).toFixed(1) + "%" : "—";
    const ram = (vm.mem && vm.maxmem)
      ? (Number(vm.mem) >= Number(vm.maxmem) * 0.99
          ? `${fmtSize(Number(vm.maxmem) * 1024 * 1024)} (alloc)`
          : `${fmtSize(Number(vm.mem) * 1024 * 1024)} / ${fmtSize(Number(vm.maxmem) * 1024 * 1024)}`)
      : "—";
    const vmidStr = escHtml(String(vm.vmid ?? "—"));
    const actions = isDeleting
      ? `<span style="font-size:0.82rem;color:var(--muted);font-style:italic;">deleting…</span>`
      : [
      { action: "start_vm",   label: "▶", title: "Start"   },
      { action: "stop_vm",    label: "■", title: "Stop"    },
      { action: "reclone_vm", label: "↺", title: "Reclone" },
      { action: "delete_vm",  label: "✕", title: "Delete"  },
    ].map(a =>
      `<button class="btn-icon hub-vm-action" data-action="${a.action}" data-vmid="${vmidStr}" title="${a.title}">${a.label}</button>`
    ).join(" ");
    const consoleBtn = (!isDeleting && vm.status === "running")
      ? `<button class="btn-icon hub-vm-console-btn" data-vmid="${vmidStr}" data-vmtype="${escHtml(vm.type || 'qemu')}" title="Open Console" style="color:#4fc3f7;">⎕</button>`
      : `<button class="btn-icon" disabled title="${isDeleting ? 'VM is being deleted' : 'VM must be running to open console'}" style="opacity:0.3;">⎕</button>`;
    return `<tr data-vmid="${vmidStr}">
      <td style="white-space:nowrap;"><input type="checkbox" class="hub-vm-check" data-vmid="${vmidStr}"></td>
      <td style="white-space:nowrap;" class="vm-status-cell">${statusLabel}</td>
      <td style="white-space:nowrap;">${vmidStr}</td>
      <td style="white-space:nowrap;">${escHtml(vm.name || "—")}</td>
      <td style="white-space:nowrap;">${cpu}</td>
      <td style="white-space:nowrap;">${ram}</td>
      <td style="white-space:nowrap;">${actions} ${consoleBtn}</td>
    </tr>`;
  }).join("");
  return `<table class="data-table">
    <thead><tr>
      <th style="width:36px;"><input type="checkbox" class="hub-vm-th-check" data-cat="${escHtml(catId)}"></th>
      <th style="white-space:nowrap;">Status</th><th style="white-space:nowrap;">${colId}</th><th style="white-space:nowrap;">Name</th><th style="white-space:nowrap;">CPU %</th><th style="white-space:nowrap;">RAM</th><th style="white-space:nowrap;">Actions</th>
    </tr></thead>
    <tbody id="hub-vm-tbody-${catId}">${rows}</tbody>
  </table>`;
}

function _hubVmTemplateTable(vms) {
  if (!vms.length) return "";
  const rows = vms.map(vm => {
    const dot = _hubVmStatusDot(vm);
    const cpu = vm.cpu != null ? Number(vm.cpu).toFixed(1) + "%" : "—";
    const ram = (vm.mem && vm.maxmem)
      ? (Number(vm.mem) >= Number(vm.maxmem) * 0.99
          ? `${fmtSize(Number(vm.maxmem) * 1024 * 1024)} (alloc)`
          : `${fmtSize(Number(vm.mem) * 1024 * 1024)} / ${fmtSize(Number(vm.maxmem) * 1024 * 1024)}`)
      : "—";
    return `<tr>
      <td>${escHtml(String(vm.vmid ?? "—"))}</td>
      <td>${escHtml(vm.name || "—")}</td>
      <td>${cpu}</td>
      <td>${ram}</td>
      <td>${dot} ${escHtml(_hubVmStatusLabel(vm))}</td>
    </tr>`;
  }).join("");
  return `<table class="data-table">
    <thead><tr><th>VM ID</th><th>Name</th><th>CPU %</th><th>RAM</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function wireHubVmsPanelActions(panel, tenantId, spokeId) {
  // Category tab switching
  panel.querySelectorAll("[data-hvmcat]").forEach(btn => {
    btn.addEventListener("click", () => {
      panel.querySelectorAll("[data-hvmcat]").forEach(b => b.classList.toggle("active", b === btn));
      panel.querySelectorAll("[id^=hub-vm-cat-panel-]").forEach(p => p.classList.add("hidden"));
      const target = panel.querySelector(`#hub-vm-cat-panel-${btn.dataset.hvmcat}`);
      if (target) target.classList.remove("hidden");
      const bulkBar = panel.querySelector("#hub-vm-bulk-bar");
      if (bulkBar) bulkBar.style.display = btn.dataset.hvmcat === "templates" ? "none" : "";
      const selAll = panel.querySelector("#hub-server-select-all");
      if (selAll) selAll.checked = false;
    });
  });

  // Column-header checkboxes
  panel.querySelectorAll(".hub-vm-th-check").forEach(thChk => {
    thChk.addEventListener("change", e => {
      panel.querySelectorAll(`#hub-vm-tbody-${thChk.dataset.cat} .hub-vm-check`)
        .forEach(chk => { chk.checked = e.target.checked; });
    });
  });

  // Select All (bulk bar)
  panel.querySelector("#hub-server-select-all")?.addEventListener("change", e => {
    const activeCat = panel.querySelector("[data-hvmcat].active")?.dataset.hvmcat;
    if (!activeCat) return;
    panel.querySelectorAll(`#hub-vm-cat-panel-${activeCat} .hub-vm-check`)
      .forEach(chk => { chk.checked = e.target.checked; });
  });

  // Per-VM action buttons
  wireHubVmPerRowActions(panel, tenantId, spokeId);

  // Reclone All Now
  panel.querySelector("#hub-spoke-reclone-now-btn")?.addEventListener("click", () => {
    if (!confirm("Reclone all VMs on this spoke?")) return;
    sendHubProxmoxCommand(tenantId, spokeId, "reclone_all", {});
  });
  panel.querySelector("#hub-spoke-reclone-clear-btn")?.addEventListener("click", async () => {
    const btn = panel.querySelector("#hub-spoke-reclone-clear-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Clearing…"; }
    try {
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/fleet-reclone-clear-spoke`, {
        method: "POST",
        body: { spoke_id: spokeId },
      });
      const data = await readJson(res);
      if (!res?.ok) throw new Error(data?.detail || "Unable to clear reclone state.");
      showToast("Queued reclone state clear for this spoke.", "ok");
      setTimeout(() => loadVmServer(true), 3000);
    } catch (err) {
      showToast(err?.message || "Unable to clear reclone state.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "✕ Clear Errors"; }
    }
  });

  // Per-spoke Auto-Provisioning toggle (VMs tab card)
  panel.querySelector("#hub-spoke-autoprov-toggle-btn")?.addEventListener("click", async () => {
    const btn = panel.querySelector("#hub-spoke-autoprov-toggle-btn");
    const currentVal = btn?.dataset.current || "off";
    const enabling = currentVal === "off";
    if (btn) { btn.disabled = true; btn.textContent = enabling ? "Enabling…" : "Disabling…"; }
    try {
      await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`, {
        method: "POST",
        body: { usb_auto_provision: enabling ? "on" : "off" },
      });
      showToast(`Auto-provisioning ${enabling ? "enabled" : "disabled"} for this spoke.`, "ok");
      await loadHubVmServerAggregateStatus();
      await loadVmServer(true);
    } catch (err) {
      showToast(err?.message || "Failed to update auto-provisioning.", "error");
      if (btn) { btn.disabled = false; btn.textContent = currentVal === "off" ? "Enable" : "Disable"; }
    }
  });

  function getCheckedVmids() {
    const activeCat = panel.querySelector("[data-hvmcat].active")?.dataset.hvmcat;
    if (!activeCat) return [];
    return [...panel.querySelectorAll(`#hub-vm-cat-panel-${activeCat} .hub-vm-check:checked`)]
      .map(chk => parseInt(chk.dataset.vmid, 10))
      .filter(v => !Number.isNaN(v));
  }

  panel.querySelector("#hub-server-bulk-start")?.addEventListener("click", async () => {
    const vmids = getCheckedVmids();
    if (!vmids.length) { showToast("No VMs selected.", "warn"); return; }
    for (const vmid of vmids) await sendHubProxmoxCommand(tenantId, spokeId, "start_vm", { vmid }, true);
    showToast(`Start queued for ${vmids.length} VM(s).`, "ok");
  });
  panel.querySelector("#hub-server-bulk-stop")?.addEventListener("click", async () => {
    const vmids = getCheckedVmids();
    if (!vmids.length) { showToast("No VMs selected.", "warn"); return; }
    for (const vmid of vmids) await sendHubProxmoxCommand(tenantId, spokeId, "stop_vm", { vmid }, true);
    showToast(`Stop queued for ${vmids.length} VM(s).`, "ok");
  });
  panel.querySelector("#hub-server-bulk-reclone")?.addEventListener("click", async () => {
    const vmids = getCheckedVmids();
    if (!vmids.length) { showToast("No VMs selected.", "warn"); return; }
    if (!confirm(`Reclone ${vmids.length} VM(s)?`)) return;
    for (const vmid of vmids) await sendHubProxmoxCommand(tenantId, spokeId, "reclone_vm", { vmid }, true);
    showToast(`Reclone queued for ${vmids.length} VM(s).`, "ok");
  });
  panel.querySelector("#hub-server-bulk-delete")?.addEventListener("click", async () => {
    const vmids = getCheckedVmids();
    if (!vmids.length) { showToast("No VMs selected.", "warn"); return; }
    if (!confirm(`Delete ${vmids.length} VM(s)? This cannot be undone.`)) return;
    for (const vmid of vmids) await sendHubProxmoxCommand(tenantId, spokeId, "delete_vm", { vmid }, true);
    showToast(`Delete queued for ${vmids.length} VM(s).`, "ok");
  });
}

function wireHubVmPerRowActions(panel, tenantId, spokeId) {
  panel.querySelectorAll(".hub-vm-action").forEach(btn => {
    btn.addEventListener("click", () => {
      const vmid = parseInt(btn.dataset.vmid, 10);
      sendHubProxmoxCommand(tenantId, spokeId, btn.dataset.action, { vmid });
    });
  });
  panel.querySelectorAll(".hub-vm-console-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const vmid = parseInt(btn.dataset.vmid, 10);
      const vmtype = btn.dataset.vmtype || "qemu";
      openHubVmConsole(tenantId, spokeId, vmid, vmtype);
    });
  });
}

async function openHubVmConsole(tenantId, spokeId, vmid, vmtype = "qemu") {
  try {
    showToast("Opening console…", "info");
    const response = await apiFetch(
      `/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/console/${encodeURIComponent(vmid)}?vmtype=${encodeURIComponent(vmtype)}`,
      { method: "POST" }
    );
    const data = await readJson(response);
    if (!data?.session_id) throw new Error(data?.detail || "No session_id in response");
    const token = authToken || sessionStorage.getItem("hub_token") || "";
    const url = `/console?session_id=${encodeURIComponent(data.session_id)}&token=${encodeURIComponent(token)}`;
    const win = window.open(url, "_blank", "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no");
    if (!win) showToast("Pop-up blocked — allow pop-ups for this site.", "warn");
  } catch (err) {
    showToast("Console error: " + (err.message || String(err)), "error");
  }
}

// ── USB (T2) tab ─────────────────────────────────────────────────────────────

function renderHubVmServerUsbPanel(host) {
  // parseJsonList lives in the spoke IIFE scope and is not accessible from the hub IIFE.
  // Use this local helper instead — handles both raw JSON strings and already-parsed arrays.
  function _parseList(val) {
    if (Array.isArray(val)) return val;
    try { const p = JSON.parse(val || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  // ── Extract all USB-related data from the host/proxmox payload ──────────────
  // The proxmox object carries the full spoke Proxmox telemetry relayed to the hub.
  const px = host.proxmox || {};
  const cfg = host.spoke_config || {};

  // Certified devices come from the spoke config stored on the hub.
  const certified = _parseList(cfg.usb_vidpids || "[]");
  // Raw USB state from the spoke — one entry per dongle↔VM assignment.
  const usbState = Array.isArray(px.usb_state) ? px.usb_state : [];
  // Physically-present dongles reported by the Proxmox agent.
  const presentUsb = Array.isArray(px.present_usb) ? px.present_usb : [];
  // Unknown (uncertified) devices detected on the spoke.
  const certifiedSet = new Set(certified.map(d => String(d?.vidpid || "").toLowerCase()).filter(Boolean));
  const ignoredSet  = new Set(_parseList(cfg.usb_ignored_vidpids || "[]").map(v => String(v || "").toLowerCase()).filter(Boolean));
  const unknownUsb  = (Array.isArray(px.unknown_usb) ? px.unknown_usb : [])
    .filter(d => {
      const v = String(d.vidpid || "").toLowerCase().trim();
      return v && !certifiedSet.has(v) && !ignoredSet.has(v);
    });
  // Set of bus paths that are currently physically present — used to detect missing dongles.
  const presentBusSet = new Set(presentUsb.map(p => String(p?.bus_path || "").trim()).filter(Boolean));
  // All VMs for name lookups.
  const allVms = Array.isArray(px.vms) ? px.vms : [];
  const vmMap  = new Map(allVms.map(v => [Number(v.vmid), v]));
  // Missing dongle timeout from spoke config (in minutes → convert to seconds for countdowns).
  const missingTimeoutSecs = (parseInt(cfg.usb_missing_timeout || "60", 10) || 60) * 60;

  // ── Stat pills ──────────────────────────────────────────────────────────────
  // Collect VMIDs whose dongles are missing (being torn down) so they're excluded
  // from the running count — the number reflects active, stable sim clients.
  const missingVmids = new Set(
    usbState
      .filter(item => item.missing_since && !presentBusSet.has(String(item?.bus_path || "").trim()))
      .map(item => Number(item.vmid))
      .filter(Boolean)
  );
  const runningVms = allVms.filter(v => v.status === "running" && !v.is_template && !missingVmids.has(Number(v.vmid)));
  const simRunning = runningVms.filter(v => v.name && v.name.startsWith("client-sim-")).length;
  const pillHtml = [
    `<span class="server-stat-pill" title="Running VMs with dongles present">🟢 ${runningVms.length} running VM${runningVms.length !== 1 ? "s" : ""}</span>`,
    simRunning > 0 ? `<span class="server-stat-pill">${simRunning} sim client${simRunning !== 1 ? "s" : ""}</span>` : "",
    `<span class="server-stat-pill">🔌 ${presentUsb.length} dongle${presentUsb.length !== 1 ? "s" : ""} present</span>`,
  ].filter(Boolean).join("");

  // ── Certified devices summary table ────────────────────────────────────────
  // Each row shows the per-VID:PID summary: which VMs have it, which are missing,
  // how many are available (present but not assigned).
  const certRows = certified.map(device => {
    const vidLower = String(device.vidpid || "").toLowerCase();
    const entries        = usbState.filter(item => (item.vidpid || "").toLowerCase() === vidLower);
    const missingEntries = entries.filter(item => item.missing_since && !presentBusSet.has(String(item?.bus_path || "").trim()));
    const activeEntries  = entries.filter(item => !missingEntries.includes(item));
    const total          = presentUsb.filter(p => (p.vidpid || "").toLowerCase() === vidLower).length;
    const available      = Math.max(0, total - activeEntries.length);

    // "Active VMs" cell: list of VMs using this dongle with status dots.
    const activeVmHtml = activeEntries.length === 0
      ? "—"
      : activeEntries.map(e => {
          const vm   = vmMap.get(Number(e.vmid));
          const name = escHtml(vm?.name || `VM ${e.vmid}`);
          const dot  = vm?.status === "running" ? "🟢" : "⚫";
          return `<div style="white-space:nowrap">${dot} ${name}</div>`;
        }).join("");

    // "Missing" cell: VMs whose dongle has been removed with a countdown to destruction.
    const missingHtml = missingEntries.length === 0
      ? "—"
      : `<div class="usb-missing-list">${missingEntries.map(item => {
            const mvm   = vmMap.get(Number(item.vmid));
            const mname = escHtml(mvm?.name || `VM ${item.vmid}`);
            return `<div class="usb-missing-item">🔴 ${mname} · <span data-missing-until="${Number(item.missing_since) + missingTimeoutSecs}"></span></div>`;
          }).join("")}</div>`;

    // Show hardware-detected name as a secondary line under the VID:PID.
    const hwName   = entries.find(e => e.name)?.name
                  || presentUsb.find(p => (p.vidpid || "").toLowerCase() === vidLower)?.name
                  || "";
    const vidHtml  = hwName
      ? `${escHtml(device.vidpid || "—")}<div class="muted" style="font-size:0.78rem;margin-top:2px;">${escHtml(hwName)}</div>`
      : escHtml(device.vidpid || "—");

    // Source badge: global devices are locked (managed by superadmin); tenant devices can be removed.
    const isGlobal  = device.source === "global";
    const sourceBadge = isGlobal
      ? `<span class="badge badge-blue" title="Globally certified by superadmin — applies to all tenants">🌐 global</span>`
      : `<span class="badge badge-grey" title="Certified by tenant admin">tenant</span>`;
    const removeBtn = isGlobal
      ? ""
      : `<button type="button" class="btn btn-danger btn-small" style="margin-left:4px;"
               data-hvmusb-action="decertify" data-vidpid="${escHtml(device.vidpid || '')}"
               title="Remove from tenant certified list">Remove</button>`;

    return `<tr>
      <td>${escHtml(device.label || device.vidpid || "—")}</td>
      <td>${vidHtml}</td>
      <td class="usb-type-${device.type || "wireless"}">${escHtml(device.type || "wireless")}</td>
      <td>${activeVmHtml}</td>
      <td>${missingHtml}</td>
      <td>${available > 0 ? `<span class="badge badge-green">${available}</span>` : '<span class="muted">—</span>'}</td>
      <td>${total}</td>
      <td>${sourceBadge}${removeBtn}</td>
    </tr>`;
  }).join("");

  // ── Unknown / uncertified devices section ──────────────────────────────────
  const unknownRows = unknownUsb.map(device => {
    const vid       = escHtml(device.vidpid || "");
    const nameLabel = escHtml(device.name || device.bus_path || "Unknown device");
    return `<tr>
      <td>${nameLabel}</td>
      <td>${vid || "—"}</td>
      <td class="usb-actions">
        <button type="button" class="btn btn-primary btn-small"
                data-hvmusb-action="certify" data-vidpid="${vid}" data-name="${nameLabel}">
          Add to certified
        </button>
        <button type="button" class="btn btn-secondary btn-small"
                data-hvmusb-action="ignore" data-vidpid="${vid}">
          Ignore
        </button>
      </td>
    </tr>`;
  }).join("");

  const unknownSection = unknownUsb.length === 0 ? "" : `
    <div class="setup-card setup-section-gap" style="margin-top:12px;">
      <div class="setup-card-header" style="padding:0 0 8px;">
        <h3>⚠️ Uncertified Devices Detected</h3>
        <p>These USB devices are connected on this spoke but not in the certified list.
           Adding to certified updates the tenant-wide list and queues a push to all spokes.</p>
      </div>
      <table class="data-table">
        <colgroup><col><col style="width:105px"><col style="width:300px"></colgroup>
        <thead><tr><th>Device</th><th>VID:PID</th><th>Actions</th></tr></thead>
        <tbody id="hub-usb-unknown-tbody">${unknownRows}</tbody>
      </table>
    </div>`;

  const ignoredList = _parseList(cfg.usb_ignored_vidpids || "[]")
    .map(v => String(v || "").trim())
    .filter(Boolean);
  const ignoredRows = ignoredList.map(vidpid => `<tr>
      <td><code>${escHtml(vidpid)}</code></td>
      <td>
        <button type="button" class="btn btn-secondary btn-small"
                data-hvmusb-action="unignore" data-vidpid="${escHtml(vidpid)}">
          Unignore
        </button>
      </td>
    </tr>`).join("");
  const ignoredSection = ignoredList.length === 0 ? "" : `
    <div class="setup-card setup-section-gap" style="margin-top:12px;">
      <div class="setup-card-header" style="padding:0 0 8px;">
        <h3>🚫 Ignored Devices (this spoke)</h3>
        <p>These devices are suppressed on this spoke only. Click Unignore to move them back to the uncertified list.</p>
      </div>
      <table class="data-table">
        <colgroup><col><col style="width:105px"><col style="width:100px"></colgroup>
        <thead><tr><th>VID:PID</th><th></th></tr></thead>
        <tbody id="hub-usb-ignored-tbody">
          ${ignoredRows}
        </tbody>
      </table>
    </div>`;
 
  // ── Auto-provisioning settings ──────────────────────────────────────────────
  // The spoke's USB auto-provisioning config is displayed as an editable form.
  // Changes are pushed directly to the spoke via the hub config-push API
  // (POST /{tenant_id}/spokes/{spoke_id}/config).
  const autoProvOn  = ["on", "true", "1", "enabled"].includes(String(cfg.usb_auto_provision || "off").toLowerCase());
  const simPhyVal   = cfg.usb_sim_phy || "wireless";
  const phyOptions  = ["wireless", "ethernet", "any"].map(v =>
    `<option value="${v}"${v === simPhyVal ? " selected" : ""}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
  ).join("");

  const settingsSection = `
    <div class="setup-card setup-section-gap" style="margin-top:12px;">
      <div class="setup-card-header">
        <h2>USB Auto-Provisioning</h2>
        <p>Configure this spoke's USB provisioning behavior. Changes are queued for delivery the next time the spoke checks in.</p>
      </div>
      <div class="setup-form">
        <div class="settings-section">

          <!-- Toggle row -->
          <label class="toggle-label" style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer;">
            <input type="checkbox" id="hvmusb-auto-provision"${autoProvOn ? " checked" : ""}>
            <span style="font-weight:500;">Auto-Provision VMs</span>
          </label>

          <!-- Row 1: Dongle Type · Missing Timeout · Max USB Slots · Max Reclones -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;">
            <div class="form-group">
              <label class="form-label" for="hvmusb-sim-phy">Preferred Dongle Type</label>
              <select id="hvmusb-sim-phy" class="form-input">${phyOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label" for="hvmusb-missing-timeout">Missing Timeout (min)</label>
              <input id="hvmusb-missing-timeout" class="form-input" type="number"
                     value="${escHtml(cfg.usb_missing_timeout || "60")}" min="1" placeholder="60">
              <span class="form-hint">Dongle absent this long → VM destroyed.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="hvmusb-max-slots">Max USB Slots</label>
              <input id="hvmusb-max-slots" class="form-input" type="number"
                     value="${escHtml(cfg.usb_max_slots || "24")}" min="1" max="256" placeholder="24">
              <span class="form-hint">Max concurrent USB-provisioned VMs.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="hvmusb-concurrency">Max Parallel Reclones</label>
              <input id="hvmusb-concurrency" class="form-input" type="number"
                     value="${escHtml(cfg.reclone_concurrency || "1")}" min="1" max="20" placeholder="1">
              <span class="form-hint">VMs to reclone or provision at once.</span>
            </div>
          </div>

          <!-- Row 2: CPU thresholds · Memory thresholds · Protected VMIDs -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
            <div class="form-group">
              <label class="form-label">CPU Thresholds (%)</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <label class="form-label" style="font-size:0.78rem;color:var(--muted);" for="hvmusb-cpu-prov-thr">Block above</label>
                  <input id="hvmusb-cpu-prov-thr" class="form-input" type="number"
                         value="${escHtml(cfg.cpu_provision_threshold || "80")}" min="0" max="100" placeholder="80">
                </div>
                <div>
                  <label class="form-label" style="font-size:0.78rem;color:var(--muted);" for="hvmusb-cpu-del-thr">Delete above</label>
                  <input id="hvmusb-cpu-del-thr" class="form-input" type="number"
                         value="${escHtml(cfg.cpu_delete_threshold || "90")}" min="0" max="100" placeholder="90">
                </div>
              </div>
              <span class="form-hint">1-hr avg CPU gates for provisioning and deletion.</span>
            </div>
            <div class="form-group">
              <label class="form-label">Memory Thresholds (%)</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <label class="form-label" style="font-size:0.78rem;color:var(--muted);" for="hvmusb-mem-prov-thr">Block above</label>
                  <input id="hvmusb-mem-prov-thr" class="form-input" type="number"
                         value="${escHtml(cfg.mem_provision_threshold || "80")}" min="0" max="100" placeholder="80">
                </div>
                <div>
                  <label class="form-label" style="font-size:0.78rem;color:var(--muted);" for="hvmusb-mem-del-thr">Delete above</label>
                  <input id="hvmusb-mem-del-thr" class="form-input" type="number"
                         value="${escHtml(cfg.mem_delete_threshold || "90")}" min="0" max="100" placeholder="90">
                </div>
              </div>
              <span class="form-hint">Same logic as CPU, applied to memory.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="hvmusb-protected-vmids">Protected VMIDs</label>
              <input id="hvmusb-protected-vmids" class="form-input" type="text"
                     value="${escHtml(cfg.protected_vmids || "")}" placeholder="e.g. 101, 102, 200">
              <span class="form-hint">Comma-separated VMIDs immune from start/stop/reclone/delete. VM 1001 is always protected.</span>
            </div>
          </div>

        </div>
        <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
          <button type="button" class="btn btn-primary" id="hvmusb-save-btn">Save Settings</button>
          <span id="hvmusb-save-msg" style="font-size:0.85rem;color:var(--muted);"></span>
        </div>
      </div>
    </div>`;

  // ── Assemble final HTML ─────────────────────────────────────────────────────
  return `
    <div class="setup-card setup-section-gap">
      <div class="setup-card-header">
        <h2>USB Devices</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${pillHtml}</div>
      </div>
      ${certified.length === 0 && usbState.length === 0 && presentUsb.length === 0
        ? '<div class="empty-state" style="padding:24px;">No certified USB devices configured for this spoke.</div>'
        : `<div class="table-scroll">
            <table class="data-table">
              <colgroup>
                <col><!-- Device: flexible -->
                <col style="width:115px"><!-- VID:PID -->
                <col style="width:90px"><!-- Type -->
                <col style="width:200px"><!-- Active VMs -->
                <col style="width:200px"><!-- Missing -->
                <col style="width:90px"><!-- Available -->
                <col style="width:65px"><!-- Count -->
                <col style="width:130px"><!-- Source/Actions -->
              </colgroup>
              <thead>
                <tr>
                  <th>Device</th><th>VID:PID</th><th>Type</th>
                  <th title="VMs with this USB device actively assigned">Active VMs</th>
                  <th>Missing Dongle</th><th>Available</th><th>Count</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>${certRows || '<tr><td colspan="8" class="empty-state">No certified devices configured.</td></tr>'}</tbody>
            </table>
           </div>`}
    </div>
    ${unknownSection}
    ${ignoredSection}
    ${settingsSection}`;
}

// Wire action handlers for the hub VM-server USB tab panel.
// Handles: certify/ignore buttons on uncertified devices, and the save button
// for the auto-provisioning settings form.
function wireHubVmServerUsbPanel(panel, tenantId, spokeId, host) {
  // ── Local JSON list helper (spoke-scope parseJsonList not accessible here) ────
  function _parseList(val) {
    if (Array.isArray(val)) return val;
    try { const p = JSON.parse(val || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  }

  // ── Fetch annotated certified list (includes source='global'/'tenant') ───────
  // The spoke_config only carries the merged list without source annotations.
  // We fetch from the tenant endpoint on mount so source badges are accurate.
  (async () => {
    try {
      const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/usb-vidpids`);
      if (!res?.ok) return;
      const data = await readJson(res);
      const annotated = Array.isArray(data?.usb_vidpids) ? data.usb_vidpids : [];
      // Re-render just the certified devices tbody rows using the annotated list.
      const tbody = panel.querySelector("table tbody");
      if (!tbody || !annotated.length) return;
      // Re-render rows in place — the original render already laid out the structure.
      const cfg = host.spoke_config || {};
      const usbState    = Array.isArray((host.proxmox || {}).usb_state) ? (host.proxmox || {}).usb_state : [];
      const presentUsb  = Array.isArray((host.proxmox || {}).present_usb) ? (host.proxmox || {}).present_usb : [];
      const allVms      = Array.isArray((host.proxmox || {}).vms) ? (host.proxmox || {}).vms : [];
      const vmMap       = new Map(allVms.map(v => [Number(v.vmid), v]));
      const presentBusSet   = new Set(presentUsb.map(p => String(p?.bus_path || "").trim()).filter(Boolean));
      const missingVmids    = new Set(usbState.filter(i => i.missing_since && !presentBusSet.has(String(i?.bus_path || "").trim())).map(i => Number(i.vmid)).filter(Boolean));
      const missingTimeout  = (parseInt(cfg.usb_missing_timeout || "60", 10) || 60) * 60;

      tbody.innerHTML = annotated.map(device => {
        const vidLower = String(device.vidpid || "").toLowerCase();
        const entries        = usbState.filter(i => (i.vidpid || "").toLowerCase() === vidLower);
        const missingEntries = entries.filter(i => i.missing_since && !presentBusSet.has(String(i?.bus_path || "").trim()));
        const activeEntries  = entries.filter(i => !missingEntries.includes(i));
        const total          = presentUsb.filter(p => (p.vidpid || "").toLowerCase() === vidLower).length;
        const available      = Math.max(0, total - activeEntries.length);
        const hwName         = entries.find(e => e.name)?.name || presentUsb.find(p => (p.vidpid || "").toLowerCase() === vidLower)?.name || "";
        const vidHtml        = hwName
          ? `${escHtml(device.vidpid || "—")}<div class="muted" style="font-size:0.78rem;margin-top:2px;">${escHtml(hwName)}</div>`
          : escHtml(device.vidpid || "—");
        const activeVmHtml = activeEntries.length === 0 ? "—"
          : activeEntries.map(e => {
              const vm = vmMap.get(Number(e.vmid));
              return `<div style="white-space:nowrap">${vm?.status === "running" ? "🟢" : "⚫"} ${escHtml(vm?.name || `VM ${e.vmid}`)}</div>`;
            }).join("");
        const missingHtml = missingEntries.length === 0 ? "—"
          : `<div class="usb-missing-list">${missingEntries.map(i => {
                const mvm = vmMap.get(Number(i.vmid));
                return `<div class="usb-missing-item">🔴 ${escHtml(mvm?.name || `VM ${i.vmid}`)} · <span data-missing-until="${Number(i.missing_since) + missingTimeout}"></span></div>`;
              }).join("")}</div>`;
        const isGlobal    = device.source === "global";
        const sourceBadge = isGlobal
          ? `<span class="badge badge-blue" title="Globally certified by superadmin">🌐 global</span>`
          : `<span class="badge badge-grey" title="Certified by tenant admin">tenant</span>`;
        const removeBtn = isGlobal ? ""
          : `<button type="button" class="btn btn-danger btn-small" style="margin-left:4px;"
                     data-hvmusb-action="decertify" data-vidpid="${escHtml(device.vidpid || '')}"
                     title="Remove from tenant certified list">Remove</button>`;
        return `<tr>
          <td>${escHtml(device.label || device.vidpid || "—")}</td>
          <td>${vidHtml}</td>
          <td class="usb-type-${device.type || "wireless"}">${escHtml(device.type || "wireless")}</td>
          <td>${activeVmHtml}</td>
          <td>${missingHtml}</td>
          <td>${available > 0 ? `<span class="badge badge-green">${available}</span>` : '<span class="muted">—</span>'}</td>
          <td>${total}</td>
          <td>${sourceBadge}${removeBtn}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="8" class="empty-state">No certified devices configured.</td></tr>`;

      const certifiedSet = new Set(
        annotated
          .map(device => String(device?.vidpid || "").trim().toLowerCase())
          .filter(Boolean)
      );
      const unknownTbody = panel.querySelector("#hub-usb-unknown-tbody");
      if (unknownTbody) {
        Array.from(unknownTbody.querySelectorAll("tr")).forEach(row => {
          const rowVidpid = String(row.querySelector("[data-vidpid]")?.dataset.vidpid || "").trim().toLowerCase();
          if (rowVidpid && certifiedSet.has(rowVidpid)) {
            row.remove();
          }
        });
        if (!unknownTbody.querySelector("tr")) {
          unknownTbody.closest(".setup-card")?.remove();
        }
      }

      // ── Show present_usb devices not in the hub's certified list ──────────────
      // When hub_config_enabled=false the spoke manages its own local cert list.
      // Devices certified only on the spoke (not the hub) never appear in unknown_usb,
      // so the hub panel would silently omit them. Compute the gap from present_usb.
      const spokeCfg    = host.spoke_config || {};
      const ignoredSet  = new Set(
        _parseList(spokeCfg.usb_ignored_vidpids || "[]")
          .map(v => String(v || "").trim().toLowerCase())
          .filter(Boolean)
      );
      const presentUsb2 = Array.isArray((host.proxmox || {}).present_usb)
        ? (host.proxmox || {}).present_usb : [];

      // Group by vidpid; skip if already hub-certified or ignored.
      const hubUncertifiedMap = new Map();
      for (const p of presentUsb2) {
        const vp = String(p?.vidpid || "").trim().toLowerCase();
        if (!vp || certifiedSet.has(vp) || ignoredSet.has(vp)) continue;
        if (!hubUncertifiedMap.has(vp)) {
          hubUncertifiedMap.set(vp, { vidpid: vp, name: p.name || "", count: 0 });
        }
        hubUncertifiedMap.get(vp).count++;
      }

      if (hubUncertifiedMap.size > 0) {
        // Re-find or create the uncertified card (it may have been removed above).
        let unknownTbody2 = panel.querySelector("#hub-usb-unknown-tbody");
        if (!unknownTbody2) {
          const newSection = document.createElement("div");
          newSection.className = "setup-card setup-section-gap";
          newSection.style.marginTop = "12px";
          newSection.innerHTML = `
            <div class="setup-card-header" style="padding:0 0 8px;">
              <h3>⚠️ Uncertified Devices Detected</h3>
              <p>These USB devices are connected on this spoke but not in the hub's certified list.
                 Adding to certified updates the tenant-wide list and queues a push to all spokes.</p>
            </div>
            <table class="data-table">
              <colgroup><col><col style="width:105px"><col style="width:300px"></colgroup>
              <thead><tr><th>Device</th><th>VID:PID</th><th>Actions</th></tr></thead>
              <tbody id="hub-usb-unknown-tbody"></tbody>
            </table>`;
          // Insert after the first setup-card (the certified table).
          const certCard = panel.querySelector(".setup-card");
          if (certCard?.nextSibling) {
            certCard.parentNode.insertBefore(newSection, certCard.nextSibling);
          } else {
            panel.appendChild(newSection);
          }
          unknownTbody2 = newSection.querySelector("#hub-usb-unknown-tbody");
        }
        // Don't duplicate rows already rendered (e.g. from the initial unknown_usb pass).
        const existingVidpids = new Set(
          Array.from(unknownTbody2.querySelectorAll("[data-vidpid]"))
            .map(el => String(el.dataset.vidpid || "").trim().toLowerCase())
            .filter(Boolean)
        );
        for (const [, info] of hubUncertifiedMap) {
          const vp = info.vidpid.toLowerCase();
          if (existingVidpids.has(vp)) continue;
          const vid       = escHtml(info.vidpid);
          const nameLabel = escHtml(info.name || info.vidpid);
          const countBadge = info.count > 1
            ? ` <span class="badge badge-grey">${info.count}×</span>` : "";
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${nameLabel}${countBadge}
              <span class="muted" style="font-size:0.78rem;margin-left:4px;">(locally certified on spoke)</span></td>
            <td data-vidpid="${vid}">${vid}</td>
            <td class="usb-actions">
              <button type="button" class="btn btn-primary btn-small"
                      data-hvmusb-action="certify" data-vidpid="${vid}" data-name="${nameLabel}">
                Add to certified
              </button>
              <button type="button" class="btn btn-secondary btn-small"
                      data-hvmusb-action="ignore" data-vidpid="${vid}">
                Ignore
              </button>
            </td>`;
          unknownTbody2.appendChild(row);
        }
      }
    } catch (_) { /* non-fatal: original render already shows unadorned rows */ }
  })();

  // ── Certify / Ignore / Decertify buttons ─────────────────────────────────────
  // "Certify"   — POST /{tenant_id}/usb-vidpids  (tenant admin, no superadmin required)
  // "Ignore"    — POST /{tenant_id}/spokes/{spoke_id}/config (spoke-local ignore list)
  // "Decertify" — DELETE /{tenant_id}/usb-vidpids/{vidpid} (tenant admin)
  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-hvmusb-action]");
    if (!btn) return;
    const action = btn.dataset.hvmusbAction;
    const vidpid = btn.dataset.vidpid;
    const name   = btn.dataset.name || vidpid;
    if (!vidpid) return;

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = "…";

    try {
      if (action === "certify") {
        // POST to the tenant-level USB endpoint — does NOT require superadmin.
        const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/usb-vidpids`, {
          method: "POST",
          body: { vidpid: vidpid.toLowerCase(), type: "wireless", label: name || vidpid },
        });
        const data = await readJson(res);
        if (!res?.ok) throw new Error(data?.detail || "Could not add to certified list");
        if (data.status === "already_global") {
          showToast(`${name || vidpid} is already globally certified`, "ok");
        } else {
          showToast(`${name || vidpid} added to certified list and queued for all spokes`, "ok");
        }
      } else if (action === "ignore") {
        // Add to this spoke's ignored list only.
        const cfg     = host.spoke_config || {};
        const current = _parseList(cfg.usb_ignored_vidpids || "[]");
        if (!current.some(v => String(v || "").toLowerCase() === String(vidpid || "").toLowerCase())) {
          current.push(vidpid.toLowerCase());
        }
        const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`, {
          method: "POST",
          body: { usb_ignored_vidpids: JSON.stringify(current) },
        });
        const data = await readJson(res);
        if (!res?.ok) throw new Error(data?.detail || "Could not update spoke config");
        showToast(`${vidpid} added to ignore list for this spoke`, "ok");
      } else if (action === "unignore") {
        // Remove vidpid from this spoke's ignored list.
        const cfg     = host.spoke_config || {};
        const current = _parseList(cfg.usb_ignored_vidpids || "[]");
        const updated = current.filter(v => String(v || "").toLowerCase() !== String(vidpid || "").toLowerCase());
        const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`, {
          method: "POST",
          body: { usb_ignored_vidpids: JSON.stringify(updated) },
        });
        const data = await readJson(res);
        if (!res?.ok) throw new Error(data?.detail || "Could not update spoke config");
        showToast(`${vidpid} removed from ignore list`, "ok");
        host.spoke_config = { ...(host.spoke_config || {}), usb_ignored_vidpids: JSON.stringify(updated) };
        btn.closest("tr")?.remove();
        const tbody = document.getElementById("hub-usb-ignored-tbody");
        if (tbody && !tbody.childElementCount) {
          tbody.closest(".setup-card")?.remove();
        }
        return;
      } else if (action === "decertify") {
        // Remove from tenant certified list — does NOT require superadmin.
        const encoded = encodeURIComponent(vidpid);
        const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/usb-vidpids/${encoded}`, {
          method: "DELETE",
        });
        const data = await readJson(res);
        if (!res?.ok) throw new Error(data?.detail || "Could not remove from certified list");
        showToast(`${vidpid} removed from certified list and queued for all spokes`, "ok");
      }
      // Remove the row from the DOM so the change is immediately visible.
      btn.closest("tr")?.remove();
      const tbody = document.getElementById("hub-usb-unknown-tbody");
      if (tbody && !tbody.childElementCount) {
        tbody.closest(".setup-card")?.remove();
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  // ── Auto-provisioning settings save ─────────────────────────────────────────
  // Collects all editable USB settings and pushes them to the spoke via the
  // hub's config-push endpoint (POST /{tenant_id}/spokes/{spoke_id}/config).
  const saveBtn = panel.querySelector("#hvmusb-save-btn");
  const saveMsg = panel.querySelector("#hvmusb-save-msg");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      if (saveMsg) saveMsg.textContent = "";
      try {
        const autoProvision  = panel.querySelector("#hvmusb-auto-provision")?.checked ? "on" : "off";
        const simPhy         = panel.querySelector("#hvmusb-sim-phy")?.value || "wireless";
        const missingTimeout = String(parseInt(panel.querySelector("#hvmusb-missing-timeout")?.value || "60", 10) || 60);
        const maxSlots       = String(parseInt(panel.querySelector("#hvmusb-max-slots")?.value || "24", 10) || 24);
        const cpuProvThr     = String(parseInt(panel.querySelector("#hvmusb-cpu-prov-thr")?.value || "80", 10) || 80);
        const cpuDelThr      = String(parseInt(panel.querySelector("#hvmusb-cpu-del-thr")?.value || "90", 10) || 90);
        const memProvThr     = String(parseInt(panel.querySelector("#hvmusb-mem-prov-thr")?.value || "80", 10) || 80);
        const memDelThr      = String(parseInt(panel.querySelector("#hvmusb-mem-del-thr")?.value || "90", 10) || 90);
        const concurrency    = String(parseInt(panel.querySelector("#hvmusb-concurrency")?.value || "1", 10) || 1);
        const protectedVmids = String(panel.querySelector("#hvmusb-protected-vmids")?.value || "").trim();

        // apiFetch automatically adds the Authorization header and JSON-encodes plain objects.
        const res  = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`, {
          method: "POST",
          body: {
            usb_auto_provision:       autoProvision,
            usb_sim_phy:              simPhy,
            usb_missing_timeout:      missingTimeout,
            usb_max_slots:            maxSlots,
            cpu_provision_threshold:  cpuProvThr,
            cpu_delete_threshold:     cpuDelThr,
            mem_provision_threshold:  memProvThr,
            mem_delete_threshold:     memDelThr,
            reclone_concurrency:      concurrency,
            protected_vmids:          protectedVmids,
          },
        });
        const data = await readJson(res);
        if (!res?.ok) throw new Error(data?.detail || "Save failed");
        if (saveMsg) saveMsg.textContent = "✓ Saved — changes queued for spoke delivery";
        if (saveMsg?.style) saveMsg.style.color = "var(--accent-green)";
        showToast("USB settings saved and queued for spoke delivery", "ok");
        // Refresh fleet pill and per-spoke data so both controls stay in sync.
        setTimeout(() => { loadHubVmServerAggregateStatus(); loadVmServer(true); }, 500);
      } catch (err) {
        if (saveMsg) {
          saveMsg.textContent = `Error: ${err.message}`;
          if (saveMsg.style) saveMsg.style.color = "var(--text-danger)";
        }
        showToast(`Error saving USB settings: ${err.message}`, "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Settings";
      }
    });
  }

  // ── Missing dongle countdown timers ─────────────────────────────────────────
  // Update all [data-missing-until] spans every second while the panel is visible.
  function tickCountdowns() {
    panel.querySelectorAll("[data-missing-until]").forEach(node => {
      const until     = Number(node.dataset.missingUntil || 0) * 1000;
      const remaining = Math.max(0, Math.floor((until - Date.now()) / 1000));
      node.textContent = remaining > 0 ? `${Math.ceil(remaining / 60)}m remaining before decommission` : "Ready to decommission";
    });
  }
  tickCountdowns();
  // Store the interval on the panel element so it can be cleared if the panel is torn down.
  panel._usbCountdownTimer = window.setInterval(tickCountdowns, 1000);
}

// ── IoT (T3) tab ─────────────────────────────────────────────────────────────

function renderHubVmServerIoTPanel(spokeId, iotVms) {
  return `
    <div class="setup-card setup-section-gap">
      <div class="setup-card-header">
        <h2>IoT (T3) Clients</h2>
        <p>VMs with PCI passthrough of a T3 IoT adapter (VID 168c:0034).</p>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>VMID</th><th>Name</th><th>Type</th><th>Status</th><th>PCI Addrs</th><th>Actions</th></tr></thead>
          <tbody>
            ${iotVms.length
              ? iotVms.map(vm => `<tr>
                  <td>${escHtml(String(vm.vmid ?? "—"))}</td>
                  <td>${escHtml(vm.name || "—")}</td>
                  <td>${escHtml(vm.type || "qemu")}</td>
                  <td>${_hubVmStatusDot(vm)} ${escHtml(_hubVmStatusLabel(vm))}</td>
                  <td style="font-size:.8rem;color:var(--muted);">${escHtml((vm.pci_passthrough_addrs || []).join(", ") || "—")}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn-icon hub-vm-action" data-action="start_vm"   data-vmid="${escHtml(String(vm.vmid))}" title="Start">▶</button>
                    <button class="btn-icon hub-vm-action" data-action="stop_vm"    data-vmid="${escHtml(String(vm.vmid))}" title="Stop">■</button>
                    <button class="btn-icon hub-vm-action" data-action="reclone_vm" data-vmid="${escHtml(String(vm.vmid))}" title="Reclone">↺</button>
                  </td>
                </tr>`).join("")
              : `<tr><td colspan="6" class="empty-state">No IoT (T3) devices detected on this node.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Other tab ─────────────────────────────────────────────────────────────────

function renderHubVmServerOtherPanel(spokeId, otherVms) {
  return `
    <div class="setup-card setup-section-gap">
      <div class="setup-card-header">
        <h2>Other VMs &amp; Containers</h2>
        <p>VMs and LXC containers not classified as USB (T2) or IoT (T3).</p>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>VMID</th><th>Name</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${otherVms.length
              ? otherVms.map(vm => `<tr>
                  <td>${escHtml(String(vm.vmid ?? "—"))}</td>
                  <td>${escHtml(vm.name || "—")}</td>
                  <td>${escHtml(vm.type || "qemu")}</td>
                  <td>${_hubVmStatusDot(vm)} ${escHtml(_hubVmStatusLabel(vm))}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn-icon hub-vm-action" data-action="start_vm"   data-vmid="${escHtml(String(vm.vmid))}" title="Start">▶</button>
                    <button class="btn-icon hub-vm-action" data-action="stop_vm"    data-vmid="${escHtml(String(vm.vmid))}" title="Stop">■</button>
                    <button class="btn-icon hub-vm-action" data-action="reclone_vm" data-vmid="${escHtml(String(vm.vmid))}" title="Reclone">↺</button>
                  </td>
                </tr>`).join("")
              : `<tr><td colspan="5" class="empty-state">No other VMs or containers.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── VirtualHere tab ───────────────────────────────────────────────────────────

function renderHubVmServerVhPanel(px) {
  const vh = px.vh_devices || {};
  const devices = Array.isArray(vh.devices) ? vh.devices : [];
  const svcActive = vh.vh_service_active;
  const connected = vh.vh_connected;
  const count = vh.count ?? devices.length;
  const inUse = devices.filter(d => d.auto_use).length;
  const available = devices.filter(d => !d.auto_use).length;

  const pills = [
    svcActive != null ? (svcActive ? "🟢 Service running" : "🔴 Service stopped") : null,
    vh.auto_use_all != null ? (vh.auto_use_all ? "⚡ Auto-Use All: ON" : "⚫ Auto-Use All: OFF") : null,
    connected
      ? (count > 0 ? `🔌 ${count} device${count !== 1 ? "s" : ""} — ${inUse} in use, ${available} available` : "⚫ No VH devices detected")
      : "⚫ Not connected to VH server",
  ].filter(Boolean).map(l => `<span class="server-stat-pill">${l}</span>`).join("");

  let devicesHtml = "";
  if (!devices.length) {
    devicesHtml = '<p class="muted" style="padding:8px 0;">No VirtualHere adapters found. Ensure the VH client service is running and connected to a server.</p>';
  } else {
    const byServer = new Map();
    devices.forEach(d => {
      const srv = d.server || "Unknown Server";
      if (!byServer.has(srv)) byServer.set(srv, []);
      byServer.get(srv).push(d);
    });
    byServer.forEach((devs, server) => {
      devicesHtml += `<div style="margin-bottom:16px;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Server: ${escHtml(server)}</div>
        <table class="data-table">
          <thead><tr><th>Adapter</th><th>Address</th><th>Vendor</th><th>VID:PID</th><th>Serial</th><th>Status</th></tr></thead>
          <tbody>${devs.map(d => `<tr>
            <td><strong>${escHtml(d.name || "Unknown")}</strong></td>
            <td><code>${escHtml(d.address || "—")}</code></td>
            <td>${escHtml(d.vendor || "—")}</td>
            <td>${d.vendor_id && d.product_id ? `<code>${escHtml(d.vendor_id)}:${escHtml(d.product_id)}</code>` : "—"}</td>
            <td><code>${escHtml(d.serial || "—")}</code></td>
            <td>${d.auto_use
              ? `<span class="badge badge-green">In Use${d.in_use_by ? ` by ${escHtml(d.in_use_by)}` : ""}</span>`
              : "<span class=\"badge badge-grey\">Available</span>"}</td>
          </tr>`).join("")}</tbody>
        </table></div>`;
    });
  }

  return `
    <div class="setup-card setup-section-gap">
      <div class="setup-card-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div>
          <h2>🔌 VirtualHere Devices</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;">${pills || '<span class="server-stat-pill">No VH data reported by spoke.</span>'}</div>
        </div>
      </div>
      <div style="margin-top:12px;">${devicesHtml}</div>
    </div>`;
}

// ── Command Queue tab ─────────────────────────────────────────────────────────

function renderHubVmServerCommandQueuePanel() {
  return `
    <div class="setup-card setup-section-gap">
      <div class="setup-card-header"><h2>📨 Command Queue</h2></div>
      <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px;">
        <div class="form-group" style="min-width:160px;">
          <label>Target</label>
          <select id="hub-spoke-cmd-target">
            <option value="all">— All Clients —</option>
            <option value="proxmox">Proxmox Host</option>
          </select>
        </div>
        <div class="form-group" style="min-width:160px;">
          <label>Action</label>
          <select id="hub-spoke-cmd-action">
            <optgroup label="Client Actions">
              <option value="restart_sim">Restart Simulation</option>
              <option value="reboot">Reboot Device</option>
              <option value="update_now">Force Update</option>
              <option value="kill_switch">Kill Switch</option>
            </optgroup>
            <optgroup label="Proxmox Actions">
              <option value="reclone_vms">Reclone VMs</option>
              <option value="snapshot_vms">Snapshot VMs</option>
              <option value="start_vms">Start VMs</option>
              <option value="stop_vms">Stop VMs</option>
            </optgroup>
          </select>
        </div>
        <button class="btn btn-primary"   id="hub-spoke-cmd-send-btn"  type="button">Send Command</button>
        <div class="form-group" style="min-width:200px;margin-left:auto;">
          <label>Search history</label>
          <input type="search" id="hub-spoke-cmd-search" class="form-input" placeholder="Filter by target, action, result…">
        </div>
        <button class="btn btn-secondary" id="hub-spoke-cmd-clear-btn" type="button">Clear History</button>
      </div>
      <div id="hub-spoke-cmd-msg" class="form-msg" style="margin-bottom:6px;"></div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Target</th><th>Action</th><th>Payload</th><th>Status</th><th>Age</th><th>Result</th></tr></thead>
          <tbody id="hub-spoke-cmd-tbody"></tbody>
        </table>
      </div>
      <div id="hub-spoke-cmd-empty" style="text-align:center;color:var(--muted);padding:16px;display:none;">No commands yet.</div>
    </div>`;
}

async function loadHubSpokeCommands(tenantId, spokeId) {
  const tbody = document.getElementById("hub-spoke-cmd-tbody");
  const empty = document.getElementById("hub-spoke-cmd-empty");
  const searchInput = document.getElementById("hub-spoke-cmd-search");
  if (!tbody) return;

  // Wire search input once
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = "1";
    searchInput.addEventListener("input", () => loadHubSpokeCommands(tenantId, spokeId));
  }

  const query = (searchInput?.value || "").trim().toLowerCase();
  try {
    const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/commands?spoke_id=${encodeURIComponent(spokeId)}`);
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? "?"}`);
    const allCommands = await res.json();
    const commands = query
      ? allCommands.filter(cmd =>
          (cmd.target || "").toLowerCase().includes(query) ||
          (cmd.type || "").toLowerCase().includes(query) ||
          JSON.stringify(cmd.payload || {}).toLowerCase().includes(query) ||
          (cmd.status || "").toLowerCase().includes(query) ||
          (cmd.result?.detail || "").toLowerCase().includes(query)
        )
      : allCommands;
    if (empty) empty.style.display = commands.length ? "none" : "";
    if (!commands.length) { tbody.innerHTML = ""; return; }
    const typeLabels = {
      restart_sim: "Restart Simulation", reboot: "Reboot Device",
      update_now: "Force Update", kill_switch: "Kill Switch",
      reclone_vms: "Reclone VMs", snapshot_vms: "Snapshot VMs",
      start_vms: "Start VMs", stop_vms: "Stop VMs",
      proxmox_reclone_all: "Reclone All VMs", proxmox_reclone_vm: "Reclone VM",
      start_vm: "Start VM", stop_vm: "Stop VM", delete_vm: "Delete VM",
    };
    tbody.innerHTML = commands.map(cmd => {
      const statusClass = cmd.status === "queued" ? "badge-blue" : cmd.status === "acked" ? "badge-green" : "badge-grey";
      return `<tr>
        <td>${escHtml(cmd.target || "spoke")}</td>
        <td>${escHtml(typeLabels[cmd.type] || cmd.type)}</td>
        <td style="font-size:0.8rem;">${escHtml(Object.keys(cmd.payload || {}).length ? JSON.stringify(cmd.payload) : "—")}</td>
        <td><span class="badge ${statusClass}">${escHtml(cmd.status || "—")}</span></td>
        <td>${relativeTime(cmd.created_at)}</td>
        <td>${escHtml(cmd.result?.detail || "—")}</td>
      </tr>`;
    }).join("");
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error loading commands: ${escHtml(err.message)}</td></tr>`;
  }
}

function wireHubCommandQueuePanel(panel, tenantId, spokeId) {
  panel.querySelector("#hub-spoke-cmd-send-btn")?.addEventListener("click", async () => {
    const type = panel.querySelector("#hub-spoke-cmd-action")?.value || "restart_sim";
    const msg = panel.querySelector("#hub-spoke-cmd-msg");
    try {
      await sendCommandToSpoke(tenantId, spokeId, type);
      if (msg) { msg.textContent = "Command queued."; msg.className = "form-msg success"; }
      loadHubSpokeCommands(tenantId, spokeId);
    } catch (err) {
      if (msg) { msg.textContent = `Error: ${err.message}`; msg.className = "form-msg error"; }
    }
  });
  panel.querySelector("#hub-spoke-cmd-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear command queue for this spoke?")) return;
    const res = await apiFetch(
      `/api/${encodeURIComponent(tenantId)}/commands?spoke_id=${encodeURIComponent(spokeId)}`,
      { method: "DELETE" }
    );
    if (res?.ok) loadHubSpokeCommands(tenantId, spokeId);
    else showToast("Failed to clear command queue.", "error");
  });
}

// ── Details tab ───────────────────────────────────────────────────────────────

function renderHubVmServerDetailsPanel(px, host) {
  const node = px.node || {};
  const cpu = node.cpu_percent != null
    ? `${Number(node.cpu_percent).toFixed(1)}%`
    : node.cpu != null ? `${Number(node.cpu).toFixed(1)}%` : "—";
  const memUsed = node.mem_used_kb ? fmtSizeKB(node.mem_used_kb)
    : node.mem ? fmtSize(Number(node.mem) * 1024 * 1024) : "—";
  const memTotal = node.mem_total_kb ? fmtSizeKB(node.mem_total_kb)
    : node.maxmem ? fmtSize(Number(node.maxmem) * 1024 * 1024) : "—";
  const storageRows = Array.isArray(node.storage) ? node.storage.map(s => {
    const used = fmtSizeKB(s.used || 0);
    const total = fmtSizeKB(s.total || 0);
    const pct = s.total ? Math.round(((s.used || 0) / s.total) * 100) : 0;
    return `<tr><th>Storage (${escHtml(s.storage || "disk")})</th><td>${used} / ${total} (${pct}%)</td></tr>`;
  }).join("") : "";
  const lastSeen = px.last_seen
    ? new Date(typeof px.last_seen === "number" ? px.last_seen * 1000 : px.last_seen).toLocaleString()
    : "—";
  const rttMs = host.hub_rtt_ms ?? host.telemetry?.hub_rtt_ms;
  const procMs = host.hub_processing_ms ?? host.telemetry?.hub_processing_ms;
  const rttColor = rttMs == null ? "" : rttMs < 500 ? "var(--accent-green)" : rttMs < 2000 ? "var(--accent-orange,#f39c12)" : "var(--danger)";
  const procColor = procMs == null ? "" : procMs < 500 ? "var(--accent-green)" : procMs < 2000 ? "var(--accent-orange,#f39c12)" : "var(--danger)";
  const rttCell = rttMs != null ? `<span style="color:${rttColor};font-weight:600;">${rttMs} ms</span>` : `<span class="muted">—</span>`;
  const procCell = procMs != null ? `<span style="color:${procColor};font-weight:600;">${procMs} ms</span>` : `<span class="muted">—</span>`;

  return `
    <div class="setup-card setup-section-gap">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;">
          <h2 style="margin:0;">${escHtml(node.hostname || node.node || host.spoke_name || "Proxmox")}</h2>
          <span class="server-stat-pill">⚡ CPU: ${cpu}</span>
          <span class="server-stat-pill">🧠 RAM: ${memUsed} / ${memTotal}</span>
          ${px.cpu_1h_avg != null ? `<span class="server-stat-pill" title="1-hour rolling average">📊 CPU avg: ${Number(px.cpu_1h_avg).toFixed(1)}%</span>` : ''}
          ${px.mem_1h_avg != null ? `<span class="server-stat-pill" title="1-hour rolling average">📊 Mem avg: ${Number(px.mem_1h_avg).toFixed(1)}%</span>` : ''}
        </div>
      </div>
      <table class="data-table">
        <tbody>
          <tr><th>Proxmox Connected</th><td>${px.connected ? "🟢 Yes" : "⚫ No"}</td></tr>
          <tr><th>Agent Version</th><td>${escHtml(px.agent_version || "—")}</td></tr>
          <tr><th>PVE Version</th><td>${escHtml(px.pve_version || "—")}</td></tr>
          <tr><th>Node</th><td>${escHtml(node.node || node.hostname || "—")}</td></tr>
          <tr><th>CPU</th><td>${cpu}</td></tr>
          <tr><th>CPU (1h avg)</th><td>${px.cpu_1h_avg != null ? `${Number(px.cpu_1h_avg).toFixed(1)}%` : '<span class="muted">warming up…</span>'}</td></tr>
          <tr><th>Memory</th><td>${memUsed} / ${memTotal}</td></tr>
          <tr><th>Memory (1h avg)</th><td>${px.mem_1h_avg != null ? `${Number(px.mem_1h_avg).toFixed(1)}%` : '<span class="muted">warming up…</span>'}</td></tr>
          ${storageRows}
          <tr><th>VMs</th><td>${escHtml(String(px.vm_count ?? "—"))} total, ${escHtml(String(px.running_count ?? "—"))} running</td></tr>
          <tr><th>Last Agent Check-in</th><td>${escHtml(lastSeen)}</td></tr>
          <tr><th>Hub Round-Trip (RTT)</th><td>${rttCell}</td></tr>
          <tr><th>Hub Processing Time</th><td>${procCell}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="setup-card setup-section-gap" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div>
        <div style="font-weight:600;font-size:13px;">🗑 Clear Server Cache</div>
        <div style="font-size:12px;color:var(--muted);">Resets Proxmox state, VM list, command history, and reclone logs on the spoke.</div>
      </div>
      <button id="hub-spoke-clear-cache-btn" class="btn btn-danger" style="flex-shrink:0;" type="button">Clear Cache</button>
    </div>
    <div class="setup-card setup-section-gap" style="padding:14px 16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">🔑 Proxmox API Token (for VM console)</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Required to open VNC console sessions. Format: <code>user@realm!tokenid=secret</code>. The token is pushed to the spoke and stored locally — it is never transmitted to Proxmox via the hub.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input id="hub-proxmox-api-token-input" type="password" autocomplete="new-password"
               placeholder="user@pam!tokenid=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
               style="flex:1;min-width:200px;font-family:monospace;font-size:12px;" />
        <button id="hub-proxmox-api-token-save-btn" class="btn btn-primary" style="flex-shrink:0;" type="button">Save Token</button>
        <button id="hub-proxmox-api-token-provision-btn" class="btn btn-secondary" style="flex-shrink:0;" type="button" title="Automatically create a Proxmox API token on this spoke via pvesh (requires spoke running on Proxmox host)">⚙ Auto-provision</button>
      </div>
      <div id="hub-proxmox-token-status" style="font-size:12px;color:var(--muted);margin-top:6px;"></div>
    </div>
    <div class="setup-card setup-section-gap" style="padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <div style="font-weight:600;font-size:13px;">📋 Remote Logs</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select id="hub-log-source-select" style="font-size:12px;padding:3px 6px;">
            <option value="watchdog">Watchdog</option>
            <option value="journal">Journal</option>
            <option value="agent">Agent</option>
            <option value="install">Install</option>
          </select>
          <button id="hub-log-fetch-btn" class="btn btn-secondary" style="font-size:12px;padding:4px 10px;" type="button">Fetch</button>
          <button id="hub-log-clear-btn" class="btn" style="font-size:12px;padding:4px 10px;background:transparent;border:1px solid var(--muted);" type="button">Clear</button>
        </div>
      </div>
      <pre id="hub-log-output" style="margin:0;max-height:320px;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:10px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;">[Select a source and click Fetch]</pre>
    </div>`;
}

function wireHubVmServerDetailsPanel(panel, tenantId, spokeId) {
  panel.querySelector("#hub-spoke-clear-cache-btn")?.addEventListener("click", () => {
    if (!confirm("Clear the Proxmox cache on this spoke?")) return;
    sendHubProxmoxCommand(tenantId, spokeId, "clear_cache", {});
    showToast("Clear cache command queued.", "ok");
  });

  // Load current token status
  const statusEl = panel.querySelector("#hub-proxmox-token-status");
  apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/proxmox-credentials`)
    .then(resp => resp.ok ? resp.json() : null)
    .then(data => {
      if (statusEl && data) {
        statusEl.textContent = data.proxmox_token_configured
          ? "✅ API token is configured on this spoke."
          : "⚠️ No API token saved — console sessions will fail.";
      }
    })
    .catch(() => {});

  panel.querySelector("#hub-proxmox-api-token-save-btn")?.addEventListener("click", async () => {
    const input = panel.querySelector("#hub-proxmox-api-token-input");
    const token = (input?.value || "").trim();
    if (!token) { showToast("Enter a Proxmox API token first.", "error"); return; }
    try {
      const resp = await apiFetch(
        `/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/proxmox-credentials`,
        { method: "PUT", body: { proxmox_host: "", proxmox_token: token } }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showToast("Proxmox API token saved and pushed to spoke.", "ok");
      if (statusEl) statusEl.textContent = "✅ API token is configured on this spoke.";
      if (input) input.value = "";
    } catch (err) {
      showToast(`Failed to save token: ${err.message}`, "error");
    }
  });

  panel.querySelector("#hub-proxmox-api-token-provision-btn")?.addEventListener("click", async () => {
    const btn = panel.querySelector("#hub-proxmox-api-token-provision-btn");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Provisioning…"; }
    if (statusEl) statusEl.textContent = "⏳ Creating Proxmox API token via pvesh on spoke…";
    try {
      const resp = await apiFetch(
        `/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/provision-proxmox-token`,
        { method: "POST" }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      showToast("Proxmox API token auto-provisioned and saved.", "ok");
      if (statusEl) statusEl.textContent = "✅ API token auto-provisioned (root@pam!cs-hub) and configured on this spoke.";
    } catch (err) {
      showToast(`Auto-provision failed: ${err.message}`, "error");
      if (statusEl) statusEl.textContent = `❌ Auto-provision failed: ${err.message}`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "⚙ Auto-provision"; }
    }
  });

  // ── Remote log viewer ──────────────────────────────────────────────────────
  const logOutput = panel.querySelector("#hub-log-output");
  const logSelect = panel.querySelector("#hub-log-source-select");

  const fetchLogs = async () => {
    const source = logSelect?.value || "watchdog";
    if (logOutput) logOutput.textContent = `Fetching ${source} logs…`;
    try {
      const resp = await apiFetch(
        `/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/remote-logs?source=${encodeURIComponent(source)}&lines=300`
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (logOutput) logOutput.textContent = `Error: ${err.detail || resp.status}`;
        return;
      }
      const data = await resp.json();
      if (logOutput) logOutput.textContent = (data.lines || []).join("\n") || "[No log output]";
      if (logOutput) logOutput.scrollTop = logOutput.scrollHeight;
      _vmLogPinned = true; // pin: keep auto-refresh from wiping the output
    } catch (err) {
      if (logOutput) logOutput.textContent = `Failed: ${err.message}`;
    }
  };

  panel.querySelector("#hub-log-fetch-btn")?.addEventListener("click", fetchLogs);
  panel.querySelector("#hub-log-clear-btn")?.addEventListener("click", () => {
    if (logOutput) logOutput.textContent = "[Cleared]";
    _vmLogPinned = false; // unpin: allow auto-refresh again
  });

  // Auto-fetch watchdog on open
  fetchLogs();
}

// ── Shared: send proxmox command via hub ──────────────────────────────────────

async function sendHubProxmoxCommand(tenantId, spokeId, action, args = {}, silent = false) {
  try {
    const resp = await apiFetch(
      `/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/proxmox-command`,
      { method: "POST", body: { action, args } }
    );
    if (!resp || !resp.ok) throw new Error(`HTTP ${resp?.status ?? "?"}`);
    if (!silent) showToast(`Command queued: ${action}`, "ok");
  } catch (err) {
    showToast(`Command failed: ${err.message}`, "error");
  }
}

async function queueHubTemplateUnlock(tenantId, spokeId) {
  const resp = await apiFetch(
    `/api/${encodeURIComponent(tenantId)}/aggregate/unlock-template`,
    { method: "POST", body: { spoke_id: spokeId } }
  );
  if (!resp?.ok) throw new Error(`HTTP ${resp?.status ?? "?"}`);
  const data = await resp.json().catch(() => ({}));
  showToast(`Queued template unlock for ${data?.queued || 0} spoke(s).`, "ok");
  setTimeout(() => loadVmServer(true), 3000);
  return data;
}


const NEW_CENTRAL_CLUSTERS = [
  { label: "US-1  (us1.api.central.arubanetworks.com)",      url: "https://us1.api.central.arubanetworks.com" },
  { label: "US-2  (us2.api.central.arubanetworks.com)",      url: "https://us2.api.central.arubanetworks.com" },
  { label: "US-WEST-4  (us4.api.central.arubanetworks.com)", url: "https://us4.api.central.arubanetworks.com" },
  { label: "US-WEST-5  (us5.api.central.arubanetworks.com)", url: "https://us5.api.central.arubanetworks.com" },
  { label: "US-EAST-1  (us6.api.central.arubanetworks.com)", url: "https://us6.api.central.arubanetworks.com" },
  { label: "EU-1  (de1.api.central.arubanetworks.com)",      url: "https://de1.api.central.arubanetworks.com" },
  { label: "EU-Central2  (de2.api.central.arubanetworks.com)", url: "https://de2.api.central.arubanetworks.com" },
  { label: "EU-Central3  (de3.api.central.arubanetworks.com)", url: "https://de3.api.central.arubanetworks.com" },
  { label: "UK  (gb1.api.central.arubanetworks.com)",        url: "https://gb1.api.central.arubanetworks.com" },
  { label: "Canada-1  (ca1.api.central.arubanetworks.com)",  url: "https://ca1.api.central.arubanetworks.com" },
  { label: "APAC-1  (in1.api.central.arubanetworks.com)",    url: "https://in1.api.central.arubanetworks.com" },
  { label: "APAC-EAST1  (jp1.api.central.arubanetworks.com)", url: "https://jp1.api.central.arubanetworks.com" },
  { label: "APAC-SOUTH1  (au1.api.central.arubanetworks.com)", url: "https://au1.api.central.arubanetworks.com" },
  { label: "UAE  (ae1.api.central.arubanetworks.com)",       url: "https://ae1.api.central.arubanetworks.com" },
  { label: "China  (cn1.api.central.arubanetworks.com.cn)",  url: "https://cn1.api.central.arubanetworks.com.cn" },
  { label: "Internal  (internal.api.central.arubanetworks.com)", url: "https://internal.api.central.arubanetworks.com" },
];

function renderClusterUrlField(config, disabled) {
  const current = (config.cluster_url || "").trim();
  const knownUrls = NEW_CENTRAL_CLUSTERS.map(c => c.url);
  const isKnown = knownUrls.includes(current);
  const selectVal = isKnown ? current : (current ? "__custom__" : "");
  const options = NEW_CENTRAL_CLUSTERS.map(c =>
    `<option value="${escHtml(c.url)}"${selectVal === c.url ? " selected" : ""}>${escHtml(c.label)}</option>`
  ).join("");
  const customSelected = selectVal === "__custom__" ? " selected" : "";
  const customHidden = selectVal === "__custom__" ? "" : ' style="display:none"';
  return `
    <div class="form-group">
      <label class="form-label" for="hub-central-cluster-select">Cluster</label>
      <select id="hub-central-cluster-select" class="form-input"${disabled}>
        <option value="">— select cluster —</option>
        ${options}
        <option value="__custom__"${customSelected}>Custom URL…</option>
      </select>
    </div>
    <div class="form-group" id="hub-central-custom-url-group"${customHidden}>
      <label class="form-label" for="hub-central-cluster-url">Custom Cluster URL</label>
      <input id="hub-central-cluster-url" type="url" class="form-input" value="${escHtml(current)}"${disabled} placeholder="https://your-cluster.api.central.arubanetworks.com">
    </div>`;
}

function onClusterSelectChange(sel) {
  const customGroup = $("#hub-central-custom-url-group");
  const customInput = $("#hub-central-cluster-url");
  if (sel.value === "__custom__") {
    if (customGroup) customGroup.style.display = "";
    if (customInput) customInput.focus();
  } else {
    if (customGroup) customGroup.style.display = "none";
  }
}

function defaultCentralWebhookStatus() {
  const tenantId = getActiveTenantId();
  return {
    registered: false,
    webhook_id: "",
    endpoint_url: tenantId
      ? `https://cs-hub.westus3.azurecontainer.io:8443/api/${tenantId}/webhook/central`
      : "https://cs-hub.westus3.azurecontainer.io:8443/api/{tenant_id}/webhook/central",
  };
}

function centralWebhookEndpoint() {
  const tenantId = getActiveTenantId();
  return tenantId ? `/api/${encodeURIComponent(tenantId)}/aggregate/register-central-webhook` : "";
}

async function loadCentralWebhookStatus() {
  if (!currentUser || !getActiveTenantId()) {
    centralWebhookStatus = defaultCentralWebhookStatus();
    return centralWebhookStatus;
  }
  const res = await apiFetch(centralWebhookEndpoint());
  const data = await readJson(res);
  centralWebhookStatus = res?.ok ? { ...defaultCentralWebhookStatus(), ...(data || {}) } : defaultCentralWebhookStatus();
  return centralWebhookStatus;
}

async function registerCentralWebhook() {
  if (!canManageTenant()) {
    setFormMessage("hub-central-webhook-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  const btn = $("#register-central-webhook-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Registering…"; }
  setFormMessage("hub-central-webhook-msg", "", true);
  try {
    const res = await apiFetch(centralWebhookEndpoint(), { method: "POST" });
    const data = await readJson(res);
    if (!res?.ok || !data?.ok) throw new Error(data?.detail || "Unable to register Central webhook.");
    setFormMessage("hub-central-webhook-msg", "Webhook registered.", true);
    showToast("Central webhook registered.", "ok");
    await loadCentral(true);
  } catch (error) {
    setFormMessage("hub-central-webhook-msg", error.message || "Unable to register Central webhook.", false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Register"; }
  }
}

async function deregisterCentralWebhook() {
  if (!canManageTenant()) {
    setFormMessage("hub-central-webhook-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  const btn = $("#deregister-central-webhook-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Deregistering…"; }
  setFormMessage("hub-central-webhook-msg", "", true);
  try {
    const res = await apiFetch(centralWebhookEndpoint(), { method: "DELETE" });
    const data = await readJson(res);
    if (!res?.ok || !data?.ok) throw new Error(data?.detail || "Unable to deregister Central webhook.");
    setFormMessage("hub-central-webhook-msg", "Webhook removed.", true);
    showToast("Central webhook removed.", "ok");
    await loadCentral(true);
  } catch (error) {
    setFormMessage("hub-central-webhook-msg", error.message || "Unable to deregister Central webhook.", false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Deregister"; }
  }
}

function renderHubCentral() {
  const container = $("#hub-central-content");
  if (!container) return;
  const data = aggregateCentralData || { spokes: [], hub_central_config: {}, mode: "distributed" };
  const spokes = data.spokes || [];
  const sortedSpokes = spokes.slice().sort((left, right) => (
    spokeDisplayName(left, "Spoke").localeCompare(spokeDisplayName(right, "Spoke"), undefined, { numeric: true, sensitivity: "base" })
  ));
  const connectedCount = spokes.filter(item => item.central_status?.token_valid).length;
  const config = data.hub_central_config || {};
  const webhook = centralWebhookStatus || defaultCentralWebhookStatus();
  const webhookRegistered = Boolean(webhook.registered);
  const disabled = canManageTenant() ? "" : " disabled";
  const note = canManageTenant() ? "" : '<div class="tenant-detail-note">Tenant Viewer access: Central settings are read-only.</div>';
  $("#hub-central-mode-pill") && ($("#hub-central-mode-pill").textContent = `${data.mode || "distributed"} mode`);
  $("#hub-central-spokes-pill") && ($("#hub-central-spokes-pill").textContent = `${spokes.length} spokes`);
  $("#hub-central-connected-pill") && ($("#hub-central-connected-pill").textContent = `${connectedCount} connected`);
  const spokeRows = sortedSpokes.map(item => {
    const central = item.central_status || {};
    const state = central.token_state?.state || (central.token_valid ? "connected" : (item.spoke_online ? "unknown" : "offline"));
    const siteCount = Object.keys(central.status || {}).length;
    const pillClass = state === "connected" ? "online" : state === "offline" ? "offline" : "pending";
    return `
      <tr>
        <td style="white-space: nowrap;"><strong>${escHtml(spokeDisplayName(item, "Spoke"))}</strong></td>
        <td style="white-space: nowrap;"><span class="site-status-pill ${pillClass}">${escHtml(state)}</span></td>
        <td>${siteCount}</td>
        <td style="white-space: nowrap;">${escHtml(item.spoke_online ? "Online" : "Offline")}</td>
        <td style="white-space: nowrap;">${escHtml(item.last_seen ? relativeTime(item.last_seen) : "—")}</td>
      </tr>
    `;
  }).join("");
  container.innerHTML = `
    ${note}
    <div class="tenant-detail-grid">
      <section class="setup-card">
        <div class="setup-card-header"><h2>Central Control</h2><p>Hub-managed Aruba Central settings and processing mode for this tenant.</p></div>
        <div class="setup-form">
          <div class="form-group">
            <label class="form-label" for="hub-central-mode">Mode</label>
            <select id="hub-central-mode" class="form-input"${disabled}>
              <option value="centralized"${data.mode === "centralized" ? " selected" : ""}>Centralized</option>
              <option value="distributed"${data.mode === "distributed" ? " selected" : ""}>Distributed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="hub-central-api-version">API Version</label>
            <select id="hub-central-api-version" class="form-input"${disabled}>
              <option value="classic"${config.api_version === "classic" ? " selected" : ""}>Classic</option>
              <option value="new_central"${config.api_version === "new_central" ? " selected" : ""}>Central / HPE GreenLake</option>
            </select>
          </div>
          ${renderClusterUrlField(config, disabled)}
          <div class="form-group"><label class="form-label" for="hub-central-client-id">Client ID (OAuth2)</label><input id="hub-central-client-id" type="text" class="form-input" value="${escHtml(config.client_id || "")}"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-central-client-secret">Client Secret (OAuth2)</label><input id="hub-central-client-secret" type="password" class="form-input" placeholder="Leave blank to keep existing"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-central-access-token">Access Token (optional — use instead of Client ID/Secret)</label><input id="hub-central-access-token" type="password" class="form-input" placeholder="${config.access_token_configured ? "Token saved — leave blank to keep" : "Paste token here"}"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-central-workspace-id">GLP Workspace ID (optional)</label><input id="hub-central-workspace-id" type="text" class="form-input" value="${escHtml(config.workspace_id || "")}"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-central-customer-id">Customer ID</label><input id="hub-central-customer-id" type="text" class="form-input" value="${escHtml(config.customer_id || "")}"${disabled}></div>
          <div class="tenant-detail-note"><strong>New Central setup:</strong> Use either a static <strong>Access Token</strong> (from Central → API Gateway → REST API → Generate Token) <em>or</em> a <strong>Client ID + Secret</strong> (from GreenLake → Manage Workspace → Personal API Clients). The <code>Cluster URL</code> is always required. <code>Workspace ID</code> is only needed for GLP-scoped OAuth2 credentials.</div>
          <div class="form-group">
            <label class="form-label" for="hub-central-poll-interval">Polling Interval</label>
            <select id="hub-central-poll-interval" class="form-input"${disabled}>
              <option value="1"${(config.central_browse_interval_minutes||5) === 1 ? " selected" : ""}>Every 1 minute</option>
              <option value="2"${(config.central_browse_interval_minutes||5) === 2 ? " selected" : ""}>Every 2 minutes</option>
              <option value="5"${(config.central_browse_interval_minutes||5) === 5 ? " selected" : ""}>Every 5 minutes (default)</option>
              <option value="10"${(config.central_browse_interval_minutes||5) === 10 ? " selected" : ""}>Every 10 minutes</option>
              <option value="15"${(config.central_browse_interval_minutes||5) === 15 ? " selected" : ""}>Every 15 minutes</option>
              <option value="30"${(config.central_browse_interval_minutes||5) === 30 ? " selected" : ""}>Every 30 minutes</option>
              <option value="60"${(config.central_browse_interval_minutes||5) === 60 ? " selected" : ""}>Every 60 minutes</option>
            </select>
          </div>
          <div class="form-actions">
            <button id="save-central-btn" class="btn btn-primary" type="button"${disabled}>Save Central Settings</button>
            <button id="test-central-btn" class="btn btn-secondary" type="button">Test Connection</button>
            <button id="clear-central-secrets-btn" class="btn btn-danger" type="button"${disabled}>Clear Secrets</button>
            <span id="hub-central-msg" class="form-msg"></span>
          </div>
        </div>
      </section>
      <section class="setup-card">
        <div class="setup-card-header"><h2>Spoke Central Status</h2><p>Last known Central API status reported by each spoke.</p></div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Spoke</th><th>Central Status</th><th>Mapped Sites</th><th>Online</th><th>Last Seen</th></tr></thead>
            <tbody>${spokeRows || '<tr><td colspan="5" class="empty-state">No spoke Central telemetry reported.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>
    <section class="setup-card" style="margin-top:16px;">
      <div class="setup-card-header">
        <h2>Real-Time Alerts (Webhook)</h2>
        <p>Register the hub as a Central webhook receiver for real-time alert delivery instead of polling-only.</p>
      </div>
      <div class="setup-form">
        <div class="tenant-detail-note"><strong>Status:</strong> ${webhookRegistered ? "Registered" : "Not registered"}</div>
        <div class="tenant-detail-note"><strong>Webhook endpoint:</strong> <code>${escHtml(webhook.endpoint_url || defaultCentralWebhookStatus().endpoint_url)}</code></div>
        ${webhook.webhook_id ? `<div class="tenant-detail-note"><strong>Webhook ID:</strong> <code>${escHtml(webhook.webhook_id)}</code></div>` : ""}
        ${webhook.webhook_api_key ? `<div class="tenant-detail-note"><strong>API Key</strong> <span style="font-size:11px;color:var(--muted);">(paste this into Central → Webhooks → Authorization)</span><br><span style="display:inline-flex;align-items:center;gap:8px;margin-top:4px;"><code id="webhook-api-key-display" style="user-select:all;">${escHtml(webhook.webhook_api_key)}</code><button class="btn btn-secondary btn-small" type="button" onclick="navigator.clipboard.writeText(${JSON.stringify(webhook.webhook_api_key)}).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button></span></div>` : ""}
        <div class="form-actions">
          <button id="register-central-webhook-btn" class="btn btn-primary" type="button"${disabled}${webhookRegistered ? " disabled" : ""}>Register</button>
          <button id="deregister-central-webhook-btn" class="btn btn-secondary" type="button"${disabled}${webhookRegistered ? "" : " disabled"}>Deregister</button>
          <span id="hub-central-webhook-msg" class="form-msg"></span>
        </div>
      </div>
    </section>
  `;
}

function renderHubConfigPage(data) {
  const approved = (data.spokes || []).filter(spoke => spoke.status === "approved");
  const github = data.settings?.github || {};
  if (!hubConfigDraft) {
    const seed = approved.find(spoke => Object.keys(spoke.config || {}).length > 0)?.config || {};
    hubConfigDraft = JSON.stringify(seed, null, 2);
  }
  const readonly = canManageTenant() ? "" : " readonly";
  const disabled = canManageTenant() ? "" : " disabled";
  const note = canManageTenant() ? "" : '<div class="tenant-detail-note">Tenant Viewer access is read-only.</div>';
  const stateRows = approved.map(spoke => {
    const summary = summarizeHubConfigState(spoke);
    return `
      <tr>
        <td style="white-space:nowrap"><strong>${escHtml(spokePrimaryLabel(spoke))}</strong></td>
        <td style="white-space:nowrap"><span class="site-status-pill ${summary.className}">${escHtml(summary.label)}</span></td>
        <td>${escHtml(String(spoke.config_version || 0))}</td>
        <td>${escHtml(String(spoke.applied_config_version || 0))}</td>
        <td style="white-space:nowrap">${escHtml(spoke.last_config_applied_at ? fmtDate(spoke.last_config_applied_at) : "—")}</td>
      </tr>
    `;
  }).join("");
  return `
    ${note}
    <nav class="setup-subnav setup-section-gap" role="tablist">
      <button class="setup-subtab hub-config-subtab ${hubConfigActiveSubtab === "api" ? "active" : ""}" data-hub-config-subtab="api" type="button">API</button>
      <button class="setup-subtab hub-config-subtab ${hubConfigActiveSubtab === "simulation" ? "active" : ""}" data-hub-config-subtab="simulation" type="button">Simulation Config</button>
      <button class="setup-subtab hub-config-subtab ${hubConfigActiveSubtab === "overrides" ? "active" : ""}" data-hub-config-subtab="overrides" type="button">Conf Overrides</button>
    </nav>
    <div id="hub-config-api-panel" class="${hubConfigActiveSubtab === "api" ? "" : "hidden"}">
      <section class="setup-card setup-section-gap">
        <div class="setup-card-header"><h2>Shared GitHub / Repo Settings</h2><p>Configure this once for the hub and every approved spoke. Changes save automatically when each field loses focus.</p></div>
        <div class="setup-form">
          <div class="form-group"><label class="form-label" for="hub-github-sim-repo-url">Simulation Repo URL</label><input id="hub-github-sim-repo-url" type="url" class="form-input" value="${escHtml(github.sim_repo_url || "")}" placeholder="https://github.com/owner/repo.git" onblur="window.saveTenantGithubSettings && window.saveTenantGithubSettings()"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-github-sim-repo-branch">Simulation Repo Branch</label><input id="hub-github-sim-repo-branch" type="text" class="form-input" value="${escHtml(github.sim_repo_branch || "main")}" placeholder="main" onblur="window.saveTenantGithubSettings && window.saveTenantGithubSettings()"${disabled}></div>
          <div class="form-group"><label class="form-label" for="hub-github-token">GitHub Token</label><input id="hub-github-token" type="password" class="form-input" placeholder="Leave blank to keep existing" data-secret-field="true" onblur="window.saveTenantGithubSettings && window.saveTenantGithubSettings()"${disabled}><span class="form-hint" id="hub-github-token-status">${escHtml(github.github_token_configured ? "Token configured" : "Token not configured")}</span></div>
          <div class="tenant-detail-note">These credentials are used by the hub and propagated to all approved spokes in this tenant.</div>
          <div class="form-actions">
            <span id="hub-github-msg" class="form-msg"></span>
          </div>
        </div>
      </section>
      <div class="tenant-detail-grid setup-section-gap" style="align-items:start">
        <section class="setup-card">
          <div class="setup-card-header"><h2>Push Config to Spokes</h2><p>Save tenant config on the hub and deliver spoke-specific config on the next inbox check.</p></div>
          <div class="setup-form">
            <div class="form-group">
              <label class="form-label" for="hub-config-payload">Config JSON</label>
              <textarea id="hub-config-payload" class="form-input" rows="14" spellcheck="false"${readonly}>${escHtml(hubConfigDraft || "{}")}</textarea>
            </div>
            <div class="form-actions">
              <button id="save-config-push-btn" class="btn btn-primary" type="button"${disabled}>Store + Push Config</button>
              <span id="hub-config-msg" class="form-msg"></span>
            </div>
          </div>
        </section>
        <section class="setup-card">
          <div class="setup-card-header"><h2>Per-Spoke Config State</h2><p>Desired hub config version vs last applied on each spoke. Use Resync to re-push USB certs if a spoke missed a previous push.</p></div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Spoke</th><th>Status</th><th>Desired</th><th>Applied</th><th>Last Applied</th></tr></thead>
              <tbody>${stateRows || '<tr><td colspan="5" class="empty-state">No approved spokes in this tenant.</td></tr>'}</tbody>
            </table>
          </div>
          ${canManageTenant() ? `<div class="form-actions" style="padding:12px 0 0;">
            <button id="resync-usb-certs-btn" class="btn btn-secondary" type="button">↺ Resync USB Certs to All Spokes</button>
            <span id="resync-usb-certs-msg" class="form-msg"></span>
          </div>` : ""}
        </section>
      </div>
    </div>
    <div id="hub-sim-config-panel" class="${hubConfigActiveSubtab === "simulation" ? "" : "hidden"}"></div>
    <div id="hub-conf-overrides-panel" class="${hubConfigActiveSubtab === "overrides" ? "" : "hidden"}"></div>
  `;
}

async function loadVmServer(force = false) {
  const container = $("#hub-vm-server-content");
  if (!container) return;
  const tenantId = getActiveTenantId();
  if (!tenantId || !currentUser) {
    aggregateProxmoxHosts = [];
    aggregateFleetRecloneStatus = defaultFleetRecloneStatus();
    aggregateUsbProvisioningStatus = defaultUsbProvisioningStatus();
    renderHubVmServer();
    return;
  }

  const cacheKey = `hub_vmserver_${tenantId}`;
  const saveCache = (hosts) => { try { localStorage.setItem(cacheKey, JSON.stringify(hosts)); } catch (_) {} };
  const loadCache = () => { try { const s = localStorage.getItem(cacheKey); return s ? JSON.parse(s) : null; } catch (_) { return null; } };

  const revalidate = async () => {
    const [fresh] = await Promise.all([
      loadAggregateData("proxmox"),
      loadHubVmServerAggregateStatus(),
    ]);
    const hosts = fresh?.hosts || [];
    aggregateProxmoxHosts = hosts;
    saveCache(hosts);
    renderHubVmServer();
  };

  if (loadVmServer._inFlight) return;
  loadVmServer._inFlight = true;

  try {
    if (aggregateProxmoxHosts.length) {
      await loadHubVmServerAggregateStatus();
      renderHubVmServer();
      revalidate();
      return;
    }

    const cached = loadCache();
    if (!force && cached && cached.length) {
      aggregateProxmoxHosts = cached;
      await loadHubVmServerAggregateStatus();
      renderHubVmServer();
      revalidate();
      return;
    }

    container.innerHTML = '<div class="empty-state">Loading…</div>';
    await revalidate();
  } finally {
    loadVmServer._inFlight = false;
  }
}


async function loadCentral(force = false) {
  const container = $("#hub-central-content");
  if (!container) return;
  if (!currentTenantId || !currentUser) {
    aggregateCentralData = { mode: "distributed", hub_central_config: {}, spokes: [] };
    centralWebhookStatus = defaultCentralWebhookStatus();
    renderHubCentral();
    return;
  }
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  const [data, webhook] = await Promise.all([
    force || !aggregateCentralData ? loadAggregateData("central") : Promise.resolve(aggregateCentralData),
    loadCentralWebhookStatus(),
  ]);
  aggregateCentralData = data || { mode: "distributed", hub_central_config: {}, spokes: [] };
  centralWebhookStatus = webhook || defaultCentralWebhookStatus();
  renderHubCentral();
}

// ── Hub Sites localStorage cache helpers ───────────────────────────────────
function hubSitesCacheKey() { return `hub_sites_${currentTenantId}`; }

function saveHubSitesCache(data) {
  try { localStorage.setItem(hubSitesCacheKey(), JSON.stringify(data)); } catch (_) {}
}

function loadHubSitesCache() {
  try { const s = localStorage.getItem(hubSitesCacheKey()); return s ? JSON.parse(s) : null; }
  catch (_) { return null; }
}

// ── Hub Central localStorage cache helpers ─────────────────────────────────
function hubCentralCacheKey() { return `hub_central_${currentTenantId}`; }

function saveHubCentralCache(data) {
  try { localStorage.setItem(hubCentralCacheKey(), JSON.stringify(data)); } catch (_) {}
}

function loadHubCentralCache() {
  try { const s = localStorage.getItem(hubCentralCacheKey()); return s ? JSON.parse(s) : null; }
  catch (_) { return null; }
}

function hubCentralConfigSummary() {
  const data = aggregateCentralData && typeof aggregateCentralData === "object"
    ? aggregateCentralData
    : { mode: "distributed", hub_central_config: {}, spokes: [] };
  const config = data.hub_central_config && typeof data.hub_central_config === "object"
    ? data.hub_central_config
    : {};
  const tenant = tenants.find((item) => item.id === getActiveTenantId()) || {};
  const summary = hubCentralMonitorSummary(hubCentralData || data);
  const configured = Boolean(
    config.configured
    || String(config.cluster_url || "").trim()
    || String(config.client_id || "").trim()
    || String(config.customer_id || tenant.aruba_cid || "").trim()
    || isConfiguredSecretValue(config.access_token_configured)
    || isConfiguredSecretValue(config.client_secret_configured)
  );
  const spokes = Array.isArray(data.spokes) ? data.spokes : [];
  const connectedCount = spokes.filter((item) => item.central_status?.token_valid).length;
  return { data, config, tenant, summary, configured, spokes, connectedCount };
}

function updateHubCentralMonitoringPills() {
  const configuredPill = $("#hcm-configured-pill");
  const versionPill = $("#hcm-version-pill");
  const sitesPill = $("#hcm-sites-pill");
  if (!configuredPill && !versionPill && !sitesPill) return;
  const { config, summary, configured } = hubCentralConfigSummary();
  if (configuredPill) configuredPill.textContent = `Configured: ${configured ? "Yes" : "No"}`;
  if (versionPill) versionPill.textContent = `API: ${config.api_version || "—"}`;
  if (sitesPill) sitesPill.textContent = `${summary.sites.length} sites`;
}

function renderHubCentralMonitoringConfig() {
  const configContainer = $("#hcm-config-content");
  const contextContainer = $("#hcm-context-content");
  if (!configContainer || !contextContainer) return;
  const row = (label, value, muted = false) => `
    <div class="setup-status-item">
      <span class="setup-status-label">${escHtml(label)}</span>
      <span class="setup-status-value${muted ? " muted" : ""}">${escHtml(value)}</span>
    </div>`;

  if (!currentUser || !currentTenantId) {
    configContainer.innerHTML = [
      row("Configured", "Sign in and select a tenant.", true),
      row("Cluster URL", "—", true),
      row("Client ID", "—", true),
      row("Customer ID", "—", true),
      row("API Version", "—", true),
    ].join("");
    contextContainer.innerHTML = [
      row("Selected Tenant", "—", true),
      row("Mode", "—", true),
      row("Connected Spokes", "—", true),
      row("Monitored Sites", "—", true),
    ].join("");
    updateHubCentralMonitoringPills();
    return;
  }

  const { data, config, tenant, summary, configured, spokes, connectedCount } = hubCentralConfigSummary();
  configContainer.innerHTML = [
    row("Configured", configured ? "Yes" : "No"),
    row("Cluster URL", config.cluster_url || "—", !config.cluster_url),
    row("Client ID", config.client_id || "—", !config.client_id),
    row("Customer ID", config.customer_id || tenant.aruba_cid || "—", !(config.customer_id || tenant.aruba_cid)),
    row("API Version", config.api_version || "—", !config.api_version),
  ].join("");
  contextContainer.innerHTML = [
    row("Selected Tenant", tenant.name || currentTenantId),
    row("Mode", data.mode || "distributed"),
    row("Connected Spokes", `${connectedCount}/${spokes.length}`),
    row("Monitored Sites", String(summary.sites.length)),
  ].join("");
  updateHubCentralMonitoringPills();
}

function activateHubCentralTopSubtab(subtab = "hcm-config") {
  hubCentralTopSubtab = subtab || "hcm-config";
  $$(".hub-central-top-subtab").forEach((button) => button.classList.toggle("active", button.dataset.subtab === hubCentralTopSubtab));
  ["hcm-config-panel", "hcm-browse-panel"].forEach((panelId) => {
    document.getElementById(panelId)?.classList.toggle("hidden", panelId !== `${hubCentralTopSubtab}-panel`);
  });
  if (hubCentralTopSubtab === "hcm-browse") {
    if (!hubCentralData && currentTenantId && currentUser) loadHubCentralData().catch(() => {});
    else renderHubCentralStatus();
    return;
  }
  if (!aggregateCentralData && currentTenantId && currentUser) loadHubCentralMonitoring().catch(() => {});
  else renderHubCentralMonitoringConfig();
}

function applyHubCentralData(data) {
  hubCentralData = data;
  updateHubCentralMonitoringPills();
  renderHubCentralStatus();
}

async function loadHubCentralData(force = false) {
  const container = $("#hcs-overview");
  if (!container) return;
  if (!currentTenantId || !currentUser) {
    hubCentralData = null;
    updateHubCentralMonitoringPills();
    container.innerHTML = '<div class="empty-state">Sign in and select a tenant.</div>';
    return;
  }

  const saveCaches = (data) => {
    saveHubSitesCache(data);
    saveHubCentralCache(data);
  };
  const revalidate = () => {
    loadAggregateData("central-status").then(data => {
      if (data) {
        applyHubCentralData(data);
        saveCaches(data);
      }
    }).catch(() => {});
  };

  // In-memory cache still valid (tab switch within session) — render immediately.
  if (!force && hubCentralData) {
    renderHubCentralStatus();
    revalidate();
    return;
  }

  // Show localStorage cache immediately while fetching fresh data.
  const cached = loadHubSitesCache() || loadHubCentralCache();
  if (cached) {
    $("#hcs-site-detail")?.classList.add("hidden");
    $("#hcs-overview")?.classList.remove("hidden");
    applyHubCentralData(cached);
    revalidate();
    return;
  }

  // No cache at all — show loading spinner and wait for the first response.
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  const data = await loadAggregateData("central-status");
  if (!data) {
    container.innerHTML = '<div class="empty-state">Unable to load Central data.</div>';
    return;
  }
  hubCentralSiteOpen = null;
  $("#hcs-site-detail")?.classList.add("hidden");
  $("#hcs-overview")?.classList.remove("hidden");
  applyHubCentralData(data);
  saveCaches(data);
}

async function loadHubCentralMonitoring(force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !currentUser) return;

  // Wire up sub-tabs, search, refresh and modal (idempotent)
  $$(".ts-ca-subtab").forEach((button) => {
    button.onclick = () => {
      hubCaBrowseActiveTab = button.dataset.subtab || "ts-ca-sites";
      renderHubCaBrowseTab();
    };
  });
  const searchEl = $("#ts-ca-search");
  if (searchEl) searchEl.oninput = () => renderHubCaBrowseTab();
  const refreshBtn = $("#ts-ca-refresh-btn");
  if (refreshBtn) refreshBtn.onclick = async () => {
    const origText = refreshBtn.textContent;
    refreshBtn.disabled = true;
    refreshBtn.textContent = "↺ Refreshing…";
    try {
      // Kick a background refresh on the server, then reload the view with fresh data
      await apiFetch(`/api/central/browse?tenant_id=${encodeURIComponent(getActiveTenantId())}&force=true`);
      await loadHubCaBrowseData(true);
    } catch (_) { /* non-fatal */ } finally {
      refreshBtn.textContent = "↺ Data refreshed";
      setTimeout(() => { refreshBtn.textContent = origText; refreshBtn.disabled = false; }, 2000);
    }
  };
  const cancelBtn = $("#ts-ca-modal-cancel");
  if (cancelBtn) cancelBtn.onclick = closeHubCaMonitorModal;
  const modal = $("#ts-ca-monitor-modal");
  if (modal) modal.onclick = (e) => { if (e.target === modal) closeHubCaMonitorModal(); };

  await loadHubCaBrowseData(force);
}

function renderHubCentralStatus() {
  if (hubCentralActiveSubtab === "hcs-sites") renderHubCentralSites();
  else if (hubCentralActiveSubtab === "hcs-alerts") renderHubCentralAlerts();
  else if (hubCentralActiveSubtab === "hcs-clients") renderHubCentralClients();
}

function renderHubCentralSites() {
  const container = $("#hcs-overview");
  if (!container || !hubCentralData) return;
  const { mode, token_valid: hubTokenValid, token_state: hubTokenState } = hubCentralData;

  if (mode === "centralized" && !hubTokenValid) {
    const state = typeof hubTokenState === "object" ? (hubTokenState?.state || "unknown") : (hubTokenState || "unknown");
    const detail = typeof hubTokenState === "object" ? (hubTokenState?.detail || "") : "";
    const stateLabels = {
      not_configured: "Central API credentials are not configured. Go to Tenant Setup → Central API to add them.",
      stale: "Central polling data is stale (no successful poll in the last 5 minutes). The hub may still be starting up.",
      error: `Central API authentication failed. ${detail ? `Error: ${detail}` : "Check credentials in Tenant Setup → Central API and use the Test Connection button."}`,
    };
    const message = stateLabels[state] || `Central API status: ${state}. Check credentials in Tenant Setup → Central API.`;
    container.innerHTML = `<div class="empty-state" style="color:#c0392b;">${escHtml(message)}</div>`;
    return;
  }

  const summary = hubCentralMonitorSummary(hubCentralData);
  const rows = summary.sites.map((site) => {
    const assignedSpokes = site.assigned_spokes || (site.assigned_spoke ? [site.assigned_spoke] : []);
    const offlineNote = site.alerts_suppressed ? "Suppressed while all assigned spokes are offline" : "";
    const checkBadge = site.alerts_suppressed
      ? hubCentralBadge(site.check_status.label, "gray", offlineNote)
      : hubCentralBadge(site.check_status.label, site.check_status.tone);
    const clientBadge = site.alerts_suppressed
      ? hubCentralBadge(site.client_status.label, "gray", offlineNote)
      : hubCentralBadge(site.client_status.label, site.client_status.tone);
    const anyOnline = assignedSpokes.some((s) => s.spoke_online);
    const spokeOnline = assignedSpokes.length
      ? `<span class="status-dot ${anyOnline ? "online" : "offline"}"></span> ${anyOnline ? "Online" : "Offline"}`
      : '<span class="status-dot" style="background:#95a5a6;"></span> —';
    const spokeNames = assignedSpokes.map((s) => escHtml(s.display_name || "—")).join(", ") || "—";
    return `
      <tr>
        <td><strong>${escHtml(site.wsite)}</strong></td>
        <td>${escHtml(site.central_site || "—")}</td>
        <td>${spokeNames}</td>
        <td>${spokeOnline}</td>
        <td>${site.wireless_clients ?? "—"}</td>
        <td>${checkBadge}</td>
        <td>${clientBadge}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    ${hubCentralBannerHtml(summary)}
    <div class="setup-card">
      <table class="data-table">
        <thead><tr><th>Site</th><th>Central Site</th><th>Assigned Spoke</th><th>Spoke Online</th><th>Clients</th><th>Check Status</th><th>Client Count Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty-state">No Central sites configured.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function openHubSiteDetail(wsite) {
  if (!wsite || !hubCentralData) return;
  hubCentralSiteOpen = wsite;

  // Build aggregated site data
  const { spokes = [], mode, token_valid: hubTokenValid } = hubCentralData;
  let centralSite = "", statusMap = {}, wirelessTotal = 0, spokeList = [];
  for (const spoke of spokes) {
    for (const site of (spoke.sites || [])) {
      if (site.wsite !== wsite) continue;
      centralSite = centralSite || site.central_site || "";
      wirelessTotal += typeof site.wireless_clients === "number" ? site.wireless_clients : 0;
      spokeList.push({ ...spoke });
      for (const [cid, cv] of Object.entries(site.status_map || {})) {
        if (!statusMap[cid] || (cv.status === "ERROR" && statusMap[cid].status !== "ERROR")) {
          statusMap[cid] = { ...cv };
        }
      }
    }
  }

  $("#hcs-overview")?.classList.add("hidden");
  $("#hcs-site-detail")?.classList.remove("hidden");
  const titleEl = $("#hcs-detail-title");
  const subEl = $("#hcs-detail-sub");
  if (titleEl) titleEl.textContent = wsite;
  if (subEl) subEl.textContent = centralSite ? `Central site: ${centralSite}` : "No Central site mapping";

  // Render checks table
  const checks = Object.entries(statusMap);
  let checksHtml = "";
  if (checks.length) {
    const checkRows = checks.map(([cid, cv]) => {
      const ok = cv.status === "OK";
      const statusLabel = ok
        ? `<span style="color:var(--hpe-green-dark);font-weight:600;">✓ OK</span>`
        : `<span style="color:#c0392b;font-weight:600;">✗ ERROR</span>`;
      return `<tr>
        <td>${escHtml(cv.check_name || cid)}</td>
        <td style="color:var(--muted);text-transform:capitalize;">${escHtml(cv.check_type || '—')}</td>
        <td>${statusLabel}</td>
        <td>${cv.count ?? '—'}</td>
        <td style="color:var(--muted);">${cv.ts ? new Date(cv.ts * 1000).toLocaleTimeString() : '—'}</td>
      </tr>`;
    }).join('');
    checksHtml = `
      <div class="setup-card" style="margin-bottom:12px;">
        <div class="setup-card-header"><h2>Check Status</h2></div>
        <table class="data-table">
          <thead><tr><th>Check</th><th>Type</th><th>Status</th><th>Count</th><th>Last Seen</th></tr></thead>
          <tbody>${checkRows}</tbody>
        </table>
      </div>`;
  } else {
    checksHtml = `<div class="setup-card" style="margin-bottom:12px;"><div class="empty-state">No check data available for this site.</div></div>`;
  }

  // Spokes section (distributed mode — shows which spokes see this site)
  let spokesHtml = "";
  if (mode === "distributed" && spokeList.length > 1) {
    const spokeRows = spokeList.map(s => `<tr>
      <td>${escHtml(s.spoke_name || s.spoke_id)}</td>
      <td><span class="status-dot ${s.spoke_online ? 'online' : 'offline'}"></span> ${s.spoke_online ? 'Online' : 'Offline'}</td>
      <td>${s.token_valid ? '✓ Valid' : '—'}</td>
    </tr>`).join('');
    spokesHtml = `
      <div class="setup-card" style="margin-bottom:12px;">
        <div class="setup-card-header"><h2>Reporting Spokes</h2></div>
        <table class="data-table">
          <thead><tr><th>Spoke</th><th>Status</th><th>Token</th></tr></thead>
          <tbody>${spokeRows}</tbody>
        </table>
      </div>`;
  }

  // Summary card
  const summaryHtml = `
    <div class="setup-card" style="margin-bottom:12px;">
      <div class="setup-status-grid">
        <div class="setup-status-item"><span class="setup-status-label">Wireless Clients</span><span class="setup-status-value">${wirelessTotal}</span></div>
        <div class="setup-status-item"><span class="setup-status-label">Checks Passing</span><span class="setup-status-value" style="color:var(--hpe-green-dark);">${checks.filter(([,v]) => v.status === "OK").length} / ${checks.length}</span></div>
        <div class="setup-status-item"><span class="setup-status-label">Mode</span><span class="setup-status-value" style="text-transform:capitalize;">${escHtml(mode || '—')}</span></div>
      </div>
    </div>`;

  const detailContent = $("#hcs-detail-content");
  if (detailContent) detailContent.innerHTML = summaryHtml + checksHtml + spokesHtml;

  // Wire back button
  const backBtn = $("#hcs-detail-back");
  if (backBtn) { backBtn.onclick = closeHubSiteDetail; }
}

function closeHubSiteDetail() {
  hubCentralSiteOpen = null;
  $("#hcs-site-detail")?.classList.add("hidden");
  $("#hcs-overview")?.classList.remove("hidden");
}

function renderHubCentralAlerts() {
  const container = $("#hcs-alerts-content");
  if (!container || !hubCentralData) return;
  const summary = hubCentralMonitorSummary(hubCentralData);
  if (!summary.checkFailures.length) {
    container.innerHTML = `${hubCentralBannerHtml(summary)}<div class="empty-state">No monitored check failures.</div>`;
    return;
  }
  const rows = summary.checkFailures.map((alert) => `
    <tr>
      <td>${escHtml(alert.check_name || alert.check_id || '—')}</td>
      <td>${escHtml(alert.site || '—')}${alert.suppressed ? '<div style="font-size:0.78rem;color:var(--muted);">Assigned spoke offline</div>' : ''}</td>
      <td>${alert.error_count ?? 0}</td>
      <td>${alert.ts ? escHtml(new Date(alert.ts * 1000).toLocaleString()) : '—'}</td>
    </tr>`).join('');
  container.innerHTML = `
    ${hubCentralBannerHtml(summary)}
    <div class="setup-card">
      <table class="data-table">
        <thead><tr><th>Check Name</th><th>Site</th><th>Error Count</th><th>Timestamp</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderHubCentralClients() {
  const container = $("#hcs-clients-content");
  if (!container || !hubCentralData) return;
  const summary = hubCentralMonitorSummary(hubCentralData);
  const rows = summary.sites.map((site) => {
    const info = site.client_count || {};
    const baselineVal = info.baseline_source === "7day" ? (info.baseline_7day ?? info.hourly_avg) : info.hourly_avg;
    const baselineLabel = info.baseline_source === "7day" ? "7d Baseline" : "1h Avg";
    const statusBadge = site.alerts_suppressed
      ? hubCentralBadge(site.client_status.label, 'gray', 'Suppressed while assigned spoke is offline')
      : hubCentralBadge(site.client_status.label, site.client_status.tone);
    return `
      <tr>
        <td>${escHtml(site.wsite)}</td>
        <td>${info.current ?? site.wireless_clients ?? '—'}</td>
        <td>${baselineVal ?? '—'} <span style="font-size:0.75rem;opacity:0.6;">(${baselineLabel})</span></td>
        <td>${Number.isFinite(Number(info.drop_pct)) ? `${Number(info.drop_pct).toFixed(1)}%` : '—'}</td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join('');
  container.innerHTML = rows
    ? `
      ${hubCentralBannerHtml(summary)}
      <div class="setup-card">
        <table class="data-table">
          <thead><tr><th>Site</th><th>Current Count</th><th>Baseline</th><th>Drop %</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : `${hubCentralBannerHtml(summary)}<div class="empty-state">No client data available.</div>`;
}

async function populateSpokeSelect(selectEl, tenantId, preferredSpokeId = "") {
  if (!selectEl || !tenantId) return "";
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  const spokes = (res?.ok ? await res.json() : null) || [];
  selectEl.innerHTML = "";
  if (!spokes.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No spokes available";
    selectEl.appendChild(opt);
    return "";
  }
  spokes.forEach((spoke) => {
    const opt = document.createElement("option");
    opt.value = spoke.id;
    opt.textContent = spoke.spoke_name || spoke.hostname || spoke.id;
    selectEl.appendChild(opt);
  });
  const nextValue = spokes.some((s) => s.id === preferredSpokeId)
    ? preferredSpokeId
    : (spokes[0]?.id || "");
  selectEl.value = nextValue;
  return selectEl.value;
}

async function loadSpokeConfig(tenantId, spokeId) {
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`);
  const data = await readJson(res);
  if (!res || !res.ok) throw new Error(data?.detail || "Unable to load spoke config.");
  return data || {};
}

async function pushSpokeConfig(tenantId, spokeId, config) {
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/config`, {
    method: "POST",
    body: config,
  });
  const data = await readJson(res);
  if (!res || !res.ok) throw new Error(data?.detail || "Unable to push spoke config.");
  return data || {};
}

function setHubTenantSetupPanels(subtab = hubTenantSetupActiveSubtab) {
  $$(".hub-ts-subtab").forEach((button) => button.classList.toggle("active", button.dataset.subtab === subtab));
  [
    "ts-setup-panel",
    "ts-central-api-panel",
    "ts-proxmox-panel",
    "ts-security-panel",
    "ts-notifications-panel",
    "ts-troubleshoot-panel",
    "ts-spokes-panel",
    "ts-processing-panel",
    "ts-simulations-panel",
  ].forEach((panelId) => {
    document.getElementById(panelId)?.classList.toggle("hidden", panelId !== `${subtab}-panel`);
  });
}

function ensureSelectHasOption(selectEl, value, label = value) {
  if (!selectEl || !value) return;
  if (![...selectEl.options].some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
  }
}

function formatTsBool(value, positive = "Yes", negative = "No") {
  if (value === null || value === undefined || value === "") return "—";
  return value ? positive : negative;
}

function setTroubleshootField(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? "—";
}

async function initTsProxmoxTab(tenantId) {
  const saveBtn = $("#ts-proxmox-save-btn");
  const msg = $("#ts-proxmox-msg");
  if (!saveBtn || !tenantId) return;
  saveBtn.disabled = !canManageTenant(tenantId);

  // Load defaults from first available spoke so the form isn't blank
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  const spokes = (res?.ok ? await res.json() : null) || [];
  if (spokes.length) {
    try {
      const data = await loadSpokeConfig(tenantId, spokes[0].id);
      const cfg = data.config || {};
      const autoProvision = cfg.usb_auto_provision === true || String(cfg.usb_auto_provision || "").toLowerCase() === "on";
      $("#ts-usb-auto-provision") && ($("#ts-usb-auto-provision").checked = autoProvision);
      $("#ts-usb-missing-timeout") && ($("#ts-usb-missing-timeout").value = cfg.usb_missing_timeout ?? 60);
      $("#ts-usb-max-slots") && ($("#ts-usb-max-slots").value = cfg.usb_max_slots ?? 24);
      $("#ts-cpu-prov-thr") && ($("#ts-cpu-prov-thr").value = cfg.cpu_provision_threshold ?? 80);
      $("#ts-cpu-del-thr") && ($("#ts-cpu-del-thr").value = cfg.cpu_delete_threshold ?? 90);
      $("#ts-mem-prov-thr") && ($("#ts-mem-prov-thr").value = cfg.mem_provision_threshold ?? 80);
      $("#ts-mem-del-thr") && ($("#ts-mem-del-thr").value = cfg.mem_delete_threshold ?? 90);
      $("#ts-vm-image-1-template-id") && ($("#ts-vm-image-1-template-id").value = cfg.vm_image_1_template_id ?? 100);
      $("#ts-vm-image-2-template-id") && ($("#ts-vm-image-2-template-id").value = cfg.vm_image_2_template_id ?? 200);
      $("#ts-vm-image-1-pct") && ($("#ts-vm-image-1-pct").value = cfg.vm_image_1_pct ?? 50);
      $("#ts-reclone-concurrency") && ($("#ts-reclone-concurrency").value = cfg.reclone_concurrency ?? 1);
      $("#ts-protected-vmids") && ($("#ts-protected-vmids").value = cfg.protected_vmids ?? "");
    } catch (_) { /* leave form at HTML defaults */ }
  }

  // Push to ALL spokes
  saveBtn.onclick = async () => {
    if (!spokes.length) { showToast("No spokes available.", "error"); return; }
    const config = {
      usb_auto_provision:      $("#ts-usb-auto-provision")?.checked ? "on" : "off",
      usb_missing_timeout:     parseInt($("#ts-usb-missing-timeout")?.value || "60", 10) || 60,
      usb_max_slots:           parseInt($("#ts-usb-max-slots")?.value || "24", 10) || 24,
      cpu_provision_threshold: String(parseInt($("#ts-cpu-prov-thr")?.value || "80", 10) || 80),
      cpu_delete_threshold:    String(parseInt($("#ts-cpu-del-thr")?.value || "90", 10) || 90),
      mem_provision_threshold: String(parseInt($("#ts-mem-prov-thr")?.value || "80", 10) || 80),
      mem_delete_threshold:    String(parseInt($("#ts-mem-del-thr")?.value || "90", 10) || 90),
      vm_image_1_template_id:  parseInt($("#ts-vm-image-1-template-id")?.value || "100", 10) || 100,
      vm_image_2_template_id:  parseInt($("#ts-vm-image-2-template-id")?.value || "200", 10) || 200,
      vm_image_1_pct:          parseInt($("#ts-vm-image-1-pct")?.value || "50", 10) || 50,
      reclone_concurrency:     parseInt($("#ts-reclone-concurrency")?.value || "1", 10) || 1,
      protected_vmids:         $("#ts-protected-vmids")?.value?.trim() ?? "",
    };
    saveBtn.disabled = true;
    try {
      await Promise.all(spokes.map((s) => pushSpokeConfig(tenantId, s.id, config)));
      showToast(`Proxmox config queued for ${spokes.length} spoke${spokes.length !== 1 ? "s" : ""}`, "success");
    } catch (error) {
      showToast(error.message || "Failed to push Proxmox settings.", "error");
    } finally {
      saveBtn.disabled = false;
    }
  };

  // Override section — collapsible, targets a single spoke
  const overrideHeader = $("#ts-proxmox-override-header");
  const overrideBody = $("#ts-proxmox-override-body");
  const overrideChevron = $("#ts-proxmox-override-chevron");
  const overrideSelect = $("#ts-proxmox-spoke-select");
  const overrideSaveBtn = $("#ts-proxmox-override-save-btn");
  const overrideMsg = $("#ts-proxmox-override-msg");

  if (overrideHeader && overrideBody) {
    overrideHeader.onclick = () => {
      const hidden = overrideBody.classList.toggle("hidden");
      if (overrideChevron) overrideChevron.textContent = hidden ? "▶ expand" : "▼ collapse";
    };
  }

  if (overrideSelect) {
    await populateSpokeSelect(overrideSelect, tenantId, "");
    const loadOverride = async () => {
      const spokeId = overrideSelect.value;
      if (!spokeId) return;
      try {
        const data = await loadSpokeConfig(tenantId, spokeId);
        const cfg = data.config || {};
        const autoProvision = cfg.usb_auto_provision === true || String(cfg.usb_auto_provision || "").toLowerCase() === "on";
        $("#ts-ov-usb-auto-provision") && ($("#ts-ov-usb-auto-provision").checked = autoProvision);
        $("#ts-ov-usb-missing-timeout") && ($("#ts-ov-usb-missing-timeout").value = cfg.usb_missing_timeout ?? 60);
        $("#ts-ov-usb-max-slots") && ($("#ts-ov-usb-max-slots").value = cfg.usb_max_slots ?? 24);
        $("#ts-ov-vm-image-1-template-id") && ($("#ts-ov-vm-image-1-template-id").value = cfg.vm_image_1_template_id ?? 100);
        $("#ts-ov-vm-image-2-template-id") && ($("#ts-ov-vm-image-2-template-id").value = cfg.vm_image_2_template_id ?? 200);
        $("#ts-ov-vm-image-1-pct") && ($("#ts-ov-vm-image-1-pct").value = cfg.vm_image_1_pct ?? 50);
        $("#ts-ov-reclone-concurrency") && ($("#ts-ov-reclone-concurrency").value = cfg.reclone_concurrency ?? 1);
        $("#ts-ov-protected-vmids") && ($("#ts-ov-protected-vmids").value = cfg.protected_vmids ?? "");
        showInlineMessage(overrideMsg, "", false, 0);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to load spoke config.", true);
      }
    };
    overrideSelect.onchange = () => void loadOverride();
    await loadOverride();
  }

  if (overrideSaveBtn) {
    overrideSaveBtn.disabled = !canManageTenant(tenantId);
    overrideSaveBtn.onclick = async () => {
      const spokeId = overrideSelect?.value;
      if (!spokeId) return;
      const config = {
        usb_auto_provision: $("#ts-ov-usb-auto-provision")?.checked ? "on" : "off",
        usb_missing_timeout: parseInt($("#ts-ov-usb-missing-timeout")?.value || "60", 10) || 60,
        usb_max_slots: parseInt($("#ts-ov-usb-max-slots")?.value || "24", 10) || 24,
        vm_image_1_template_id: parseInt($("#ts-ov-vm-image-1-template-id")?.value || "100", 10) || 100,
        vm_image_2_template_id: parseInt($("#ts-ov-vm-image-2-template-id")?.value || "200", 10) || 200,
        vm_image_1_pct: parseInt($("#ts-ov-vm-image-1-pct")?.value || "50", 10) || 50,
        reclone_concurrency: parseInt($("#ts-ov-reclone-concurrency")?.value || "1", 10) || 1,
        protected_vmids: $("#ts-ov-protected-vmids")?.value?.trim() ?? "",
      };
      try {
        await pushSpokeConfig(tenantId, spokeId, config);
        const spokeName = overrideSelect.options[overrideSelect.selectedIndex]?.text || spokeId;
        showInlineMessage(overrideMsg, `Pushed to ${spokeName} ✓`, false);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to push to spoke.", true);
      }
    };
  }
}

async function initTsSecurityTab(tenantId) {
  const saveBtn = $("#ts-security-save-btn");
  const msg = $("#ts-security-msg");
  const providerSelect = $("#ts-auth-provider");
  if (!saveBtn || !tenantId) return;
  saveBtn.disabled = !canManageTenant(tenantId);

  // Load defaults from first available spoke so the form isn't blank
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  const spokes = (res?.ok ? await res.json() : null) || [];
  if (spokes.length) {
    try {
      const data = await loadSpokeConfig(tenantId, spokes[0].id);
      const cfg = data.config || {};
      $("#ts-session-timeout") && ($("#ts-session-timeout").value = cfg.session_timeout_minutes ?? 30);
      const provider = String(cfg.auth_provider || "local").toLowerCase();
      ensureSelectHasOption(providerSelect, provider, provider.toUpperCase());
      if (providerSelect) providerSelect.value = provider;
    } catch (_) { /* leave form at HTML defaults */ }
  }

  // Push to ALL spokes
  saveBtn.onclick = async () => {
    if (!spokes.length) { showToast("No spokes available.", "error"); return; }
    const payload = {
      session_timeout_minutes: parseInt($("#ts-session-timeout")?.value || "30", 10) || 30,
      auth_provider: providerSelect?.value || "local",
    };
    saveBtn.disabled = true;
    try {
      await Promise.all(spokes.map((s) => pushSpokeConfig(tenantId, s.id, payload)));
      showToast(`Security settings queued for ${spokes.length} spoke${spokes.length !== 1 ? "s" : ""}`, "success");
      showInlineMessage(msg, "", false, 0);
    } catch (error) {
      showToast(error.message || "Failed to push security settings.", "error");
    } finally {
      saveBtn.disabled = !canManageTenant(tenantId);
    }
  };

  // Override section — collapsible, targets a single spoke
  const overrideHeader = $("#ts-security-override-header");
  const overrideBody = $("#ts-security-override-body");
  const overrideChevron = $("#ts-security-override-chevron");
  const overrideSelect = $("#ts-security-spoke-select");
  const overrideSaveBtn = $("#ts-security-override-save-btn");
  const overrideMsg = $("#ts-security-override-msg");
  const ovProviderSelect = $("#ts-ov-auth-provider");

  if (overrideHeader && overrideBody) {
    overrideHeader.onclick = () => {
      const hidden = overrideBody.classList.toggle("hidden");
      if (overrideChevron) overrideChevron.textContent = hidden ? "▶ expand" : "▼ collapse";
    };
  }

  if (overrideSelect) {
    await populateSpokeSelect(overrideSelect, tenantId, "");
    const loadOverride = async () => {
      const spokeId = overrideSelect.value;
      if (!spokeId) return;
      try {
        const data = await loadSpokeConfig(tenantId, spokeId);
        const cfg = data.config || {};
        $("#ts-ov-session-timeout") && ($("#ts-ov-session-timeout").value = cfg.session_timeout_minutes ?? 30);
        const provider = String(cfg.auth_provider || "local").toLowerCase();
        ensureSelectHasOption(ovProviderSelect, provider, provider.toUpperCase());
        if (ovProviderSelect) ovProviderSelect.value = provider;
        showInlineMessage(overrideMsg, "", false, 0);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to load spoke config.", true);
      }
    };
    overrideSelect.onchange = () => void loadOverride();
    await loadOverride();
  }

  if (overrideSaveBtn) {
    overrideSaveBtn.disabled = !canManageTenant(tenantId);
    overrideSaveBtn.onclick = async () => {
      const spokeId = overrideSelect?.value;
      if (!spokeId) return;
      const payload = {
        session_timeout_minutes: parseInt($("#ts-ov-session-timeout")?.value || "30", 10) || 30,
        auth_provider: ovProviderSelect?.value || "local",
      };
      try {
        await pushSpokeConfig(tenantId, spokeId, payload);
        const spokeName = overrideSelect.options[overrideSelect.selectedIndex]?.text || spokeId;
        showInlineMessage(overrideMsg, `Pushed to ${spokeName} ✓`, false);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to push to spoke.", true);
      }
    };
  }
}

async function initTsNotificationsTab(tenantId) {
  const saveBtn = $("#ts-notifications-save-btn");
  const msg = $("#ts-notifications-msg");
  const smtpPasswordInput = $("#ts-notif-smtp-password");
  const teamsWebhookInput = $("#ts-notif-teams-webhook");
  if (!saveBtn || !tenantId) return;
  saveBtn.disabled = !canManageTenant(tenantId);

  // Load defaults from first available spoke so the form isn't blank
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  const spokes = (res?.ok ? await res.json() : null) || [];
  if (spokes.length) {
    try {
      const data = await loadSpokeConfig(tenantId, spokes[0].id);
      const notif = data.config?.notifications || {};
      $("#ts-notif-email-enabled") && ($("#ts-notif-email-enabled").checked = !!notif.email_enabled);
      $("#ts-notif-teams-enabled") && ($("#ts-notif-teams-enabled").checked = !!notif.teams_enabled);
      $("#ts-notif-smtp-host") && ($("#ts-notif-smtp-host").value = notif.smtp_host || "");
      $("#ts-notif-smtp-port") && ($("#ts-notif-smtp-port").value = notif.smtp_port ?? 587);
      $("#ts-notif-smtp-user") && ($("#ts-notif-smtp-user").value = notif.smtp_user || "");
      $("#ts-notif-smtp-from") && ($("#ts-notif-smtp-from").value = notif.smtp_from || "");
      $("#ts-notif-smtp-to") && ($("#ts-notif-smtp-to").value = Array.isArray(notif.smtp_to) ? notif.smtp_to.join(", ") : (notif.smtp_to || ""));
      if (smtpPasswordInput) setSecretInputConfigured(smtpPasswordInput, Boolean(notif.smtp_password || notif.smtp_password_configured));
      if (teamsWebhookInput) setSecretInputConfigured(teamsWebhookInput, Boolean(notif.teams_webhook_url || notif.teams_webhook_url_configured));
    } catch (_) { /* leave form at HTML defaults */ }
  }

  // Push to ALL spokes
  saveBtn.onclick = async () => {
    if (!spokes.length) { showToast("No spokes available.", "error"); return; }
    const smtpSecret = getSecretInputPayload(smtpPasswordInput);
    const teamsSecret = getSecretInputPayload(teamsWebhookInput);
    const notifications = {
      email_enabled: $("#ts-notif-email-enabled")?.checked ?? false,
      teams_enabled: $("#ts-notif-teams-enabled")?.checked ?? false,
      smtp_host: $("#ts-notif-smtp-host")?.value.trim() || "",
      smtp_port: parseInt($("#ts-notif-smtp-port")?.value || "587", 10) || 587,
      smtp_user: $("#ts-notif-smtp-user")?.value.trim() || "",
      smtp_from: $("#ts-notif-smtp-from")?.value.trim() || "",
      smtp_to: ($("#ts-notif-smtp-to")?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
    };
    if (smtpSecret.include) notifications.smtp_password = smtpSecret.value;
    if (teamsSecret.include) notifications.teams_webhook_url = teamsSecret.value.trim();
    saveBtn.disabled = true;
    try {
      await Promise.all(spokes.map((s) => pushSpokeConfig(tenantId, s.id, { notifications })));
      resetSecretInput(smtpPasswordInput);
      resetSecretInput(teamsWebhookInput);
      showToast(`Notification settings queued for ${spokes.length} spoke${spokes.length !== 1 ? "s" : ""}`, "success");
      showInlineMessage(msg, "", false, 0);
    } catch (error) {
      showToast(error.message || "Failed to push notification settings.", "error");
    } finally {
      saveBtn.disabled = !canManageTenant(tenantId);
    }
  };

  // Override section — collapsible, targets a single spoke
  const overrideHeader = $("#ts-notif-override-header");
  const overrideBody = $("#ts-notif-override-body");
  const overrideChevron = $("#ts-notif-override-chevron");
  const overrideSelect = $("#ts-notif-spoke-select");
  const overrideSaveBtn = $("#ts-notif-override-save-btn");
  const overrideMsg = $("#ts-notif-override-msg");
  const ovSmtpPass = $("#ts-ov-notif-smtp-password");
  const ovTeamsWebhook = $("#ts-ov-notif-teams-webhook");

  if (overrideHeader && overrideBody) {
    overrideHeader.onclick = () => {
      const hidden = overrideBody.classList.toggle("hidden");
      if (overrideChevron) overrideChevron.textContent = hidden ? "▶ expand" : "▼ collapse";
    };
  }

  if (overrideSelect) {
    await populateSpokeSelect(overrideSelect, tenantId, "");
    const loadOverride = async () => {
      const spokeId = overrideSelect.value;
      if (!spokeId) return;
      try {
        const data = await loadSpokeConfig(tenantId, spokeId);
        const notif = data.config?.notifications || {};
        $("#ts-ov-notif-email-enabled") && ($("#ts-ov-notif-email-enabled").checked = !!notif.email_enabled);
        $("#ts-ov-notif-teams-enabled") && ($("#ts-ov-notif-teams-enabled").checked = !!notif.teams_enabled);
        $("#ts-ov-notif-smtp-host") && ($("#ts-ov-notif-smtp-host").value = notif.smtp_host || "");
        $("#ts-ov-notif-smtp-port") && ($("#ts-ov-notif-smtp-port").value = notif.smtp_port ?? 587);
        $("#ts-ov-notif-smtp-user") && ($("#ts-ov-notif-smtp-user").value = notif.smtp_user || "");
        $("#ts-ov-notif-smtp-from") && ($("#ts-ov-notif-smtp-from").value = notif.smtp_from || "");
        $("#ts-ov-notif-smtp-to") && ($("#ts-ov-notif-smtp-to").value = Array.isArray(notif.smtp_to) ? notif.smtp_to.join(", ") : (notif.smtp_to || ""));
        if (ovSmtpPass) setSecretInputConfigured(ovSmtpPass, Boolean(notif.smtp_password || notif.smtp_password_configured));
        if (ovTeamsWebhook) setSecretInputConfigured(ovTeamsWebhook, Boolean(notif.teams_webhook_url || notif.teams_webhook_url_configured));
        showInlineMessage(overrideMsg, "", false, 0);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to load spoke config.", true);
      }
    };
    overrideSelect.onchange = () => void loadOverride();
    await loadOverride();
  }

  if (overrideSaveBtn) {
    overrideSaveBtn.disabled = !canManageTenant(tenantId);
    overrideSaveBtn.onclick = async () => {
      const spokeId = overrideSelect?.value;
      if (!spokeId) return;
      const ovSmtpSecret = getSecretInputPayload(ovSmtpPass);
      const ovTeamsSecret = getSecretInputPayload(ovTeamsWebhook);
      const notifications = {
        email_enabled: $("#ts-ov-notif-email-enabled")?.checked ?? false,
        teams_enabled: $("#ts-ov-notif-teams-enabled")?.checked ?? false,
        smtp_host: $("#ts-ov-notif-smtp-host")?.value.trim() || "",
        smtp_port: parseInt($("#ts-ov-notif-smtp-port")?.value || "587", 10) || 587,
        smtp_user: $("#ts-ov-notif-smtp-user")?.value.trim() || "",
        smtp_from: $("#ts-ov-notif-smtp-from")?.value.trim() || "",
        smtp_to: ($("#ts-ov-notif-smtp-to")?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
      };
      if (ovSmtpSecret.include) notifications.smtp_password = ovSmtpSecret.value;
      if (ovTeamsSecret.include) notifications.teams_webhook_url = ovTeamsSecret.value.trim();
      try {
        await pushSpokeConfig(tenantId, spokeId, { notifications });
        resetSecretInput(ovSmtpPass);
        resetSecretInput(ovTeamsWebhook);
        const spokeName = overrideSelect.options[overrideSelect.selectedIndex]?.text || spokeId;
        showInlineMessage(overrideMsg, `Pushed to ${spokeName} ✓`, false);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to push to spoke.", true);
      }
    };
  }
}

async function initTsTroubleshootTab(tenantId) {
  const updateBtn = $("#ts-troubleshoot-update-btn");
  const msg = $("#ts-troubleshoot-msg");
  if (!updateBtn || !tenantId) return;
  updateBtn.disabled = !canManageTenant(tenantId);

  // Load health from first available spoke into the main panel
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
  const spokes = (res?.ok ? await res.json() : null) || [];
  if (spokes.length) {
    try {
      const data = await loadSpokeConfig(tenantId, spokes[0].id);
      const health = data.telemetry?.api_server?.health || {};
      const label = $("#ts-trbl-spoke-label");
      if (label) label.textContent = `— ${spokes[0].name || spokes[0].id}`;
      setTroubleshootField("ts-trbl-version", health.version || "—");
      setTroubleshootField("ts-trbl-repo-synced", health.repo_synced != null ? formatTsBool(Boolean(health.repo_synced), "Yes", "No") : "—");
      setTroubleshootField("ts-trbl-repo-error", health.repo_error || "None");
      setTroubleshootField("ts-trbl-installer-version", health.installer_version || "—");
    } catch (_) { /* leave fields at defaults */ }
  }

  // Trigger update on ALL spokes
  updateBtn.onclick = async () => {
    if (!spokes.length) { showToast("No spokes available.", "error"); return; }
    updateBtn.disabled = true;
    let succeeded = 0;
    for (const s of spokes) {
      const ok = await sendCommandToSpoke(tenantId, s.id, "update_now");
      if (ok) succeeded++;
    }
    updateBtn.disabled = !canManageTenant(tenantId);
    showToast(`Update queued for ${succeeded} of ${spokes.length} spoke${spokes.length !== 1 ? "s" : ""}`, succeeded > 0 ? "success" : "error");
  };

  // Per-spoke override section — collapsible
  const overrideHeader = $("#ts-trbl-override-header");
  const overrideBody = $("#ts-trbl-override-body");
  const overrideChevron = $("#ts-trbl-override-chevron");
  const overrideSelect = $("#ts-troubleshoot-spoke-select");
  const overrideUpdateBtn = $("#ts-trbl-override-update-btn");
  const overrideMsg = $("#ts-trbl-override-msg");

  if (overrideHeader && overrideBody) {
    overrideHeader.onclick = () => {
      const hidden = overrideBody.classList.toggle("hidden");
      if (overrideChevron) overrideChevron.textContent = hidden ? "▶ expand" : "▼ collapse";
    };
  }

  if (overrideSelect) {
    await populateSpokeSelect(overrideSelect, tenantId, "");
    const loadOverride = async () => {
      const spokeId = overrideSelect.value;
      if (!spokeId) return;
      try {
        const data = await loadSpokeConfig(tenantId, spokeId);
        const health = data.telemetry?.api_server?.health || {};
        setTroubleshootField("ts-trbl-ov-version", health.version || "—");
        setTroubleshootField("ts-trbl-ov-repo-synced", health.repo_synced != null ? formatTsBool(Boolean(health.repo_synced), "Yes", "No") : "—");
        setTroubleshootField("ts-trbl-ov-repo-error", health.repo_error || "None");
        setTroubleshootField("ts-trbl-ov-installer-version", health.installer_version || "—");
        showInlineMessage(overrideMsg, "", false, 0);
      } catch (error) {
        showInlineMessage(overrideMsg, error.message || "Failed to load spoke health.", true);
      }
    };
    overrideSelect.onchange = () => void loadOverride();
    await loadOverride();
  }

  if (overrideUpdateBtn) {
    overrideUpdateBtn.disabled = !canManageTenant(tenantId);
    overrideUpdateBtn.onclick = async () => {
      const spokeId = overrideSelect?.value;
      if (!spokeId) return;
      const ok = await sendCommandToSpoke(tenantId, spokeId, "update_now");
      const spokeName = overrideSelect.options[overrideSelect.selectedIndex]?.text || spokeId;
      showInlineMessage(overrideMsg, ok ? `Update queued for ${spokeName} ✓` : "Failed to queue update.", !ok);
    };
  }
}

async function initHubTenantSetupSubtab(subtab = hubTenantSetupActiveSubtab, force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !currentUser) return;
  if (subtab === "ts-central-api") {
    await initTsCentralApiTab(force);
    return;
  }
  if (subtab === "ts-proxmox") {
    await initTsProxmoxTab(tenantId);
    return;
  }
  if (subtab === "ts-security") {
    await initTsSecurityTab(tenantId);
    return;
  }
  if (subtab === "ts-notifications") {
    await initTsNotificationsTab(tenantId);
    return;
  }
  if (subtab === "ts-troubleshoot") {
    await initTsTroubleshootTab(tenantId);
  }
  if (subtab === "ts-spokes") {
    await initTsSpokesTab(tenantId);
  }
  if (subtab === "ts-processing") {
    await initTsProcessingTab(tenantId);
  }
  if (subtab === "ts-simulations") {
    initTsSimulationsTab(force);
  }
}

async function initTsProcessingTab(tenantId) {
  const container = $("#ts-processing-content");
  if (!container || !tenantId) return;
  container.innerHTML = '<div class="empty-state">Loading…</div>';

  const data = await loadTenantDetailData(false);
  const processing = data?.processing;
  const settings = data?.settings;
  const disabled = canManageTenant(tenantId) ? "" : " disabled";

  const processingModes = {
    central_api: settings?.processing_modes?.central_api || data?.processing?.default_mode || "centralized",
    teams: settings?.processing_modes?.teams || "centralized",
    email: settings?.processing_modes?.email || "centralized",
  };

  const processingRows = processing?.spokes?.length
    ? PROCESSING_FEATURES.map(feature => {
        const counts = processing.spokes.reduce((acc, item) => {
          const mode = item.effective_modes?.[feature] || item.global_mode || processing.default_mode || "centralized";
          acc[mode] = (acc[mode] || 0) + 1;
          return acc;
        }, {});
        return `<tr>
          <td>${escHtml(feature.replace(/_/g, " "))}</td>
          <td>${escHtml(processing.default_mode || "centralized")}</td>
          <td>${escHtml(Object.entries(counts).map(([m, c]) => `${m}:${c}`).join(" • "))}</td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="3" class="empty-state">No processing summary available.</td></tr>';

  container.innerHTML = `
    <div class="setup-card" style="margin-bottom:16px;">
      <div class="setup-card-header"><h2>Processing Modes ${helpIcon('central-mode')}</h2><p>Choose which credentials stay centralized on the hub versus distributed to spokes.</p></div>
      <div class="setup-form processing-modes-section mt-3">
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small">Central API</label>
            <select class="form-input" id="pm-central-api" onchange="saveProcessingMode('${escHtml(tenantId)}', 'central_api', this.value)"${disabled}>
              <option value="centralized"${processingModes.central_api === "centralized" ? " selected" : ""}>Centralized</option>
              <option value="distributed"${processingModes.central_api === "distributed" ? " selected" : ""}>Distributed</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Teams Webhook</label>
            <select class="form-input" id="pm-teams" onchange="saveProcessingMode('${escHtml(tenantId)}', 'teams', this.value)"${disabled}>
              <option value="centralized"${processingModes.teams === "centralized" ? " selected" : ""}>Centralized</option>
              <option value="distributed"${processingModes.teams === "distributed" ? " selected" : ""}>Distributed</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Email / SMTP</label>
            <select class="form-input" id="pm-email" onchange="saveProcessingMode('${escHtml(tenantId)}', 'email', this.value)"${disabled}>
              <option value="centralized"${processingModes.email === "centralized" ? " selected" : ""}>Centralized</option>
              <option value="distributed"${processingModes.email === "distributed" ? " selected" : ""}>Distributed</option>
            </select>
          </div>
        </div>
        <div id="processing-modes-msg" class="form-msg"></div>
      </div>
    </div>
    <div class="setup-card">
      <div class="setup-card-header"><h2>Processing Defaults</h2><p>Tenant default mode plus effective spoke distribution per feature.</p></div>
      <table class="data-table">
        <thead><tr><th>Feature</th><th>Tenant Default</th><th>Effective Modes</th></tr></thead>
        <tbody>${processingRows}</tbody>
      </table>
    </div>`;
}

function initTsSimulationsTab(force = false) {
  const tenantId = currentTenantId || getActiveTenantId();
  renderSetupSimulationConfigEditor();
  if (tenantId && (!hubSimulationConfState.loaded || force)) loadSetupSimulationConf(tenantId, force);
  if (tenantId && (!hubUserOverridesConfState.loaded || force)) loadSetupUserOverridesConf(tenantId, true);
}

async function activateHubTenantSetupSubtab(subtab = "ts-central-api", force = false) {
  hubTenantSetupActiveSubtab = subtab || "ts-central-api";
  setHubTenantSetupPanels(hubTenantSetupActiveSubtab);
  await initHubTenantSetupSubtab(hubTenantSetupActiveSubtab, force);
}

async function loadTenantAssignedSites(tenantId) {
  if (!tenantId) return [];
  const currentMappings = tenantId === getActiveTenantId()
    ? hubCentralData?.central_sites_config?.site_mappings
    : null;
  if (currentMappings && typeof currentMappings === 'object') {
    return Object.keys(currentMappings).filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }
  const res = await apiFetch(`/api/aggregate/central-status?tenant_id=${encodeURIComponent(tenantId)}`);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const mappings = data?.central_sites_config?.site_mappings && typeof data.central_sites_config.site_mappings === 'object'
    ? data.central_sites_config.site_mappings
    : {};
  return Object.keys(mappings).filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

// ── Central API Browse ──────────────────────────────────────────────────────

let hubCentralBrowseData = null;
let hubCaBrowseActiveTab = "ts-ca-sites";
let hubCaBrowseMonitoredItems = []; // cached monitored items for button state

function hubCaFindMonitoredItem(type, payload = {}) {
  const requestedType = String(type || "").trim().toLowerCase();
  const requestedIdentifier = String(
    payload.identifier || payload.name || payload.hostname || payload.mac || ""
  ).trim().toLowerCase();
  const requestedSite = String(
    payload.site || payload.site_name || payload.central_site || ""
  ).trim().toLowerCase();
  if (!requestedIdentifier) return null;
  return hubCaBrowseMonitoredItems.find((item) => {
    const itemType = String(item?.type || "").trim().toLowerCase();
    if (requestedType && itemType && itemType !== requestedType) return false;
    const itemIdentifier = String(item?.identifier || item?.name || "").trim().toLowerCase();
    const itemSite = String(item?.site || item?.site_name || item?.central_site || "").trim().toLowerCase();
    return itemIdentifier === requestedIdentifier && (!itemSite || !requestedSite || itemSite === requestedSite);
  }) || null;
}

function hubCaIsMonitored(type, name, site, identifier = "") {
  const n = (name || "").toLowerCase().trim();
  // Sites are stored in central_sites_config.site_mappings, not monitored-items
  if (type === "site") {
    const mappings = hubCentralData?.central_sites_config?.site_mappings;
    if (mappings && typeof mappings === "object") {
      return Object.keys(mappings).some((k) => k.toLowerCase().trim() === n);
    }
    return false;
  }
  return Boolean(hubCaFindMonitoredItem(type, { name, site, identifier }));
}
let hubCaBrowseRefreshTimer = null;

function hubCaBrowseCacheKey(tenantId = getActiveTenantId()) {
  return tenantId ? `hub_ca_browse_${tenantId}` : "";
}

function hubCaIsIndividualClientRecord(client) {
  if (!client || typeof client !== "object") return false;
  return ["mac", "hostname", "ip", "ap", "ssid", "status", "os", "vlan"]
    .some((key) => Object.prototype.hasOwnProperty.call(client, key));
}

function hubCaHasLegacyClientSummaryRows(data) {
  const clients = Array.isArray(data?.clients) ? data.clients : [];
  const hasIndividualClients = clients.some((client) => hubCaIsIndividualClientRecord(client));
  const hasLegacyClientSummaries = clients.some((client) =>
    client && typeof client === "object"
    && !hubCaIsIndividualClientRecord(client)
    && ["total", "wired", "wireless"].some((key) => Object.prototype.hasOwnProperty.call(client, key))
  );
  return hasLegacyClientSummaries && !hasIndividualClients;
}

function normalizeHubCaBrowseData(data) {
  if (!data || typeof data !== "object") return data;
  const normalized = { ...data };
  const clients = Array.isArray(data.clients) ? data.clients : [];

  if (hubCaHasLegacyClientSummaryRows(data)) {
    normalized.clients = [];
    if (!normalized.clients_by_site || typeof normalized.clients_by_site !== "object") {
      normalized.clients_by_site = Object.fromEntries(clients.map((client) => {
        const site = String(client?.site || "—").trim() || "—";
        return [site, {
          total: Number(client?.total) || 0,
          wired: Number(client?.wired) || 0,
          wireless: Number(client?.wireless) || 0,
        }];
      }));
    }
  } else if (!Array.isArray(normalized.clients)) {
    normalized.clients = [];
  }

  return normalized;
}

function saveHubCaBrowseCache(data, tenantId = getActiveTenantId()) {
  const key = hubCaBrowseCacheKey(tenantId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(normalizeHubCaBrowseData(data)));
  } catch (_) {}
}

function loadHubCaBrowseCache(tenantId = getActiveTenantId()) {
  const key = hubCaBrowseCacheKey(tenantId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hubCaHasLegacyClientSummaryRows(parsed) ? null : normalizeHubCaBrowseData(parsed);
  } catch (_) {
    return null;
  }
}

function resetHubCaBrowsePills() {
  const modePill = $("#ts-ca-mode-pill");
  const sitesPill = $("#ts-ca-sites-pill");
  const updPill = $("#ts-ca-updated-pill");
  if (modePill) modePill.textContent = "— mode";
  if (sitesPill) sitesPill.textContent = "— sites";
  if (updPill) updPill.textContent = "—";
}

function updateHubCaBrowsePills(data) {
  const modePill = $("#ts-ca-mode-pill");
  const sitesPill = $("#ts-ca-sites-pill");
  const updPill = $("#ts-ca-updated-pill");
  if (modePill) modePill.textContent = `${data?.mode || "—"} mode`;
  if (sitesPill) sitesPill.textContent = `${(data?.sites || []).length} sites`;
  if (updPill) {
    if (data?.cached_at) {
      updPill.textContent = `Updated ${new Date(data.cached_at * 1000).toLocaleTimeString()}`;
    } else {
      updPill.textContent = "—";
    }
  }
}

function scheduleHubCaBrowseRefresh() {
  clearTimeout(hubCaBrowseRefreshTimer);
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  hubCaBrowseRefreshTimer = setTimeout(() => {
    if (hubTenantSetupActiveSubtab === "ts-central-api" && getActiveTenantId() === tenantId) {
      loadHubCaBrowseData(true).catch(() => {});
    }
  }, 5 * 60 * 1000);
}

async function initTsCentralApiTab(force = false) {
  const tenantId = getActiveTenantId();
  if (!tenantId) return;

  // Populate cluster select options if empty
  const clusterSel = $("#ts-ca-central-cluster-select");
  if (clusterSel && clusterSel.options.length <= 2) {
    const opts = NEW_CENTRAL_CLUSTERS.map(c =>
      `<option value="${escHtml(c.url)}">${escHtml(c.label)}</option>`
    ).join("");
    clusterSel.insertAdjacentHTML("afterbegin", opts);
  }

  const saveCentralBtn = $("#ts-ca-save-central-btn");
  if (saveCentralBtn) saveCentralBtn.onclick = saveTsApiCentralSettings;

  const saveGithubBtn = $("#ts-ca-save-github-btn");
  if (saveGithubBtn) saveGithubBtn.onclick = saveTsApiGithubSettings;

  const clearSecretsBtn = $("#ts-ca-clear-secrets-btn");
  if (clearSecretsBtn) clearSecretsBtn.onclick = async () => {
    if (!confirm("Clear the stored Central client secret and access token?")) return;
    clearSecretsBtn.disabled = true;
    clearSecretsBtn.textContent = "Clearing…";
    try {
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/central-clear-secrets`, { method: "POST" });
      if (!res?.ok) {
        const err = await readJson(res);
        setFormMessage("ts-ca-central-msg", err?.detail || "Failed to clear secrets.", false);
      } else {
        setFormMessage("ts-ca-central-msg", "Secrets cleared.", true);
        void loadTsApiSettingsForm(true);
      }
    } finally {
      clearSecretsBtn.disabled = false;
      clearSecretsBtn.textContent = "Clear Secrets";
    }
  };

  const testCentralBtn = $("#ts-ca-test-central-btn");
  if (testCentralBtn) testCentralBtn.onclick = async () => {
    testCentralBtn.disabled = true;
    setFormMessage("ts-ca-central-msg", "Testing…", true);
    try {
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/test-central`, { method: "POST" });
      const data = await readJson(res);
      if (!res?.ok || !data?.ok) {
        setFormMessage("ts-ca-central-msg", `Connection failed: ${data?.error || "Unknown error"}`, false);
      } else {
        const sitesText = data.sites_discovered > 0 ? ` Found ${data.sites_discovered} site(s).` : " No sites found.";
        setFormMessage("ts-ca-central-msg", `✓ Connected (${data.api_version}).${sitesText}`, true);
      }
    } catch (e) {
      setFormMessage("ts-ca-central-msg", "Connection failed.", false);
    } finally {
      testCentralBtn.disabled = false;
    }
  };

  await loadTsApiSettingsForm(force);
}

function showTsCaSettingsPanel() {
  $$(".ts-ca-subtab").forEach(b => b.classList.toggle("active", b.dataset.subtab === "ts-ca-settings"));
  const browseArea = $("#ts-ca-search")?.parentElement;
  if (browseArea) browseArea.style.display = "none";
  $("#ts-ca-content")?.classList.add("hidden");
  $("#ts-ca-settings-panel")?.classList.remove("hidden");
  // Load current settings into form
  void loadTsApiSettingsForm();
}

function hideTsCaSettingsPanel() {
  const browseArea = $("#ts-ca-search")?.parentElement;
  if (browseArea) browseArea.style.display = "";
  $("#ts-ca-content")?.classList.remove("hidden");
  $("#ts-ca-settings-panel")?.classList.add("hidden");
}

async function loadTsApiSettingsForm(force = false) {
  const data = await loadTenantDetailData(force);
  if (!data) return;
  const config = data.settings?.aruba || {};
  const github = data.settings?.github || {};
  const disabled = canManageTenant() ? "" : " disabled";

  // Central API version
  const apiVer = $("#ts-ca-central-api-version");
  if (apiVer) { apiVer.value = config.api_version || "classic"; if (disabled) apiVer.disabled = true; }

  // Cluster select
  const clusterSel = $("#ts-ca-central-cluster-select");
  const clusterUrlInput = $("#ts-ca-central-cluster-url");
  if (clusterSel) {
    const current = (config.cluster_url || "").trim();
    const knownUrls = NEW_CENTRAL_CLUSTERS.map(c => c.url);
    const isKnown = knownUrls.includes(current);
    clusterSel.value = isKnown ? current : (current ? "__custom__" : "");
    if (disabled) clusterSel.disabled = true;
    const customGroup = $("#ts-ca-central-custom-url-group");
    if (customGroup) customGroup.style.display = (clusterSel.value === "__custom__") ? "" : "none";
  }
  if (clusterUrlInput) {
    clusterUrlInput.value = config.cluster_url || "";
    if (disabled) clusterUrlInput.disabled = true;
  }

  // Non-secret fields
  const setVal = (id, val) => { const el = $(id); if (el) { el.value = val; if (disabled) el.disabled = true; } };
  setVal("#ts-ca-central-client-id", config.client_id || "");
  setVal("#ts-ca-central-customer-id", config.customer_id || "");
  setVal("#ts-ca-central-workspace-id", config.workspace_id || "");

  // Secret placeholders
  const atEl = $("#ts-ca-central-access-token");
  if (atEl) {
    atEl.placeholder = config.access_token_configured ? "Token saved — leave blank to keep" : "Paste token here";
    if (disabled) atEl.disabled = true;
  }
  const tokenStatus = $("#ts-ca-central-token-status");
  if (tokenStatus) tokenStatus.textContent = config.access_token_configured ? "Access token configured" : "";

  // GitHub fields
  setVal("#ts-ca-github-repo-url", github.sim_repo_url || "");
  setVal("#ts-ca-github-repo-branch", github.sim_repo_branch || "main");
  const ghStatus = $("#ts-ca-github-token-status");
  if (ghStatus) ghStatus.textContent = github.github_token_configured ? "Token configured" : "Token not configured";
  const ghToken = $("#ts-ca-github-token");
  if (ghToken && disabled) ghToken.disabled = true;
}

window.onTsCaClusterSelectChange = function(sel) {
  const customGroup = $("#ts-ca-central-custom-url-group");
  const customInput = $("#ts-ca-central-cluster-url");
  if (sel.value === "__custom__") {
    if (customGroup) customGroup.style.display = "";
    if (customInput) customInput.focus();
  } else {
    if (customGroup) customGroup.style.display = "none";
  }
};

async function saveTsApiCentralSettings() {
  if (!canManageTenant()) {
    setFormMessage("ts-ca-central-msg", "Read-only access.", false);
    return;
  }
  const clusterSel = $("#ts-ca-central-cluster-select");
  const clusterUrl = (clusterSel?.value && clusterSel.value !== "__custom__")
    ? clusterSel.value
    : ($("#ts-ca-central-cluster-url")?.value.trim() || "");
  const payload = {
    mode: hubCentralData?.mode || aggregateCentralData?.mode || "centralized",
    hub_central_config: {
      api_version: $("#ts-ca-central-api-version")?.value || "classic",
      cluster_url: clusterUrl,
      client_id: $("#ts-ca-central-client-id")?.value.trim() || "",
      client_secret: $("#ts-ca-central-client-secret")?.value || "",
      access_token: $("#ts-ca-central-access-token")?.value || "",
      workspace_id: $("#ts-ca-central-workspace-id")?.value.trim() || "",
      customer_id: $("#ts-ca-central-customer-id")?.value.trim() || "",
    },
  };
  setFormMessage("ts-ca-central-msg", "Saving…", true);
  const res = await apiFetch(aggregateEndpoint("central"), { method: "POST", body: payload });
  if (!res?.ok) {
    const err = await readJson(res);
    setFormMessage("ts-ca-central-msg", err?.detail || "Unable to save Central settings.", false);
    return;
  }
  aggregateCentralData = await res.json();
  setFormMessage("ts-ca-central-msg", "Central settings saved.", true);
  // Clear secret inputs
  const secretEl = $("#ts-ca-central-client-secret"); if (secretEl) secretEl.value = "";
  const tokenEl = $("#ts-ca-central-access-token"); if (tokenEl) tokenEl.value = "";
  void loadTsApiSettingsForm(true);
}

async function saveTsApiGithubSettings() {
  if (!canManageTenant()) {
    setFormMessage("ts-ca-github-msg", "Read-only access.", false);
    return;
  }
  const token = $("#ts-ca-github-token")?.value || "";
  const payload = {
    sim_repo_url: $("#ts-ca-github-repo-url")?.value.trim() || "",
    sim_repo_branch: $("#ts-ca-github-repo-branch")?.value.trim() || "main",
    ...(token ? { github_token: token } : {}),
  };
  setFormMessage("ts-ca-github-msg", "Saving…", true);
  const tenantId = getActiveTenantId();
  const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/settings/github`, { method: "POST", body: payload });
  if (!res?.ok) {
    const err = await readJson(res);
    setFormMessage("ts-ca-github-msg", err?.detail || "Unable to save GitHub settings.", false);
    return;
  }
  const data = await res.json();
  setFormMessage("ts-ca-github-msg", "GitHub settings saved.", true);
  const tokenEl = $("#ts-ca-github-token"); if (tokenEl) tokenEl.value = "";
  const statusEl = $("#ts-ca-github-token-status");
  if (statusEl) statusEl.textContent = data.github_token_configured ? "Token configured" : "Token not configured";
}

async function loadHubCaBrowseData(force = false) {
  const tenantId = getActiveTenantId();
  const content = $("#ts-ca-content");
  if (!tenantId || !content) return;

  const cached = loadHubCaBrowseCache(tenantId);
  // Only use localStorage cache if it has sites — empty cache may be stale (token expired)
  const cachedHasSites = cached && (cached.sites || []).length > 0;
  if (cachedHasSites && !force) {
    // Render cached data immediately — no flash of loading message
    hubCentralBrowseData = cached;
    updateHubCaBrowsePills(cached);
    // Refresh monitored items in the background so button state is correct
    apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items`)
      .then(mRes => mRes?.ok ? readJson(mRes) : null)
      .then(mData => { if (mData) hubCaBrowseMonitoredItems = mData?.items || []; renderHubCaBrowseTab(); })
      .catch(() => {});
    renderHubCaBrowseTab();
    scheduleHubCaBrowseRefresh();
    return;
  }

  // No local cache — show loading and fetch from server (which serves its own 5-min cache)
  hubCentralBrowseData = null;
  resetHubCaBrowsePills();
  content.innerHTML = '<div class="empty-state">Loading Central data…</div>';

  try {
    const params = new URLSearchParams({ tenant_id: tenantId });
    if (force) params.set("force", "true");
    const [res, mRes] = await Promise.all([
      apiFetch(`/api/central/browse?${params.toString()}`),
      apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items`).catch(() => null),
    ]);
    const data = normalizeHubCaBrowseData(await readJson(res));
    if (!res?.ok) throw new Error(data?.detail || data?.warning || "Unable to load Central data.");
    hubCentralBrowseData = data || { sites: [], alerts: [], insights: [], clients: [], mode: "—" };
    saveHubCaBrowseCache(hubCentralBrowseData, tenantId);
    updateHubCaBrowsePills(hubCentralBrowseData);
    if (mRes?.ok) { const mData = await readJson(mRes); hubCaBrowseMonitoredItems = mData?.items || []; }
    renderHubCaBrowseTab();
  } catch (error) {
    if (!hubCentralBrowseData) {
      content.innerHTML = `<div class="empty-state">Error loading Central data: ${escHtml(error?.message || "Unknown error")}</div>`;
    }
  } finally {
    scheduleHubCaBrowseRefresh();
  }
}

function renderHubCaBrowseTab() {
  const content = $("#ts-ca-content");
  if (!content || !hubCentralBrowseData) return;
  if (hubCaBrowseActiveTab === "ts-ca-settings") return; // settings panel handles its own rendering

  const search = ($("#ts-ca-search")?.value || "").trim().toLowerCase();
  const tab = hubCaBrowseActiveTab || "ts-ca-sites";
  $$(".ts-ca-subtab").forEach((button) => button.classList.toggle("active", button.dataset.subtab === tab));

  if (tab === "ts-ca-alerts") renderHubCaAlertsTab(content, hubCentralBrowseData.alerts || [], search);
  else if (tab === "ts-ca-insights") renderHubCaInsightsTab(content, hubCentralBrowseData.insights || [], search);
  else if (tab === "ts-ca-clients") renderHubCaClientsTab(content, hubCentralBrowseData.clients_by_site || {}, hubCentralBrowseData.clients || [], search);
  else if (tab === "ts-ca-devices") renderHubCaDevicesTab(content, hubCentralBrowseData.devices_by_site || {}, search);
  else renderHubCaSitesTab(content, hubCentralBrowseData.sites || [], search);

  if (hubCentralBrowseData.warning && !content.querySelector("tbody") && !content.querySelector(".ca-browse-warning")) {
    content.insertAdjacentHTML("afterbegin", `<div class="empty-state ca-browse-warning" style="color:#c0392b;">${escHtml(hubCentralBrowseData.warning)}</div>`);
  }
}

function hubCaMonitorBtn(type, payload = {}) {
  const name = payload.name || payload.hostname || payload.mac || "";
  const site = payload.site || "";
  const identifier = payload.identifier || payload.mac || payload.hostname || payload.name || "";
  const monitored = hubCaIsMonitored(type, name, site, identifier);
  const dataAttrs = Object.entries(payload)
    .map(([key, value]) => `data-ca-${key.replace(/_/g, "-")}="${escHtml(String(value ?? ""))}"`)
    .join(" ");
  if (monitored) {
    return `<button class="btn btn-small btn-secondary ca-unmonitor-btn" type="button" data-ca-type="${escHtml(type)}" ${dataAttrs} title="Click to remove from monitoring">✓ Monitored</button>`;
  }
  return `<button class="btn btn-small btn-primary ca-monitor-btn" type="button" data-ca-type="${escHtml(type)}" ${dataAttrs}>Monitor</button>`;
}

function attachHubCaMonitorButtons(container) {
  container.querySelectorAll(".ca-monitor-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const payload = {
        name: button.dataset.caName || "",
        site: button.dataset.caSite || "",
        central_site: button.dataset.caCentralSite || "",
        identifier: button.dataset.caIdentifier || "",
        mac: button.dataset.caMac || "",
        hostname: button.dataset.caHostname || "",
      };
      openHubCaMonitorModal(button.dataset.caType || "", payload).catch((error) => {
        showToast(error.message || "Unable to open monitor dialog.", "error");
      });
    });
  });
  container.querySelectorAll(".ca-unmonitor-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const payload = {
        name: button.dataset.caName || "",
        site: button.dataset.caSite || "",
        central_site: button.dataset.caCentralSite || "",
        identifier: button.dataset.caIdentifier || "",
        mac: button.dataset.caMac || "",
        hostname: button.dataset.caHostname || "",
      };
      hubCaUnmonitorItem(button.dataset.caType || "", payload, button).catch((error) => {
        showToast(error.message || "Unable to remove from monitoring.", "error");
      });
    });
  });
}

async function hubCaUnmonitorItem(type, payload, button) {
  const tenantId = getActiveTenantId();
  if (!tenantId) return;
  if (button) button.disabled = true;

  try {
    if (type === "site") {
      // Sites: remove from central_sites_config.site_mappings and add to excluded_sites
      const cfgRes = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/central-sites-config`);
      const cfg = await readJson(cfgRes);
      if (!cfgRes?.ok) throw new Error(cfg?.detail || "Unable to load Central site mappings.");
      const siteMappings = { ...((cfg && typeof cfg.site_mappings === "object") ? cfg.site_mappings : {}) };
      const nameKey = (payload.name || "").toLowerCase().trim();
      Object.keys(siteMappings).forEach((k) => {
        if (k.toLowerCase().trim() === nameKey) delete siteMappings[k];
      });
      // Track excluded sites so auto-discovery doesn't re-add them
      const excludedSites = Array.isArray(cfg?.excluded_sites) ? [...cfg.excluded_sites] : [];
      if (nameKey && !excludedSites.map((s) => s.toLowerCase().trim()).includes(nameKey)) {
        excludedSites.push(payload.name || nameKey);
      }
      const saveRes = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/central-sites-config`, {
        method: "POST",
        body: { ...(cfg || {}), site_mappings: siteMappings, excluded_sites: excludedSites },
      });
      const saveData = await readJson(saveRes);
      if (!saveRes?.ok) throw new Error(saveData?.detail || "Unable to save Central site mappings.");
      // Update local hubCentralData so button state refreshes immediately
      if (hubCentralData) {
        if (typeof hubCentralData.central_sites_config === "object") {
          hubCentralData.central_sites_config.site_mappings = siteMappings;
          hubCentralData.central_sites_config.excluded_sites = excludedSites;
        } else {
          hubCentralData.central_sites_config = { site_mappings: siteMappings, excluded_sites: excludedSites };
        }
      }
      showToast(`"${payload.name}" removed from monitoring.`, "ok");
      renderHubCaBrowseTab();
    } else {
      // Alerts/insights/clients: find and delete by monitored-items ID
      const item = hubCaFindMonitoredItem(type, payload);
      if (!item) {
        showToast("Item not found in Monitored Items.", "error");
        if (button) button.disabled = false;
        return;
      }
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res?.ok) {
        const err = await readJson(res);
        throw new Error(err?.detail || "Failed to remove monitored item.");
      }
      hubCaBrowseMonitoredItems = hubCaBrowseMonitoredItems.filter((m) => m.id !== item.id);
      showToast(`"${payload.name || name}" removed from monitoring.`, "ok");
      renderHubCaBrowseTab();
    }
  } catch (error) {
    if (button) button.disabled = false;
    throw error;
  }
}

// Returns a Set of lowercased monitored site names, or null if no sites are configured yet.
function _caMonitoredSiteNames() {
  const mappings = hubCentralData?.central_sites_config?.site_mappings;
  if (!mappings || typeof mappings !== "object") return null;
  const keys = Object.keys(mappings);
  if (!keys.length) return null;
  return new Set(keys.map((k) => k.toLowerCase().trim()));
}

function renderHubCaSitesTab(container, sites, search) {
  const filtered = sites.filter((site) => !search || JSON.stringify(site).toLowerCase().includes(search));
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${search ? "No sites match your search." : "No sites returned from Central."}</div>`;
    return;
  }
  const tdP = "padding:6px 10px;";
  const rows = filtered.map((site) => {
    const score = site.health_score != null ? parseInt(site.health_score, 10) : null;
    const healthColor = score == null ? "#aaa" : score >= 80 ? "#27ae60" : score >= 50 ? "#f39c12" : "#e74c3c";
    const healthLabel = score == null ? "—" : score >= 80 ? "Healthy" : score >= 50 ? "Fair" : "Poor";
    const healthDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:${healthColor};display:inline-block;flex-shrink:0;"></span>${healthLabel}</span>`;
    const scoreStr = score != null ? `<div style="font-size:11px;color:var(--muted);">${score}</div>` : "";
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(site.name || "—")}</strong></td>
      <td style="${tdP}">${healthDot}</td>
      <td style="white-space:nowrap;${tdP}">${site.wireless_clients != null ? escHtml(String(site.wireless_clients)) : "—"}</td>
      <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("site", { name: site.name || "", central_site: site.central_site || site.name || "" })}</td>
    </tr>`;
  }).join("");
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
  attachHubCaMonitorButtons(container);
}

function _caTs(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString();
    return `<span style="display:block;font-size:0.78rem;color:var(--muted);">${escHtml(date)}</span><span style="display:block;font-size:0.78rem;color:var(--muted);">${escHtml(time)}</span>`;
  } catch (_) { return escHtml(String(ts)); }
}

function _caSevDot(sev) {
  const s = (sev || "").toLowerCase();
  const color = s === "critical" || s === "red" || s === "error" ? "#e74c3c"
    : s === "major" || s === "orange" ? "#e67e22"
    : s === "minor" || s === "warning" || s === "yellow" ? "#f1c40f"
    : s === "info" || s === "good" || s === "green" || s === "clear" ? "#27ae60"
    : "#aaa";
  return `<span style="display:flex;justify-content:center;align-items:center;"><span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span></span>`;
}

function renderHubCaAlertsTab(container, alerts, search) {
  const monitoredSites = _caMonitoredSiteNames();
  if (monitoredSites) alerts = alerts.filter((a) => monitoredSites.has((a.site || "").toLowerCase().trim()));

  const activeCat = container._caCatFilter || "All";
  const categories = ["All", ...new Set(alerts.map((a) => a.category).filter(Boolean))].sort((a, b) => a === "All" ? -1 : a.localeCompare(b));

  let filtered = alerts;
  if (activeCat !== "All") filtered = filtered.filter((a) => a.category === activeCat);
  if (search) filtered = filtered.filter((a) => JSON.stringify(a).toLowerCase().includes(search));

  const catPills = categories.map((cat) =>
    `<button class="btn btn-small ${activeCat === cat ? "btn-primary" : "btn-secondary"} ca-cat-filter" data-cat="${escHtml(cat)}" style="margin:0 2px 4px;">${escHtml(cat)}</button>`
  ).join("");

  const tdP = "padding:6px 10px;";
  const rows = filtered.map((alert) => {
    const catBadge = alert.category ? `<span class="badge badge-grey" style="font-size:10px;margin-left:4px;">${escHtml(alert.category)}</span>` : "";
    const devType = alert.device_type ? escHtml(alert.device_type) : "—";
    const detailStr = alert.detail ? `<div style="font-size:11px;color:var(--muted);line-height:1.3;">${escHtml(alert.detail)}</div>` : "";
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(alert.name || "—")}</strong>${catBadge}${detailStr}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(alert.site || "—")}</td>
      <td style="white-space:nowrap;min-width:80px;text-align:center;${tdP}">${_caSevDot(alert.severity)}</td>
      <td style="font-size:11px;color:var(--muted);white-space:nowrap;${tdP}">${devType}</td>
      <td style="min-width:70px;${tdP}">${_caTs(alert.ts)}</td>
      <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("alert", { name: alert.name || "", site: alert.site || "", identifier: alert.name || "" })}</td>
    </tr>`;
  }).join("");

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
    </div>` : `<div class="empty-state">${search || activeCat !== "All" ? "No alerts match the filter." : "No active alerts."}</div>`}`;

  container.querySelectorAll(".ca-cat-filter").forEach((btn) => {
    btn.onclick = () => { container._caCatFilter = btn.dataset.cat; renderHubCaAlertsTab(container, alerts, search); };
  });
  attachHubCaMonitorButtons(container);
}

function renderHubCaInsightsTab(container, insights, search) {
  const monitoredSites = _caMonitoredSiteNames();
  if (monitoredSites) insights = insights.filter((i) => monitoredSites.has((i.site || "").toLowerCase().trim()));

  const activeCat = container._caCatFilter || "All";
  const categories = ["All", ...new Set(insights.map((i) => i.category).filter(Boolean))].sort((a, b) => a === "All" ? -1 : a.localeCompare(b));

  let filtered = insights;
  if (activeCat !== "All") filtered = filtered.filter((i) => i.category === activeCat);
  if (search) filtered = filtered.filter((i) => JSON.stringify(i).toLowerCase().includes(search));

  const catPills = categories.map((cat) =>
    `<button class="btn btn-small ${activeCat === cat ? "btn-primary" : "btn-secondary"} ca-insight-cat-filter" data-cat="${escHtml(cat)}" style="margin:0 2px 4px;">${escHtml(cat)}</button>`
  ).join("");

  const tdP = "padding:6px 10px;";
  const rows = filtered.map((insight) => {
    const catLabel = (insight.category || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const catBadge = catLabel ? `<span class="badge badge-grey" style="font-size:10px;margin-left:4px;">${escHtml(catLabel)}</span>` : "";
    const devCount = insight.device_count ? `${insight.device_count} dev` : "";
    const cliCount = insight.client_count ? `${insight.client_count} client${insight.client_count !== 1 ? "s" : ""}` : "";
    const impacted = [devCount, cliCount].filter(Boolean).join(", ");
    const descStr = insight.description ? `<div style="font-size:11px;color:var(--muted);line-height:1.3;">${escHtml(insight.description)}</div>` : "";
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(insight.name || "—")}</strong>${catBadge}${descStr}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(insight.site || "—")}</td>
      <td style="white-space:nowrap;font-size:11px;${tdP}">${escHtml(impacted || "—")}</td>
      <td style="min-width:70px;${tdP}">${_caTs(insight.ts)}</td>
      <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("insight", { name: insight.name || "", site: insight.site || "", identifier: insight.name || "" })}</td>
    </tr>`;
  }).join("");

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
    </div>` : `<div class="empty-state">${search || activeCat !== "All" ? "No insights match the filter." : "No AI insights returned from Central."}</div>`}`;

  container.querySelectorAll(".ca-insight-cat-filter").forEach((btn) => {
    btn.onclick = () => { container._caCatFilter = btn.dataset.cat; renderHubCaInsightsTab(container, insights, search); };
  });
  attachHubCaMonitorButtons(container);
}

function _caClientIsWireless(c) {
  // A client is wireless if connection_type says WIRELESS, or it has AP/SSID fields
  if (c.connection_type && typeof c.connection_type === "string") {
    const ct = c.connection_type.toUpperCase();
    if (ct === "WIRELESS" || ct === "WIFI") return true;
    if (ct === "WIRED" || ct === "ETHERNET") return false;
  }
  return !!(c.ap && c.ap !== "—") || !!(c.ssid && c.ssid !== "—");
}

function renderHubCaClientsTab(container, clientsBySite, clientsLegacy, search) {
  const tdP = "padding:6px 10px;";
  const monitoredSites = _caMonitoredSiteNames();
  const activeTab = container._caClientTab || "all";

  // Prefer individual client records; fall back to count-only mode if no individual data
  const allClients = (clientsLegacy || []).filter((client) => hubCaIsIndividualClientRecord(client));
  const clientSource = allClients.length > 0
    ? (monitoredSites ? allClients.filter((c) => monitoredSites.has((c.site || "").toLowerCase().trim())) : allClients)
    : null;

  const tabPills = `<div style="margin-bottom:8px;">
    <button class="btn btn-small ${activeTab === "all" ? "btn-primary" : "btn-secondary"} ca-client-tab-btn" data-tab="all" style="margin:0 2px 4px;">All</button>
    <button class="btn btn-small ${activeTab === "wireless" ? "btn-primary" : "btn-secondary"} ca-client-tab-btn" data-tab="wireless" style="margin:0 2px 4px;">Wireless</button>
    <button class="btn btn-small ${activeTab === "wired" ? "btn-primary" : "btn-secondary"} ca-client-tab-btn" data-tab="wired" style="margin:0 2px 4px;">Wired</button>
  </div>`;

  if (clientSource) {
    const tabFiltered = activeTab === "all" ? clientSource
      : clientSource.filter((c) => activeTab === "wireless" ? _caClientIsWireless(c) : !_caClientIsWireless(c));
    const filtered = tabFiltered.filter((c) => !search || JSON.stringify(c).toLowerCase().includes(search));
    const emptyMsg = search ? "No clients match your search." : `No ${activeTab === "all" ? "" : activeTab + " "}clients returned from Central.`;
    if (!filtered.length) {
      container.innerHTML = tabPills + `<div class="empty-state">${emptyMsg}</div>`;
    } else {
      const isWireless = activeTab === "wireless";
      const isAll = activeTab === "all";
      const rows = filtered.map((c) => {
        const statusColor = (c.status || "").toLowerCase() === "connected" ? "#27ae60"
          : (c.status || "").toLowerCase() === "disconnected" ? "#e74c3c" : "#aaa";
        const statusDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>${escHtml(c.status || "—")}</span>`;
        const wirelessCells = isAll
          ? `<td style="white-space:nowrap;${tdP}">${escHtml(c.ap || "—")}</td>
             <td style="white-space:nowrap;${tdP}">${escHtml(c.ssid || "—")}</td>
             <td style="white-space:nowrap;${tdP}">${escHtml(c.vlan || "—")}</td>`
          : isWireless
            ? `<td style="white-space:nowrap;${tdP}">${escHtml(c.ap || "—")}</td>
               <td style="white-space:nowrap;${tdP}">${escHtml(c.ssid || "—")}</td>`
            : `<td style="white-space:nowrap;${tdP}">${escHtml(c.vlan || "—")}</td>`;
        return `<tr>
          <td style="width:28%;${tdP}"><strong>${escHtml(c.hostname !== "—" ? c.hostname : (c.username || "—"))}</strong>${c.username && c.hostname !== "—" ? `<div style="font-size:11px;color:var(--muted);margin-top:1px;">${escHtml(c.username)}</div>` : ""}<div style="font-size:11px;color:var(--muted);margin-top:2px;">${escHtml(c.mac || "")}</div></td>
          <td style="${tdP}"><span style="white-space:nowrap;">${escHtml(c.ip || "—")}</span>${c.site ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;">${escHtml(c.site)}</div>` : ""}</td>
          ${wirelessCells}
          <td style="white-space:nowrap;${tdP}">${statusDot}</td>
          <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("client", {
            name: c.hostname || c.mac || "Client",
            hostname: c.hostname || "",
            mac: c.mac || "",
            site: c.site || "",
          })}</td>
        </tr>`;
      }).join("");
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
    // Fallback: show per-site counts when no individual client records are available
    let entries = Object.entries(clientsBySite || {});
    if (monitoredSites) entries = entries.filter(([site]) => monitoredSites.has(site.toLowerCase().trim()));
    const filtered = entries.filter(([site]) => !search || site.toLowerCase().includes(search));
    const emptyMsg = search ? "No clients match your search." : "No clients returned from Central.";
    if (!filtered.length) {
      container.innerHTML = tabPills + `<div class="empty-state">${emptyMsg}</div>`;
    } else {
      const isAll = activeTab === "all";
      const countKey = activeTab === "wired" ? "wired" : "wireless";
      const rows = filtered.sort((a, b) => (b[1].total || 0) - (a[1].total || 0)).map(([site, counts]) => `
        <tr>
          <td style="width:40%;${tdP}"><strong>${escHtml(site)}</strong></td>
          ${isAll ? `<td style="white-space:nowrap;${tdP}">${counts.total ?? "—"}</td>
          <td style="white-space:nowrap;${tdP}">${counts.wireless ?? "—"}</td>
          <td style="white-space:nowrap;${tdP}">${counts.wired ?? "—"}</td>`
          : `<td style="white-space:nowrap;${tdP}">${counts[countKey] ?? "—"}</td>`}
          <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("client", { name: `Client Count: ${site}`, site })}</td>
        </tr>`).join("");
      const countHeaders = isAll
        ? `<th style="padding:5px 10px;white-space:nowrap;">Total</th>
           <th style="padding:5px 10px;white-space:nowrap;">Wireless</th>
           <th style="padding:5px 10px;white-space:nowrap;">Wired</th>`
        : `<th style="padding:5px 10px;white-space:nowrap;">${activeTab === "wired" ? "Wired" : "Wireless"} Clients</th>`;
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

  container.querySelectorAll(".ca-client-tab-btn").forEach((btn) => {
    btn.onclick = () => { container._caClientTab = btn.dataset.tab; renderHubCaClientsTab(container, clientsBySite, clientsLegacy, search); };
  });
  attachHubCaMonitorButtons(container);
}

function _caDeviceTabType(d) {
  const t = (d.type || "").toUpperCase();
  if (t === "AP" || t === "IAP" || t === "CAP" || t.startsWith("AP-") || t.includes("IAP")) return "ap";
  if (t === "GATEWAY" || t === "GW" || t === "VGW" || t === "BRANCH_GATEWAY" || t.includes("GATEWAY")) return "gateway";
  if (t === "SWITCH" || t === "SW" || t === "CX" || t.includes("SWITCH")) return "switch";
  return "other";
}

function renderHubCaDevicesTab(container, devicesBySite, search) {
  const monitoredSites = _caMonitoredSiteNames();
  const activeTab = container._caDeviceTab || "all";
  const allDevices = Object.entries(devicesBySite || [])
    .filter(([site]) => !monitoredSites || monitoredSites.has(site.toLowerCase().trim()))
    .flatMap(([site, devs]) => devs.map((d) => ({ ...d, site })));

  const tabPills = `<div style="margin-bottom:8px;">
    <button class="btn btn-small ${activeTab === "all" ? "btn-primary" : "btn-secondary"} ca-device-tab-btn" data-tab="all" style="margin:0 2px 4px;">All</button>
    <button class="btn btn-small ${activeTab === "ap" ? "btn-primary" : "btn-secondary"} ca-device-tab-btn" data-tab="ap" style="margin:0 2px 4px;">Access Points</button>
    <button class="btn btn-small ${activeTab === "gateway" ? "btn-primary" : "btn-secondary"} ca-device-tab-btn" data-tab="gateway" style="margin:0 2px 4px;">Gateway</button>
    <button class="btn btn-small ${activeTab === "switch" ? "btn-primary" : "btn-secondary"} ca-device-tab-btn" data-tab="switch" style="margin:0 2px 4px;">Switch</button>
  </div>`;

  const tabDevices = activeTab === "all" ? allDevices : allDevices.filter((d) => _caDeviceTabType(d) === activeTab);
  const filtered = tabDevices.filter((d) =>
    !search || JSON.stringify(d).toLowerCase().includes(search)
  );
  if (!filtered.length) {
    const emptyLabel = activeTab === "all" ? "devices" : activeTab === "ap" ? "access points" : activeTab === "gateway" ? "gateways" : "switches";
    container.innerHTML = tabPills + `<div class="empty-state">${search ? "No devices match your search." : `No ${emptyLabel} returned from Central.`}</div>`;
    container.querySelectorAll(".ca-device-tab-btn").forEach((btn) => {
      btn.onclick = () => { container._caDeviceTab = btn.dataset.tab; renderHubCaDevicesTab(container, devicesBySite, search); };
    });
    return;
  }
  const tdP = "padding:6px 10px;";
  const rows = filtered.map((d) => {
    const statusColor = (d.status || "").toUpperCase() === "DOWN" || (d.status || "").toUpperCase() === "OFFLINE" ? "#e74c3c"
      : (d.status || "").toUpperCase() === "UP" || (d.status || "").toUpperCase() === "ONLINE" ? "#27ae60"
      : "#aaa";
    const statusDot = `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>${escHtml(d.status || "—")}</span>`;
    const deviceName = String(d.name || d.serial || d.type || "Device").trim() || "Device";
    const deviceIdentifier = String(d.name || d.serial || `${d.type || "device"}:${d.site || ""}`).trim();
    const subLine = [d.model, d.serial].filter(Boolean).map(escHtml).join(" · ");
    const ipFw = [d.ip, d.firmware].filter(Boolean).map(escHtml).join(" · ");
    return `<tr>
      <td style="width:40%;${tdP}"><strong>${escHtml(d.name || "—")}</strong>${subLine ? `<div style="font-size:11px;color:var(--muted);">${subLine}</div>` : ""}</td>
      <td style="white-space:nowrap;${tdP}">${escHtml(d.site || "—")}</td>
      <td style="white-space:nowrap;font-size:11px;color:var(--muted);${tdP}">${escHtml(d.type || "—")}</td>
      <td style="white-space:nowrap;min-width:80px;${tdP}">${statusDot}</td>
      <td style="font-size:11px;color:var(--muted);${tdP}">${ipFw || "—"}</td>
      <td style="white-space:nowrap;${tdP}">${hubCaMonitorBtn("gateway", { name: deviceName, identifier: deviceIdentifier, site: d.site || "" })}</td>
    </tr>`;
  }).join("");
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
  container.querySelectorAll(".ca-device-tab-btn").forEach((btn) => {
    btn.onclick = () => { container._caDeviceTab = btn.dataset.tab; renderHubCaDevicesTab(container, devicesBySite, search); };
  });
  attachHubCaMonitorButtons(container);
}

async function openHubCaMonitorModal(type, payload) {
  const tenantId = getActiveTenantId();
  if (!tenantId) return;

  if (type !== "site") {
    // For alerts, insights, clients — add directly to monitored items list
    const typeMap = { alert: "alert", insight: "insight", client: "client", gateway: "gateway" };
    const itemType = typeMap[type];
    if (!itemType) {
      showToast("Unknown monitor type.", "error");
      return;
    }
    const name = payload?.name || payload?.hostname || payload?.mac || "—";
    const identifier = payload?.identifier || (type === "client"
      ? (payload?.mac || payload?.hostname || payload?.site || payload?.name || "")
      : (payload?.name || ""));
    if (!identifier) {
      showToast("Cannot monitor: missing identifier.", "error");
      return;
    }
    try {
      const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/monitored-items`, {
        method: "POST",
        body: { type: itemType, name, identifier },
      });
      const data = await readJson(res);
      if (!res?.ok) throw new Error(data?.detail || "Failed to add monitored item.");
      if (data?.created === false) {
        showToast(`"${name}" is already being monitored.`, "ok");
      } else {
        showToast(`"${name}" added to Monitored Items (Simulations tab).`, "ok");
      }
      if (data?.item) {
        hubCaBrowseMonitoredItems = [
          ...hubCaBrowseMonitoredItems.filter((item) => item?.id !== data.item.id),
          data.item,
        ];
        renderHubCaBrowseTab();
      }
      // Refresh monitored items so it shows up immediately in the Simulations tab
      _hubMonitoredItemsData = null;
      await loadAndRenderHubMonitoredItems(true);
    } catch (error) {
      showToast(error.message || "Failed to add monitored item.", "error");
    }
    return;
  }

  const modal = $("#ts-ca-monitor-modal");
  const title = $("#ts-ca-modal-title");
  const sub = $("#ts-ca-modal-sub");
  const spokeSelect = $("#ts-ca-modal-spoke");
  const confirmBtn = $("#ts-ca-modal-confirm");
  const closeBtn = $("#ts-ca-modal-close");
  const msg = $("#ts-ca-modal-msg");
  if (!modal || !spokeSelect || !confirmBtn) return;

  if (title) title.textContent = `Monitor Site: ${payload?.name || "—"}`;
  if (sub) sub.textContent = `Select which spoke should monitor this site. It will be added to that spoke's site mappings.`;
  if (msg) {
    msg.textContent = "";
    msg.style.color = "";
  }
  spokeSelect.innerHTML = '<option value="">Loading spokes…</option>';
  modal.classList.remove("hidden");

  // Close on backdrop click (outer overlay, not the inner card which stops propagation)
  modal.onclick = () => closeHubCaMonitorModal();
  if (closeBtn) closeBtn.onclick = () => closeHubCaMonitorModal();
  const cancelBtn = $("#ts-ca-modal-cancel");
  if (cancelBtn) cancelBtn.onclick = () => closeHubCaMonitorModal();
  // Close on ESC
  const escHandler = (e) => { if (e.key === "Escape") { closeHubCaMonitorModal(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);

  try {
    const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
    const spokes = await readJson(res);
    if (!res?.ok) throw new Error(spokes?.detail || "Unable to load spokes.");
    const approved = (Array.isArray(spokes) ? spokes : []).filter((spoke) => spoke.status === "approved");
    if (!approved.length) {
      spokeSelect.innerHTML = '<option value="">No approved spokes</option>';
    } else {
      spokeSelect.innerHTML = approved
        .map((spoke) => `<option value="${escHtml(spoke.id)}">${escHtml(spoke.spoke_name || spoke.hostname || spoke.id)}</option>`)
        .join("");
    }
  } catch (error) {
    spokeSelect.innerHTML = '<option value="">Unable to load spokes</option>';
    if (msg) {
      msg.textContent = error.message || "Unable to load spokes.";
      msg.style.color = "var(--error)";
    }
  }

  confirmBtn.onclick = async () => {
    const spokeId = spokeSelect.value;
    if (!spokeId) {
      if (msg) {
        msg.textContent = "Select a spoke.";
        msg.style.color = "var(--error)";
      }
      return;
    }

    confirmBtn.disabled = true;
    if (msg) {
      msg.textContent = "";
      msg.style.color = "";
    }

    try {
      const spokeRes = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`);
      const spokes = await readJson(spokeRes);
      if (!spokeRes?.ok) throw new Error(spokes?.detail || "Unable to load spoke assignments.");
      const spoke = (Array.isArray(spokes) ? spokes : []).find((item) => item.id === spokeId);
      const currentSites = Array.isArray(spoke?.assigned_sites)
        ? spoke.assigned_sites
        : (spoke?.assigned_site ? [spoke.assigned_site] : []);
      const nextSites = [...new Set([...currentSites, payload?.name].filter(Boolean))];
      await updateTsSpokeAssignedSites(tenantId, spokeId, nextSites);

      const cfgRes = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/central-sites-config`);
      const cfg = await readJson(cfgRes);
      if (!cfgRes?.ok) throw new Error(cfg?.detail || "Unable to load Central site mappings.");
      const siteMappings = {
        ...((cfg && typeof cfg.site_mappings === "object") ? cfg.site_mappings : {}),
        [payload.name]: payload.central_site || payload.name,
      };
      const saveRes = await apiFetch(`/api/${encodeURIComponent(tenantId)}/aggregate/central-sites-config`, {
        method: "POST",
        body: {
          ...(cfg || {}),
          site_mappings: siteMappings,
        },
      });
      const saveData = await readJson(saveRes);
      if (!saveRes?.ok) throw new Error(saveData?.detail || "Unable to save Central site mappings.");

      closeHubCaMonitorModal();
      // Update hubCentralData with the fresh site_mappings so button state updates immediately
      if (hubCentralData && typeof hubCentralData.central_sites_config === "object") {
        hubCentralData.central_sites_config.site_mappings = siteMappings;
      } else if (hubCentralData) {
        hubCentralData.central_sites_config = { site_mappings: siteMappings };
      }
      showToast(`"${payload.name}" added to monitoring.`, "ok");
      // Re-render the browse tab to update button state
      renderHubCaBrowseTab();
      // Load fresh data in the background
      loadHubCentralData(true).catch(() => {});
    } catch (error) {
      if (msg) {
        msg.textContent = error.message || "Error adding site to monitoring.";
        msg.style.color = "var(--error)";
      }
    } finally {
      confirmBtn.disabled = false;
    }
  };
}

function closeHubCaMonitorModal() {
  const modal = $("#ts-ca-monitor-modal");
  const msg = $("#ts-ca-modal-msg");
  if (modal) modal.classList.add("hidden");
  if (msg) {
    msg.textContent = "";
    msg.style.color = "";
  }
}

async function updateTsSpokeAssignedSites(tenantId, spokeId, assignedSites) {
  const res = await apiFetch(`/api/tenant/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spokeId)}/assigned-site`, {
    method: 'PATCH',
    body: { assigned_sites: assignedSites },
  });
  const data = await readJson(res);
  if (!res?.ok) throw new Error(data?.detail || 'Unable to update assigned sites.');
  return data || {};
}

async function initTsSpokesTab(tenantId) {
  if (!tenantId) return;

  await loadTenantPendingSpokes();

  const tbody = document.getElementById('ts-spokes-approved-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';
  try {
    const [spokeRes, availableSites] = await Promise.all([
      apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes`),
      loadTenantAssignedSites(tenantId).catch(() => []),
    ]);
    const spokes = spokeRes?.ok ? await spokeRes.json() : [];
    const approved = spokes.filter((spoke) => spoke.status === 'approved');
    if (!approved.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No approved spokes yet.</td></tr>';
      return;
    }
    const canManage = canManageTenant(tenantId);

    function renderSpokeRow(spoke, container) {
      const assignedSites = Array.isArray(spoke.assigned_sites) ? [...spoke.assigned_sites]
        : (spoke.assigned_site ? [spoke.assigned_site] : []);
      const unassigned = availableSites.filter((s) => !assignedSites.includes(s));

      const chipsHtml = assignedSites.map((site) => `
        <span class="site-chip" style="display:inline-flex;align-items:center;gap:4px;background:var(--badge-bg,#e8f0fe);color:var(--badge-text,#174ea6);border-radius:4px;padding:2px 6px;font-size:12px;white-space:nowrap;">
          ${escHtml(site)}
          ${canManage ? `<button type="button" data-remove-site="${escHtml(site)}" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:0;color:var(--muted);" title="Remove ${escHtml(site)}">×</button>` : ''}
        </span>`).join('');

      const dropdownHtml = canManage && unassigned.length ? `
        <select class="form-input site-add-select" style="min-width:160px;font-size:12px;" title="Add site assignment">
          <option value="">+ add site…</option>
          ${unassigned.map((s) => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('')}
        </select>` : '';

      container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
          ${chipsHtml || '<span style="color:var(--muted);font-size:12px;">— unassigned —</span>'}
          ${dropdownHtml}
        </div>`;

      if (canManage) {
        container.querySelectorAll('[data-remove-site]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const site = btn.dataset.removeSite;
            const next = assignedSites.filter((s) => s !== site);
            btn.disabled = true;
            try {
              const updated = await updateTsSpokeAssignedSites(tenantId, spoke.id, next);
              spoke.assigned_sites = updated.assigned_sites || next;
              hubCentralData = null;
              renderSpokeRow(spoke, container);
              await loadHubCentralData(true).catch(() => {});
              showToast(`Removed ${site} from ${spoke.spoke_name || spoke.hostname}.`, 'ok');
            } catch (err) {
              showToast(err.message || 'Unable to update assigned sites.', 'error');
              btn.disabled = false;
            }
          });
        });

        const addSelect = container.querySelector('.site-add-select');
        if (addSelect) {
          addSelect.addEventListener('change', async () => {
            const site = addSelect.value;
            if (!site) return;
            const next = [...assignedSites, site];
            addSelect.disabled = true;
            try {
              const updated = await updateTsSpokeAssignedSites(tenantId, spoke.id, next);
              spoke.assigned_sites = updated.assigned_sites || next;
              hubCentralData = null;
              renderSpokeRow(spoke, container);
              await loadHubCentralData(true).catch(() => {});
              showToast(`Assigned ${site} to ${spoke.spoke_name || spoke.hostname}.`, 'ok');
            } catch (err) {
              showToast(err.message || 'Unable to update assigned sites.', 'error');
              addSelect.disabled = false;
              addSelect.value = '';
            }
          });
        }
      }
    }

    tbody.innerHTML = approved.map((spoke) => `
      <tr>
        <td><strong>${escHtml(spoke.name || spoke.spoke_name || spoke.hostname || spoke.id)}</strong></td>
        <td><code>${escHtml(spoke.hostname || spoke.id)}</code></td>
        <td>${(typeof spoke.online === 'boolean' ? spoke.online : isOnline(spoke.last_seen)) ? '<span class="status-dot online"></span> Online' : '<span class="status-dot offline"></span> Offline'}</td>
        <td>${escHtml(fmtDate(spoke.last_seen || spoke.updated_at || ''))}</td>
        <td id="spoke-sites-${escHtml(spoke.id)}"></td>
      </tr>`).join('');

    for (const spoke of approved) {
      const cell = document.getElementById(`spoke-sites-${spoke.id}`);
      if (cell) renderSpokeRow(spoke, cell);
    }
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load spokes.</td></tr>';
  }
}



async function loadSetup() {
  await loadHubSettings();
}

async function loadTenantSetup(force = false) {
  const container = $("#hub-tenant-setup-content");
  if (!container) return;
  if (!currentTenantId || !currentUser) {
    container.innerHTML = '<div class="empty-state">Sign in and select a tenant to view setup.</div>';
    return;
  }
  container.innerHTML = '<div class="empty-state">Loading…</div>';
  const data = await loadTenantDetailData(force);
  container.innerHTML = data ? renderTenantSetupPanel(data) : '<div class="empty-state">Unable to load tenant setup.</div>';
  if (data) hydrateTenantSetupPanel(data);
  if (data && canManageTenant()) loadTenantPendingSpokes();
  await activateHubTenantSetupSubtab(hubTenantSetupActiveSubtab, force);
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
  container.innerHTML = data ? renderHubConfigPage(data) : '<div class="empty-state">Unable to load tenant config.</div>';
  if (data) hydrateTenantSetupPanel(data);
  renderHubSimulationConfigPanel();
  renderHubConfOverridesPanel();
  if (hubConfigActiveSubtab === "simulation") await loadHubSimulationConf(force);
  if (hubConfigActiveSubtab === "overrides") await loadHubConfOverrides(force);
}

async function saveCentralSettings() {
  if (!canManageTenant()) {
    setFormMessage("hub-central-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  const payload = {
    mode: $("#hub-central-mode")?.value || "distributed",
    central_browse_interval_minutes: parseInt($("#hub-central-poll-interval")?.value || "5", 10),
    hub_central_config: {
      api_version: $("#hub-central-api-version")?.value || "classic",
      cluster_url: (() => {
        const sel = $("#hub-central-cluster-select");
        if (sel && sel.value && sel.value !== "__custom__") return sel.value;
        return $("#hub-central-cluster-url")?.value.trim() || "";
      })(),
      client_id: $("#hub-central-client-id")?.value.trim() || "",
      client_secret: $("#hub-central-client-secret")?.value || "",
      access_token: $("#hub-central-access-token")?.value || "",
      workspace_id: $("#hub-central-workspace-id")?.value.trim() || "",
      customer_id: $("#hub-central-customer-id")?.value.trim() || "",
    },
  };
  const res = await apiFetch(aggregateEndpoint("central"), { method: "POST", body: payload });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("hub-central-msg", err?.detail || "Unable to save Central settings.", false);
    return;
  }
  aggregateCentralData = await res.json();
  setFormMessage("hub-central-msg", "Central settings saved.", true);
  await loadCentral(true);
  await loadSetup();
}

async function clearCentralSecrets() {
  if (!canManageTenant()) {
    setFormMessage("hub-central-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  if (!confirm("Clear the stored Central client secret and access token?")) return;
  const btn = $("#clear-central-secrets-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Clearing…";
  }
  try {
    const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/aggregate/central-clear-secrets`, { method: "POST" });
    if (!res?.ok) {
      const err = await readJson(res);
      setFormMessage("hub-central-msg", err?.detail || "Unable to clear Central secrets.", false);
      return;
    }
    await loadCentral(true);
    setFormMessage("hub-central-msg", "Secrets cleared.", true);
  } catch (err) {
    setFormMessage("hub-central-msg", err.message || "Unable to clear Central secrets.", false);
  } finally {
    const refreshedBtn = $("#clear-central-secrets-btn");
    if (refreshedBtn) {
      refreshedBtn.disabled = false;
      refreshedBtn.textContent = "Clear Secrets";
    }
  }
}

async function testCentralConnection() {
  const btn = $("#test-central-btn");
  const msg = $("#hub-central-msg");
  if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
  if (msg) { msg.textContent = ""; msg.className = "form-msg"; }
  try {
    const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/aggregate/test-central`, { method: "POST" });
    const data = await readJson(res);
    if (!res?.ok || !data?.ok) {
      setFormMessage("hub-central-msg", `Connection failed: ${data?.error || "Unknown error"}`, false);
    } else {
      const sitesText = data.sites_discovered > 0
        ? ` Found ${data.sites_discovered} site(s): ${data.sites.join(", ")}`
        : " No sites discovered.";
      let detail = `✓ Connected (${data.api_version}).${sitesText}`;
      if (data.raw_sites_response) {
        detail += `\n\nRaw API response:\n${JSON.stringify(data.raw_sites_response, null, 2)}`;
      }
      setFormMessage("hub-central-msg", detail, true);
      if (data.raw_sites_response) {
        const msgEl = $("#hub-central-msg");
        if (msgEl) msgEl.style.whiteSpace = "pre-wrap";
      }
    }
  } catch (err) {
    setFormMessage("hub-central-msg", `Connection failed: ${err.message}`, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Test Connection"; }
  }
}


async function saveConfigPush() {
  if (!canManageTenant()) {
    setFormMessage("hub-config-msg", "Tenant Viewer access is read-only.", false);
    return;
  }
  const raw = $("#hub-config-payload")?.value || "{}";
  hubConfigDraft = raw;
  let config;
  try {
    config = JSON.parse(raw || "{}");
  } catch (error) {
    setFormMessage("hub-config-msg", `Invalid JSON: ${error.message}`, false);
    return;
  }
  const res = await apiFetch(aggregateEndpoint("config-push"), { method: "POST", body: { config } });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("hub-config-msg", err?.detail || "Unable to push config.", false);
    return;
  }
  setFormMessage("hub-config-msg", "Config stored and queued for spokes.", true);
  tenantDetailState.data[currentTenantId] = null;
  await ensureSpokes(true);
  await loadConfig(true);
}


async function resyncUsbCerts() {
  const btn = $("#resync-usb-certs-btn");
  const msgEl = $("#resync-usb-certs-msg");
  if (btn) { btn.disabled = true; btn.textContent = "Resyncing…"; }
  try {
    const tenantId = getActiveTenantId();
    const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/usb-vidpids/resync`, { method: "POST" });
    const data = await readJson(res);
    if (!res || !res.ok) throw new Error(data?.detail || "Resync failed");
    setFormMessage("resync-usb-certs-msg", `USB cert push queued for ${data.pushed_to_spokes ?? 0} spoke(s).`, true);
    await ensureSpokes(true);
    await loadConfig(true);
  } catch (err) {
    setFormMessage("resync-usb-certs-msg", err.message || "Resync failed.", false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↺ Resync USB Certs to All Spokes"; }
  }
}

async function ensureSpokes(force = false) {
  if (!currentTenantId) return [];
  return ensureTenantSpokesFor(currentTenantId, force);
}

function renderClientRows(clients = []) {
  if (!clients.length) {
    return '<tr><td colspan="6" class="empty-state">No client telemetry reported.</td></tr>';
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
        <td style="font-family:monospace;font-size:0.85em">${escHtml(client.simulation_id || "—")}</td>
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
      <button class="btn btn-primary btn-small" data-action="detail" type="button">Open Detail</button>
      <button class="btn btn-primary btn-small" data-action="audit" type="button">View Audit Log</button>
      <button class="btn btn-primary btn-small" data-action="mode" type="button">Processing Mode</button>
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
      <thead><tr><th>Client ID</th><th>Hostname</th><th>Status</th><th>Last Seen</th><th>IP</th><th>Sim</th></tr></thead>
      <tbody>${renderClientRows(clients)}</tbody>
    </table>
  `;
  const quickSelect = $(".quick-command-select", body);
  if (!canManageTenant(spoke.tenant_id)) {
    const modeButton = $('[data-action="mode"]', body);
    const sendButton = $('[data-action="send"]', body);
    if (modeButton) modeButton.disabled = true;
    if (quickSelect) quickSelect.disabled = true;
    if (sendButton) sendButton.disabled = true;
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
      <button class="btn btn-danger btn-small spoke-delete-btn" data-delete-spoke="${escHtml(spoke.id)}" title="Delete this spoke" type="button">✕ Delete</button>
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
  const spokeSummary = summary.spokes.find(item => item.spoke_id === activeSpokeModal.spoke.id);
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

function renderSpokeServerTab() {
  if (!activeSpokeModal) return;
  const proxmox = activeSpokeModal.spoke?.telemetry?.proxmox || {};
  const vms = proxmox.vms || [];
  const usbState = proxmox.usb_state || [];

  // Node bar
  $("#spoke-server-hostname") && ($("#spoke-server-hostname").textContent = proxmox.hostname || activeSpokeModal.spoke?.hostname || "—");
  $("#spoke-server-vm-count") && ($("#spoke-server-vm-count").textContent = `${proxmox.vm_count ?? vms.length} VMs`);
  $("#spoke-server-running-count") && ($("#spoke-server-running-count").textContent = `${proxmox.running_count ?? vms.filter(v => v.status === "running").length} running`);
  $("#spoke-server-pve-version") && ($("#spoke-server-pve-version").textContent = proxmox.pve_version ? `PVE ${proxmox.pve_version}` : "");
  $("#spoke-server-agent-version") && ($("#spoke-server-agent-version").textContent = proxmox.agent_version ? `Agent ${proxmox.agent_version}` : "");

  // VMs table
  const vmsTbody = $("#spoke-server-vms-tbody");
  if (vmsTbody) {
    if (!vms.length) {
      vmsTbody.innerHTML = `<tr><td colspan="5" class="empty-msg">No VMs</td></tr>`;
    } else {
      const usbByVmid = {};
      usbState.forEach(u => { if (u.vmid != null) usbByVmid[String(u.vmid)] = u; });
      vmsTbody.innerHTML = vms.map(vm => {
        const statusClass = vm.status === "running" ? "status-online" : "status-offline";
        const usbEntry = usbByVmid[String(vm.vmid)];
        const usbBadge = usbEntry
          ? `<span class="status-badge ${usbEntry.prov_status === "active" ? "status-online" : "status-unknown"}">${usbEntry.prov_status || "—"}</span>`
          : `<span class="status-badge status-offline">none</span>`;
        return `<tr>
          <td>${escapeHtml(String(vm.vmid ?? ""))}</td>
          <td>${escapeHtml(vm.name || "")}</td>
          <td>${escapeHtml(vm.type || "")}</td>
          <td><span class="status-badge ${statusClass}">${escapeHtml(vm.status || "—")}</span></td>
          <td>${usbBadge}</td>
        </tr>`;
      }).join("");
    }
  }

  // USB table
  const usbTbody = $("#spoke-server-usb-tbody");
  if (usbTbody) {
    if (!usbState.length) {
      usbTbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No USB devices</td></tr>`;
    } else {
      usbTbody.innerHTML = usbState.map(u => {
        const ps = String(u.prov_status || "—");
        const psClass = ps === "active" ? "status-online" : ps === "provisioning" ? "status-pending" : "status-offline";
        return `<tr>
          <td>${escapeHtml(String(u.bus || u.bus_path || "—"))}</td>
          <td>${escapeHtml(String(u.vidpid || "—"))}</td>
          <td>${escapeHtml(String(u.vmid ?? "—"))}</td>
          <td><span class="status-badge ${psClass}">${escapeHtml(ps)}</span></td>
        </tr>`;
      }).join("");
    }
  }
}

function renderSpokeCentralTab() {
  if (!activeSpokeModal) return;
  const central = activeSpokeModal.spoke?.telemetry?.central || {};
  const checks = central.status || {};
  const alerts = central.hardware_alerts || [];
  const tokenState = central.token_state || (central.token_valid ? "valid" : "unknown");

  // Token bar
  const tokenBadge = $("#spoke-central-token-state");
  if (tokenBadge) {
    const cls = tokenState === "valid" ? "status-online" : tokenState === "expired" ? "status-offline" : "status-unknown";
    tokenBadge.className = `server-stat-pill ${cls}`;
    tokenBadge.textContent = `Token: ${escapeHtml(tokenState)}`;
  }

  // Checks table
  const checksTbody = $("#spoke-central-checks-tbody");
  if (checksTbody) {
    const checkEntries = Object.entries(checks);
    if (!checkEntries.length) {
      checksTbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No checks</td></tr>`;
    } else {
      checksTbody.innerHTML = checkEntries.map(([name, c]) => {
        const state = String(c.state || "—");
        const stateClass = state === "ok" ? "status-online" : state === "warn" ? "status-pending" : state === "error" ? "status-offline" : "status-unknown";
        const lastCheck = c.last_check ? new Date(c.last_check * 1000).toLocaleTimeString() : "—";
        return `<tr>
          <td>${escapeHtml(name)}</td>
          <td><span class="status-badge ${stateClass}">${escapeHtml(state)}</span></td>
          <td>${escapeHtml(String(c.value ?? "—"))}</td>
          <td>${escapeHtml(lastCheck)}</td>
        </tr>`;
      }).join("");
    }
  }

  // Alerts table
  const alertsTbody = $("#spoke-central-alerts-tbody");
  if (alertsTbody) {
    if (!alerts.length) {
      alertsTbody.innerHTML = `<tr><td colspan="3" class="empty-msg">No alerts</td></tr>`;
    } else {
      alertsTbody.innerHTML = alerts.map(a => {
        const sev = String(a.severity || "info");
        const sevClass = sev === "critical" ? "status-offline" : sev === "warning" ? "status-pending" : "status-unknown";
        return `<tr>
          <td><span class="status-badge ${sevClass}">${escapeHtml(sev)}</span></td>
          <td>${escapeHtml(a.check_type || "—")}</td>
          <td>${escapeHtml(a.message || "—")}</td>
        </tr>`;
      }).join("");
    }
  }
}

function renderSpokeStatusTab() {
  if (!activeSpokeModal) return;
  const api = activeSpokeModal.spoke?.telemetry?.api_server || {};
  const health = api.health || {};
  const services = api.services || {};

  // Info table
  const infoTbody = $("#spoke-status-info-tbody");
  if (infoTbody) {
    const rows = [
      ["Hostname", activeSpokeModal.spoke?.hostname || health.hostname || "—"],
      ["Version", health.version || "—"],
      ["Installer Version", health.installer_version || "—"],
      ["Clients", String(health.clients ?? "—")],
      ["Repo Synced", health.repo_synced != null ? (health.repo_synced ? "Yes" : "No") : "—"],
      ["Repo Error", health.repo_error || "None"],
    ];
    infoTbody.innerHTML = rows.map(([k, v]) =>
      `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(String(v))}</td></tr>`
    ).join("");
  }

  // Services table
  const servicesTbody = $("#spoke-status-services-tbody");
  if (servicesTbody) {
    const entries = Object.entries(services);
    if (!entries.length) {
      servicesTbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No services</td></tr>`;
    } else {
      servicesTbody.innerHTML = entries.map(([name, svc]) => {
        const status = String(svc.status || "—");
        const statusClass = status === "running" ? "status-online" : status === "stopped" ? "status-offline" : "status-unknown";
        const lastRun = svc.last_run ? new Date(svc.last_run * 1000).toLocaleString() : "—";
        return `<tr>
          <td>${escapeHtml(name)}</td>
          <td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(String(svc.error_count ?? 0))}</td>
          <td>${escapeHtml(lastRun)}</td>
        </tr>`;
      }).join("");
    }
  }
}

function openSpokeModal(spoke, tenantId, subtab = "spoke-clients") {
  activeSpokeModal = { spoke, tenant_id: tenantId };
  $("#spoke-modal-title") && ($("#spoke-modal-title").textContent = `${spokePrimaryLabel(spoke)} — ${tenantName(tenantId)}`);
  $("#spoke-modal")?.classList.remove("hidden");
  activateSpokeSubtab(subtab);
  renderSpokeClientsTab();
  renderSpokeServerTab();
  renderSpokeCentralTab();
  renderSpokeStatusTab();
  loadSpokeCommands();
  loadSpokeProcessingMode();
  loadSpokeAudit();
  const canManage = canManageTenant(tenantId);
  [
    '#spoke-clients .spoke-action-bar button',
    '#spoke-clients .spoke-action-bar select',
    '.spoke-subtab[data-subtab="spoke-mode"]',
    '#mode-save-btn',
  ].forEach(selector => {
    $$(selector).forEach(el => {
      el.disabled = !canManage;
      el.classList.toggle('hidden', !canManage && selector.includes('spoke-mode'));
    });
  });
}

function closeSpokeModal() {
  $("#spoke-modal")?.classList.add("hidden");
  activeSpokeModal = null;
}

function activateSpokeSubtab(subtabId) {
  $$(".spoke-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtabId));
  ["spoke-clients", "spoke-commands", "spoke-mode", "spoke-audit", "spoke-server", "spoke-central", "spoke-status", "spoke-config-diag"].forEach(panelId => {
    document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtabId);
  });
  if (subtabId === "spoke-commands") loadSpokeCommands();
  if (subtabId === "spoke-mode") loadSpokeProcessingMode();
  if (subtabId === "spoke-audit") loadSpokeAudit();
  if (subtabId === "spoke-server") renderSpokeServerTab();
  if (subtabId === "spoke-central") renderSpokeCentralTab();
  if (subtabId === "spoke-status") renderSpokeStatusTab();
  if (subtabId === "spoke-config-diag") loadSpokeConfigDiag();
}

async function sendSpokeCommand(type) {
  if (!activeSpokeModal || !canManageTenant(activeSpokeModal.tenant_id)) return;
  const ok = await sendCommandToSpoke(activeSpokeModal.tenant_id, activeSpokeModal.spoke.id, type);
  if (ok) {
    loadSpokeCommands();
    loadSpokeAudit();
  }
}
window.sendSpokeCommand = sendSpokeCommand;

async function loadSpokeConfigDiag() {
  if (!activeSpokeModal) return;
  const { spoke, tenant_id: tenantId } = activeSpokeModal;
  const content = $("#spoke-config-diag-content");
  const msgEl = $("#diag-msg");
  if (content) content.innerHTML = '<p class="muted">Loading…</p>';
  if (msgEl) msgEl.textContent = "";

  // Wire up buttons (idempotent — removing old listeners via cloneNode)
  const refreshBtn = $("#diag-refresh-btn");
  const resyncBtn = $("#diag-force-resync-btn");
  if (refreshBtn) {
    const newRefresh = refreshBtn.cloneNode(true);
    refreshBtn.replaceWith(newRefresh);
    newRefresh.addEventListener("click", () => loadSpokeConfigDiag());
  }
  if (resyncBtn) {
    const newResync = resyncBtn.cloneNode(true);
    resyncBtn.replaceWith(newResync);
    newResync.addEventListener("click", async () => {
      newResync.disabled = true;
      newResync.textContent = "Resyncing…";
      try {
        const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/usb-vidpids/resync`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (msgEl) { msgEl.textContent = `Resync queued for ${data.pushed_to_spokes ?? 0} spoke(s).`; msgEl.className = "form-msg success"; }
        setTimeout(() => loadSpokeConfigDiag(), 1500);
      } catch (err) {
        if (msgEl) { msgEl.textContent = err.message || "Resync failed."; msgEl.className = "form-msg error"; }
      } finally {
        newResync.disabled = false;
        newResync.textContent = "⬆ Force Resync";
      }
    });
  }

  let diag;
  try {
    const res = await apiFetch(`/api/${encodeURIComponent(tenantId)}/spokes/${encodeURIComponent(spoke.id)}/config-diag`);
    diag = await res.json();
  } catch (err) {
    if (content) content.innerHTML = `<p class="error">Failed to load diagnostics: ${escHtml(err.message || String(err))}</p>`;
    return;
  }

  const syncOk = diag.config_in_sync;
  const pushPending = diag.push_pending;
  const usbOk = diag.effective_usb_cert_count > 0;

  // Status badge helper
  const badge = (ok, text) => `<span class="badge ${ok ? 'badge-success' : 'badge-error'}">${escHtml(text)}</span>`;
  const neutral = text => `<span class="badge badge-neutral">${escHtml(text)}</span>`;

  const rows = [
    ["Config version (hub)", String(diag.config_version ?? "—")],
    ["Config version (spoke acked)", String(diag.applied_config_version ?? "—")],
    ["Push pending", pushPending ? badge(false, "Yes — push in flight or queued") : badge(true, "No")],
    ["Config hash (last pushed)", `<code>${escHtml(diag.last_pushed_config_hash ?? "none")}</code>`],
    ["Config hash (current)", `<code>${escHtml(diag.current_authoritative_hash ?? "—")}</code>`],
    ["Hashes match (in sync)", syncOk ? badge(true, "✓ In sync") : badge(false, "✗ Drift detected — push pending")],
    ["Global USB cert count", String(diag.global_usb_cert_count ?? 0)],
    ["Effective USB cert count (global + tenant)", String(diag.effective_usb_cert_count ?? 0)],
    ["USB certs included in next payload", diag.usb_vidpids_in_next_payload ? badge(true, "Yes") : badge(false, "No — global list may be empty")],
  ];

  const tableRows = rows.map(([k, v]) => `<tr><td style="font-weight:500;white-space:nowrap;">${escHtml(k)}</td><td>${v}</td></tr>`).join("");

  // USB cert list
  const certRows = (diag.effective_usb_certs || []).map(d =>
    `<tr><td><code>${escHtml(d.vidpid || "")}</code></td><td>${escHtml(d.type || "")}</td><td>${escHtml(d.label || "")}</td><td>${neutral(d.source || "")}</td></tr>`
  ).join("") || `<tr><td colspan="4" class="muted">None — hub global approved list is empty. Add devices in Setup → USB Management.</td></tr>`;

  // Pending config commands
  const cmdRows = (diag.pending_config_commands || []).map(c =>
    `<tr><td><code>${escHtml(c.type)}</code></td><td>${neutral(c.status)}</td><td>v${escHtml(String(c.config_version))}</td><td>${c.usb_vidpids_in_payload ? badge(true, "Yes") : badge(false, "No")}</td></tr>`
  ).join("") || `<tr><td colspan="4" class="muted">No pending config commands.</td></tr>`;

  // Overall status banner
  let banner = "";
  if (!usbOk) {
    banner = `<div style="margin-bottom:12px;padding:10px 14px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;color:#92400e;">⚠️ <strong>Global USB cert list is empty.</strong> Add the Realtek (or other) devices to Setup → USB Management → Global Approved Devices, then click <em>⬆ Force Resync</em>.</div>`;
  } else if (!syncOk || pushPending) {
    banner = `<div style="margin-bottom:12px;padding:10px 14px;background:#dbeafe;border:1px solid #3b82f6;border-radius:6px;color:#1e40af;">ℹ️ Config push in flight or pending. The spoke will apply on its next relay cycle (~30s). If this persists, click <em>⬆ Force Resync</em>.</div>`;
  } else {
    banner = `<div style="margin-bottom:12px;padding:10px 14px;background:#d1fae5;border:1px solid #10b981;border-radius:6px;color:#065f46;">✅ Config is in sync. USB certs (${diag.effective_usb_cert_count}) are included in the last push.</div>`;
  }

  if (content) content.innerHTML = `
    ${banner}
    <div class="setup-card" style="margin-bottom:10px;">
      <div class="setup-card-header"><h4>Config Version & Sync State</h4></div>
      <table class="data-table"><tbody>${tableRows}</tbody></table>
    </div>
    <div class="setup-card" style="margin-bottom:10px;">
      <div class="setup-card-header"><h4>Effective USB Certs (would be sent to spoke)</h4></div>
      <table class="data-table">
        <thead><tr><th>VID:PID</th><th>Type</th><th>Label</th><th>Source</th></tr></thead>
        <tbody>${certRows}</tbody>
      </table>
    </div>
    <div class="setup-card">
      <div class="setup-card-header"><h4>Pending Config Commands in Queue</h4></div>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Status</th><th>Version</th><th>USB Certs Included</th></tr></thead>
        <tbody>${cmdRows}</tbody>
      </table>
    </div>
  `;
}

async function loadHubSettings() {
  if (!currentTenantId) return;
  const disabled = !canManageTenant();
  ["notif-save-btn", "acme-request-btn"].forEach(id => { const btn = document.getElementById(id); if (btn) btn.disabled = disabled; });
  // Load tenant admin pending spokes whenever settings tab opens
  if (canManageTenant()) loadTenantPendingSpokes();
  if (canManageTenant()) loadHubConfig();
  const res = await apiFetch(`/api/${encodeURIComponent(currentTenantId)}/settings`);
  if (!res || !res.ok) return;
  const data = await res.json();
  const notifications = data.notifications || {};
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
  await loadHubSettings();
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
  const provider = $("#acme-dns-provider")?.value || "cloudflare";
  const allFields = ["cloudflare", "he", "godaddy", "do", "porkbun", "gcloud", "dnsimple", "azure", "route53", "namecheap"];
  allFields.forEach((p) => $("#acme-" + p + "-fields")?.classList.add("hidden"));
  const map = {
    cloudflare: "acme-cloudflare-fields",
    hurricane_electric: "acme-he-fields",
    godaddy: "acme-godaddy-fields",
    digitalocean: "acme-do-fields",
    porkbun: "acme-porkbun-fields",
    gcloud: "acme-gcloud-fields",
    dnsimple: "acme-dnsimple-fields",
    azure_dns: "acme-azure-fields",
    route53: "acme-route53-fields",
    namecheap: "acme-namecheap-fields",
  };
  const target = map[provider];
  if (target) $("#" + target)?.classList.remove("hidden");
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
      <div class="setup-status-item"><span class="setup-status-label">Challenge</span><span class="setup-status-value">DNS-01</span></div>
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
  const creds = data.dns_credentials || {};
  const configured = data.dns_credentials_configured || {};
  const setValue = (id, value) => {
    const el = $(id);
    if (el) el.value = value || "";
  };
  hubAcmeSettings = data;
  hubAcmeStatus = statusRes?.ok ? await statusRes.json() : {};
  setValue("#acme-domain", data.domain || "");
  setValue("#acme-email", data.email || "");
  setValue("#acme-ca", data.ca || "letsencrypt");
  setValue("#acme-challenge", "dns-01");
  setValue("#acme-dns-provider", data.dns_provider || "cloudflare");
  setValue("#acme-gcloud-sa-json", configured.gcloud_service_account_json || creds.gcloud_service_account_json || "");
  setValue("#acme-gcloud-zone", creds.gcloud_zone_name || "");
  setValue("#acme-dnsimple-account-id", creds.dnsimple_account_id || "");
  setValue("#acme-azure-tenant", creds.azure_tenant_id || "");
  setValue("#acme-azure-client-id", creds.azure_client_id || "");
  setValue("#acme-azure-sub", creds.azure_subscription_id || "");
  setValue("#acme-azure-rg", creds.azure_resource_group || "");
  setValue("#acme-azure-zone", creds.azure_zone_name || "");
  setValue("#acme-r53-key", creds.route53_access_key || "");
  setValue("#acme-r53-zone-id", creds.route53_zone_id || "");
  setValue("#acme-nc-user", creds.namecheap_username || "");
  setValue("#acme-nc-ip", creds.namecheap_client_ip || "");
  $("#acme-enabled") && ($("#acme-enabled").checked = Boolean(data.enabled));
  setSecretInputConfigured($("#acme-cf-token"), isConfiguredSecretValue(data.dns_credentials_configured?.cf_api_token ?? creds.cf_api_token));
  setSecretInputConfigured($("#acme-he-ddns-key"), isConfiguredSecretValue(data.dns_credentials_configured?.he_ddns_key ?? creds.he_ddns_key));
  setSecretInputConfigured($("#acme-godaddy-key"), isConfiguredSecretValue(configured.godaddy_api_key ?? creds.godaddy_api_key));
  setSecretInputConfigured($("#acme-godaddy-secret"), isConfiguredSecretValue(configured.godaddy_api_secret ?? creds.godaddy_api_secret));
  setSecretInputConfigured($("#acme-do-token"), isConfiguredSecretValue(configured.do_token ?? creds.do_token));
  setSecretInputConfigured($("#acme-porkbun-key"), isConfiguredSecretValue(configured.porkbun_api_key ?? creds.porkbun_api_key));
  setSecretInputConfigured($("#acme-porkbun-secret"), isConfiguredSecretValue(configured.porkbun_secret_key ?? creds.porkbun_secret_key));
  setSecretInputConfigured($("#acme-dnsimple-token"), isConfiguredSecretValue(configured.dnsimple_token ?? creds.dnsimple_token));
  setSecretInputConfigured($("#acme-azure-client-secret"), isConfiguredSecretValue(configured.azure_client_secret ?? creds.azure_client_secret));
  setSecretInputConfigured($("#acme-r53-secret"), isConfiguredSecretValue(configured.route53_secret_key ?? creds.route53_secret_key));
  setSecretInputConfigured($("#acme-nc-key"), isConfiguredSecretValue(configured.namecheap_api_key ?? creds.namecheap_api_key));
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
    challenge: "dns-01",
    dns_provider: $("#acme-dns-provider")?.value || "",
    dns_credentials: {},
  };
  const addSecret = (key, id) => {
    const secret = getSecretInputPayload($(id));
    if (secret.include) payload.dns_credentials[key] = secret.value;
  };
  const addValue = (key, id) => {
    const value = $(id)?.value.trim();
    if (value) payload.dns_credentials[key] = value;
  };
  addSecret("cf_api_token", "#acme-cf-token");
  addSecret("he_ddns_key", "#acme-he-ddns-key");
  addSecret("godaddy_api_key", "#acme-godaddy-key");
  addSecret("godaddy_api_secret", "#acme-godaddy-secret");
  addSecret("do_token", "#acme-do-token");
  addSecret("porkbun_api_key", "#acme-porkbun-key");
  addSecret("porkbun_secret_key", "#acme-porkbun-secret");
  addValue("gcloud_service_account_json", "#acme-gcloud-sa-json");
  addValue("gcloud_zone_name", "#acme-gcloud-zone");
  addSecret("dnsimple_token", "#acme-dnsimple-token");
  addValue("dnsimple_account_id", "#acme-dnsimple-account-id");
  addValue("azure_tenant_id", "#acme-azure-tenant");
  addValue("azure_client_id", "#acme-azure-client-id");
  addSecret("azure_client_secret", "#acme-azure-client-secret");
  addValue("azure_subscription_id", "#acme-azure-sub");
  addValue("azure_resource_group", "#acme-azure-rg");
  addValue("azure_zone_name", "#acme-azure-zone");
  addValue("route53_access_key", "#acme-r53-key");
  addSecret("route53_secret_key", "#acme-r53-secret");
  addValue("route53_zone_id", "#acme-r53-zone-id");
  addSecret("namecheap_api_key", "#acme-nc-key");
  addValue("namecheap_username", "#acme-nc-user");
  addValue("namecheap_client_ip", "#acme-nc-ip");

  const res = await apiFetch("/api/settings/acme", { method: "POST", body: payload });
  if (!res || !res.ok) {
    const err = await readJson(res);
    setFormMessage("acme-msg", err?.detail || "Unable to save ACME settings.", false);
    return;
  }
  const data = await res.json();
  const creds = data.dns_credentials || {};
  const configured = data.dns_credentials_configured || {};
  hubAcmeSettings = data;
  setFormMessage("acme-msg", "TLS certificate settings saved.", true);
  updateHubAcmeDisplay();
  setSecretInputConfigured($("#acme-cf-token"), isConfiguredSecretValue(data.dns_credentials_configured?.cf_api_token ?? creds.cf_api_token));
  setSecretInputConfigured($("#acme-he-ddns-key"), isConfiguredSecretValue(data.dns_credentials_configured?.he_ddns_key ?? creds.he_ddns_key));
  setSecretInputConfigured($("#acme-godaddy-key"), isConfiguredSecretValue(configured.godaddy_api_key ?? creds.godaddy_api_key));
  setSecretInputConfigured($("#acme-godaddy-secret"), isConfiguredSecretValue(configured.godaddy_api_secret ?? creds.godaddy_api_secret));
  setSecretInputConfigured($("#acme-do-token"), isConfiguredSecretValue(configured.do_token ?? creds.do_token));
  setSecretInputConfigured($("#acme-porkbun-key"), isConfiguredSecretValue(configured.porkbun_api_key ?? creds.porkbun_api_key));
  setSecretInputConfigured($("#acme-porkbun-secret"), isConfiguredSecretValue(configured.porkbun_secret_key ?? creds.porkbun_secret_key));
  setSecretInputConfigured($("#acme-dnsimple-token"), isConfiguredSecretValue(configured.dnsimple_token ?? creds.dnsimple_token));
  setSecretInputConfigured($("#acme-azure-client-secret"), isConfiguredSecretValue(configured.azure_client_secret ?? creds.azure_client_secret));
  setSecretInputConfigured($("#acme-r53-secret"), isConfiguredSecretValue(configured.route53_secret_key ?? creds.route53_secret_key));
  setSecretInputConfigured($("#acme-nc-key"), isConfiguredSecretValue(configured.namecheap_api_key ?? creds.namecheap_api_key));
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

function normalizeHubAuthProvider(provider) {
  return ["local", "ldap", "radius", "tacacs"].includes(provider) ? provider : "local";
}

function normalizeHubAuthDefaultRole(role) {
  return role === "tenant_admin" ? "tenant_admin" : "superadmin";
}

function normalizeHubAuthConfig(data = {}) {
  return {
    ...HUB_AUTH_DEFAULTS,
    ...data,
    auth_provider: normalizeHubAuthProvider(String(data.auth_provider || HUB_AUTH_DEFAULTS.auth_provider).trim().toLowerCase()),
    auth_radius_port: Number.parseInt(data.auth_radius_port ?? HUB_AUTH_DEFAULTS.auth_radius_port, 10) || HUB_AUTH_DEFAULTS.auth_radius_port,
    auth_tacacs_port: Number.parseInt(data.auth_tacacs_port ?? HUB_AUTH_DEFAULTS.auth_tacacs_port, 10) || HUB_AUTH_DEFAULTS.auth_tacacs_port,
    auth_tacacs_superadmin_priv: Number.parseInt(data.auth_tacacs_superadmin_priv ?? HUB_AUTH_DEFAULTS.auth_tacacs_superadmin_priv, 10) || HUB_AUTH_DEFAULTS.auth_tacacs_superadmin_priv,
    auth_default_role: normalizeHubAuthDefaultRole(String(data.auth_default_role || HUB_AUTH_DEFAULTS.auth_default_role).trim().toLowerCase()),
  };
}

function renderHubAuthTenantOptions(selectedTenantId = "") {
  const select = hubAuthEl("sa-auth-tenant-id");
  if (!select) return;
  const options = ['<option value="">Select tenant</option>'];
  tenants.forEach((tenant) => {
    const selected = tenant.id === selectedTenantId ? ' selected' : '';
    options.push(`<option value="${escHtml(tenant.id)}"${selected}>${escHtml(tenant.name || tenant.id)}</option>`);
  });
  select.innerHTML = options.join("");
}

function updateHubAuthProviderVisibility(provider = hubAuthConfig.auth_provider || "local") {
  const nextProvider = normalizeHubAuthProvider(String(provider || "local").trim().toLowerCase());
  const providerSelect = hubAuthEl("sa-auth-provider");
  if (providerSelect && !providerSelect.matches(":focus")) providerSelect.value = nextProvider;
  hubAuthEl("sa-auth-ldap-fields")?.classList.toggle("hidden", nextProvider !== "ldap");
  hubAuthEl("sa-auth-radius-fields")?.classList.toggle("hidden", nextProvider !== "radius");
  hubAuthEl("sa-auth-tacacs-fields")?.classList.toggle("hidden", nextProvider !== "tacacs");
}

function applyHubAuthConfigToUi(config = hubAuthConfig) {
  // setInputValueIfIdle is defined in the spoke IIFE and not in scope here.
  function setInputValueIfIdle(input, value) {
    if (input && !input.matches(":focus")) input.value = value || "";
  }
  const next = normalizeHubAuthConfig(config);
  hubAuthConfig = next;
  renderHubAuthTenantOptions(next.auth_ldap_tenant_id || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-url"), next.auth_ldap_url || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-bind-dn"), next.auth_ldap_bind_dn || "");
  setSecretInputConfigured(hubAuthEl("sa-auth-ldap-bind-password"), next.auth_ldap_bind_password_configured);
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-user-base"), next.auth_ldap_user_base || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-user-filter"), next.auth_ldap_user_filter || HUB_AUTH_DEFAULTS.auth_ldap_user_filter);
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-group-superadmin"), next.auth_ldap_group_superadmin || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-ldap-group-tenant-admin"), next.auth_ldap_group_tenant_admin || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-radius-host"), next.auth_radius_host || "");
  setInputValueIfIdle(hubAuthEl("sa-auth-radius-role-attr"), next.auth_radius_role_attr || HUB_AUTH_DEFAULTS.auth_radius_role_attr);
  setInputValueIfIdle(hubAuthEl("sa-auth-radius-superadmin-val"), next.auth_radius_superadmin_val || HUB_AUTH_DEFAULTS.auth_radius_superadmin_val);
  setSecretInputConfigured(hubAuthEl("sa-auth-radius-secret"), next.auth_radius_secret_configured);
  setInputValueIfIdle(hubAuthEl("sa-auth-tacacs-host"), next.auth_tacacs_host || "");
  setSecretInputConfigured(hubAuthEl("sa-auth-tacacs-secret"), next.auth_tacacs_secret_configured);
  const radiusPort = hubAuthEl("sa-auth-radius-port");
  if (radiusPort && !radiusPort.matches(":focus")) radiusPort.value = next.auth_radius_port ?? HUB_AUTH_DEFAULTS.auth_radius_port;
  const tacacsPort = hubAuthEl("sa-auth-tacacs-port");
  if (tacacsPort && !tacacsPort.matches(":focus")) tacacsPort.value = next.auth_tacacs_port ?? HUB_AUTH_DEFAULTS.auth_tacacs_port;
  const tacacsPriv = hubAuthEl("sa-auth-tacacs-superadmin-priv");
  if (tacacsPriv && !tacacsPriv.matches(":focus")) tacacsPriv.value = next.auth_tacacs_superadmin_priv ?? HUB_AUTH_DEFAULTS.auth_tacacs_superadmin_priv;
  const defaultSuperadmin = hubAuthEl("sa-auth-default-role-superadmin");
  const defaultTenantAdmin = hubAuthEl("sa-auth-default-role-tenant-admin");
  if (defaultSuperadmin) defaultSuperadmin.checked = next.auth_default_role !== "tenant_admin";
  if (defaultTenantAdmin) defaultTenantAdmin.checked = next.auth_default_role === "tenant_admin";
  updateHubAuthProviderVisibility(next.auth_provider);
}

function getHubAuthDefaultRole() {
  return hubAuthEl("sa-auth-default-role-tenant-admin")?.checked ? "tenant_admin" : "superadmin";
}

async function loadHubAuthConfig(force = false) {
  if (!currentUser?.is_superadmin) return null;
  if (hubAuthConfigLoaded && !force) {
    applyHubAuthConfigToUi(hubAuthConfig);
    return hubAuthConfig;
  }
  const response = await apiFetch("/api/superadmin/auth-config");
  const data = await readJson(response);
  if (!response || !response.ok) {
    showInlineMessage(hubAuthEl("sa-auth-msg"), data?.detail || "Failed to load auth configuration.", true, 7000);
    return null;
  }
  hubAuthConfig = normalizeHubAuthConfig(data || {});
  hubAuthConfigLoaded = true;
  applyHubAuthConfigToUi(hubAuthConfig);
  return hubAuthConfig;
}

async function saveHubAuthConfig() {
  if (!currentUser?.is_superadmin) return;
  const provider = normalizeHubAuthProvider(String(hubAuthEl("sa-auth-provider")?.value || hubAuthConfig.auth_provider || "local").trim().toLowerCase());
  const payload = {
    auth_provider: provider,
    auth_ldap_url: hubAuthEl("sa-auth-ldap-url")?.value?.trim() || "",
    auth_ldap_bind_dn: hubAuthEl("sa-auth-ldap-bind-dn")?.value?.trim() || "",
    auth_ldap_user_base: hubAuthEl("sa-auth-ldap-user-base")?.value?.trim() || "",
    auth_ldap_user_filter: hubAuthEl("sa-auth-ldap-user-filter")?.value?.trim() || HUB_AUTH_DEFAULTS.auth_ldap_user_filter,
    auth_ldap_group_superadmin: hubAuthEl("sa-auth-ldap-group-superadmin")?.value?.trim() || "",
    auth_ldap_group_tenant_admin: hubAuthEl("sa-auth-ldap-group-tenant-admin")?.value?.trim() || "",
    auth_ldap_tenant_id: hubAuthEl("sa-auth-tenant-id")?.value || "",
    auth_radius_host: hubAuthEl("sa-auth-radius-host")?.value?.trim() || "",
    auth_radius_port: Number.parseInt(hubAuthEl("sa-auth-radius-port")?.value || HUB_AUTH_DEFAULTS.auth_radius_port, 10) || HUB_AUTH_DEFAULTS.auth_radius_port,
    auth_radius_role_attr: hubAuthEl("sa-auth-radius-role-attr")?.value?.trim() || HUB_AUTH_DEFAULTS.auth_radius_role_attr,
    auth_radius_superadmin_val: hubAuthEl("sa-auth-radius-superadmin-val")?.value?.trim() || HUB_AUTH_DEFAULTS.auth_radius_superadmin_val,
    auth_tacacs_host: hubAuthEl("sa-auth-tacacs-host")?.value?.trim() || "",
    auth_tacacs_port: Number.parseInt(hubAuthEl("sa-auth-tacacs-port")?.value || HUB_AUTH_DEFAULTS.auth_tacacs_port, 10) || HUB_AUTH_DEFAULTS.auth_tacacs_port,
    auth_tacacs_superadmin_priv: Number.parseInt(hubAuthEl("sa-auth-tacacs-superadmin-priv")?.value || HUB_AUTH_DEFAULTS.auth_tacacs_superadmin_priv, 10) || HUB_AUTH_DEFAULTS.auth_tacacs_superadmin_priv,
    auth_default_role: getHubAuthDefaultRole(),
  };
  const ldapSecret = getSecretInputPayload(hubAuthEl("sa-auth-ldap-bind-password"));
  if (ldapSecret.include) payload.auth_ldap_bind_password = ldapSecret.value;
  const radiusSecret = getSecretInputPayload(hubAuthEl("sa-auth-radius-secret"));
  if (radiusSecret.include) payload.auth_radius_secret = radiusSecret.value;
  const tacacsSecret = getSecretInputPayload(hubAuthEl("sa-auth-tacacs-secret"));
  if (tacacsSecret.include) payload.auth_tacacs_secret = tacacsSecret.value;

  showInlineMessage(hubAuthEl("sa-auth-msg"), "Saving authentication settings…", false, 0);
  const response = await apiFetch("/api/superadmin/auth-config", { method: "POST", body: payload });
  const data = await readJson(response);
  if (!response || !response.ok) {
    showInlineMessage(hubAuthEl("sa-auth-msg"), data?.detail || "Failed to save auth configuration.", true, 7000);
    return;
  }
  resetSecretInput(hubAuthEl("sa-auth-ldap-bind-password"));
  resetSecretInput(hubAuthEl("sa-auth-radius-secret"));
  resetSecretInput(hubAuthEl("sa-auth-tacacs-secret"));
  hubAuthConfigLoaded = false;
  await loadHubAuthConfig(true).catch(() => {});
  showInlineMessage(hubAuthEl("sa-auth-msg"), "Authentication settings saved.", false, 5000);
}

async function testHubAuthConnection() {
  if (!currentUser?.is_superadmin) return;
  const provider = normalizeHubAuthProvider(String(hubAuthEl("sa-auth-provider")?.value || hubAuthConfig.auth_provider || "local").trim().toLowerCase());
  const response = await apiFetch("/api/superadmin/auth-test", {
    method: "POST",
    body: {
      provider,
      username: hubAuthEl("sa-auth-test-username")?.value?.trim() || "",
      password: hubAuthEl("sa-auth-test-password")?.value || "",
    },
  });
  const data = await readJson(response);
  if (!response || !response.ok) {
    showInlineMessage(hubAuthEl("sa-auth-msg"), data?.detail || "Failed to test auth provider.", true, 7000);
    return;
  }
  showInlineMessage(hubAuthEl("sa-auth-msg"), data?.message || (data?.ok ? "Connection OK." : "Connection failed."), !data?.ok, 7000);
}

async function loadSuperadmin() {
  if (!currentUser?.is_superadmin) return;
  const [tenantsRes, pendingRes, usersRes, authRes] = await Promise.all([
    apiFetch("/api/superadmin/tenants"),
    apiFetch("/api/superadmin/pending-spokes"),
    apiFetch("/api/superadmin/users"),
    apiFetch("/api/superadmin/auth-config"),
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
  if (authRes?.ok) {
    hubAuthConfig = normalizeHubAuthConfig(await authRes.json());
    hubAuthConfigLoaded = true;
    applyHubAuthConfigToUi(hubAuthConfig);
  } else {
    hubAuthConfigLoaded = false;
  }
  loadGkillState();
  loadGlobalUsbVidpids();
}

// ── Global USB certified devices (superadmin) ────────────────────────────────
// Shared state so loadGlobalUsbVidpids and wireGlobalUsb stay in sync.
let _globalCertified = [];
let _globalDiscovered = [];
let _globalIgnored = [];

async function loadGlobalUsbVidpids() {
  const tbody = $("#sa-global-usb-tbody");
  const discSection = $("#sa-global-usb-discovered");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading…</td></tr>';
  if (discSection) discSection.innerHTML = '<p class="empty-state" style="padding:8px 0;">Loading…</p>';
  try {
    // Fetch certified list, ignored list, and discovered list in parallel
    const [certRes, ignoredRes, discRes] = await Promise.all([
      apiFetch("/api/superadmin/global-usb-vidpids"),
      apiFetch("/api/superadmin/global-usb-ignored-vidpids"),
      apiFetch("/api/superadmin/discovered-usb-vidpids"),
    ]);
    const certData    = certRes?.ok    ? await readJson(certRes)    : null;
    const ignoredData = ignoredRes?.ok ? await readJson(ignoredRes) : null;
    const discData    = discRes?.ok    ? await readJson(discRes)    : null;
    _globalCertified  = Array.isArray(certData?.usb_vidpids)    ? certData.usb_vidpids    : [];
    _globalIgnored    = Array.isArray(ignoredData?.usb_vidpids) ? ignoredData.usb_vidpids : [];
    _globalDiscovered = Array.isArray(discData?.devices)        ? discData.devices        : [];
    renderGlobalUsbVidpids(_globalCertified, _globalDiscovered);
    renderGlobalUsbIgnored(_globalIgnored);
    populateIgnoreFromDiscovered();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:var(--danger)">Error loading USB data: ${escHtml(String(err))}</td></tr>`;
  }
}

function renderGlobalUsbVidpids(devices, discovered) {
  const tbody = $("#sa-global-usb-tbody");
  if (!tbody) return;

  // ── Discovered / pending approval section ──
  const globalSet        = new Set(devices.map(d => String(d.vidpid || "").toLowerCase().trim()));
  const globalIgnoredSet = new Set(_globalIgnored.map(d => String(d.vidpid || "").toLowerCase().trim()));
  const pending = (discovered || []).filter(d =>
    !globalSet.has(String(d.vidpid || "").toLowerCase().trim()) &&
    !globalIgnoredSet.has(String(d.vidpid || "").toLowerCase().trim())
  );
  const discSection = $("#sa-global-usb-discovered");
  if (discSection) {
    if (!pending.length) {
      discSection.innerHTML = '<p class="empty-state" style="padding:8px 0;">No new devices seen on any spoke.</p>';
    } else {
      discSection.innerHTML = `
        <table class="data-table">
          <colgroup><col style="width:120px"><col><col><col style="width:200px"></colgroup>
          <thead><tr><th>VID:PID</th><th>Device Name</th><th>Seen On</th><th>Action</th></tr></thead>
          <tbody>${pending.map(d => {
            const vid = escHtml(d.vidpid || "");
            const name = escHtml(d.name || "—");
            const seenOn = (d.seen_on || []).map(s => escHtml(`${s.spoke_name} (${s.tenant_name})`)).join(", ") || "—";
            return `<tr>
              <td><code>${vid}</code></td>
              <td>${name}</td>
              <td class="muted" style="font-size:0.85rem">${seenOn}</td>
              <td style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-primary btn-small" data-sa-usb-approve="${vid}" type="button">Approve</button>
                <button class="btn btn-warning btn-small" data-sa-usb-ignore="${vid}" data-sa-usb-ignore-name="${escHtml(d.name || "")}" type="button">Ignore</button>
              </td>
            </tr>`;
          }).join("")}</tbody>
        </table>`;
    }
  }

  // ── Globally certified section ──
  if (!devices.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No globally certified devices.</td></tr>';
    return;
  }
  tbody.innerHTML = devices.map(d => `
    <tr data-vidpid="${escHtml(d.vidpid || '')}">
      <td>${escHtml(d.label || d.vidpid || "—")}</td>
      <td><code>${escHtml(d.vidpid || "—")}</code></td>
      <td>${escHtml(d.type || "wireless")}</td>
      <td>
        <button class="btn btn-danger btn-small" data-sa-usb-remove="${escHtml(d.vidpid || '')}" type="button">Remove</button>
      </td>
    </tr>`).join("");
}

function renderGlobalUsbIgnored(devices) {
  const tbody = $("#sa-global-usb-ignored-tbody");
  if (!tbody) return;
  if (!devices.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No globally ignored devices.</td></tr>';
    return;
  }
  tbody.innerHTML = devices.map(d => `
    <tr data-vidpid="${escHtml(d.vidpid || '')}">
      <td>${escHtml(d.label || d.vidpid || "—")}</td>
      <td><code>${escHtml(d.vidpid || "—")}</code></td>
      <td>
        <button class="btn btn-danger btn-small" data-sa-usb-ignore-remove="${escHtml(d.vidpid || '')}" type="button">Remove</button>
      </td>
    </tr>`).join("");
}

function populateIgnoreFromDiscovered() {
  const select = $("#sa-usb-ignore-discovered-select");
  if (!select) return;

  const certifiedSet = new Set(_globalCertified.map(d => String(d.vidpid || "").toLowerCase().trim()));
  const ignoredSet = new Set(_globalIgnored.map(d => String(d.vidpid || "").toLowerCase().trim()));
  const pending = _globalDiscovered.filter(d => {
    const vidpid = String(d.vidpid || "").toLowerCase().trim();
    return vidpid && !certifiedSet.has(vidpid) && !ignoredSet.has(vidpid);
  });

  const currentValue = select.value;
  select.innerHTML = '<option value="">— select a discovered device —</option>';
  pending.forEach((device, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    const seenOn = Array.isArray(device.seen_on)
      ? device.seen_on.map(s => [s?.spoke_name, s?.tenant_name].filter(Boolean).join(" / ")).filter(Boolean).join(", ")
      : "";
    option.textContent = [device.vidpid || "—", device.name || "Unnamed device", seenOn ? `(${seenOn})` : ""]
      .filter(Boolean)
      .join(" — ");
    select.appendChild(option);
  });
  if (pending.some((_, idx) => String(idx) === currentValue)) select.value = currentValue;
}

// Wire global USB add/remove/approve/ignore — called once after DOM ready.
(function wireGlobalUsb() {
  // Add button
  document.addEventListener("click", async (e) => {
    if (e.target.id === "sa-usb-add-btn") {
      const vidpid = ($("#sa-usb-vidpid")?.value || "").trim().toLowerCase();
      const label  = ($("#sa-usb-label")?.value || "").trim();
      const type   = $("#sa-usb-type")?.value || "wireless";
      const msg    = $("#sa-usb-msg");
      if (!vidpid) { if (msg) { msg.textContent = "VID:PID is required."; msg.style.color = "var(--text-danger)"; } return; }
      if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(vidpid)) {
        if (msg) { msg.textContent = "Format must be xxxx:xxxx (hex)."; msg.style.color = "var(--text-danger)"; } return;
      }
      e.target.disabled = true;
      e.target.textContent = "Saving…";
      if (msg) msg.textContent = "";
      try {
        // Fetch current list, append/replace, PUT back.
        const getRes  = await apiFetch("/api/superadmin/global-usb-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global USB list");
        const current = Array.isArray(getData.usb_vidpids) ? getData.usb_vidpids : [];
        const updated = current.filter(d => d.vidpid !== vidpid);
        updated.push({ vidpid, label: label || vidpid, type });
        const putRes  = await apiFetch("/api/superadmin/global-usb-vidpids", {
          method: "PUT", body: { usb_vidpids: updated },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Save failed");
        _globalCertified = updated;
        renderGlobalUsbVidpids(updated, _globalDiscovered);
        populateIgnoreFromDiscovered();
        if ($("#sa-usb-label")) $("#sa-usb-label").value = "";
        if (msg) { msg.textContent = `✓ ${vidpid} added (pushed to ${putData.pushed_to_spokes ?? 0} spokes)`; msg.style.color = "var(--accent-green)"; }
      } catch (err) {
        if (msg) { msg.textContent = `Error: ${err.message}`; msg.style.color = "var(--text-danger)"; }
      } finally {
        e.target.disabled = false;
        e.target.textContent = "Add to Global List";
      }
    }

    if (e.target.id === "sa-usb-ignore-load-btn") {
      const select = $("#sa-usb-ignore-discovered-select");
      const option = select?.selectedOptions?.[0];
      const deviceIndex = Number(option?.value);
      const selectMsg = $("#sa-usb-ignore-msg");
      const certifiedSet = new Set(_globalCertified.map(d => String(d.vidpid || "").toLowerCase().trim()));
      const ignoredSet = new Set(_globalIgnored.map(d => String(d.vidpid || "").toLowerCase().trim()));
      const pending = _globalDiscovered.filter(d => {
        const vidpid = String(d.vidpid || "").toLowerCase().trim();
        return vidpid && !certifiedSet.has(vidpid) && !ignoredSet.has(vidpid);
      });
      const device = Number.isInteger(deviceIndex) ? pending[deviceIndex] : null;
      if (!device) {
        if (selectMsg) { selectMsg.textContent = "Select a discovered device to load."; selectMsg.style.color = "var(--text-danger)"; }
        return;
      }
      if ($("#sa-usb-ignore-vidpid")) $("#sa-usb-ignore-vidpid").value = String(device.vidpid || "").toLowerCase().trim();
      if ($("#sa-usb-ignore-label")) $("#sa-usb-ignore-label").value = String(device.name || device.vidpid || "").trim();
      if (selectMsg) { selectMsg.textContent = `Loaded ${device.vidpid || "device"} from discovered devices.`; selectMsg.style.color = "var(--muted)"; }
    }

    // Add to global ignored list
    if (e.target.id === "sa-usb-ignore-add-btn") {
      const vidpid = ($("#sa-usb-ignore-vidpid")?.value || "").trim().toLowerCase();
      const label  = ($("#sa-usb-ignore-label")?.value || "").trim();
      const msg    = $("#sa-usb-ignore-msg");
      if (!vidpid) { if (msg) { msg.textContent = "VID:PID is required."; msg.style.color = "var(--text-danger)"; } return; }
      if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(vidpid)) {
        if (msg) { msg.textContent = "Format must be xxxx:xxxx (hex)."; msg.style.color = "var(--text-danger)"; } return;
      }
      e.target.disabled = true;
      e.target.textContent = "Saving…";
      if (msg) msg.textContent = "";
      try {
        const getRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global ignored list");
        const current = Array.isArray(getData.usb_vidpids) ? getData.usb_vidpids : [];
        const updated = current.filter(d => d.vidpid !== vidpid);
        updated.push({ vidpid, label: label || vidpid });
        const putRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids", {
          method: "PUT", body: { usb_vidpids: updated },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Save failed");
        _globalIgnored = updated;
        renderGlobalUsbIgnored(updated);
        _globalCertified = await _reloadCertified();
        renderGlobalUsbVidpids(_globalCertified, _globalDiscovered);
        populateIgnoreFromDiscovered();
        if ($("#sa-usb-ignore-discovered-select")) $("#sa-usb-ignore-discovered-select").value = "";
        if ($("#sa-usb-ignore-vidpid")) $("#sa-usb-ignore-vidpid").value = "";
        if ($("#sa-usb-ignore-label")) $("#sa-usb-ignore-label").value = "";
        if (msg) { msg.textContent = `✓ ${vidpid} ignored (pushed to ${putData.pushed_to_spokes ?? 0} spokes)`; msg.style.color = "var(--accent-green)"; }
      } catch (err) {
        if (msg) { msg.textContent = `Error: ${err.message}`; msg.style.color = "var(--text-danger)"; }
      } finally {
        e.target.disabled = false;
        e.target.textContent = "Add to Ignored List";
      }
    }

    // Approve button (promote a discovered device to global certified)
    const approveVidpid = e.target.dataset?.saUsbApprove;
    if (approveVidpid !== undefined) {
      e.target.disabled = true;
      e.target.textContent = "Approving…";
      try {
        const discEntry = _globalDiscovered.find(d => d.vidpid === approveVidpid) || {};
        const getRes  = await apiFetch("/api/superadmin/global-usb-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global USB list");
        const current = Array.isArray(getData.usb_vidpids) ? getData.usb_vidpids : [];
        if (!current.find(d => d.vidpid === approveVidpid)) {
          current.push({ vidpid: approveVidpid, label: discEntry.name || approveVidpid, type: "wireless" });
        }
        const putRes  = await apiFetch("/api/superadmin/global-usb-vidpids", {
          method: "PUT", body: { usb_vidpids: current },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Approve failed");
        _globalCertified = current;
        renderGlobalUsbVidpids(current, _globalDiscovered);
        populateIgnoreFromDiscovered();
        showToast(`${approveVidpid} approved globally (pushed to ${putData.pushed_to_spokes ?? 0} spokes)`, "ok");
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
      } finally {
        e.target.disabled = false;
        e.target.textContent = "Approve";
      }
    }

    // Ignore button (add a discovered device to global ignored list)
    const ignoreVidpid = e.target.dataset?.saUsbIgnore;
    if (ignoreVidpid !== undefined) {
      e.target.disabled = true;
      e.target.textContent = "Ignoring…";
      try {
        const ignoreName = e.target.dataset?.saUsbIgnoreName || ignoreVidpid;
        const getRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global ignored list");
        const current = Array.isArray(getData.usb_vidpids) ? getData.usb_vidpids : [];
        if (!current.find(d => d.vidpid === ignoreVidpid)) {
          current.push({ vidpid: ignoreVidpid, label: ignoreName || ignoreVidpid });
        }
        const putRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids", {
          method: "PUT", body: { usb_vidpids: current },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Ignore failed");
        _globalIgnored = current;
        renderGlobalUsbIgnored(current);
        _globalCertified = await _reloadCertified();
        renderGlobalUsbVidpids(_globalCertified, _globalDiscovered);
        populateIgnoreFromDiscovered();
        showToast(`${ignoreVidpid} globally ignored (pushed to ${putData.pushed_to_spokes ?? 0} spokes)`, "ok");
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
      } finally {
        e.target.disabled = false;
        e.target.textContent = "Ignore";
      }
    }

    // Remove from certified list
    const removeVidpid = e.target.dataset?.saUsbRemove;
    if (removeVidpid !== undefined) {
      e.target.disabled = true;
      e.target.textContent = "…";
      try {
        const getRes  = await apiFetch("/api/superadmin/global-usb-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global USB list");
        const updated = (getData.usb_vidpids || []).filter(d => d.vidpid !== removeVidpid);
        const putRes  = await apiFetch("/api/superadmin/global-usb-vidpids", {
          method: "PUT", body: { usb_vidpids: updated },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Remove failed");
        _globalCertified = updated;
        renderGlobalUsbVidpids(updated, _globalDiscovered);
        populateIgnoreFromDiscovered();
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
        e.target.disabled = false;
        e.target.textContent = "Remove";
      }
    }

    // Remove from ignored list
    const ignoreRemoveVidpid = e.target.dataset?.saUsbIgnoreRemove;
    if (ignoreRemoveVidpid !== undefined) {
      e.target.disabled = true;
      e.target.textContent = "…";
      try {
        const getRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids");
        const getData = await readJson(getRes);
        if (!getRes?.ok) throw new Error(getData?.detail || "Could not read global ignored list");
        const updated = (getData.usb_vidpids || []).filter(d => d.vidpid !== ignoreRemoveVidpid);
        const putRes  = await apiFetch("/api/superadmin/global-usb-ignored-vidpids", {
          method: "PUT", body: { usb_vidpids: updated },
        });
        const putData = await readJson(putRes);
        if (!putRes?.ok) throw new Error(putData?.detail || "Remove failed");
        _globalIgnored = updated;
        renderGlobalUsbIgnored(updated);
        _globalCertified = await _reloadCertified();
        renderGlobalUsbVidpids(_globalCertified, _globalDiscovered);
        populateIgnoreFromDiscovered();
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
        e.target.disabled = false;
        e.target.textContent = "Remove";
      }
    }
  });

  async function _reloadCertified() {
    const r = await apiFetch("/api/superadmin/global-usb-vidpids");
    const d = r?.ok ? await readJson(r) : null;
    return Array.isArray(d?.usb_vidpids) ? d.usb_vidpids : [];
  }
})();

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

// ── Hub as Source of Truth config ────────────────────────────────────────────
const HUB_CONFIG_FIELDS = [
  "repo_branch","reclone_schedule_enabled","reclone_schedule_cron","reclone_concurrency",
  "vm_image_1_template_id","vm_image_2_template_id","vm_image_1_pct",
  "usb_auto_provision","usb_missing_timeout","usb_max_slots","vm_silent_timeout",
  "l1_vlan_start","l1_vlan_end","usb_vidpids","ignored_hostnames",
  "guest_agent_watchdog_enabled","guest_agent_grace_minutes","guest_agent_check_interval_minutes",
  "guest_agent_reboot_after_minutes","guest_agent_reclone_after_minutes",
];

async function loadHubConfig() {
  if (!currentTenantId || !canManageTenant()) return;
  const tabBtn = document.getElementById("settings-spoke-config-tab-btn");
  if (tabBtn) tabBtn.style.display = "";
  // Pre-seed toggle from cached tenant data (instant, no flicker)
  const cached = tenants.find(t => t.id === currentTenantId);
  if (cached?.raw?.hub_config_enabled !== undefined) {
    const toggle = document.getElementById("hub-config-enabled-toggle");
    if (toggle) toggle.checked = Boolean(cached.raw.hub_config_enabled);
    document.getElementById("hub-config-fields")?.classList.toggle("hidden", !cached.raw.hub_config_enabled);
  }
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/hub-config`,
      { headers: { Authorization: `Bearer ${authToken}` } });
    if (!res.ok) return;
    const data = await res.json();
    const toggle = document.getElementById("hub-config-enabled-toggle");
    if (toggle) toggle.checked = Boolean(data.hub_config_enabled);
    const fields = document.getElementById("hub-config-fields");
    if (fields) fields.classList.toggle("hidden", !data.hub_config_enabled);
    const cfg = data.hub_config || {};
    HUB_CONFIG_FIELDS.forEach(key => {
      const el = document.getElementById(`hc-${key}`);
      if (el && cfg[key] !== undefined) el.value = typeof cfg[key] === "object" ? JSON.stringify(cfg[key]) : cfg[key];
    });
  } catch (_) { /* silent */ }
}

async function saveHubConfig() {
  if (!currentTenantId || !canManageTenant()) return;
  const toggle = document.getElementById("hub-config-enabled-toggle");
  const enabled = toggle?.checked ?? false;
  const config = {};
  HUB_CONFIG_FIELDS.forEach(key => {
    const el = document.getElementById(`hc-${key}`);
    if (!el) return;
    const v = el.value.trim();
    if (!v) return;
    if (key === "usb_vidpids" || key === "ignored_hostnames") {
      try { config[key] = JSON.parse(v); } catch { config[key] = v; }
    } else {
      config[key] = v;
    }
  });
  const statusEl = document.getElementById("hub-config-save-status");
  if (statusEl) statusEl.textContent = "Saving…";
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/hub-config`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hub_config_enabled: enabled, hub_config: config }),
    });
    const data = await res.json();
    if (res.ok) {
      if (statusEl) statusEl.textContent = `✅ Saved. Pushed to ${data.pushed_to_spokes} spoke(s).`;
      setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 4000);
    } else {
      if (statusEl) statusEl.textContent = `❌ ${data.detail || "Save failed"}`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ ${e.message}`;
  }
}

async function saveProcessingMode(tenantId, feature, value) {
  const msg = document.getElementById('processing-modes-msg');
  if (!tenantId || !feature) return;
  if (msg) msg.textContent = 'Saving…';
  try {
    const response = await apiFetch(`/api/hub/tenants/${encodeURIComponent(tenantId)}/processing-modes`, {
      method: 'PATCH',
      body: { [feature]: value },
    });
    const data = await readJson(response);
    if (!response?.ok) throw new Error(data?.detail || 'Save failed');
    if (tenantDetailState.data[tenantId]?.settings) {
      tenantDetailState.data[tenantId].settings.processing_modes = data?.processing_modes || tenantDetailState.data[tenantId].settings.processing_modes;
    }
    if (msg) msg.textContent = `Saved. Pushed to ${data?.pushed_to_spokes ?? 0} spoke(s).`;
    setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
  } catch (error) {
    if (msg) msg.textContent = `Error: ${error.message}`;
  }
}
window.saveProcessingMode = saveProcessingMode;

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
  // Hub Setup tab elements (superadmin)
  const btn = document.getElementById("settings-pending-tab-btn");
  const countEl = document.getElementById("settings-pending-count");
  if (btn) btn.style.display = items.length > 0 ? "" : "none";
  if (countEl) countEl.textContent = String(items.length);

  // Tenant Setup panel card (tenant admin)
  const tsCard = document.getElementById("ts-pending-card");
  if (tsCard) tsCard.style.display = items.length > 0 ? "" : "none";

  const rowsHtml = items.length ? items.map(item => `
    <tr>
      <td><strong>${escHtml(item.spoke_name || item.hostname)}</strong></td>
      <td><code>${escHtml(item.hostname)}</code></td>
      <td>${escHtml(fmtDate(item.registered_at))}</td>
      <td>
        <button class="btn btn-primary btn-small" data-tenant-approve-id="${escHtml(item.id)}" type="button">Approve</button>
        <button class="btn btn-danger btn-small" data-tenant-reject-id="${escHtml(item.id)}" type="button">Reject</button>
      </td>
    </tr>
  `).join("") : '<tr><td colspan="4" class="empty-state">No pending spokes for this tenant.</td></tr>';

  function wireTable(tbody, bannerEl) {
    if (!tbody) return;
    tbody.innerHTML = rowsHtml;
    tbody.querySelectorAll("[data-tenant-approve-id]").forEach(b => {
      b.addEventListener("click", async () => {
        const id = b.dataset.tenantApproveId;
        const res = await fetch(`/api/tenant/${currentTenantId}/pending-spokes/${id}/approve`,
          { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
        if (!res.ok) { alert("Approval failed: " + (await res.text())); return; }
        const data = await res.json();
        if (bannerEl && data.api_key) {
          bannerEl.textContent = `✅ Spoke approved. API Key (shown once): ${data.api_key}`;
          bannerEl.classList.remove("hidden");
          setTimeout(() => bannerEl.classList.add("hidden"), 30000);
        }
        showToast("Spoke approved.", "ok");
        await refreshAfterSpokeApproval(currentTenantId);
      });
    });
    tbody.querySelectorAll("[data-tenant-reject-id]").forEach(b => {
      b.addEventListener("click", async () => {
        const id = b.dataset.tenantRejectId;
        await fetch(`/api/tenant/${currentTenantId}/pending-spokes/${id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
        loadTenantPendingSpokes();
      });
    });
  }

  wireTable(
    document.getElementById("settings-pending-tbody"),
    document.getElementById("settings-pending-key-banner")
  );
  wireTable(
    document.getElementById("ts-pending-tbody"),
    document.getElementById("ts-pending-key-banner")
  );

  // Spokes subtab panel elements
  const spokesSection = document.getElementById("ts-spokes-pending-section");
  const noPending = document.getElementById("ts-spokes-no-pending");
  if (spokesSection) spokesSection.style.display = items.length > 0 ? "" : "none";
  if (noPending) noPending.style.display = items.length === 0 ? "" : "none";
  wireTable(
    document.getElementById("ts-spokes-pending-tbody"),
    document.getElementById("ts-spokes-key-banner")
  );
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
            <button class="btn btn-primary btn-small" data-open-tenant="${escHtml(item.id)}" type="button">Manage</button>
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
    <span class="tenant-role-chip">${escHtml(role.tenant_id)} · ${escHtml(normalizeTenantRole(role.role))} <button data-remove-role="${escHtml(user.id)}:${escHtml(role.tenant_id)}" type="button">×</button></span>
  `).join("") : "—";
}

function renderUserRoleAssignForm(user, tenants) {
  if (user.is_superadmin) return '—';
  const options = tenants.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.name)}</option>`).join('');
  return `<div class="inline-form-row">` +
    `<select class="form-input form-input-sm user-tenant-select" data-user-id="${escHtml(user.id)}">${options}</select>` +
    `<select class="form-input form-input-sm user-role-select" data-user-id="${escHtml(user.id)}">` +
    `<option value="admin">Tenant Admin</option><option value="viewer">Tenant Viewer</option></select>` +
    `<button class="btn btn-primary btn-small" data-assign-role="${escHtml(user.id)}" type="button">Assign</button>` +
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

function hubGkillCacheKey() { return "hub_superadmin_gkill"; }

function saveHubGkillCache(data) {
  try { localStorage.setItem(hubGkillCacheKey(), JSON.stringify(data)); } catch (_) {}
}

function loadHubGkillCache() {
  try { const s = localStorage.getItem(hubGkillCacheKey()); return s ? JSON.parse(s) : null; }
  catch (_) { return null; }
}

function renderGkillState(data) {
  const value = data && Object.prototype.hasOwnProperty.call(data, "value") ? data.value : null;
  const lastFetched = Number(data?.last_fetched);
  $("#sa-gkill-value") && ($("#sa-gkill-value").textContent = value == null ? "—" : String(value));
  $("#sa-gkill-fetched") && ($("#sa-gkill-fetched").textContent = Number.isFinite(lastFetched) && lastFetched > 0 ? fmtDate(new Date(lastFetched * 1000).toISOString()) : "—");
  $("#sa-gkill-error") && ($("#sa-gkill-error").textContent = data?.error || "—");
  updateGkillBadge(value);
}

async function fetchGkillState() {
  const res = await apiFetch("/api/superadmin/gkill-state");
  if (!res || !res.ok) return null;
  const data = await res.json();
  gkillState = data;
  renderGkillState(data);
  saveHubGkillCache(data);
  return data;
}

async function loadGkillState(force = false) {
  if (!currentUser?.is_superadmin) return null;
  if (!force && gkillState) {
    renderGkillState(gkillState);
    fetchGkillState().catch(() => {});
    return gkillState;
  }
  const cached = !force ? loadHubGkillCache() : null;
  if (cached) {
    gkillState = cached;
    renderGkillState(cached);
    fetchGkillState().catch(() => {});
    return cached;
  }
  return fetchGkillState();
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

function openSuperadminTenantForm() {
  if (!currentUser?.is_superadmin) {
    showToast("Only superadmins can add tenants.", "warn");
    return;
  }
  showTab("hub-superadmin", { source: "admin" });
  const tenantsButton = $('.sa-subtab[data-subtab="sa-tenants"]');
  if (tenantsButton) tenantsButton.click();
  $("#sa-tenant-form")?.classList.remove("hidden");
  $("#sa-tenant-name")?.focus();
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

async function deleteSpoke(spokeId) {
  if (!window.confirm(`Delete spoke "${spokeId}"? This will remove it from the hub. The spoke itself is not affected.`)) return;
  const res = await apiFetch(`/api/spokes/${encodeURIComponent(spokeId)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to delete spoke.", "err");
    return;
  }
  showToast("Spoke deleted.", "ok");
  await loadSpokes(true);
}

async function deleteTenant(id) {
  if (!window.confirm(`Delete tenant ${id}?`)) return;
  const res = await apiFetch(`/api/superadmin/tenants/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res || !res.ok) {
    showToast("Failed to delete tenant.", "err");
    return;
  }
  if (currentTenantId === id) {
    currentTenantId = tenants.find(tenant => tenant.id !== id)?.id || null;
    tenantContextActive = false;
  }
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
  const role = $(`.user-role-select[data-user-id="${CSS.escape(userId)}"]`)?.value || "viewer";
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

function computeHubRefreshPaused() {
  if (!currentUser) return true;
  // Pause while the user is actively editing a field or has items selected
  if (_hasActiveInteraction()) return true;
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
    // Skip full DOM refresh if user is actively editing a field or has items selected
    if (_hasActiveInteraction()) {
      updateAutoRefreshCountdownDisplay("Paused", true);
      return;
    }
    await refreshCurrentView(false);
  }, seconds * 1000);
}

function updateHubRefreshPausedState() {
  const wasPaused = refreshPaused;
  refreshPaused = computeHubRefreshPaused();
  syncAutoRefreshState();
  if (wasPaused && !refreshPaused) {
    refreshCurrentView(true).catch(() => {});
  }
}

function startAutoRefresh() {
  updateHubRefreshPausedState();
}

function connectHubWebSocket() {
  if (!authToken) return;
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) return;
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onopen = () => {
    if (wsOfflineTimer) { clearTimeout(wsOfflineTimer); wsOfflineTimer = null; }
    updateApiStatus(true, "Connected");
  };
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === "telemetry") {
      // Active tab: re-render only if user has no active form interaction or selections
      if (!_hasActiveInteraction()) {
        if (activeTab === "dashboard") scheduleReload("ws-dashboard", () => loadDashboard(true));
        if (activeTab === "simulations") scheduleReload("ws-simulations", () => loadHubSimulations(true));
        if (activeTab === "clients") scheduleReload("ws-clients", () => loadClients(true));
        if (activeTab === "central") scheduleReload("ws-hub-central", () => loadHubCentralMonitoring(true));
        if (activeTab === "spokes") scheduleReload("ws-spokes", () => loadSpokes(true));
        if (activeTab === "vm-server") scheduleReload("ws-vm-server", () => loadVmServer(true));
        if (activeTab === "reseed") scheduleReload("ws-reseed", () => ensureSpokes(true).then(() => renderHubReseedPanel()));
        if (activeTab === "tenant-setup") scheduleReload("ws-tenant-setup", () => loadTenantSetup(true));
        if (activeTab === "config") scheduleReload("ws-config", () => loadConfig(true));
        if (activeTab === "setup") scheduleReload("ws-setup", () => loadSetup(true));
        if (activeTab === "commands") scheduleReload("ws-commands", () => loadCommands());
        if (activeTab === "superadmin") scheduleReload("ws-superadmin", () => loadSuperadmin());
      }
      // Background tabs: silently refresh data caches so tab switches show fresh data instantly
      const BG_TABS = ["vm-server", "simulations", "clients", "spokes"];
      for (const tab of BG_TABS) {
        if (tab !== activeTab) scheduleReload(`ws-bg-${tab}`, () => _bgFetchTab(tab), 1500);
      }
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
    } else if (data.type === "backup_progress") {
      updateSuperadminBackupProgress(data);
    } else if (data.type === "reseed_progress") {
      updateHubReseedProgress(data);
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
    ws = null;
    if (!authToken) {
      updateApiStatus(false, "Disconnected");
      return;
    }
    wsReconnectTimer = window.setTimeout(connectHubWebSocket, 3000);
    // Delay showing red until after the reconnect window — transient drops won't flash the indicator
    wsOfflineTimer = window.setTimeout(() => updateApiStatus(false, "Disconnected"), 4000);
  };
  ws.onerror = () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
  };
}

function bindEvents() {
  document.addEventListener("click", event => {
    const adminShortcut = event.target.closest("[data-admin-tab]");
    if (adminShortcut) {
      showTab(adminShortcut.dataset.adminTab, { source: "admin" });
      return;
    }

    // User override modal trigger (from Simulation Clients Override button)
    const userOverrideBtn = event.target.closest("[data-user-override-hostname]");
    if (userOverrideBtn) {
      const hostname = userOverrideBtn.dataset.userOverrideHostname;
      const simId = userOverrideBtn.dataset.userOverrideSimid || null;
      openUserOverrideModal(hostname, simId || null, { autoSave: true });
      return;
    }

    // User override modal save button
    if (event.target.closest("#hub-uom-save")) {
      saveUserOverrideFromModal(currentTenantId).catch(console.error);
      return;
    }

    // User override modal close/cancel
    if (event.target.closest("#hub-uom-x") || event.target.closest("#hub-uom-cancel")) {
      closeUserOverrideModal();
      return;
    }

    // User override modal backdrop click
    if (event.target.id === "hub-user-override-modal") {
      closeUserOverrideModal();
      return;
    }

    if (event.target.closest("#tenant-context-change-btn")) {
      showTab("hub-dashboard", { source: "admin" });
      return;
    }

    if (event.target.closest("#hub-superadmin-btn")) {
      openSuperadminBackupModal().catch(() => {
        superadminBackupState.backupError = "Failed to open backup panel.";
        superadminBackupState.open = true;
        renderSuperadminBackupModal();
      });
      return;
    }

    if (event.target.id === "sa-backup-modal") {
      closeSuperadminBackupModal(false);
      return;
    }

    const backupTabButton = event.target.closest(".sa-backup-tab");
    if (backupTabButton) {
      superadminBackupState.activeTab = backupTabButton.dataset.saBackupTab || "backup";
      renderSuperadminBackupModal();
      return;
    }

    if (event.target.closest("#sa-backup-modal-x") || event.target.closest("#sa-backup-cancel-btn") || event.target.closest("#sa-backup-close-btn")) {
      closeSuperadminBackupModal(false);
      return;
    }

    if (event.target.closest("#sa-backup-proceed-btn")) {
      superadminBackupState.backupError = "";
      superadminBackupState.step = "key";
      renderSuperadminBackupModal();
      return;
    }

    if (event.target.closest("#sa-backup-back-btn")) {
      superadminBackupState.backupError = "";
      superadminBackupState.step = "confirm";
      renderSuperadminBackupModal();
      return;
    }

    if (event.target.closest("#sa-backup-start-btn")) {
      startSuperadminBackup();
      return;
    }

    if (event.target.closest("#sa-backup-config-save-btn")) {
      saveSuperadminBackupConfig();
      return;
    }

    if (event.target.closest("#reseed-refresh-templates-btn")) {
      loadHubReseedTemplates(true).catch(() => {});
      return;
    }

    if (event.target.closest("#reseed-select-all-btn")) {
      setHubReseedSelectedSpokeIds(listTenantReseedSpokes().map(spoke => spoke.id));
      hubReseedState.error = "";
      renderHubReseedPanel();
      return;
    }

    if (event.target.closest("#reseed-clear-btn") || event.target.closest("#reseed-cancel-btn")) {
      setHubReseedSelectedSpokeIds([]);
      hubReseedState.error = "";
      renderHubReseedPanel();
      return;
    }

    if (event.target.closest("#reseed-start-btn")) {
      startHubReseed();
      return;
    }

    if (event.target.closest("#reseed-close-btn")) {
      if (isHubReseedComplete()) {
        resetHubReseedState({ preserveTemplates: true });
        renderHubReseedPanel();
      }
      return;
    }
 
    const tabButton = event.target.closest("#tab-nav .tab:not(.sa-subtab)");
    if (tabButton) {
      if (tabButton.dataset.tenantId) setCurrentTenant(tabButton.dataset.tenantId, false);
      // Row-1 back-nav buttons in tenant context exit tenant context first
      if (tabButton.classList.contains("tab-back") && tenantContextActive) {
        exitTenantContext();
        showTab(tabButton.dataset.tab, { button: tabButton, source: "admin" });
        return;
      }
      showTab(tabButton.dataset.tab, { button: tabButton, source: tabButton.closest("#tenant-context-nav .tenant-context-nav-row2") ? "tenant" : "admin" });
      return;
    }

    if (event.target.closest("[data-add-tenant]")) {
      openSuperadminTenantForm();
      return;
    }

    const enterTenantButton = event.target.closest("[data-enter-tenant]");
    if (enterTenantButton) {
      enterTenantContext(enterTenantButton.dataset.enterTenant, "simulations", true);
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
      enterTenantContext(openTenantButton.dataset.openTenant, "simulations", true);
      return;
    }

    const tenantDetailTab = event.target.closest(".tenant-detail-tab");
    if (tenantDetailTab) {
      tenantDetailState.activeTab = tenantDetailTab.dataset.tenantDetailTab;
      renderTenantDetail();
      return;
    }

    const hubConfigSubtab = event.target.closest(".hub-config-subtab");
    if (hubConfigSubtab) {
      hubConfigActiveSubtab = hubConfigSubtab.dataset.hubConfigSubtab || "api";
      if (tenantDetailState.open) {
        renderTenantDetail();
      } else {
        loadConfig(false).catch(() => {});
      }
      if (hubConfigActiveSubtab === "simulation") loadHubSimulationConf().catch(() => {});
      if (hubConfigActiveSubtab === "overrides") loadHubConfOverrides().catch(() => {});
      return;
    }

    if (event.target.closest("[data-open-tenant-setup]")) {
      if (tenantDetailState.open) {
        tenantDetailState.activeTab = "setup";
        renderTenantDetail();
      } else {
        showTab("hub-tenant-setup", { source: "tenant" });
      }
      return;
    }

    if (event.target.closest("#tenant-detail-back-btn")) {
      showTab("hub-dashboard", { source: "admin" });
      return;
    }

    const detailSpokeButton = event.target.closest("[data-open-spoke-modal]");
    if (detailSpokeButton) {
      const spoke = getSpokeFromCache(tenantDetailState.tenantId, detailSpokeButton.dataset.openSpokeModal);
      if (spoke) openSpokeModal(spoke, tenantDetailState.tenantId, "spoke-clients");
      return;
    }

    const hTsButton = event.target.closest(".hub-ts-subtab");
    if (hTsButton) {
      const subtab = hTsButton.dataset.subtab;
      activateHubTenantSetupSubtab(subtab).catch(() => {});
      return;
    }

    const hCentralTopBtn = event.target.closest(".hub-central-top-subtab");
    if (hCentralTopBtn) {
      activateHubCentralTopSubtab(hCentralTopBtn.dataset.subtab);
      return;
    }

    const hCentralBtn = event.target.closest(".hub-central-subtab");
    if (hCentralBtn) {
      hubCentralActiveSubtab = hCentralBtn.dataset.subtab;
      $$(".hub-central-subtab").forEach(b => b.classList.toggle("active", b.dataset.subtab === hubCentralActiveSubtab));
      ["hcs-sites-panel", "hcs-alerts-panel", "hcs-clients-panel"].forEach(id => {
        document.getElementById(id)?.classList.toggle("hidden", id !== `${hubCentralActiveSubtab}-panel`);
      });
      if (!hubCentralData && currentTenantId && currentUser) {
        loadHubCentralData().catch(() => {});
      } else {
        renderHubCentralStatus();
      }
      return;
    }

    if (event.target.closest("[data-open-central-browser]")) {
      showTab("hub-tenant-setup", { source: "tenant" });
      activateHubTenantSetupSubtab("ts-central-api", true).catch(() => {});
      return;
    }

    const setupButton = event.target.closest(".settings-subtab");
    if (setupButton) {
      const subtab = setupButton.dataset.subtab;
      $$(".settings-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtab));
      ["settings-account", "settings-notifications", "settings-tls", "settings-pending-spokes"].forEach(panelId => {
        document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtab);
      });
      if (subtab === "settings-tls") loadAcmeSettings().catch(() => {});
      return;
    }

    const saButton = event.target.closest(".sa-subtab");
    if (saButton) {
      const subtab = saButton.dataset.subtab;
      superadminActiveSubtab = subtab;
      $$(".sa-subtab").forEach(button => button.classList.toggle("active", button.dataset.subtab === subtab));
      ["sa-pending", "sa-tenants", "sa-users", "sa-security", "sa-gkill", "sa-global-usb", "sa-qa", "sa-hub-update"].forEach(panelId => {
        document.getElementById(panelId)?.classList.toggle("hidden", panelId !== subtab);
      });
      const wasPaused = refreshPaused;
      refreshPaused = computeHubRefreshPaused();
      syncAutoRefreshState();
      if (subtab === "sa-security") loadHubAuthConfig().catch(() => {});
      if (subtab === "sa-gkill") loadGkillState(false).catch(() => {});
      if (subtab === "sa-global-usb") loadGlobalUsbVidpids().catch(() => {});
      if (subtab === "sa-qa") initQaPanel().catch(() => {});
      if (subtab === "sa-hub-update") initHubUpdatePanel().catch(() => {});
      if (wasPaused && !refreshPaused && subtab !== "sa-gkill") {
        refreshCurrentView(true).catch(() => {});
      }
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
    if (event.target.matches("[data-delete-spoke]")) { deleteSpoke(event.target.dataset.deleteSpoke); return; }
    if (event.target.matches("[data-assign-role]")) assignRole(event.target.dataset.assignRole);
    if (event.target.matches("[data-remove-role]")) {
      const [userId, tenantId] = event.target.dataset.removeRole.split(":");
      removeRole(userId, tenantId);
      return;
    }
    if (event.target.closest("#save-central-btn")) {
      saveCentralSettings();
      return;
    }
    if (event.target.closest("#test-central-btn")) {
      testCentralConnection();
      return;
    }
    if (event.target.closest("#clear-central-secrets-btn")) {
      clearCentralSecrets();
      return;
    }
    if (event.target.closest("#register-central-webhook-btn")) {
      registerCentralWebhook();
      return;
    }
    if (event.target.closest("#deregister-central-webhook-btn")) {
      deregisterCentralWebhook();
      return;
    }
    if (event.target.closest("#save-config-push-btn")) {
      saveConfigPush();
      return;
    }
    if (event.target.closest("#resync-usb-certs-btn")) {
      resyncUsbCerts();
      return;
    }
    if (event.target.closest("#hub-sim-config-refresh-btn")) {
      loadHubSimulationConf(true).catch(() => {});
      return;
    }
    if (event.target.closest("#hub-sim-config-save-btn")) {
      saveHubSimulationConf();
    }
    if (event.target.closest("#hub-sim-override-save-btn")) {
      saveHubConfOverride("sim");
      return;
    }
    if (event.target.closest("#hub-sim-override-clear-btn")) {
      clearHubConfOverride("sim");
      return;
    }
    if (event.target.closest("#hub-user-override-save-btn")) {
      saveHubConfOverride("user");
      return;
    }
    if (event.target.closest("#hub-user-override-clear-btn")) {
      clearHubConfOverride("user");
      return;
    }
  });

  document.addEventListener("change", event => {
    const spokeSelect = event.target.closest("#sa-spoke-select");
    if (spokeSelect) {
      superadminBackupState.selectedSpokeId = spokeSelect.value || "";
      superadminBackupState.backupError = "";
      renderSuperadminBackupModal();
      return;
    }
    const templateSelect = event.target.closest("#reseed-template-select");
    if (templateSelect) {
      hubReseedState.selectedTemplateKey = templateSelect.value || "";
      hubReseedState.error = "";
      renderHubReseedPanel();
      return;
    }
    const spokeToggle = event.target.closest("[data-reseed-spoke-id]");
    if (spokeToggle) {
      const next = new Set(hubReseedState.selectedSpokeIds);
      if (spokeToggle.checked) next.add(spokeToggle.dataset.reseedSpokeId);
      else next.delete(spokeToggle.dataset.reseedSpokeId);
      setHubReseedSelectedSpokeIds(Array.from(next));
      hubReseedState.error = "";
      renderHubReseedPanel();
    }
  });
 
  $("#hub-logout-btn")?.addEventListener("click", () => logout(true));
  $("#login-submit-btn")?.addEventListener("click", submitLogin);
  $("#login-username")?.addEventListener("keydown", event => { if (event.key === "Enter") submitLogin(); });
  $("#login-password")?.addEventListener("keydown", event => { if (event.key === "Enter") submitLogin(); });
  $("#refresh-dashboard-btn")?.addEventListener("click", () => loadDashboard(true));
  $("#dashboard-add-tenant-btn")?.addEventListener("click", openSuperadminTenantForm);
  document.querySelectorAll(".hub-simtop-subtab").forEach((button) => {
    button.addEventListener("click", () => activateHubSimTopTab(button.dataset.hubsimtop || "hub-simtop-checks"));
  });
  document.querySelectorAll(".hub-sim-subtab").forEach((button) => {
    button.addEventListener("click", () => {
      hubSimChecksFilter = button.dataset.hubsimtab || "failing";
      document.querySelectorAll(".hub-sim-subtab").forEach((item) => item.classList.toggle("active", item === button));
      renderHubSimChecksList();
    });
  });
  $("#hub-checks-filter")?.addEventListener("input", (event) => {
    hubSimChecksSearch = event.target.value || "";
    renderHubSimChecksList();
  });
  $("#hub-sim-detail-back")?.addEventListener("click", () => {
    $("#hub-sim-detail")?.classList.add("hidden");
    $("#hub-sim-overview")?.classList.remove("hidden");
    hubSimOpenCheckId = null;
  });
  $("#hub-hw-detail-back")?.addEventListener("click", () => {
    $("#hub-hw-detail")?.classList.add("hidden");
    $("#hub-hw-overview")?.classList.remove("hidden");
    hubHwOpenCheckId = null;
  });
  $("#hub-cc-detail-back")?.addEventListener("click", () => {
    $("#hub-cc-detail")?.classList.add("hidden");
    $("#hub-cc-overview")?.classList.remove("hidden");
    hubCcOpenWsite = null;
  });
  $("#hub-sim-refresh-btn")?.addEventListener("click", () => loadHubSimulations(true));
  $("#hub-monitored-refresh-btn")?.addEventListener("click", () => loadAndRenderHubMonitoredItems(true));
  $("#hub-monitored-sites-refresh-btn")?.addEventListener("click", () => renderHubSitesTab());
  $("#hub-monitored-clients-refresh-btn")?.addEventListener("click", () => loadAndRenderHubMonitoredItems(true));
  $("#hub-status-refresh-btn")?.addEventListener("click", () => { loadAndRenderHubMonitoredItems(true).then(() => renderHubStatusTab()); });
  $("#hub-monitored-alerts-refresh-btn")?.addEventListener("click", () => loadAndRenderHubMonitoredItems(true));
  $("#refresh-clients-btn")?.addEventListener("click", () => loadClients(true));
  $("#hub-purge-all-clients-btn")?.addEventListener("click", async () => {
    const btn = $("#hub-purge-all-clients-btn");
    if (!confirm("Clear ALL client history across every spoke in this tenant? Records on disk will also be deleted. This cannot be undone.")) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ Clearing…";
    try {
      const resp = await fetch(`/api/${currentTenantId}/spokes/clients/history`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();
      const sent = (data.sent_to || []).length;
      const offline = (data.offline || []).length;
      const msg = offline > 0
        ? `Cleared ${sent} spoke(s). ${offline} spoke(s) were offline and will clear on reconnect.`
        : `Client history cleared across ${sent} spoke(s).`;
      alert(msg);
      await loadClients(true);
    } catch (err) {
      alert(`Clear failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
  $("#refresh-hub-central-btn")?.addEventListener("click", () => loadHubCentralMonitoring(true));
  $("#refresh-vm-server-btn")?.addEventListener("click", () => loadVmServer(true));
  $("#refresh-spokes-btn")?.addEventListener("click", () => loadSpokes(true));
  $("#update-all-spokes-btn")?.addEventListener("click", async () => {
    const btn = $("#update-all-spokes-btn");
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⬆ Queuing…";
    try {
      const res = await apiFetch(`/api/${currentTenantId}/aggregate/update-all-spokes`, { method: "POST" });
      const data = await res.json();
      btn.textContent = data.ok ? `✓ Queued (${data.spokes_queued} spokes)` : "⚠ Failed";
    } catch {
      btn.textContent = "⚠ Error";
    }
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
  });
  $("#refresh-commands-btn")?.addEventListener("click", loadCommands);
  $("#refresh-config-btn")?.addEventListener("click", () => loadConfig(true));
  $("#refresh-tenant-setup-btn")?.addEventListener("click", () => loadTenantSetup(true));
  $("#auto-refresh-toggle")?.addEventListener("change", startAutoRefresh);
  $("#auto-refresh-interval")?.addEventListener("change", startAutoRefresh);
  $("#send-command-btn")?.addEventListener("click", sendCommandFromForm);
  $("#collapse-all-btn")?.addEventListener("click", () => { getExpandedSet().clear(); loadSpokes(); });
  $("#expand-all-btn")?.addEventListener("click", async () => {
    const spokes = await ensureSpokes();
    spokeUiState.expandedByTenant[currentTenantId] = new Set(spokes.filter(spoke => spoke.status === "approved").map(spoke => spoke.id));
    loadSpokes();
  });
  $("#hub-clients-search")?.addEventListener("input", event => {
    hubClientUiState.search = event.target.value || "";
    renderClientRowsForHub();
  });
  $("#hub-clients-status-filter")?.addEventListener("change", event => {
    hubClientUiState.status = event.target.value || "all";
    renderClientRowsForHub();
  });
  document.querySelectorAll("[data-clienttype]").forEach(button => {
    button.addEventListener("click", () => setClientTypeFilter(button.dataset.clienttype || "all"));
  });
  document.querySelectorAll("[data-hubclienttype]").forEach(button => {
    button.addEventListener("click", () => setHubClientTypeFilter(button.dataset.hubclienttype || "all"));
  });
  $("#spoke-search")?.addEventListener("input", event => {
    spokeUiState.search = event.target.value || "";
    scheduleReload("spoke-search", () => loadSpokes(), 120);
  });
  $("#spoke-modal-close")?.addEventListener("click", closeSpokeModal);
  $("#spoke-modal")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeSpokeModal(); });
  $("#mode-save-btn")?.addEventListener("click", saveSpokeProcessingMode);
  $("#pw-save-btn")?.addEventListener("click", savePassword);
  $("#notif-save-btn")?.addEventListener("click", saveNotificationSettings);
  $("#hub-config-save-btn")?.addEventListener("click", saveHubConfig);
  $("#hub-config-enabled-toggle")?.addEventListener("change", function () {
    document.getElementById("hub-config-fields")?.classList.toggle("hidden", !this.checked);
  });
  $("#sa-gkill-refresh-btn")?.addEventListener("click", () => loadGkillState(true));
  hubAuthEl("sa-auth-provider")?.addEventListener("change", () => updateHubAuthProviderVisibility(hubAuthEl("sa-auth-provider")?.value));
  $("#sa-auth-test-btn")?.addEventListener("click", testHubAuthConnection);
  $("#sa-auth-save-btn")?.addEventListener("click", saveHubAuthConfig);
  $("#sa-add-tenant-btn")?.addEventListener("click", () => $("#sa-tenant-form")?.classList.toggle("hidden"));
  $("#sa-cancel-tenant-btn")?.addEventListener("click", () => $("#sa-tenant-form")?.classList.add("hidden"));
  $("#sa-save-tenant-btn")?.addEventListener("click", createTenant);
  $("#sa-create-user-btn")?.addEventListener("click", createUser);

  // Delegated handler for hub Central cluster dropdown (re-rendered into innerHTML)
  document.addEventListener("change", event => {
    if (event.target.id === "hub-central-cluster-select") {
      onClusterSelectChange(event.target);
    }
  });
}

(async function init() {
  bindEvents();
  await pingApi();
  await loadUserContext();
  if (currentUser) {
    connectHubWebSocket();
    if (currentTenantId) await ensureSpokes(true);
    syncTenantContextChrome();
    syncHubPermissionUI();
    await loadDashboard();
  }
  startAutoRefresh();
})();

document.getElementById("acme-dns-provider")?.addEventListener("change", toggleAcmeDnsSection);



// ── Superadmin QA Panel ─────────────────────────────────────────────────────

let _qaKeysWired = false;

/** Populate a <select> with the global tenants list */
function _qaPopulateTenantSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = tenants.length
    ? tenants.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join("")
    : '<option value="">No tenants</option>';
}

/** Called once when the sa-hub-update subtab is first opened (and on each revisit). */
async function initHubUpdatePanel() {
  const statusPanel = $("#hub-update-status-panel");
  const msgEl = $("#hub-update-msg");

  // Wire buttons (idempotent via cloneNode)
  const checkBtn = $("#hub-update-check-btn");
  const applyBtn = $("#hub-update-apply-btn");
  [checkBtn, applyBtn].forEach(btn => {
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.replaceWith(newBtn);
  });

  const newCheckBtn = $("#hub-update-check-btn");
  const newApplyBtn = $("#hub-update-apply-btn");

  async function loadStatus() {
    if (newCheckBtn) { newCheckBtn.disabled = true; newCheckBtn.textContent = "Checking…"; }
    if (msgEl) { msgEl.textContent = ""; msgEl.className = "form-msg"; }
    let data;
    try {
      const res = await apiFetch("/api/superadmin/hub-update-status");
      data = await readJson(res);
    } catch (err) {
      if (statusPanel) statusPanel.innerHTML = `<p class="error">Failed to load status: ${escHtml(err.message || String(err))}</p>`;
      return;
    } finally {
      if (newCheckBtn) { newCheckBtn.disabled = false; newCheckBtn.textContent = "↺ Check for Updates"; }
    }
    renderHubUpdateStatus(data);
  }

  function renderHubUpdateStatus(data) {
    if (!statusPanel) return;
    const updateAvailable = data.update_available;
    const inProgress = data.update_in_progress;
    const error = data.update_error;
    const commits = (data.pending_commits || []).map(c => `<li style="font-family:monospace;font-size:0.85rem;">${escHtml(c)}</li>`).join("");

    let banner = "";
    if (inProgress) {
      banner = `<div style="padding:10px 14px;background:#dbeafe;border:1px solid #3b82f6;border-radius:6px;color:#1e40af;margin-bottom:12px;">⏳ Update in progress… Refresh to see latest log. The hub will restart when complete.</div>`;
    } else if (error) {
      banner = `<div style="padding:10px 14px;background:#fee2e2;border:1px solid #ef4444;border-radius:6px;color:#991b1b;margin-bottom:12px;">❌ Last update error: ${escHtml(error)}</div>`;
    } else if (updateAvailable) {
      banner = `<div style="padding:10px 14px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;color:#92400e;margin-bottom:12px;">🆕 Update available — ${data.commits_behind ?? 0} new commit(s) on remote.</div>`;
    } else if (data.commits_behind === 0) {
      banner = `<div style="padding:10px 14px;background:#d1fae5;border:1px solid #10b981;border-radius:6px;color:#065f46;margin-bottom:12px;">✅ Hub is up to date.</div>`;
    }

    const rows = [
      ["Current version", escHtml(data.current_version ?? "—")],
      ["Commits behind remote", String(data.commits_behind ?? "—")],
      ["Local HEAD", `<code style="font-size:0.8rem;">${escHtml(data.local_commit ? data.local_commit.slice(0,12) : "—")}</code> ${escHtml(data.local_subject ?? "")}`],
      ["Update in progress", inProgress ? '<span class="badge badge-yellow">Yes</span>' : '<span class="badge badge-grey">No</span>'],
      ["Started at", escHtml(data.started_at ? fmtDate(data.started_at) : "—")],
      ["Finished at", escHtml(data.finished_at ? fmtDate(data.finished_at) : "—")],
    ];
    const tableRows = rows.map(([k, v]) => `<tr><td style="font-weight:500;white-space:nowrap;">${escHtml(k)}</td><td>${v}</td></tr>`).join("");

    const logBlock = data.update_log?.length
      ? `<div class="setup-card" style="margin-top:10px;"><div class="setup-card-header"><h4>Update Log</h4></div><pre style="font-size:0.78rem;max-height:260px;overflow-y:auto;background:#f3f4f6;padding:10px;border-radius:4px;white-space:pre-wrap;">${escHtml((data.update_log || []).join("\n"))}</pre></div>`
      : "";

    const commitList = commits ? `<div class="setup-card" style="margin-top:10px;"><div class="setup-card-header"><h4>Pending Commits (newest first)</h4></div><ul style="margin:0;padding:0 0 0 18px;">${commits}</ul></div>` : "";

    statusPanel.innerHTML = `
      ${banner}
      <table class="data-table"><tbody>${tableRows}</tbody></table>
      ${commitList}
      ${logBlock}
    `;
  }

  newCheckBtn?.addEventListener("click", loadStatus);
  newApplyBtn?.addEventListener("click", async () => {
    if (!confirm("This will run git pull, pip install, and restart the hub service. The hub will be briefly unavailable. Continue?")) return;
    newApplyBtn.disabled = true;
    newApplyBtn.textContent = "Updating…";
    if (msgEl) { msgEl.textContent = ""; msgEl.className = "form-msg"; }
    try {
      const res = await apiFetch("/api/superadmin/hub-self-update", { method: "POST" });
      const data = await readJson(res);
      if (!res?.ok) {
        if (msgEl) { msgEl.textContent = data?.detail || "Update failed."; msgEl.className = "form-msg error"; }
      } else {
        if (msgEl) { msgEl.textContent = "Update started. Hub will restart shortly."; msgEl.className = "form-msg success"; }
        // Auto-poll for status
        let polls = 0;
        const poll = setInterval(async () => {
          polls++;
          if (polls > 20) { clearInterval(poll); return; }
          try {
            const sr = await apiFetch("/api/superadmin/hub-update-status");
            const sd = await readJson(sr);
            renderHubUpdateStatus(sd);
            if (!sd?.update_in_progress) clearInterval(poll);
          } catch { clearInterval(poll); }
        }, 2000);
      }
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message || "Update failed."; msgEl.className = "form-msg error"; }
    } finally {
      newApplyBtn.disabled = false;
      newApplyBtn.textContent = "⬆ Update Hub Now";
    }
  });

  await loadStatus();
}

/** Called once when the sa-qa subtab is first opened (and on each revisit). */
async function initQaPanel() {
  _qaPopulateTenantSelect("qa-key-tenant-sel");
  _qaPopulateTenantSelect("qa-run-tenant-sel");
  await loadQaKeys();
  if (!_qaKeysWired) {
    _wireQaPanel();
    _qaKeysWired = true;
  }
}

/** Fetch + render the QA API keys table. */
async function loadQaKeys() {
  const tbody = document.getElementById("qa-keys-tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
  const res = await apiFetch("/api/superadmin/qa-api-keys");
  if (!res?.ok) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state error-state">Failed to load QA API keys.</td></tr>';
    return;
  }
  const keys = await readJson(res);
  if (!Array.isArray(keys) || keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No QA API keys yet.</td></tr>';
    return;
  }
  const fmt = ts => ts ? new Date(ts).toLocaleString() : "—";
  tbody.innerHTML = keys.map(k => `
    <tr data-key-id="${k.id}">
      <td>${tenants.find(t => t.id === k.tenant_id)?.name || k.tenant_id}</td>
      <td>${k.description || "—"}</td>
      <td>${k.created_by || "—"}</td>
      <td>${fmt(k.created_at)}</td>
      <td>${fmt(k.last_used_at)}</td>
      <td><button class="btn btn-danger btn-small qa-revoke-btn" data-key-id="${k.id}" type="button">Revoke</button></td>
    </tr>`).join("");
}

/** Wire all QA panel button events (called once). */
function _wireQaPanel() {
  // Show / hide key generation form
  document.getElementById("qa-key-new-btn")?.addEventListener("click", () => {
    const form = document.getElementById("qa-key-form");
    form?.classList.remove("hidden");
    document.getElementById("qa-key-msg").textContent = "";
  });

  document.getElementById("qa-key-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("qa-key-form")?.classList.add("hidden");
  });

  // Generate key
  document.getElementById("qa-key-save-btn")?.addEventListener("click", async () => {
    const tenantId = document.getElementById("qa-key-tenant-sel")?.value;
    const description = document.getElementById("qa-key-desc")?.value?.trim();
    const msg = document.getElementById("qa-key-msg");
    if (!tenantId) { msg.textContent = "Select a tenant."; return; }
    msg.textContent = "Generating…";
    const res = await apiFetch("/api/superadmin/qa-api-keys", {
      method: "POST",
      body: { tenant_id: tenantId, description: description || undefined },
    });
    if (!res?.ok) {
      msg.textContent = "Error creating key.";
      return;
    }
    const data = await readJson(res);
    msg.textContent = "";
    document.getElementById("qa-key-form")?.classList.add("hidden");
    // Show one-time key banner
    const banner = document.getElementById("qa-key-banner");
    if (banner && data?.raw_key) {
      banner.innerHTML = `
        <strong>🔑 Copy this key now — it will NOT be shown again.</strong><br>
        <code style="user-select:all;word-break:break-all;">${data.raw_key}</code>`;
      banner.classList.remove("hidden");
    }
    await loadQaKeys();
  });

  // Revoke key (delegated)
  document.getElementById("qa-keys-tbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".qa-revoke-btn");
    if (!btn) return;
    const keyId = btn.dataset.keyId;
    if (!keyId || !confirm("Revoke this QA API key? This cannot be undone.")) return;
    const res = await apiFetch(`/api/superadmin/qa-api-keys/${keyId}`, { method: "DELETE" });
    if (res?.ok) {
      document.getElementById("qa-key-banner")?.classList.add("hidden");
      await loadQaKeys();
    }
  });

  // Run QA
  document.getElementById("qa-run-btn")?.addEventListener("click", async () => {
    const tenantId = document.getElementById("qa-run-tenant-sel")?.value;
    const module = document.getElementById("qa-run-module-sel")?.value || "all";
    if (!tenantId) return;
    await _runQaChecks(tenantId, module);
  });

  // Clear results
  document.getElementById("qa-clear-btn")?.addEventListener("click", () => {
    document.getElementById("qa-results-empty")?.classList.remove("hidden");
    document.getElementById("qa-results-table")?.classList.add("hidden");
    document.getElementById("qa-summary-bar")?.classList.add("hidden");
    document.getElementById("qa-clear-btn")?.classList.add("hidden");
    document.getElementById("qa-results-tbody").innerHTML = "";
  });
}

/** Status badge HTML */
function _qaBadge(status) {
  const colors = { PASS: "#22c55e", FAIL: "#ef4444", WARN: "#f59e0b", SKIP: "#6b7280", RUN: "#3b82f6" };
  const col = colors[status] || "#6b7280";
  return `<span style="display:inline-block;min-width:54px;padding:2px 8px;border-radius:4px;background:${col};color:#fff;font-size:0.75rem;font-weight:700;text-align:center;white-space:nowrap;">${status}</span>`;
}

/** Append a result row to the QA results table. */
function _qaAppendRow(module, name, status, detail = "") {
  const tbody = document.getElementById("qa-results-tbody");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${_qaBadge(status)}</td><td style="font-size:0.8rem;">${module}</td><td>${name}</td><td style="font-size:0.8rem;color:var(--text-muted);">${detail}</td>`;
  tbody.appendChild(tr);
}

/** Update summary counts. */
function _qaUpdateSummary(startMs) {
  const tbody = document.getElementById("qa-results-tbody");
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll("tr")];
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  rows.forEach(r => {
    const badge = r.querySelector("span");
    if (badge) {
      const s = badge.textContent.trim();
      if (s in counts) counts[s]++;
    }
  });
  const fmt = (k, label) => `${counts[k]} ${label}`;
  document.getElementById("qa-summary-pass").textContent = fmt("PASS", "Passed");
  document.getElementById("qa-summary-fail").textContent = fmt("FAIL", "Failed");
  document.getElementById("qa-summary-warn").textContent = fmt("WARN", "Warnings");
  document.getElementById("qa-summary-skip").textContent = fmt("SKIP", "Skipped");
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  document.getElementById("qa-summary-time").textContent = `Completed in ${elapsed}s`;
  document.getElementById("qa-summary-bar")?.classList.remove("hidden");
}

/** Helper: run a single API check. Returns { status, detail }. */
async function _qaCheck(method, url, label, opts = {}) {
  const { expect200 = true, jsonTest } = opts;
  try {
    const res = await _qaFetch(url, { method: method || "GET" });
    if (!res) return { status: "FAIL", detail: "No response / network error" };
    if (expect200 && !res.ok) return { status: "FAIL", detail: `HTTP ${res.status}` };
    if (jsonTest) {
      const data = await readJson(res);
      const result = jsonTest(data);
      return result || { status: "PASS", detail: "" };
    }
    return { status: "PASS", detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: "FAIL", detail: String(err) };
  }
}

/** Map of module → list of checks. Each check: { name, method, url(tenantId), jsonTest? } */
function _qaModuleChecks(tenantId) {
  const T = tenantId;
  return {
    auth: [
      { name: "Auth providers list",          url: "/api/auth/providers" },
      { name: "Current user endpoint",         url: "/api/auth/me" },
      { name: "Hub init returns mode=hub",     url: "/api/init",
        jsonTest: d => d?.mode === "hub" ? null : { status: "FAIL", detail: `mode=${d?.mode}` } },
    ],
    hub: [
      { name: "Hub health OK",                 url: "/api/health",
        jsonTest: d => d?.status === "ok" ? null : { status: "FAIL", detail: JSON.stringify(d) } },
      { name: "Hub config readable",           url: `/api/tenant/${T}/hub-config` },
      { name: "Onboarding PSK present",        url: `/api/tenant/${T}/onboarding-psk` },
      { name: "ACME status",                   url: "/api/acme/status" },
      { name: "Aggregate dashboard responds",  url: `/api/aggregate/dashboard?tenant_id=${T}` },
    ],
    spokes: [
      { name: "Approved spokes list",          url: `/api/${T}/spokes` },
      { name: "Pending spokes list",           url: `/api/tenant/${T}/pending-spokes` },
      { name: "Aggregate dashboard has spokes", url: `/api/aggregate/dashboard?tenant_id=${T}`,
        jsonTest: d => {
          const n = d?.spokes_total ?? d?.spoke_count ?? 0;
          return n > 0 ? null : { status: "WARN", detail: `spokes_total=${n} (no spokes?)` };
        }},
    ],
    proxmox: [
      { name: "Aggregate proxmox data",        url: `/api/aggregate/proxmox?tenant_id=${T}` },
    ],
    usb: [
      { name: "Tenant USB VID/PIDs",           url: `/api/${T}/usb-vidpids` },
      { name: "USB provisioning status",        url: `/api/${T}/aggregate/usb-provisioning-status` },
      { name: "Global USB VID/PIDs",           url: "/api/superadmin/global-usb-vidpids" },
      { name: "Discovered USB VID/PIDs",       url: "/api/superadmin/discovered-usb-vidpids" },
    ],
    provisioning: [
      { name: "USB provisioning status",        url: `/api/${T}/aggregate/usb-provisioning-status` },
      { name: "Provisioning check (NEW)",       url: `/api/${T}/qa/provisioning-check`,
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No data returned" };
          const issues = d.spokes?.flatMap(s => s.issues || []) || [];
          if (!d.overall_pass) return { status: "FAIL", detail: `delta=${d.delta}; ${issues.join(", ")}` };
          return { status: "PASS", detail: `${d.actual_clients}/${d.expected_clients} clients reporting` };
        }},
      { name: "Fleet reclone status",          url: `/api/${T}/aggregate/fleet-reclone-status` },
    ],
    clients: [
      { name: "Aggregate clients list",        url: `/api/aggregate/clients?tenant_id=${T}` },
      { name: "Aggregate simulations",         url: `/api/aggregate/simulations?tenant_id=${T}` },
      { name: "Aggregate dashboard client count", url: `/api/aggregate/dashboard?tenant_id=${T}`,
        jsonTest: d => {
          const n = d?.client_count ?? d?.total_clients ?? 0;
          return n > 0 ? null : { status: "WARN", detail: `client_count=${n}` };
        }},
    ],
    commands: [
      { name: "Commands list",                 url: `/api/${T}/commands` },
      { name: "API server aggregate",          url: `/api/aggregate/api-server?tenant_id=${T}` },
    ],
    settings: [
      { name: "Tenant settings",               url: `/api/${T}/settings` },
      { name: "Processing mode",               url: `/api/${T}/settings/processing-mode` },
      { name: "Processing summary",            url: `/api/${T}/processing-summary` },
      { name: "Simulation config",             url: `/api/${T}/config/simulation-conf` },
    ],
    central: [
      { name: "Central available",             url: "/central/available" },
      { name: "Central status",                url: `/api/${T}/aggregate/central-status`,
        jsonTest: d => d == null ? { status: "SKIP", detail: "No data (Central may not be configured)" } : null },
    ],
    backup: [
      { name: "Backup config",                 url: "/api/backup/config" },
      { name: "Backup templates",              url: "/api/backup/templates" },
      { name: "Installer SAS token",           url: "/api/backup/installer/sas-token" },
    ],
    t3: [
      { name: "OUI pool",                      url: "/api/oui-pool" },
    ],
    health: [
      { name: "Hub system health",             url: "/api/system/health" },
      { name: "QA system health (NEW)",        url: `/api/aggregate/qa/system-health?tenant_id=${T}`,
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No data returned" };
          if (!d.all_ok) return { status: "FAIL", detail: (d.issues || []).join(", ") || "Degraded" };
          return { status: "PASS", detail: `${d.spokes_online}/${d.spokes_total} spokes, ${d.total_clients} clients` };
        }},
      { name: "Kill switch state",             url: "/api/superadmin/gkill-state" },
    ],
    background: [
      { name: "Aggregate dashboard (baseline)", url: `/api/aggregate/dashboard?tenant_id=${T}`,
        jsonTest: d => d ? null : { status: "FAIL", detail: "No dashboard data" } },
      { name: "Repo status (spoke proxy)",      url: `/api/${T}/spokes`,
        jsonTest: d => {
          if (!Array.isArray(d) || d.length === 0) return { status: "SKIP", detail: "No spokes to check" };
          const stale = d.filter(s => {
            if (!s.last_seen) return false;
            const age = (Date.now() - new Date(s.last_seen).getTime()) / 1000;
            return age > 90;
          });
          return stale.length > 0
            ? { status: "WARN", detail: `${stale.length} spoke(s) last_seen > 90s ago` }
            : { status: "PASS", detail: `${d.length} spoke(s) heartbeat OK` };
        }},
    ],

    // ── Destructive / Long-running tests ──────────────────────────────────
    teardown: [
      { name: "Trigger VM teardown (all sim VMs)", method: "POST", url: `/api/${T}/qa/teardown-all-vms`,
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No response" };
          if (!d.ok) return { status: "FAIL", detail: JSON.stringify(d) };
          if (d.total_vms_queued === 0) return { status: "SKIP", detail: "No sim VMs found (vmid > 9000) — nothing to tear down" };
          const spokeDetail = (d.spokes || []).map(s => `${s.spoke_name || s.spoke_id}: ${s.vms_queued} VM(s)`).join(", ");
          return { status: "PASS", detail: `Queued delete_vm for ${d.total_vms_queued} VM(s) → ${spokeDetail}` };
        }},
      { name: "All sim VMs deleted", url: `/api/${T}/qa/teardown-status`,
        poll: { intervalMs: 10000, timeoutMs: 300000 },
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No response" };
          if (d.total_remaining === 0 && d.complete) {
            const spokeNames = (d.spokes || []).map(s => s.spoke_name || s.spoke_id).join(", ");
            return { status: "PASS", detail: `All VMs deleted — verified clean on: ${spokeNames || "all spokes"}` };
          }
          return null; // keep polling
        },
      },
    ],

    autoprov_e2e: [
      { name: "Dongles present", url: `/api/${T}/aggregate/usb-provisioning-status`,
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No response" };
          if ((d.total_dongles || 0) === 0) return { status: "SKIP", detail: "No USB dongles detected — cannot run E2E test" };
          const spokeDetail = (d.spokes || []).filter(s => (s.dongle_count || 0) > 0)
            .map(s => `${s.spoke_name || s.spoke_id}: ${s.dongle_count} dongle(s)`).join(", ");
          return { status: "PASS", detail: `${d.total_dongles} dongle(s) detected → ${spokeDetail}` };
        }},
      { name: "Enable Auto-Provisioning fleet-wide", method: "POST", url: `/api/${T}/qa/enable-autoprov`,
        jsonTest: d => {
          if (!d?.ok) return { status: "FAIL", detail: JSON.stringify(d) };
          const spokeDetail = (d.spokes || []).map(s => `${s.spoke_name || s.spoke_id}: ${s.dongle_count} dongle(s)`).join(", ");
          return { status: "PASS", detail: `usb_auto_provision=ON on ${d.updated_spokes} spoke(s) — expecting ${d.expected_clients} client(s): ${spokeDetail}` };
        }},
      { name: "All clients online", url: `/api/${T}/qa/provisioning-check`,
        poll: { intervalMs: 15000, timeoutMs: 600000 },
        jsonTest: d => {
          if (!d) return { status: "FAIL", detail: "No response" };
          if (d.expected_clients === 0) return { status: "SKIP", detail: "expected_clients=0 — no dongles to provision" };
          if (d.overall_pass && d.actual_clients >= d.expected_clients) {
            const spokeDetail = (d.spokes || []).map(s =>
              `${s.spoke_name || s.spoke_id}: ${s.reporting_clients}/${s.dongle_count}`).join(", ");
            return { status: "PASS", detail: `${d.actual_clients}/${d.expected_clients} clients reporting — ${spokeDetail}` };
          }
          return null; // keep polling
        }},
    ],
  };
}

/** Run QA checks for the given module (or all) against the tenant. */
async function _runQaChecks(tenantId, module) {
  const startMs = Date.now();
  const tbody = document.getElementById("qa-results-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  document.getElementById("qa-results-empty")?.classList.add("hidden");
  document.getElementById("qa-results-table")?.classList.remove("hidden");
  document.getElementById("qa-summary-bar")?.classList.add("hidden");
  document.getElementById("qa-clear-btn")?.classList.remove("hidden");

  const allModules = _qaModuleChecks(tenantId);
  // Destructive / long-running modules are excluded from "all" — must be selected explicitly.
  const DESTRUCTIVE_MODULES = ["teardown", "autoprov_e2e"];
  const modulesToRun = module === "all"
    ? Object.keys(allModules).filter(m => !DESTRUCTIVE_MODULES.includes(m))
    : [module];

  for (const mod of modulesToRun) {
    const checks = allModules[mod] || [];
    for (const check of checks) {
      // Insert a "running" placeholder
      const tempRow = document.createElement("tr");
      const modLabel = mod;
      tempRow.innerHTML = `<td>${_qaBadge("RUN")}</td><td style="font-size:0.8rem;">${modLabel}</td><td>${check.name}</td><td></td>`;
      tbody.appendChild(tempRow);

      let status, detail;

      if (check.poll) {
        // Polling check: keep calling until jsonTest returns non-null or timeout
        const { intervalMs, timeoutMs } = check.poll;
        const deadline = Date.now() + timeoutMs;
        let lastData = null;
        let resolved = false;

        while (Date.now() < deadline) {
          const res = await _qaFetch(check.url, { method: check.method || "GET" });
          if (!res) { status = "FAIL"; detail = "No response / network error"; break; }
          lastData = await readJson(res);
          const result = check.jsonTest ? check.jsonTest(lastData) : null;
          if (result !== null) {
            status = result.status; detail = result.detail || "";
            resolved = true;
            break;
          }
          // Update placeholder with live progress
          let progressNote;
          if (lastData?.spokes) {
            // Teardown: show per-spoke remaining counts
            if (lastData.total_remaining !== undefined) {
              const spokeDetail = (lastData.spokes || [])
                .filter(s => (s.sim_vms_remaining || 0) > 0)
                .map(s => `${s.spoke_name || s.spoke_id}: ${s.sim_vms_remaining} VM(s) left`)
                .join(" | ") || "verifying…";
              progressNote = `Deleting… ${lastData.total_remaining} VM(s) remaining — ${spokeDetail}`;
            // Autoprov: show per-spoke client counts
            } else if (lastData.actual_clients !== undefined) {
              const spokeDetail = (lastData.spokes || [])
                .map(s => `${s.spoke_name || s.spoke_id}: ${s.reporting_clients}/${s.dongle_count}`)
                .join(" | ") || "waiting…";
              progressNote = `Provisioning… ${lastData.actual_clients}/${lastData.expected_clients} clients online — ${spokeDetail}`;
            } else {
              progressNote = "Checking…";
            }
          } else {
            const remaining = lastData?.total_remaining ?? lastData?.actual_clients ?? "?";
            const expected = lastData?.expected_clients;
            progressNote = expected != null ? `${remaining}/${expected} — waiting…` : `remaining=${remaining} — waiting…`;
          }
          tempRow.innerHTML = `<td>${_qaBadge("RUN")}</td><td style="font-size:0.8rem;">${modLabel}</td><td>${check.name}</td><td style="font-size:0.8rem;color:var(--text-muted);">${progressNote}</td>`;
          await new Promise(r => setTimeout(r, intervalMs));
        }

        if (!resolved && !status) {
          // Timed out — do one final check to report state
          const res = await _qaFetch(check.url, { method: check.method || "GET" });
          lastData = res ? await readJson(res) : null;
          const timeoutSec = Math.round(timeoutMs / 1000);
          if (lastData?.total_remaining !== undefined) {
            const spokeDetail = (lastData.spokes || [])
              .filter(s => (s.sim_vms_remaining || 0) > 0)
              .map(s => `${s.spoke_name || s.spoke_id}: ${s.sim_vms_remaining} VM(s) left`)
              .join(", ");
            detail = `Timed out after ${timeoutSec}s — ${lastData.total_remaining} VM(s) still present: ${spokeDetail}`;
          } else if (lastData?.actual_clients !== undefined) {
            const spokeDetail = (lastData.spokes || [])
              .filter(s => !s.pass)
              .map(s => `${s.spoke_name || s.spoke_id}: ${s.reporting_clients}/${s.dongle_count} clients`)
              .join(", ");
            detail = `Timed out after ${timeoutSec}s — ${lastData.actual_clients}/${lastData.expected_clients} clients online. Incomplete: ${spokeDetail}`;
          } else {
            detail = `Timed out after ${timeoutSec}s`;
          }
          status = "FAIL";
        }
      } else {
        const result = await _qaCheck(check.method || "GET", check.url, check.name, {
          jsonTest: check.jsonTest,
        });
        status = result.status; detail = result.detail;
      }

      // Replace placeholder with real result
      tempRow.innerHTML = `<td>${_qaBadge(status)}</td><td style="font-size:0.8rem;">${modLabel}</td><td>${check.name}</td><td style="font-size:0.8rem;color:var(--text-muted);">${detail}</td>`;

      // Micro-delay so the browser can paint between rows
      await new Promise(r => setTimeout(r, 0));
    }
  }

  _qaUpdateSummary(startMs);
}

// ── Help Panel ─────────────────────────────────────────────────────────────
// Single source of truth: cs-webui/static/docs/settings-help.md
// Panel fetches the markdown once, caches it, and renders the matching section.

let _helpContentCache = null; // raw markdown string once fetched
let _helpSectionMap = null;   // { topicId: markdownString }
let _helpPanelPreviousFocus = null;

async function _fetchHelpContent() {
  if (_helpContentCache !== null) return _helpContentCache;
  try {
    const r = await fetch('/static/docs/settings-help.md');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _helpContentCache = await r.text();
  } catch (e) {
    _helpContentCache = '';
    console.warn('[help] Could not load settings-help.md', e);
  }
  return _helpContentCache;
}

function _buildHelpSectionMap(markdown) {
  if (_helpSectionMap) return _helpSectionMap;
  _helpSectionMap = {};
  // Normalize CRLF
  const text = markdown.replace(/\r\n/g, '\n');
  // Split on ## headings at the start of a line
  const parts = text.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## ([^\n]+)\n([\s\S]*)/);
    if (!m) continue;
    const id = m[1].trim();
    _helpSectionMap[id] = m[2].trim();
  }
  return _helpSectionMap;
}

function _renderHelpMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Bullet list item
    if (/^- /.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + _inlineHelpMd(line.slice(2)) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }

    // First line: treat as title if it starts with **...**
    if (i === 0 && /^\*\*/.test(line)) {
      const title = line.replace(/^\*\*(.+?)\*\*/, '$1');
      html += `<p class="help-title">${escHtml(title)}</p>`;
      continue;
    }

    // Link line: [text](url)
    const linkMatch = line.match(/^\[(.+?)\]\((.+?)\)$/);
    if (linkMatch) {
      const href = _sanitizeHelpHref(linkMatch[2]);
      if (href) {
        html += `<a class="help-docs-link" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">📖 ${escHtml(linkMatch[1])}</a>`;
      }
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      continue;
    }

    // Regular paragraph
    html += '<p>' + _inlineHelpMd(line) + '</p>';
  }
  if (inList) html += '</ul>';
  return html;
}

function _inlineHelpMd(text) {
  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${escHtml(t)}</strong>`);
  // Italic: *text* or _text_
  text = text.replace(/\*(.+?)\*/g, (_, t) => `<em>${escHtml(t)}</em>`);
  // Code: `text`
  text = text.replace(/`([^`]+)`/g, (_, t) => `<code>${escHtml(t)}</code>`);
  // Inline link: [text](url)
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, (_, t, u) => {
    const href = _sanitizeHelpHref(u);
    return href ? `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(t)}</a>` : escHtml(t);
  });
  // If text wasn't already escaped by a replacement, escape the remaining literals
  // (replacements already produce safe HTML; we only need to protect unprocessed text)
  return text;
}

function _sanitizeHelpHref(href) {
  href = (href || '').trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^[/#]/.test(href)) return href;
  return null;
}

async function openHelpPanel(topicId) {
  const panel = document.getElementById('help-panel');
  const overlay = document.getElementById('help-panel-overlay');
  const titleEl = document.getElementById('help-panel-title');
  const contentEl = document.getElementById('help-panel-content');
  if (!panel || !overlay) return;

  _helpPanelPreviousFocus = document.activeElement;

  titleEl.textContent = 'Help';
  contentEl.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');

  const markdown = await _fetchHelpContent();
  const map = _buildHelpSectionMap(markdown);
  const section = map[topicId];

  if (section) {
    contentEl.innerHTML = _renderHelpMarkdown(section);
  } else {
    contentEl.innerHTML = `<p style="color:var(--muted)">No help content found for <code>${escHtml(topicId)}</code>.</p>`;
  }

  // Focus close button for accessibility
  const closeBtn = document.getElementById('help-panel-close');
  if (closeBtn) closeBtn.focus();
}

function closeHelpPanel() {
  const panel = document.getElementById('help-panel');
  const overlay = document.getElementById('help-panel-overlay');
  if (!panel || !overlay) return;
  panel.classList.add('hidden');
  overlay.classList.add('hidden');
  if (_helpPanelPreviousFocus && typeof _helpPanelPreviousFocus.focus === 'function') {
    _helpPanelPreviousFocus.focus();
    _helpPanelPreviousFocus = null;
  }
}

/** Returns an inline help icon button HTML string for a given topic ID. */
function helpIcon(topicId) {
  return `<button class="help-icon" data-help-topic="${escHtml(topicId)}" type="button" aria-label="Help for ${escHtml(topicId)}">?</button>`;
}

// Delegated click handler for all help icons
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-help-topic]');
  if (btn) {
    e.preventDefault();
    openHelpPanel(btn.dataset.helpTopic);
  }
});

// Overlay click closes panel
document.getElementById('help-panel-overlay')?.addEventListener('click', closeHelpPanel);

// Escape key closes panel
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const panel = document.getElementById('help-panel');
    if (panel && !panel.classList.contains('hidden')) {
      closeHelpPanel();
    }
  }
});

// Expose on window for inline onclick handlers in template HTML
window.openHelpPanel = openHelpPanel;
window.closeHelpPanel = closeHelpPanel;

export {
  showTab as switchTab,
  showTab,
  refreshCurrentView,
  connectHubWebSocket,
  loadDashboard,
  renderHubSitesTab,
  renderHubCentral,
  loadHubCentralData,
  loadHubCentralMonitoring,
  loadHubConfig,
  loadTenantPendingSpokes,
  loadSetup,
  loadTenantSetup,
  loadConfig,
  loadQaKeys,
  initQaPanel,
  openHelpPanel,
  closeHelpPanel,
  helpIcon,
};
