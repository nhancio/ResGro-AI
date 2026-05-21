const { getStripe, respond, wrapHandler } = require("./_shared");
const { sendPasswordChangedEmail } = require("./_email");
const crypto = require("crypto");

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;

function hashPassword(password, salt) {
  const saltBuf = Buffer.from(salt, "hex");
  const derived = crypto.pbkdf2Sync(password, saltBuf, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return `${salt}:${derived.toString("hex")}`;
}

function matchesResetCode(storedToken, codeOrToken) {
  if (!storedToken || !codeOrToken) return false;
  const raw = String(codeOrToken).trim();
  if (raw.length === 64 && /^[a-f0-9]+$/i.test(raw)) {
    return storedToken === raw;
  }
  return storedToken.slice(0, 8).toUpperCase() === raw.toUpperCase();
}

exports.handler = wrapHandler(async (body, event, headers) => {
  const { email, token, code, newPassword } = body;

  if (!email || !newPassword) {
    return respond(400, { error: "Email and new password are required." }, headers);
  }
  if (newPassword.length < 8) {
    return respond(400, { error: "Password must be at least 8 characters." }, headers);
  }
  if (!token && !code) {
    return respond(400, { error: "Reset code is required." }, headers);
  }

  const stripe = getStripe();
  const normalizedEmail = email.trim().toLowerCase();

  const results = await stripe.customers.search({
    query: `metadata["resgro_email"]:"${normalizedEmail}"`,
  });

  if (results.data.length === 0) {
    return respond(400, { error: "Invalid or expired reset link." }, headers);
  }

  const customer = results.data[0];
  const meta = customer.metadata || {};
  const stored = meta.resgro_reset_token;

  if (!stored || !matchesResetCode(stored, token || code)) {
    return respond(400, { error: "Invalid or expired reset link." }, headers);
  }

  if (meta.resgro_reset_expiry && new Date(meta.resgro_reset_expiry) < new Date()) {
    return respond(400, { error: "Reset link has expired. Please request a new one." }, headers);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(newPassword, salt);

  await stripe.customers.update(customer.id, {
    metadata: {
      ...meta,
      resgro_password_hash: passwordHash,
      resgro_reset_token: "",
      resgro_reset_expiry: "",
    },
  });

  try {
    await sendPasswordChangedEmail({
      to: normalizedEmail,
      name: meta.resgro_business_name || customer.name || "",
      appOrigin: body.appOrigin || process.env.APP_ORIGIN || "",
    });
  } catch (err) {
    console.error("auth-reset-password email error:", err && err.message ? err.message : err);
  }

  return respond(200, {
    success: true,
    message: "Password updated successfully. You can now log in.",
  }, headers);
});
