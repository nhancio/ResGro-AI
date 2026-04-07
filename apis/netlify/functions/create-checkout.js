const Stripe = require("stripe");

function getBaseUrl(origin) {
  return (origin || "https://resgro.ai").replace(/\/$/, "");
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    const { plan, origin, appOrigin } = JSON.parse(event.body);

    if (!plan || !["self-serve", "autonomy"].includes(plan)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid plan. Must be 'self-serve' or 'autonomy'." }),
      };
    }

    // Use the correct price based on plan
    const priceId =
      plan === "self-serve"
        ? process.env.STRIPE_SELFSERVE_PRICE_ID
        : process.env.STRIPE_AUTONOMY_PRICE_ID;

    if (!priceId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Missing Stripe price configuration for ${plan}.`,
        }),
      };
    }

    // Build redirect URL based on where the request came from
    const baseUrl = getBaseUrl(origin || event.headers.origin);
    const portalUrl = getBaseUrl(appOrigin || baseUrl);
    const successUrl = `${portalUrl}/?session_id={CHECKOUT_SESSION_ID}#/app`;
    const cancelUrl = `${baseUrl}/#/pricing`;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Checkout creation error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Failed to create checkout session" }),
    };
  }
};
