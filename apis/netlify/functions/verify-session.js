const { getStripe, respond, wrapHandler } = require("./_shared");

exports.handler = wrapHandler(async (body, _event, headers) => {
  const { session_id } = body;

  if (!session_id) {
    return respond(400, { error: "Missing session_id" }, headers);
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ["subscription", "subscription.items.data.price", "customer"],
  });

  const subscription = session.subscription;
  const subscriptionStatus =
    subscription && typeof subscription === "object" ? subscription.status : null;

  const isSuccessful =
    session.payment_status === "paid" ||
    session.status === "complete" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "active";

  if (!isSuccessful) {
    return respond(200, {
      status: "failed",
      message: "Payment was not completed. Please try again.",
    }, headers);
  }

  const customer = session.customer;
  let planName = null;

  if (subscription && typeof subscription === "object" && subscription?.metadata?.plan) {
    planName = subscription.metadata.plan;
  } else if (session?.metadata?.plan) {
    planName = session.metadata.plan;
  } else {
    const productName =
      subscription && typeof subscription === "object"
        ? subscription?.items?.data?.[0]?.price?.product?.name || ""
        : "";
    if (productName.toLowerCase().includes("self-serve") || productName.toLowerCase().includes("self serve")) {
      planName = "self-serve";
    } else if (productName.toLowerCase().includes("autonomy") || productName.toLowerCase().includes("pro")) {
      planName = "autonomy";
    }
  }

  if (!planName && subscription && typeof subscription === "object") {
    const amount = subscription?.items?.data?.[0]?.price?.unit_amount;
    if (amount === 10000) planName = "self-serve";
    else if (amount === 25000) planName = "autonomy";
  }

  return respond(200, {
    status: "success",
    customer: {
      id: customer?.id || null,
      email: customer?.email || session.customer_details?.email || null,
      name: customer?.name || session.customer_details?.name || null,
    },
    subscription: {
      id: subscription?.id || null,
      status: subscription?.status || null,
      planName,
      trialStart: subscription?.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : null,
      trialEnd: subscription?.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      currentPeriodEnd: subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      plan: {
        amount: subscription?.items?.data?.[0]?.price?.unit_amount
          ? subscription.items.data[0].price.unit_amount / 100
          : null,
        currency: subscription?.items?.data?.[0]?.price?.currency || "aud",
        interval: subscription?.items?.data?.[0]?.price?.recurring?.interval || "month",
      },
    },
  }, headers);
});
