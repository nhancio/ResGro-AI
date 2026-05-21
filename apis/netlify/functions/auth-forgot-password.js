const { getStripe, respond, wrapHandler } = require("./_shared");
const { sendPasswordResetEmail, isEmailConfigured } = require("./_email");
const crypto = require("crypto");

function exposeResetTokenInResponse() {
  return process.env.EXPOSE_RESET_TOKEN_IN_API_RESPONSE === "true";
}

exports.handler = wrapHandler(async (body, event, headers) => {
  const { email } = body;
  const emailProviderConfigured = isEmailConfigured();

  if (!email) {
    return respond(400, { error: "Email is required." }, headers);
  }

  const stripe = getStripe();
  const normalizedEmail = email.trim().toLowerCase();

  const results = await stripe.customers.search({
    query: `metadata["resgro_email"]:"${normalizedEmail}"`,
  });

  if (results.data.length === 0) {
    return respond(200, {
      success: true,
      message: "If an account exists with that email, a reset code has been sent.",
      emailDelivered: false,
      emailConfigured: emailProviderConfigured,
    }, headers);
  }

  const customer = results.data[0];
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await stripe.customers.update(customer.id, {
    metadata: {
      ...customer.metadata,
      resgro_reset_token: token,
      resgro_reset_expiry: expiry,
    },
  });

  const shortCode = token.slice(0, 8).toUpperCase();
  const businessName = customer.metadata?.resgro_business_name || customer.name || "";
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const appOrigin =
    body.appOrigin ||
    process.env.APP_ORIGIN ||
    (origin ? origin.replace(/^https?:\/\/www\./, (m) => m.replace("www.", "")) : "");

  let emailSent = false;
  let emailSendError = false;
  const mailConfigured = isEmailConfigured();
  if (mailConfigured) {
    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        name: businessName,
        shortCode,
        appOrigin: appOrigin || undefined,
      });
      emailSent = true;
    } catch (err) {
      emailSendError = true;
      console.error("auth-forgot-password email error:", err.message || err);
    }
  }

  const base = {
    success: true,
    message: "If an account exists with that email, a reset code has been sent.",
  };

  if (emailSent) {
    return respond(200, { ...base, emailDelivered: true, emailConfigured: true }, headers);
  }

  if (exposeResetTokenInResponse()) {
    return respond(200, {
      ...base,
      emailDelivered: false,
      emailConfigured: mailConfigured,
      emailSendFailed: emailSendError,
      _resetToken: token,
      _email: normalizedEmail,
      _businessName: businessName,
    }, headers);
  }

  if (!mailConfigured) {
    console.warn(
      "auth-forgot-password: configure VITE_EMAILJS_SERVICE_ID + VITE_EMAILJS_TEMPLATE_ID + VITE_EMAILJS_PUBLIC_KEY, or SMTP_*.",
    );
  }
  return respond(200, {
    ...base,
    emailDelivered: false,
    emailConfigured: mailConfigured,
    emailSendFailed: mailConfigured && emailSendError,
  }, headers);
});
