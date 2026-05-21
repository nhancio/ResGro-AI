const { getStripe, respond, wrapHandler } = require("./_shared");

const ACTIVE = new Set(["trialing", "active", "past_due"]);

function inferPlanName(sub) {
  let planName = null;
  if (sub?.metadata?.plan) {
    planName = sub.metadata.plan;
  }
  if (!planName) {
    const productName = sub?.items?.data?.[0]?.price?.product?.name || "";
    if (productName.toLowerCase().includes("self-serve") || productName.toLowerCase().includes("self serve")) {
      planName = "self-serve";
    } else if (productName.toLowerCase().includes("autonomy") || productName.toLowerCase().includes("pro")) {
      planName = "autonomy";
    }
  }
  if (!planName) {
    const amount = sub?.items?.data?.[0]?.price?.unit_amount;
    if (amount === 10000) planName = "self-serve";
    else if (amount === 25000) planName = "autonomy";
  }
  if (!planName) planName = "self-serve";
  return planName;
}

function subscriptionPayload(customer, sub) {
  if (!sub || typeof sub !== "object") return null;
  return {
    customer: {
      id: customer?.id || null,
      email: customer?.email || null,
      name: customer?.name || null,
    },
    subscription: {
      id: sub.id || null,
      status: sub.status || null,
      planName: inferPlanName(sub),
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      plan: {
        amount: sub.items?.data?.[0]?.price?.unit_amount
          ? sub.items.data[0].price.unit_amount / 100
          : 0,
        currency: sub.items?.data?.[0]?.price?.currency || "aud",
        interval: sub.items?.data?.[0]?.price?.recurring?.interval || "month",
      },
    },
  };
}

exports.handler = wrapHandler(async (body, _event, headers) => {
  const { customerId } = body;
  if (!customerId || typeof customerId !== "string" || !customerId.startsWith("cus_")) {
    return respond(400, { error: "Valid Stripe customer id is required." }, headers);
  }

  const stripe = getStripe();
  let customer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    return respond(400, { error: "Could not load customer." }, headers);
  }
  if (customer.deleted) {
    return respond(404, { error: "Customer not found" }, headers);
  }

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const candidates = (list.data || []).filter((s) => ACTIVE.has(s.status));
  const subSummary = candidates[0] || (list.data || [])[0];
  if (!subSummary) {
    return respond(200, { data: null }, headers);
  }

  const sub = await stripe.subscriptions.retrieve(subSummary.id, {
    expand: ["items.data.price.product"],
  });

  return respond(200, { data: subscriptionPayload(customer, sub) }, headers);
});
