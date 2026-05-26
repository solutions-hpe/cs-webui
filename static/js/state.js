// Shared UI state scaffold for ES-module refactor.
export const state = window.__CS_WEBUI_STATE__ || (window.__CS_WEBUI_STATE__ = {
  WEBUI_MODE: window.WEBUI_MODE || '',
  socket: null,
  reconnectTimer: null,
  updateWasInProgress: false,
  openControlHost: null,
  centralSiteDetailOpen: null,
  activeSpokeTab: 'simulations',
  activeServerSubtab: 'server-vms',
  activeSimTab: 'failing',
  activeVmCat: 'sim',
  centralStatusData: {},
  centralWirelessClients: {},
  hwAlertsData: [],
  clientCountData: {},
  _hwRowsCache: [],
  _ccRowsCache: [],
  latestProxmoxData: { vms: [], usb_state: [], unknown_usb: [], reclone_state: null, vh_devices: null },
  latestRecloneState: null,
  currentSettings: {},
  configData: {},
  configLoaded: false,
  centralTokenValid: null,
  centralLastSyncedTs: null,
  refreshPaused: false,
  refreshCountdownTimer: null,
  refreshSecondsLeft: 10,
  refreshIntervalSeconds: 10,
  agentLogLines: [],
  agentLogAutoScroll: true,
  clientTypeFilter: 'all',
  simDisabledState: { global: false, local: false },
  webuiVmid: null,
  hub: {
    authToken: sessionStorage.getItem('hub_token') || null,
    currentUser: null,
    currentTenantId: null,
    tenants: [],
    spokeCache: {},
    activeTab: 'dashboard',
  },
});

export const WEBUI_MODE = state.WEBUI_MODE;
export function setWebuiMode(mode) {
  state.WEBUI_MODE = mode === 'hub' ? 'hub' : 'spoke';
  window.WEBUI_MODE = state.WEBUI_MODE;
  return state.WEBUI_MODE;
}
