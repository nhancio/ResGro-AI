const { getStripe, respond, wrapHandler } = require("./_shared");

exports.handler = wrapHandler(async (body, _event, headers) => {
  const { customerId, returnUrl } = body;

  if (!customerId) {
    return respond(400, { error: "Missing Stripe customer ID" }, headers);
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || "https://resgro.ai/#/app",
  });

  return respond(200, { url: session.url }, headers);
});
