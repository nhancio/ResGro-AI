# How to Run ResGro

## Quick Start

From the **ResGro-AI** root directory:

```bash
./run.sh install   # first time only
./run.sh           # website + autonomy API
```

This starts:

| Service | Port | URL |
|---------|------|-----|
| Landing + portal (Netlify Dev) | 8888 | http://localhost:8888 |
| Autonomy Agent API (FastAPI) | 8000 | http://localhost:8000 |

Analytics and operator tools run **inside** the portal **Agents** section (no separate Streamlit dev server).

Press **Ctrl+C** to stop all services.

## Run Individual Services

```bash
./run.sh website      # Website only (port 8888)
./run.sh autonomy     # Autonomy Agent API only (port 8000)
./run.sh stop         # Stop background services
```

## Useful URLs

| URL | What it shows |
|-----|---------------|
| http://localhost:8888 | Main website |
| http://localhost:8888/#/pricing | Pricing |
| http://localhost:8888/#/login | Portal login (when using app host / `VITE_FORCE_APP_HOST`) |
| http://localhost:8000/health | Autonomy API health |
| http://localhost:8000/docs | Autonomy API docs (Swagger) |

## Prerequisites

- **Node.js** 18+ (`node -v`)
- **Python** 3.11+ (`python3 --version`)
- **npm**

## Environment Variables

Create a `.env` in `agents/resgro-browser-automation/` for the API:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
# OR
BROWSER_USE_API_KEY=xxxxxxxxxxxxx
```

Create/update `.env` in `resgro-landing/` for Stripe:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
# Optional: autonomy API if not default
VITE_AUTONOMY_API_URL=http://localhost:8000
```

## Build for Production

```bash
cd resgro-landing
npm run build
```

## Logs

- `logs/autonomy.log` — FastAPI output when started via `./run.sh all`
- Website logs appear in the terminal (foreground)

## Troubleshooting

- **Port in use?** Run `./run.sh stop` first, or: `lsof -ti:8000 | xargs kill` / `lsof -ti:8888 | xargs kill`
- **Agent API fails?** Check `OPENAI_API_KEY` or `BROWSER_USE_API_KEY` in `resgro-browser-automation/.env`
- **Stripe?** Add the required `VITE_*` / Netlify env vars from `DEPLOYMENT.md` and restart
