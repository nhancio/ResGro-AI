const { getStripe, respond, wrapHandler } = require("./_shared");

function getBaseUrl(origin) {
  return (origin || "https://resgro.ai").replace(/\/$/, "");
}

exports.handler = wrapHandler(async (body, event, headers) => {
  const { plan, origin, appOrigin } = body;

  if (!plan || !["self-serve", "autonomy"].includes(plan)) {
    return respond(400, { error: "Invalid plan. Must be 'self-serve' or 'autonomy'." }, headers);
  }

  const priceId =
    plan === "self-serve"
      ? process.env.STRIPE_SELFSERVE_PRICE_ID
      : process.env.STRIPE_AUTONOMY_PRICE_ID;

  if (!priceId) {
    return respond(500, { error: `Missing Stripe price configuration for ${plan}.` }, headers);
  }

  const baseUrl = getBaseUrl(origin || event.headers.origin);
  const portalUrl = getBaseUrl(appOrigin || baseUrl);
  const successUrl = `${portalUrl}/?session_id={CHECKOUT_SESSION_ID}#/app`;
  const cancelUrl = `${baseUrl}/#/pricing`;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { plan },
    subscription_data: {
      trial_period_days: 30,
      metadata: { plan },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return respond(200, { url: session.url }, headers);
});
