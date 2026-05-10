# cs-webui

`cs-webui` is the unified frontend for the HPE Client-Sim hub-and-spoke platform. Both `webui-hub` and `client-sim/webui-spoke` serve the same HTML, CSS, and JavaScript from this repo; the backend injects `WEBUI_MODE=hub` or `WEBUI_MODE=spoke` at runtime so one frontend can expose the correct tabs, actions, and layouts.

## How `WEBUI_MODE` works

- `templates/index.html` defines `window.WEBUI_MODE = "{{WEBUI_MODE}}"`.
- `webui-hub/app/main.py` serves that template and replaces the placeholder with `hub`.
- `client-sim/webui-spoke/server.py` serves the same template and replaces the placeholder with `spoke`.
- `static/app.js` gates hub-only logic with checks such as `if (WEBUI_MODE === 'hub') { ... }`.
- `static/style.css` uses mode classes such as `body.mode-hub` and `body.mode-spoke` to hide or show mode-specific sections.

## Repository layout

```text
cs-webui/
├── templates/
│   └── index.html      # Unified HTML template with WEBUI_MODE placeholder
├── static/
│   ├── app.js          # Shared hub + spoke JavaScript
│   ├── style.css       # Shared CSS with mode-gated selectors
│   └── assets/         # Images and other static assets
├── shared/
│   └── shared_utils.py # Shared Python TypedDict/serialization helpers
└── VERSION             # Frontend version string
```

## How the other repos consume this repo

### `webui-hub`

- GitHub Actions in `webui-hub/.github/workflows/build-push.yml` clones `cs-webui` from the matching branch during image builds.
- The workflow copies `static/` and `templates/index.html` into the Hub Docker build context before `docker build`.
- At runtime, `app/main.py` injects `WEBUI_MODE=hub` before returning `HTMLResponse`.

### `client-sim` / `webui-spoke`

- `webui-spoke/install-lxc.sh` fetches `static/app.js`, `static/style.css`, and `templates/index.html` from `cs-webui` with `curl` at install/update time.
- The installer injects `WEBUI_MODE=spoke` into `index.html` so the same frontend runs in spoke mode.
- Re-running the installer on the same branch keeps the spoke backend and frontend aligned.

## Development workflow

1. Edit `templates/`, `static/`, or `shared/` in this repo.
2. Commit changes to `lrb` for development work.
3. Rebuild `webui-hub` or rerun `client-sim/webui-spoke/install-lxc.sh` so the backend fetches the updated frontend assets.
4. Promote the same changes to `main` when they are ready for production.

Because both backends pull from the same branch, keep branch alignment consistent across `cs-webui`, `webui-hub`, and `client-sim`.

## Branch convention

| Branch | Purpose |
|---|---|
| `lrb` | Development / integration branch |
| `main` | Production branch |

## Summary

This repo is the single source of truth for the Client-Sim browser UI. Hub and spoke behavior are differentiated by runtime `WEBUI_MODE` injection, not by separate frontend codebases.
