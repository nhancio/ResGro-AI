/**
 * Password-reset email for Cloud Run / Netlify.
 * Configure one of:
 * - EmailJS: VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (nodemailer)
 */

const nodemailer = require("nodemailer");

function hasSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function emailjsConfig() {
  const serviceId = process.env.EMAILJS_SERVICE_ID || process.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID || process.env.VITE_EMAILJS_TEMPLATE_ID;
  const resetTemplateId = process.env.EMAILJS_RESET_TEMPLATE_ID || "template_epacpjs";
  const userId = process.env.EMAILJS_PUBLIC_KEY || process.env.VITE_EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY || "";
  return { serviceId, templateId, resetTemplateId, userId, privateKey };
}

function hasEmailJS() {
  const { serviceId, templateId, userId } = emailjsConfig();
  return Boolean(serviceId && templateId && userId);
}

function mailFrom() {
  return process.env.MAIL_FROM || "noreply@resgro.ai";
}

/** @returns {boolean} */
function isEmailConfigured() {
  return hasEmailJS() || hasSmtp();
}

async function sendViaEmailJS({ templateParams, templateIdOverride }) {
  const { serviceId, templateId, userId, privateKey } = emailjsConfig();
  if (!serviceId || !templateId || !userId) {
    throw new Error("EmailJS is not configured.");
  }

  const payload = {
    service_id: serviceId,
    template_id: templateIdOverride || templateId,
    user_id: userId,
    template_params: templateParams,
  };
  if (privateKey) {
    payload.accessToken = privateKey;
  }

  const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const textBody = await resp.text().catch(() => "");
    throw new Error(`EmailJS request failed (${resp.status}): ${textBody || "Unknown error"}`);
  }
}

function emailjsCommonParams({ to, subject, text, html }) {
  return {
    to_email: to,
    to_name: to,
    from_name: "ResGro",
    from_email: mailFrom(),
    reply_to: mailFrom(),
    subject,
    message: text,
    html_message: html,
    mobile: "Not provided",
    restaurant: "Not provided",
  };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    text,
    html,
  });
}

/**
 * @param {{ to: string; name: string; shortCode: string; appOrigin?: string }} opts
 */
async function sendPasswordResetEmail(opts) {
  const { to, name, shortCode, appOrigin } = opts;
  const subject = "Reset your ResGro password";
  const text = [
    `Hi ${name || "there"},`,
    "",
    `Your password reset code is: ${shortCode}`,
    "",
    "This code expires in 30 minutes. If you did not request this, you can ignore this email.",
    "",
    appOrigin ? `Sign in: ${appOrigin.replace(/\/$/, "")}/#/get-started` : "",
    "",
    "— ResGro",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <p>Hi ${escapeHtml(name || "there")},</p>
    <p>Your password reset code is:</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:0.12em;">${escapeHtml(shortCode)}</p>
    <p style="color:#555;font-size:14px;">This code expires in 30 minutes. If you did not request this, you can ignore this email.</p>
    ${appOrigin ? `<p><a href="${escapeAttr(appOrigin.replace(/\/$/, "") + "/#/get-started")}">Open ResGro</a></p>` : ""}
    <p>— ResGro</p>
  `;

  if (hasEmailJS()) {
    const { resetTemplateId } = emailjsConfig();
    await sendViaEmailJS({
      templateParams: {
        ...emailjsCommonParams({ to, subject, text, html }),
        to_name: name || "User",
        reset_code: shortCode,
        app_origin: appOrigin || "",
      },
      templateIdOverride: resetTemplateId,
    });
    return;
  }
  if (hasSmtp()) {
    await sendViaSmtp({ to, subject, text, html });
    return;
  }
  throw new Error("Email is not configured (set EmailJS or SMTP_* env vars).");
}

/**
 * @param {{ to: string; name?: string; appOrigin?: string }} opts
 */
async function sendPasswordChangedEmail(opts) {
  const { to, name, appOrigin } = opts;
  const subject = "Your ResGro password was changed";
  const text = [
    `Hi ${name || "there"},`,
    "",
    "Your ResGro password was successfully updated.",
    "If you did not make this change, contact support immediately.",
    "",
    appOrigin ? `Sign in: ${appOrigin.replace(/\/$/, "")}/#/get-started` : "",
    "",
    "— ResGro",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <p>Hi ${escapeHtml(name || "there")},</p>
    <p>Your ResGro password was successfully updated.</p>
    <p style="color:#555;font-size:14px;">If you did not make this change, contact support immediately.</p>
    ${appOrigin ? `<p><a href="${escapeAttr(appOrigin.replace(/\/$/, "") + "/#/get-started")}">Open ResGro</a></p>` : ""}
    <p>— ResGro</p>
  `;

  if (hasEmailJS()) {
    const { resetTemplateId } = emailjsConfig();
    await sendViaEmailJS({
      templateParams: {
        ...emailjsCommonParams({ to, subject, text, html }),
        to_name: name || "User",
      },
      templateIdOverride: resetTemplateId,
    });
    return;
  }
  if (hasSmtp()) {
    await sendViaSmtp({ to, subject, text, html });
    return;
  }
  throw new Error("Email is not configured (set EmailJS or SMTP_* env vars).");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

module.exports = { sendPasswordResetEmail, sendPasswordChangedEmail, isEmailConfigured };
