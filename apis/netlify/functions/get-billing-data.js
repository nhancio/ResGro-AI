const { getStripe, respond, wrapHandler } = require("./_shared");

function toIso(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function mapInvoiceStatus(status) {
  if (!status) return "Draft";
  if (status === "paid") return "Paid";
  if (status === "draft") return "Draft";
  if (status === "open") return "Open";
  return "Upcoming";
}

exports.handler = wrapHandler(async (body, _event, headers) => {
  const { customerId, subscriptionId } = body;

  if (!customerId) {
    return respond(400, { error: "Missing Stripe customer ID" }, headers);
  }

  const stripe = getStripe();

  let invoiceList;
  let upcomingInvoice = null;
  try {
    invoiceList = await stripe.invoices.list({ customer: customerId, limit: 10 });
  } catch (err) {
    return respond(200, { invoices: [] }, headers);
  }

  if (subscriptionId) {
    try {
      const fn = stripe.invoices.retrieveUpcoming || stripe.invoices.upcoming;
      if (typeof fn === "function") {
        upcomingInvoice = await fn.call(stripe.invoices, { customer: customerId, subscription: subscriptionId });
      }
    } catch (_) {
      /* upcoming invoice not available */
    }
  }

  const invoices = (invoiceList.data || []).map((inv) => ({
    id: inv.id,
    label: inv.description || inv.lines?.data?.[0]?.description || "Stripe invoice",
    amount: typeof inv.amount_due === "number" ? inv.amount_due / 100 : 0,
    status: mapInvoiceStatus(inv.status),
    date: toIso(inv.status_transitions?.paid_at || inv.created),
    hostedInvoiceUrl: inv.hosted_invoice_url || null,
    invoicePdf: inv.invoice_pdf || null,
  }));

  if (upcomingInvoice) {
    invoices.unshift({
      id: upcomingInvoice.id || "upcoming",
      label: upcomingInvoice.description || "Upcoming charge",
      amount: typeof upcomingInvoice.amount_due === "number" ? upcomingInvoice.amount_due / 100 : 0,
      status: "Upcoming",
      date: toIso(upcomingInvoice.period_end || upcomingInvoice.next_payment_attempt || upcomingInvoice.created),
      hostedInvoiceUrl: upcomingInvoice.hosted_invoice_url || null,
      invoicePdf: upcomingInvoice.invoice_pdf || null,
    });
  }

  return respond(200, { invoices }, headers);
});
