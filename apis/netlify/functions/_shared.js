const Stripe = require("stripe");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function getCorsOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.length === 0) return requestOrigin || "*";
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(requestOrigin) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(requestOrigin),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

let _stripe;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function respond(statusCode, body, headers) {
  return {
    statusCode,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function wrapHandler(fn) {
  return async (event) => {
    const headers = corsHeaders(event.headers?.origin);
    if (event.httpMethod === "OPTIONS") {
      return respond(200, "", headers);
    }
    if (event.httpMethod !== "POST") {
      return respond(405, { error: "Method not allowed" }, headers);
    }
    try {
      const body = JSON.parse(event.body || "{}");
      return await fn(body, event, headers);
    } catch (err) {
      console.error(`${event.path} error:`, err.message);
      return respond(500, { error: err.message || "Internal server error" }, headers);
    }
  };
}

module.exports = { getStripe, respond, wrapHandler };
