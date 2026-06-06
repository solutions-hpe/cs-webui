# cs-webui

![Release](https://img.shields.io/badge/release-v1.0.0-success)

`cs-webui` is the shared browser frontend for the HPE Client-Sim platform. Version **v1.0.0** on `main` is the production frontend consumed by both Hub and Spoke deployments. The same `templates/index.html`, `static/js/*` modules, legacy `static/app.js` compatibility bundle, and `static/style.css` are served by both:

- `webui-hub` in **hub** mode
- `client-sim/webui-spoke` in **spoke** mode

The backend injects `window.WEBUI_MODE` at runtime, so one codebase drives both experiences.

---

## Operators

### What this frontend does

The UI is the operator-facing surface for:

- viewing simulations and client status
- approving and managing spokes
- sending commands
- managing Proxmox VM/USB operations
- viewing Proxmox multi-host VM Server state, 1-hour CPU/memory warmup states, provision-halt / throttle badges, guest-agent watchdog recovery status, and agent/PVE version metadata
- launching direct Proxmox VNC consoles from spoke mode and reviewing Command Queue / Command Trace detail in hub mode
- editing GitHub-backed `simulation.conf` and `user-overrides.conf` flows in hub or standalone spoke mode
- configuring Aruba Central, notifications, relay, and TLS
- checking service health and troubleshooting state

### How to access it

#### Spoke mode

Access the spoke UI from the spoke server itself.

Typical URL:

```text
http://<spoke-host>:8000
```

If spoke TLS is enabled, use HTTPS instead.

#### Hub mode

Access the hub UI over HTTPS.

Typical URL:

```text
https://<hub-host>:8443
```

Hub requires login. Spoke mode does not implement the same tenant-auth flow.

### Navigation by mode

#### Spoke mode tabs

| Tab | What it is for |
|---|---|
| **Simulations** | Current simulation buckets, counts, Central correlation, hardware alert status, and 7-day client-count baseline monitoring |
| **Simulation Clients** | Live client inventory with hostname search, online/offline filtering, and client-type tabs: **All**, **T1** (no USB dongle), **T2** (has USB dongle), and **T3** |
| **Central Monitoring** | Aruba Central overview plus sites, alerts, insights, clients, devices, and background polling while the tab is active |
| **VM Server** | Proxmox VM and USB management with two-level server list → agent detail navigation, per-server average/throttle/halt badges, and sub-tabs: **VMs**, **USB (T2)**, **IoT (T3)**, **Other**, **VirtualHere**, **Command Queue**, **Details** |
| **API Server** | Spoke service status, health, and service log views |
| **Config** | Unified `simulation.conf` editor plus standalone `user-overrides.conf` management |
| **Setup** | Repository, Simulations, VM/USB, Hub relay, Central API, notifications, TLS, and troubleshooting configuration |

#### Hub mode tabs

| Tab | What it is for |
|---|---|
| **Tenants** | Superadmin landing view and tenant selection |
| **Simulations** | Cross-spoke simulation summary inside a tenant context, including 7-day client-count baseline alarms |
| **Clients** | Aggregate client list across the selected tenant |
| **Spokes** | Approved spokes, detail modal, processing mode, spoke health, relayed Proxmox Details metrics, provision-halt and hardware-alert badges, and access to VM Server workflows for backup/reseed operations |
| **Commands** | Queue commands to a spoke |
| **Setup** | Tenant settings, notifications, API info, TLS, and pending spoke approval |
| **Config** | Tenant processing-mode summary plus `simulation.conf` / `user-overrides.conf` editors |
| **Superadmin** | Tenant creation, user management, global kill switch state, and pending spoke approvals |

Hub mode does not expose VM backup as a standalone top-level tab. In v1.0, those controls appear in the hub-side VM Server context for eligible spokes, including backup, reseed, and related recovery actions.

### Spoke operator workflow

#### 1. Simulations

Use **Simulations** first to answer:

- which simulation buckets exist right now
- how many clients are attached to each bucket
- whether the expected Aruba Central check is passing or failing
- whether 7-day client-count or hardware-alert monitoring is reporting issues

#### 2. Simulation Clients

Use **Simulation Clients** for day-to-day VM troubleshooting:

- online/offline state (online means the last heartbeat was within 300 seconds)
- hostname search and status filtering
- platform/hardware type plus T1 / T2 / T3 classification
- active simulations
- Aruba impact badge
- recent client-side errors posted by `simulation.sh`

#### 3. VM Server / USB (T2) / IoT (T3)

When the spoke has a connected Proxmox agent, **VM Server** exposes a server list first, then a per-agent detail view with these sub-tabs:

| Sub-tab | Content |
|---------|---------|
| **VMs** | Simulation VMs plus recovery states such as `retrying…`, `agent rebooting…`, and `agent down` when the post-provision retry queue or guest-agent watchdog is active; spoke mode also offers direct Proxmox VNC launch actions |
| **USB (T2)** | USB dongle inventory, VID:PID, assigned VMs, missing/available status |
| **IoT (T3)** | VMs with T3 PCI passthrough on this node |
| **Other** | Non-sim, non-IoT VMs plus containers |
| **VirtualHere** | VH hub/server name, device names, connection state, auto-use status |
| **Command Queue** | Queued and completed commands for clients and the Proxmox host; hub mode expands entries with smart payload summaries plus detail/result sub-rows |
| **Details** | Proxmox node info, agent/PVE version metadata, spoke version metadata in hub mode, live CPU/RAM, 1-hour CPU/memory average pills with warmup countdowns, and the hub-side Command Trace panel |

Server cards and breadcrumbs also surface **Auto-Provisioning Throttled** and **Provision Halt** badges when a host is blocked by the current resource gates.

Hub and spoke Details views use the same three resource-average states:

1. `📊 warming up… <N> min remaining` — no confirmed 1-hour window yet
2. `📊 CPU avg: ~3.2% (<N> min remaining)` / `Mem avg: ~…` — estimated average from samples collected so far
3. `📊 CPU avg: 3.2%` / `Mem avg: 41.7%` — confirmed 1-hour rolling average once the full window is available

**T1 / T2 client classification** is visible on the **Simulation Clients** tab using the type filter buttons at the top of the client list:
- **T1** — client VM has no USB dongle assigned
- **T2** — client VM has an active USB dongle assignment (determined by the `has_usb` field on each client)
- **IoT (T3)** — placeholder for future classification

#### 4. Setup -> Hub

If the spoke will relay to Hub, go to:

```text
Setup -> Hub
```

That section holds:

- hub URL
- relay enable/disable
- spoke name
- tenant hint
- current registration/relay diagnostics

#### 5. Setup -> Central API

Use:

```text
Setup -> Central API
```

for Aruba Central credentials, site mappings, monitored checks, and hardware-alert settings. After **Load Sites**, any local `wsite` values that are still unmapped are auto-added as rows so operators can finish the mapping quickly.

#### 6. Setup -> Notifications

Use:

```text
Setup -> Notifications
```

for SMTP and Teams webhook configuration.

#### 7. Setup -> TLS Certificate

Use:

```text
Setup -> TLS Certificate
```

for spoke HTTPS settings and certificate request status.

#### 8. Setup -> Troubleshooting

Use:

```text
Setup -> Troubleshooting
```

for:

- system health summary
- service control buttons
- **Message Statistics** with live WebSocket load indicators and **Clear Message Queue**
- install/service/journal log history (newest entries first)
- Proxmox agent setup instructions
- relay diagnostics

#### 9. Config

Use **Config** for the current config editors:

- `simulation.conf` now uses the same unified collapsible-card layout in hub and spoke mode
- Hub mode adds a per-user `user-overrides.conf` editor with user cards, **Add User** modal, delete actions, hostname search, and a **↗ Override** shortcut from the Simulation Clients list
- Spoke mode exposes the same `simulation.conf` editor in **Config** and **Setup → Simulation**, plus standalone **Config → User Overrides** management

### Hub vs Spoke differences

| Area | Hub mode | Spoke mode |
|---|---|---|
| Auth | JWT login, users, tenant roles, superadmin | Local UI; no tenant-login flow |
| Scope | Multi-tenant, many spokes | Single site/lab |
| Command target | Spokes in a tenant | Local VMs and Proxmox host |
| Proxmox controls | View through spoke detail/aggregate context | Native local VM/USB controls |
| Central config | Tenant-level settings | Local spoke polling and site mappings |
| Top-bar status | API auth, tenant context, auto-refresh | GitHub sync, local API status, relay indicator, Central API status |

---

## Developers

### Repository layout

```text
cs-webui/
├── templates/
│   └── index.html
├── static/
│   ├── js/
│   │   ├── main.js
│   │   ├── hub/dashboard.js
│   │   ├── spoke/dashboard.js
│   │   └── shared helpers (state, utils, websocket, nav, agent-log)
│   ├── app.js            # legacy compatibility bundle
│   ├── docs/
│   └── style.css
├── shared/
│   └── shared_utils.py
├── VERSION
└── .githooks/
    └── pre-commit
```

### Runtime architecture

The frontend is intentionally simple:

- no bundler
- no npm build
- no framework runtime
- one HTML template
- ES-module loading under `static/js/`
- one shared CSS file

#### Mode injection

`templates/index.html` provides the shared shell and the backend injects `window.WEBUI_MODE` / `__CS_WEBUI_INIT__` at runtime so the browser can pick the correct module set.

At runtime:

- Hub replaces the mode with `hub`
- Spoke replaces the mode with `spoke`

#### Module structure

`static/js/main.js` is the entry point. It:

1. detects the active mode from the injected init payload (or `/api/init` fallback)
2. applies `mode-hub` or `mode-spoke` to `<body>`
3. lazy-loads `static/js/hub/dashboard.js` or `static/js/spoke/dashboard.js`
4. sets footer version pills from the init payload

Shared helpers such as `state.js`, `utils.js`, `websocket.js`, `nav.js`, and `agent-log.js` are imported by the mode-specific dashboards as needed.

`static/app.js` is kept as a legacy compatibility bundle, but new work should target the modular files under `static/js/`.

### How to add a new tab or feature

#### Add a new tab

1. Add the tab button in `templates/index.html` using `data-tab="..."`.
2. Add a matching panel with id `tab-<name>`.
3. Put it under the correct root:
   - `#hub-root` for hub-only pages
   - `#spoke-root` for spoke-only pages
4. Add mode classes if needed:
   - `hub-only`
   - `spoke-only`
5. In the correct mode module (`static/js/hub/dashboard.js` or `static/js/spoke/dashboard.js`), wire the new tab into the appropriate init/render flow.
6. Add fetch/render/init logic for the new panel.
7. Update `static/style.css` if the layout needs new classes.

#### Add a new data-driven feature

1. Decide whether the backend source is Hub, Spoke, or both.
2. Add or reuse the backend endpoint in `webui-hub` or `client-sim/webui-spoke`.
3. Add UI fetch logic in the correct dashboard module.
4. Render into the existing page/card/table pattern used in `index.html`.
5. If the feature belongs in both modes, keep selectors and function names mode-scoped so the hub and spoke modules stay isolated.

### UI conventions

- `btn-primary` is the default action button style and uses the solid HPE green fill.
- Use a more specific variant only when semantics require it, such as `btn-danger` for destructive actions or `btn-secondary` for secondary/outline actions.
- Keep online/offline UI behavior aligned to the shared 300-second timeout used by spoke and hub backends.

### Shared utilities

`shared/shared_utils.py` is the Python-side contract between Hub and Spoke for telemetry serialization helpers. Keep it in sync when the telemetry shape changes.

### Versioning

- Repo version is stored in `VERSION`.
- `main` is the production branch. Hub and Spoke both consume this repo from `main`.

#### How the version is bumped

`.githooks/pre-commit`:

- runs Python syntax checks on staged `.py`
- runs `bash -n` on staged `.sh`
- runs a lightweight JS balance check on staged `.js`
- bumps `VERSION` by `0.01` on non-`main` commits when files other than `VERSION` are staged

### How other repos consume this frontend

#### `webui-hub`

- consumes `frontend/` as a submodule in local development and copies `static/` plus `templates/index.html` into its runtime image/build context
- injects `WEBUI_MODE=hub`

#### `client-sim/webui-spoke`

- `install-lxc.sh` downloads `static/js/*`, the legacy `static/app.js` compatibility bundle, `static/style.css`, and `templates/index.html` from `cs-webui`
- injects `WEBUI_MODE=spoke`

### Local development notes

There is no standalone frontend dev server in this repo. The normal workflow is:

1. edit `templates/`, `static/`, or `shared/`
2. commit to `main`
3. redeploy/reinstall the spoke or rebuild hub so it consumes the updated assets

---

## Summary

`cs-webui` is the single source of truth for the platform UI. Hub and Spoke stay aligned by serving the same frontend and switching behavior with runtime `WEBUI_MODE` injection.
