/**
 * API gateway: proxies user/auth/billing to Django; /admin → Django admin UI.
 * All account routes live in backend/ (Django).
 */

const express = require("express");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const DJANGO_BACKEND_URL = (process.env.DJANGO_BACKEND_URL || "http://127.0.0.1:8002").replace(
  /\/$/,
  "",
);

/** Legacy Netlify function names → Django accounts paths */
const DJANGO_LEGACY_MAP = {
  "auth-login": "login",
  "auth-signup": "signup",
  "auth-forgot-password": "forgot-password",
  "auth-reset-password": "reset-password",
  "create-checkout": "create-checkout",
  "create-billing-portal": "create-billing-portal",
  "get-billing-data": "get-billing-data",
  "verify-session": "verify-session",
  "resolve-workspace-subscription": "resolve-workspace-subscription",
};

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "512kb" }));

function publicOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/** Reverse-proxy Django admin + static assets (HTML, CSS, JS). */
function proxyToDjangoApp(prefix) {
  return (req, res) => {
    const base = new URL(DJANGO_BACKEND_URL);
    const path = req.originalUrl.startsWith(prefix)
      ? req.originalUrl
      : `${prefix}${req.originalUrl}`;
    const headers = { ...req.headers, host: base.host };
    headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
    headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers.host || "";

    const lib = base.protocol === "https:" ? https : http;
    const proxyReq = lib.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || undefined,
        path,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const outHeaders = { ...proxyRes.headers };
        const pub = publicOrigin(req);
        if (outHeaders.location && outHeaders.location.startsWith(DJANGO_BACKEND_URL)) {
          outHeaders.location = outHeaders.location.replace(DJANGO_BACKEND_URL, pub);
        }
        res.writeHead(proxyRes.statusCode, outHeaders);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (err) => {
      console.error(`Django app proxy error (${prefix}):`, err);
      res.status(502).send("Django backend unavailable");
    });
    req.pipe(proxyReq);
  };
}

// Redirect only bare /admin (no trailing slash). With Express default routing, "/admin"
// also matches "/admin/" and caused a 301 loop to itself (Chrome: ERR_TOO_MANY_ACCEPT_CH_RESTARTS).
app.get("/admin", (req, res, next) => {
  if (req.originalUrl.endsWith("/")) {
    return next();
  }
  res.redirect(301, "/admin/");
});
app.use("/admin", proxyToDjangoApp("/admin"));
app.use("/static", proxyToDjangoApp("/static"));

async function proxyToDjango(accountsPath, req, res) {
  const target = `${DJANGO_BACKEND_URL}/api/accounts/${accountsPath}`;
  try {
    const headers = { "Content-Type": "application/json" };
    if (req.headers["x-admin-email"]) {
      headers["X-Admin-Email"] = req.headers["x-admin-email"];
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (err) {
    console.error(`Django proxy error (${accountsPath}):`, err);
    res.status(502).json({ error: "Accounts service unavailable" });
  }
}

app.use("/api/accounts", (req, res) => {
  const sub = req.path.replace(/^\//, "");
  proxyToDjango(sub, req, res);
});

function legacyMount(prefix) {
  app.post(`${prefix}/:name`, (req, res) => {
    const mapped = DJANGO_LEGACY_MAP[req.params.name];
    if (mapped) {
      proxyToDjango(mapped, req, res);
      return;
    }
    res.status(404).json({
      error: `Unknown function: ${req.params.name}. User/auth routes are served by Django (/api/accounts/).`,
    });
  });
}

legacyMount("/.netlify/functions");
legacyMount("/api");

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "resgro-api", accountsBackend: DJANGO_BACKEND_URL });
});

const port = Number(process.env.PORT || "8080");
app.listen(port, "0.0.0.0", () => {
  console.log(`ResGro API gateway on ${port} → Django ${DJANGO_BACKEND_URL} (admin at /admin/)`);
});
