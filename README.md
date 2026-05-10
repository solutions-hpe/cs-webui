# cs-webui

HPE Client-Sim unified WebUI — single frontend codebase for both hub and spoke deployments.

## Overview

The same HTML, CSS, and JavaScript serves both hub and spoke modes. The backend injects
`WEBUI_MODE=hub` or `WEBUI_MODE=spoke` at runtime to control which sections are rendered.

## Repos

| Repo | Role |
|------|------|
| `cs-webui` (this repo) | Unified frontend — HTML, CSS, JS |
| `webui-hub` | Hub backend — multi-tenant FastAPI server |
| `client-sim` | Spoke backend — Proxmox/simulation FastAPI server |

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production |
| `lrb` | Development |

## Structure

```
static/
  app.js          # Unified JS — hub + spoke logic, mode-gated
  style.css       # Unified CSS
  assets/         # Images, icons
templates/
  index.html      # Unified HTML template — WEBUI_MODE injected by backend
shared/
  shared_utils.py # Shared Python serialization helpers
VERSION           # Current version string
```
