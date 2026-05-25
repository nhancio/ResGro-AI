import React, { useEffect, useState } from "react";
import {
  CreditCard,
  Calendar,
  DollarSign,
  ExternalLink,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { SubscriptionData } from "../../hooks/useSubscription";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { formatDate, getPlanLabel } from "../../lib/format";
import {
  openBillingPortal,
  fetchStripeBillingData,
  type StripeBillingInvoice,
} from "../../config/stripe";

interface BillingPanelProps {
  subscription: SubscriptionData;
  sessionUser: WorkspaceUser;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const STATUS_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Paid: CheckCircle2,
  Upcoming: Clock,
  Draft: Clock,
  Open: AlertCircle,
};

export function BillingPanel({ subscription, sessionUser }: BillingPanelProps) {
  const [invoices, setInvoices] = useState<StripeBillingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const planLabel = getPlanLabel(subscription.subscription.planName);
  const status = subscription.subscription.status || "unknown";
  const activatedAt = new Date(
    sessionUser.createdAt || subscription.subscription.trialStart || Date.now(),
  );
  const nextBilling = addDays(activatedAt, 31);
  const amount = subscription.subscription.plan.amount;
  const currency = subscription.subscription.plan.currency.toUpperCase();
  const interval = subscription.subscription.plan.interval;

  useEffect(() => {
    const customerId = subscription.customer.id;
    const subId = subscription.subscription.id;
    if (!customerId) return;
    setLoading(true);
    fetchStripeBillingData(customerId, subId)
      .then((data) => setInvoices(data.invoices))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subscription]);

  const handlePortal = async () => {
    if (!subscription.customer.id) return;
    setPortalLoading(true);
    await openBillingPortal(subscription.customer.id);
    setPortalLoading(false);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <CreditCard size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Billing</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your subscription and invoices</p>
        </div>

        {/* Plan Card */}
        <div className="rounded-2xl border border-[#2a2a2e] bg-[#1e1e22] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2a2e] bg-[#242428]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Current Plan
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  status === "active" || status === "trialing"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {status}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{planLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#242428] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign size={11} className="text-gray-500" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Price</span>
                </div>
                <p className="text-sm font-medium text-white">
                  ${amount} {currency}/{interval}
                </p>
              </div>
              <div className="rounded-xl bg-[#242428] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar size={11} className="text-gray-500" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Next billing
                  </span>
                </div>
                <p className="text-sm font-medium text-white">
                  {formatDate(nextBilling.toISOString())}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Manage Subscription */}
        <button
          onClick={handlePortal}
          disabled={portalLoading || !subscription.customer.id}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FF6B35] hover:bg-[#FF8C42] disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          {portalLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ExternalLink size={16} />
          )}
          Manage Subscription
        </button>

        {/* Invoices */}
        <div className="rounded-2xl border border-[#2a2a2e] bg-[#1e1e22] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2a2e] bg-[#242428]">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Invoice History
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-500" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-gray-500">No invoices yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a2e]">
              {invoices.map((inv) => {
                const StatusIcon = STATUS_ICONS[inv.status] || Clock;
                return (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#242428] transition-colors">
                    <StatusIcon
                      size={14}
                      className={
                        inv.status === "Paid"
                          ? "text-emerald-400"
                          : inv.status === "Upcoming"
                            ? "text-amber-400"
                            : "text-gray-500"
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{inv.label}</p>
                      {inv.date && (
                        <p className="text-[10px] text-gray-500">{formatDate(inv.date)}</p>
                      )}
                    </div>
                    <span className="text-sm font-medium text-white">
                      ${(inv.amount / 100).toFixed(2)}
                    </span>
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-[#FF6B35] hover:bg-[#333338] transition-colors"
                      >
                        <FileText size={12} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
