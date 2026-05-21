const { getStripe, respond, wrapHandler } = require("./_shared");
const crypto = require("crypto");

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const saltBuf = Buffer.from(salt, "hex");
  const derived = crypto.pbkdf2Sync(password, saltBuf, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return derived.toString("hex") === hash;
}

function customerToUser(customer) {
  const m = customer.metadata || {};
  return {
    id: m.resgro_user_id,
    email: m.resgro_email,
    stripeCustomerId: customer.id,
    canManageUsers: m.resgro_can_manage_users === "true",
    metadata: {
      businessName: m.resgro_business_name || customer.name || "",
      restaurantCount: Number(m.resgro_restaurant_count) || 1,
      dateOfBirth: m.resgro_date_of_birth || "",
      region: m.resgro_region || "",
    },
    createdAt: m.resgro_created_at || "",
  };
}

exports.handler = wrapHandler(async (body, event, headers) => {
  const { email, password } = body;

  if (!email || !password) {
    return respond(400, { error: "Email and password are required." }, headers);
  }

  const stripe = getStripe();
  const normalizedEmail = email.trim().toLowerCase();

  const results = await stripe.customers.search({
    query: `metadata["resgro_email"]:"${normalizedEmail}"`,
  });

  if (results.data.length === 0) {
    return respond(401, { error: "Invalid email or password." }, headers);
  }

  const customer = results.data[0];
  const storedHash = customer.metadata?.resgro_password_hash;

  if (!storedHash || !verifyPassword(password, storedHash)) {
    return respond(401, { error: "Invalid email or password." }, headers);
  }

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 1,
  });

  const sub = subs.data[0] || null;
  let subscription = null;
  if (sub) {
    const planMeta = sub.metadata || {};
    subscription = {
      id: sub.id,
      status: sub.status,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      planName: planMeta.plan || "self-serve",
      plan: {
        amount: sub.items?.data?.[0]?.price?.unit_amount ? sub.items.data[0].price.unit_amount / 100 : 0,
        currency: sub.items?.data?.[0]?.price?.currency || "aud",
        interval: sub.items?.data?.[0]?.price?.recurring?.interval || "month",
      },
    };
  }

  return respond(200, {
    user: customerToUser(customer),
    subscription: subscription
      ? {
          customer: { id: customer.id, email: customer.email, name: customer.name },
          subscription,
        }
      : null,
  }, headers);
});
