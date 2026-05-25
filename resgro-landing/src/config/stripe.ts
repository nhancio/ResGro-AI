import { getApiBaseUrl, getAppOrigin, getSiteOrigin } from "./app";
import type { SubscriptionData } from "../hooks/useSubscription";

function accountsPath(path: string): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/api/accounts/${path}`;
}

async function readErrorMessage(res: Response) {
  try {
    const data = await res.json();
    return data.error || data.message || "Request failed";
  } catch {
    return "Request failed";
  }
}

export async function redirectToCheckout(
  plan: "self-serve" | "autonomy",
  customerEmail?: string,
) {
  try {
    const res = await fetch(accountsPath("create-checkout"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        origin: getSiteOrigin(),
        appOrigin: getAppOrigin(),
        customerEmail: customerEmail?.trim().toLowerCase() || undefined,
      }),
    });

    if (!res.ok) {
      alert(await readErrorMessage(res));
      return;
    }

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Failed to create checkout session. Please try again.");
    }
  } catch {
    alert("Unable to connect to payment service. Please try again.");
  }
}

export async function openBillingPortal(customerId: string) {
  try {
    const res = await fetch(accountsPath("create-billing-portal"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        returnUrl: `${getAppOrigin()}/#/app`,
      }),
    });

    if (!res.ok) {
      alert(await readErrorMessage(res));
      return;
    }

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Failed to open billing portal. Please try again.");
    }
  } catch {
    alert("Unable to connect to billing service. Please try again.");
  }
}

export interface StripeBillingInvoice {
  id: string;
  label: string;
  amount: number;
  status: "Paid" | "Upcoming" | "Draft" | "Open";
  date: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
}

export async function resolveWorkspaceSubscriptionFromStripe(
  customerId: string,
): Promise<SubscriptionData | null> {
  try {
    const res = await fetch(accountsPath("resolve-workspace-subscription"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: SubscriptionData | null };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchStripeBillingData(customerId: string, subscriptionId: string | null) {
  const res = await fetch(accountsPath("get-billing-data"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, subscriptionId }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  const data = await res.json();
  return {
    invoices: (data?.invoices || []) as StripeBillingInvoice[],
  };
}
