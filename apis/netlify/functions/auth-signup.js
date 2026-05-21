const { getStripe, respond, wrapHandler } = require("./_shared");
const crypto = require("crypto");

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;

function hashPassword(password, salt) {
  const saltBuf = Buffer.from(salt, "hex");
  const derived = crypto.pbkdf2Sync(password, saltBuf, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return `${salt}:${derived.toString("hex")}`;
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

exports.handler = wrapHandler(async (body, event, headers) => {
  const { email, password, stripeCustomerId, businessName, restaurantCount, dateOfBirth, region } = body;

  if (!email || !password || password.length < 8) {
    return respond(400, { error: "Valid email and password (min 8 chars) required." }, headers);
  }
  if (!stripeCustomerId) {
    return respond(400, { error: "Stripe customer ID is required." }, headers);
  }
  if (!businessName || !dateOfBirth) {
    return respond(400, { error: "Business name and date of birth are required." }, headers);
  }

  const stripe = getStripe();
  const normalizedEmail = email.trim().toLowerCase();

  let customer;
  try {
    customer = await stripe.customers.retrieve(stripeCustomerId);
  } catch {
    return respond(400, { error: "Invalid Stripe customer." }, headers);
  }

  if (customer.deleted) {
    return respond(400, { error: "Stripe customer has been deleted." }, headers);
  }

  const existingMeta = customer.metadata || {};
  if (existingMeta.resgro_user_id) {
    return respond(409, { error: "An account already exists for this subscription." }, headers);
  }

  const existingUsers = await stripe.customers.search({
    query: `metadata["resgro_email"]:"${normalizedEmail}"`,
  });
  if (existingUsers.data.length > 0) {
    return respond(409, { error: "An account with this email already exists." }, headers);
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const userId = `usr_${crypto.randomBytes(8).toString("hex")}`;

  await stripe.customers.update(stripeCustomerId, {
    email: normalizedEmail,
    name: businessName.trim(),
    metadata: {
      ...existingMeta,
      resgro_user_id: userId,
      resgro_email: normalizedEmail,
      resgro_password_hash: passwordHash,
      resgro_business_name: businessName.trim(),
      resgro_restaurant_count: String(restaurantCount || 1),
      resgro_date_of_birth: dateOfBirth,
      resgro_region: region || "",
      resgro_can_manage_users: "true",
      resgro_created_at: new Date().toISOString(),
    },
  });

  return respond(200, {
    user: {
      id: userId,
      email: normalizedEmail,
      stripeCustomerId,
      canManageUsers: true,
      metadata: {
        businessName: businessName.trim(),
        restaurantCount: Number(restaurantCount) || 1,
        dateOfBirth,
        region: region || "",
      },
      createdAt: new Date().toISOString(),
    },
  }, headers);
});
