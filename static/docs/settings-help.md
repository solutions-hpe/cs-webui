# Client-Simulator Hub — Settings Help

This file is the single source of truth for all in-app help content.
Each `## section-id` becomes one help panel. Update this file to update
the tooltips — no code changes required.

---

## aruba-central
**Aruba Central API**
Connects this tenant to HPE Aruba Central for real-time site health monitoring, client-count tracking, and hardware alert visibility.

- **Cluster URL**: your Central instance hostname (e.g. `apigw-prod2.central.arubanetworks.com`)
- **Client ID / Secret**: from HPE GreenLake → Manage Workspace → API Clients
- **Access Token**: alternative to Client ID/Secret — from Central → API Gateway → REST API → Generate Token
- **Customer ID**: your Aruba Central customer identifier (CID)
- **GLP Workspace ID**: optional — only needed for multi-workspace GreenLake accounts

Either an Access Token **or** a Client ID + Secret is required. The Cluster URL is always required.

[Full documentation](https://github.com/solutions-hpe/webui-hub#aruba-central-api)

## aruba-central-mode
**API Version**
Selects which Central API flavor the hub uses for polling sites, clients, and hardware alerts.

- **Classic**: legacy Aruba Central API (pre-GreenLake). Uses `/monitoring/v2/` endpoints.
- **Central / HPE GreenLake**: modern CNX API. Uses `/network-monitoring/v1alpha1/` endpoints for richer site-health data and device inventory.

Choose **Central / HPE GreenLake** for all new deployments on HPE GreenLake Central (CNX).

[Full documentation](https://github.com/solutions-hpe/webui-hub#aruba-central-api)

## github-repo
**GitHub Repository**
Configures the GitHub repository where simulation configs (`simulation.conf`, `user-overrides.conf`) are stored. The hub fetches these files and distributes them to all spokes in this tenant.

- **Simulation Repo URL**: HTTPS URL to the Git repo (e.g. `https://github.com/org/client-sim-configs.git`)
- **Simulation Repo Branch**: branch to read from — defaults to `main`
- **GitHub Token**: personal access token with `repo` scope for private repos. Leave blank to keep the current token.

These credentials are propagated to all approved spokes in this tenant automatically.

[Full documentation](https://github.com/solutions-hpe/webui-hub#github-configuration)

## auto-provisioning
**VM Auto-Provisioning**
Automatically creates and destroys client-simulator VMs on Proxmox in response to USB dongles being plugged in or unplugged on a spoke.

- When a new USB dongle is detected, the Proxmox agent clones the VM template and starts a client-simulator VM
- When a dongle is removed and stays absent past the **Missing Timeout**, the corresponding VM is destroyed
- Requires an approved Proxmox agent running on the hypervisor

Toggle this off to stop all automatic provisioning while keeping existing VMs running.

[Full documentation](https://github.com/solutions-hpe/webui-hub#auto-provisioning)

## usb-missing-timeout
**Destroy After Missing (minutes)**
How long a USB dongle must remain absent before its corresponding client-simulator VM is automatically destroyed.

- **Default**: 60 minutes
- Set **higher** to tolerate brief disconnects or reboot cycles without losing the VM
- Set **lower** for a fast teardown cycle in lab environments
- A value of 0 disables the timeout — VMs are only destroyed manually

[Full documentation](https://github.com/solutions-hpe/webui-hub#auto-provisioning)

## usb-max-slots
**Max VMs Per Host**
The maximum number of auto-provisioned VMs allowed on a single Proxmox host. New dongles detected beyond this limit are ignored until a slot opens.

- **Default**: 24
- Prevents runaway provisioning when many dongles are connected simultaneously
- Applied per Proxmox server, not per spoke
- Combine with **Max parallel reclones** to tune throughput vs. resource usage

[Full documentation](https://github.com/solutions-hpe/webui-hub#auto-provisioning)

## vm-templates
**VM Template IDs**
The VMID of Proxmox VM templates used as base images when cloning new client-simulator VMs.

- **Image 1 / Image 2**: two templates support A/B image configurations (e.g. different OS builds or client versions)
- **VM Image 1 %**: percentage of newly-cloned VMs that use Image 1 — the remainder use Image 2
- Templates must exist on **each** Proxmox host and be marked as a Proxmox template (not running VMs)
- A single template setup is fine — set VM Image 1 % to 100

[Full documentation](https://github.com/solutions-hpe/webui-hub#vm-templates)

## notifications
**Notifications**
Sends alerts to Microsoft Teams or email when monitored Aruba Central conditions trigger — site alerts, client-count drops, or hardware failures.

- **Teams**: paste the Incoming Webhook URL from your Teams channel connector
- **SMTP Host / Port / User / Password**: configure your mail server for email delivery
- **To Emails**: comma-separated list of recipient addresses
- Enable the **Enable notifications** toggle to activate alerting

At least one delivery channel (Teams or SMTP) must be configured for alerts to send.

[Full documentation](https://github.com/solutions-hpe/webui-hub#notifications)

## tls-acme
**TLS Certificate (ACME)**
Automatically provisions and renews a TLS/HTTPS certificate for the hub using the ACME protocol (Let's Encrypt or ZeroSSL).

- Requires a domain name pointed at the hub's public IP address
- Uses a **DNS-01 challenge** — no inbound port 80 required
- Supports Cloudflare, Route53, Azure DNS, GoDaddy, DigitalOcean, Porkbun, and others
- Check **Enable automatic renewal** to renew certificates before they expire (recommended)

Certificates are stored on the hub and served immediately on renewal — no restart required.

[Full documentation](https://github.com/solutions-hpe/webui-hub#tls-certificate)

## spoke-onboarding
**Spoke Onboarding**
Controls how new spokes register and authenticate with the hub.

- **PSK mode**: spokes include a pre-shared key in their `simulation.conf`. Matching spokes are automatically approved on first contact — no admin action required.
- **Pending approval mode**: spokes that don't match any PSK appear in the **Pending Spokes** list and require manual approval by a tenant admin.

Set the Onboarding PSK here and distribute it to spoke `simulation.conf` files. Multiple PSKs can be active simultaneously.

[Full documentation](https://github.com/solutions-hpe/webui-hub#spoke-onboarding)

## push-config
**Push Config to Spokes**
Stores a JSON configuration blob on the hub and delivers it to all approved spokes in this tenant.

- The hub assigns a **config version** and tracks whether each spoke has applied it
- Spokes receive the config within 30 seconds on the next inbox poll or WebSocket sync
- The **Per-Spoke Config State** table shows desired vs. applied version for each spoke
- Useful for pushing reclone schedules, image percentages, or USB settings tenant-wide

[Full documentation](https://github.com/solutions-hpe/webui-hub#push-config)

## hub-config-source-of-truth
**Hub as Source of Truth**
When enabled, the hub maintains a canonical spoke configuration and automatically pushes it to all approved spokes — on initial approval and whenever the config changes.

- The first approved spoke's existing config seeds the hub config automatically
- New spokes approved after this is enabled receive the config immediately
- Disabling this does not remove existing spoke configs; it only stops future automatic pushes
- Individual fields (branch, reclone schedule, VM templates, etc.) can be edited directly

[Full documentation](https://github.com/solutions-hpe/webui-hub#hub-config-source-of-truth)

## simulation-conf
**simulation.conf**
The primary configuration file for the client-simulator. Defines how every client VM connects, what traffic it generates, and which fault scenarios it runs. Organized into four section types:

- **[simulation]** — global flags and defaults applied to every client
- **[server]** — spoke dashboard URL that clients report status to
- **[address]** — server IP addresses for specific simulation tests
- **[s0]–[s9]** — per-bucket slot configurations; each client is assigned to one bucket

Fetched from GitHub if a repository is configured; falls back to a hub-managed override if not. `user-overrides.conf` can override any field per username on top of the slot settings.

---

**[simulation] fields**

- **Kill Switch** (`kill_switch`) — when `on`, immediately stops all simulations on every client in this tenant. Clients stay connected to Wi-Fi but stop generating traffic. Use to pause activity without rebooting or destroying VMs.
- **Rapid Update** (`rapid_update`) — when `on`, clients skip the GitHub pull at startup and launch immediately from the scripts already on disk. Boots faster. When `off`, clients pull the latest scripts from the configured repo before running.
- **Sim Load** (`sim_load`) — percentage of slot buckets to activate: `100` = all run, `75` = 3 out of 4, `50` = half, `25` = 1 in 4, `0` = clients stay associated but run no traffic simulations.
- **Github Repo** (`github_repo`) — when `on`, update scripts are pulled from the GitHub repository on every startup cycle. Set `off` for air-gapped environments that use a local copy or SMB share instead.
- **Repo Location** (`repo_location`) — HTTPS URL of the GitHub repository containing client simulation scripts (e.g. `https://github.com/org/client-sim`).
- **Repo Branch** (`repo_branch`) — Git branch to pull scripts from. Defaults to `main`. Change to a staging or feature branch to test new scripts without affecting production clients.
- **SMB Repo** (`smb_repo`) — when `on`, scripts are pulled from an SMB/CIFS network share instead of GitHub. Configure the share path in `[address] → smb_address`. Useful in environments without public internet access.
- **Site Based SSID** (`site_based_ssid`) — when `on`, each client joins the SSID associated with its assigned site (wsite) rather than the SSID written in its s0–s9 slot. Useful when multiple sites share one simulation config but have different Wi-Fi networks.
- **Reboot Schedule** (`reboot_schedule`) — minutes until the client schedules an automatic reboot. Up to 600 seconds of random jitter is added so the fleet doesn't reboot simultaneously. Set to `0` to disable scheduled reboots entirely.
- **Allow Offline** (`allow_offline`) — when `on`, clients continue running simulations even when they cannot reach the spoke/hub dashboard. When `off`, clients that lose dashboard connectivity pause their simulations.
- **SSIDpw Fail** (`ssidpw_fail`) — global flag: when `on`, clients deliberately use wrong Wi-Fi passphrases across all slots to simulate authentication failures visible in Aruba Central.
- **Auth Fail** (`auth_fail`) — global flag: when `on`, clients simulate 802.1X authentication failures (wrong credentials / bad EAP exchange) on all enterprise SSID slots.
- **Dot1x Password** (`dot1x_password`) — password used for WPA-Enterprise / 802.1X authentication. Paired with `dot1x_eap`. This field is masked in the UI.
- **Dot1x EAP** (`dot1x_eap`) — EAP method for 802.1X: `peap` (most common), `tls`, `ttls`, etc.
- **Iperf BW** (`iperf_bw`) — target bandwidth for iPerf3 throughput tests (e.g. `1k`, `10m`, `100m`). Applies to all slots with `iperf = on`.
- **Syslog** (`syslog`) — when `on`, clients forward simulation status and error messages to the syslog server in `[address] → syslog_server`.
- **Web Server** (`web_server`) — when `on`, each client VM runs a lightweight HTTP server for health checks and connectivity probing by other components.

---

**[server] fields**

- **Server URL** (`server_url`) — URL of the spoke web UI that clients post their status to. Must be reachable from the client VM's network (e.g. `http://192.168.1.10:8000`). Controls where live client data appears in the Simulations tab.

---

**[address] fields**

- **SMB Address** (`smb_address`) — UNC path to the SMB/CIFS share used when `smb_repo = on` (e.g. `//nas/scripts`).
- **Ping Address** (`ping_address`) — IP address clients send ICMP pings to for connectivity tests (`ping_test = on`).
- **DNS Latency 1/2/3** (`dns_latency_1`, `_2`, `_3`) — DNS resolver IPs used for latency measurement simulations.
- **DNS Bad IP 1/2/3** (`dns_bad_ip_1`, `_2`, `_3`) — intentionally unreachable IPs injected into DNS responses to simulate resolution failures.
- **DNS Bad Record 1/2/3** (`dns_bad_record_1`, `_2`, `_3`) — DNS records that return unexpected results, used to trigger DNS-failure detection in Aruba Central.
- **iPerf Server** (`iperf_server`) — IP or hostname of the iPerf3 server clients connect to for throughput tests.
- **Syslog Server** (`syslog_server`) — IP or hostname of the syslog collector receiving client log messages.

---

**[s0]–[s9] slot fields** (applied per client bucket)

- **WSite** (`wsite`) — Aruba Central site name. Must match the site name exactly. Clients in this slot appear under this site in Central and in the Sites health tab.
- **SSID** (`ssid`) — Wi-Fi network the client connects to. Overridden per-site when `site_based_ssid = on`.
- **SSID Password** (`ssidpw`) — Wi-Fi passphrase (PSK). Not used for 802.1X SSIDs.
- **DHCP Fail** (`dhcp_fail`) — when `on`, the client releases its DHCP lease and deliberately fails to renew, simulating address exhaustion or a rogue DHCP scenario at the site.
- **DNS Fail** (`dns_fail`) — when `on`, the client uses the `dns_bad_ip` and `dns_bad_record` addresses to generate DNS failures that should appear as alerts in Aruba Central.
- **Assoc Fail** (`assoc_fail`) — when `on`, the client repeatedly de-authenticates and re-associates to simulate association instability and generate Max-Associations events.
- **Port Flap** (`port_flap`) — when `on`, the wired or wireless interface is toggled up and down at intervals to simulate physical port instability (switch port, USB dongle, etc.).
- **Ping Test** (`ping_test`) — when `on`, the client runs periodic ICMP pings to `ping_address` and reports success/failure to the spoke dashboard.
- **Download** (`download`) — when `on`, the client downloads files from the configured download list to generate realistic bulk download traffic.
- **WWW Traffic** (`www_traffic`) — when `on`, the client browses a list of websites to generate HTTP/HTTPS traffic and measure web reachability from the site.
- **iPerf** (`iperf`) — when `on`, the client runs iPerf3 throughput tests against `iperf_server` at the `iperf_bw` rate.
- **Sim PHY** (`sim_phy`) — physical medium: `wireless` = Wi-Fi adapter, `ethernet` = wired adapter. Determines which interface is used for simulation traffic.
- **L1** (`l1`) — when `on`, the client runs Layer-1 diagnostics (signal strength, RSSI, SNR checks) and includes physical-layer health in its status report.

[Full documentation](https://github.com/solutions-hpe/webui-hub#simulation-conf)

## user-overrides-conf
**User Overrides Configuration**
Per-user simulation profile overrides stored in `configs/user-overrides.conf` in the GitHub repository. Each user section (`[username]`) specifies which simulation settings apply when that user's hostname runs simulations.

- **Add User**: creates a new override section for a username
- **↗ Override**: pre-fills the override form from a client's current simulation bucket (s0–s9)
- **Search**: filter users by name (appears when more than 5 users are configured)
- **Delete (✕ Remove)**: removes the user's override section from the file
- Saved changes are written to GitHub and distributed to all spokes

User overrides take precedence over the bucket-level (s0–s9) settings in `simulation.conf`.

## conf-overrides
**Config Overrides**
Per-tenant overrides for `simulation.conf` and `user-overrides.conf`. Both files use GitHub-first mode when a repo token is configured, but any hub override saved here takes precedence until it is cleared.

- Use this to customize a specific tenant without modifying the shared GitHub repository
- `simulation.conf` overrides are merged on top of the repo file on each spoke
- `user-overrides.conf` overrides replace the GitHub copy when a hub-managed override is set
- Changes are written locally on spokes as `hub-sim-overrides.conf` and `hub-user-overrides.conf`
- Clearing the hub override returns the tenant to the GitHub-sourced file

[Full documentation](https://github.com/solutions-hpe/webui-hub#config-overrides)

## client-count-alarm
**Client Count Alarm — Sites**
Monitors the number of wireless clients per site and raises an alarm when the count drops significantly below the 7-day baseline.

- **7-day baseline**: rolling average of hourly client counts over the past 7 days — provides a stable reference that a brief drop cannot suppress
- **Alarm threshold**: raises DEGRADED when the current hourly average is more than 25% below the 7-day baseline
- **Sticky alarms**: the alarm stays active as long as the site count remains below baseline, regardless of how long the drop has lasted — a multi-day outage does not self-resolve
- **Fallback**: uses the 1-hour rolling average as baseline for the first day of operation (before 7-day history accumulates)

The baseline is recalculated every hour and persisted to disk (`client_count_7day.json`) so it survives restarts.

## spoke-config
**Spoke Standalone Configuration**
When operating without a hub, the spoke manages `simulation.conf` and `user-overrides.conf` directly.

- **Config tab** (⚙ Config): edit all simulation.conf sections — [simulation], [server], [address], and s0–s9 bucket slots. Each section is a collapsible card; changes are saved per-section and pushed to GitHub.
- **Setup → Simulation**: same editor, accessible from the Setup tab
- **Config → User Overrides**: per-user override editor — add, edit, delete user sections with the same card layout as the hub

In hub-connected mode, config changes pushed from the hub take precedence and are written to `hub-sim-overrides.conf` and `hub-user-overrides.conf` locally.

## fleet-reclone
**Fleet Reclone**
Triggers a rolling VM reclone across all Proxmox hosts in this tenant simultaneously. All client-simulator VMs are deleted and re-created from the current VM template.

- **Concurrency**: number of VMs recloned in parallel per spoke. Higher values are faster but consume more Proxmox CPU and storage I/O.
- Progress is shown in real time in the VM Server tab
- A reclone cannot be cancelled once started — VMs mid-clone may be left in a transitional state if the agent loses connectivity

[Full documentation](https://github.com/solutions-hpe/webui-hub#fleet-reclone)

## proxmox-agent
**Proxmox Agent Approval**
The Proxmox agent runs directly on the hypervisor and handles VM creation, deletion, recloning, and USB dongle detection. It must be approved before the hub can issue commands through it.

- Agents connect to their spoke and appear in the **Pending** list
- **Approve** an agent to allow the spoke (and hub) to forward VM commands to it
- **Revoke** to disconnect an agent and block commands until it is re-approved
- Multiple agents can be approved on the same spoke (one per Proxmox server)

[Full documentation](https://github.com/solutions-hpe/webui-hub#proxmox-agent)

## reclone-concurrency
**Max Parallel Reclones**
Number of VM reclone operations that run simultaneously on a single Proxmox host.

- **Default**: 3
- Higher values reduce total reclone time but increase Proxmox disk and CPU load
- Lower values are safer in production environments with limited storage bandwidth
- This setting applies to both scheduled reclones and manual fleet reclones

[Full documentation](https://github.com/solutions-hpe/webui-hub#fleet-reclone)

## protected-vmids
**Protected VMIDs**
Comma-separated list of Proxmox VMIDs that the Proxmox agent will never delete or reclone, even during a fleet operation.

- Use this to protect manually-created VMs or non-simulator guests on the same host
- Auto-provisioned VMs are assigned IDs outside the protected range automatically
- Enter the VMID as shown in the Proxmox web UI (e.g. `100, 101, 9000`)

[Full documentation](https://github.com/solutions-hpe/webui-hub#auto-provisioning)

## central-mode
**Central Mode (Centralized vs Distributed)**
Controls whether Aruba Central polling happens at the hub or at each individual spoke.

- **Centralized** (recommended): the hub polls Central once and distributes status to all spokes. Requires only one set of API credentials.
- **Distributed**: each spoke polls Central independently using its own credentials. Required when spokes are in isolated networks that cannot reach the hub.

In centralized mode, the Sites status tab reflects data from the hub's polling cycle (every 5 minutes).

[Full documentation](https://github.com/solutions-hpe/webui-hub#central-mode)
