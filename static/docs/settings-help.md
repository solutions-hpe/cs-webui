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
Configures the GitHub repository where simulation configs (`simulation.conf`, `user.conf`) are stored. The hub fetches these files and distributes them to all spokes in this tenant.

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
The primary configuration file for the client-simulator. Controls SSID targeting, L1/L2 simulation parameters, reclone schedule, USB VID:PID filters, and more.

- Fetched from GitHub if a repository is configured; falls back to a hub-managed override if not
- Displayed here read-only when sourced from GitHub — edit the file in the repo to update it
- Use the **Conf Overrides** tab to apply tenant-specific changes without modifying the shared repo

[Full documentation](https://github.com/solutions-hpe/webui-hub#simulation-conf)

## conf-overrides
**Config Overrides**
Per-tenant overrides for `simulation.conf` and `user.conf` fields. Values entered here take precedence over the shared repo config at the spoke level.

- Use this to customize a specific tenant without modifying the shared GitHub repository
- Override keys are deep-merged on top of the base config on each spoke
- Leave fields blank to inherit unchanged values from the repo
- Changes apply to all spokes in this tenant on the next config push

[Full documentation](https://github.com/solutions-hpe/webui-hub#config-overrides)

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
