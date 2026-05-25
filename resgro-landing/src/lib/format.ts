export function formatCurrency(amount: number | null, currency = "aud") {
  if (amount === null || Number.isNaN(amount)) return "N/A";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | null) {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getPlanLabel(planName: string | null) {
  if (planName === "self-serve") return "Pro";
  if (planName === "autonomy") return "Max";
  return "ResGro Access";
}
