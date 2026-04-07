const Stripe = require("stripe");

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

    const { session_id } = JSON.parse(event.body);

    if (!session_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing session_id" }),
      };
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "subscription.items.data.price", "customer"],
    });

    const subscription = session.subscription;
    const subscriptionStatus =
      subscription && typeof subscription === "object" ? subscription.status : null;

    // For subscriptions with a free trial, Stripe may set `payment_status` to `unpaid`
    // while the subscription itself is already created as `trialing`.
    const isSuccessful =
      session.payment_status === "paid" ||
      session.status === "complete" ||
      subscriptionStatus === "trialing" ||
      subscriptionStatus === "active";

    if (isSuccessful) {
      const customer = session.customer;

      // Determine plan name from product or subscription metadata
      let planName = null;
      if (subscription && typeof subscription === "object" && subscription?.metadata?.plan) {
        planName = subscription.metadata.plan;
      } else if (session?.metadata?.plan) {
        planName = session.metadata.plan;
      } else {
        // Derive from product name
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

      // Fallback: derive from price amount
      if (!planName && subscription && typeof subscription === "object") {
        const amount = subscription?.items?.data?.[0]?.price?.unit_amount;
        if (amount === 10000) planName = "self-serve";
        else if (amount === 25000) planName = "autonomy";
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "success",
          customer: {
            id: customer?.id || null,
            email: customer?.email || session.customer_details?.email || null,
            name: customer?.name || session.customer_details?.name || null,
          },
          subscription: {
            id: subscription?.id || null,
            status: subscription?.status || null,
            planName: planName,
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
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "failed",
        message: "Payment was not completed. Please try again.",
      }),
    };
  } catch (err) {
    console.error("Stripe verification error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: err.message || "Failed to verify payment session" }),
    };
  }
};
