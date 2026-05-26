import { state, setWebuiMode } from './state.js';

function applyModeClass(mode) {
  const update = () => {
    if (!document.body) return;
    document.body.classList.remove('mode-hub', 'mode-spoke');
    if (mode === 'hub' || mode === 'spoke') document.body.classList.add(`mode-${mode}`);
  };
  if (document.body) {
    update();
    return;
  }
  document.addEventListener('DOMContentLoaded', update, { once: true });
}

function consumeInitPayload() {
  const init = window.__CS_WEBUI_INIT__ || null;
  window.__CS_WEBUI_INIT__ = null;
  return init;
}

const MODE_DETECTION_TIMEOUT_MS = 1500;

async function fetchInitPayload(timeoutMs = 0) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller && timeoutMs > 0
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetch('/api/init', {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!response?.ok) return null;
    return await response.json().catch(() => ({}));
  } catch (_) {
    return null;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

async function detectWebuiMode() {
  const init = consumeInitPayload() || await fetchInitPayload(MODE_DETECTION_TIMEOUT_MS);
  const mode = String(init?.mode || state.WEBUI_MODE || '').trim().toLowerCase();
  if (mode === 'hub' || mode === 'spoke') {
    window.__CS_WEBUI_INIT__ = init;
    applyModeClass(setWebuiMode(mode));
    return state.WEBUI_MODE;
  }
  applyModeClass(setWebuiMode(state.WEBUI_MODE === 'hub' ? 'hub' : 'spoke'));
  return state.WEBUI_MODE;
}

async function setFooterVersions() {
  try {
    const init = window.__CS_WEBUI_INIT__ || await fetchInitPayload();
    if (!init) return;
    const fWebui = document.getElementById('footer-cswebui-version');
    const fRepo = document.getElementById('footer-repo-version');
    const fHost = document.getElementById('footer-hostname');
    if (fWebui) {
      const ver = init.app_version || init.installer_version || '—';
      fWebui.textContent = `CS-WebUI v${ver}`;
      fWebui.title = `cs-webui frontend version: v${ver}`;
    }
    if (fRepo) {
      const rver = init.installer_version || '—';
      fRepo.textContent = `GitHub Repo v${rver}`;
    }
    if (fHost && init.hostname) {
      fHost.textContent = init.hostname;
      fHost.title = `Spoke hostname: ${init.hostname}`;
      fHost.style.display = '';
    }
  } catch (_) {}
}

applyModeClass(state.WEBUI_MODE);

(async function initUnifiedWebUi() {
  const mode = await detectWebuiMode();
  void setFooterVersions();
  if (mode === 'hub') {
    await import('./hub/dashboard.js');
  } else {
    await import('./spoke/dashboard.js');
  }
})();
