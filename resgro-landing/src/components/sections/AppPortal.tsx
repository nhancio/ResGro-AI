import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import {
  ArrowUpRight,
  Bot,
  Calendar,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Shield,
  Sparkles,
  Store,
  User,
  Users,
} from "lucide-react";
import { OperatorAgentsPanel } from "@agents";
import { SubscriptionData } from "../../hooks/useSubscription";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { getSiteOrigin } from "../../config/app";
import { formatDate, getPlanLabel } from "../../lib/format";
import { UserManagementSection } from "./UserManagementSection";
import { fetchStripeBillingData, openBillingPortal, type StripeBillingInvoice } from "../../config/stripe";

type PortalSection = "dashboard" | "agents" | "billing" | "profile" | "feedback" | "users";
type FeedbackPriority = "Product" | "Billing" | "Support";

interface AppPortalProps {
  subscription: SubscriptionData | null;
  sessionUser: WorkspaceUser | null;
  /** No active subscription — billing upsell only */
  locked?: boolean;
  skipPayments?: boolean;
  initialSection?: PortalSection;
  onLogout?: () => void;
}

const PORTAL_ITEMS: Array<{
  id: PortalSection;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Overview and usage",
    icon: LayoutDashboard,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Operator workflows",
    icon: Bot,
  },
  {
    id: "billing",
    label: "Billing",
    description: "Activation and cycle dates",
    icon: Calendar,
  },
  {
    id: "profile",
    label: "Profile",
    description: "Restaurant and user info",
    icon: User,
  },
  {
    id: "users",
    label: "Users",
    description: "Create and edit workspace logins",
    icon: Users,
  },
  {
    id: "feedback",
    label: "Feedback",
    description: "Product requests and bugs",
    icon: MessageSquare,
  },
];

function startOfLocalDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getBillingSnapshot(createdAt: string | null | undefined) {
  const activatedAt = createdAt ? new Date(createdAt) : startOfLocalDay();

  return {
    activatedAt,
    trialExpiry: addDays(activatedAt, 30),
    nextBilling: addDays(activatedAt, 31),
    cycleStart: activatedAt,
    cycleEnd: addDays(activatedAt, 30),
  };
}

export function AppPortal({
  subscription: subscriptionProp,
  sessionUser,
  locked = false,
  skipPayments = false,
  initialSection = "dashboard",
  onLogout,
}: AppPortalProps) {
  const [activeSection, setActiveSection] = useState<PortalSection>(initialSection);
  const [agentResetKey, setAgentResetKey] = useState(0);

  const portalNavItems = (skipPayments ? PORTAL_ITEMS.filter((item) => item.id !== "billing") : PORTAL_ITEMS).filter(
    (item) => {
      if (item.id === "users" && !sessionUser?.canManageUsers) return false;
      if (item.id === "billing" && !sessionUser?.canManageUsers) return false;
      return true;
    },
  );

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (skipPayments && activeSection === "billing") {
      setActiveSection("dashboard");
    }
  }, [skipPayments, activeSection]);

  useEffect(() => {
    if (activeSection === "users" && !sessionUser?.canManageUsers) {
      setActiveSection("dashboard");
    }
  }, [activeSection, sessionUser?.canManageUsers]);

  if (locked) {
    return <LockedPortalState />;
  }

  const portalSubscription = subscriptionProp;
  if (!portalSubscription) {
    return <LockedPortalState />;
  }

  const displayBusinessName =
    sessionUser?.metadata.businessName?.trim() || portalSubscription.customer.name || "Restaurant Account";
  const displayEmail = sessionUser?.email || portalSubscription.customer.email || "No customer email available";

  const planLabel = getPlanLabel(portalSubscription.subscription.planName);
  const billingDates = getBillingSnapshot(sessionUser?.createdAt || portalSubscription.subscription.trialStart);

  return (
    <div className="min-h-screen bg-[#FFF7F2] font-sans">
      <header className="sticky top-0 z-50 border-b border-[#FF6B35]/20 bg-white/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                window.location.hash = "#/app";
              }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="RESGRO Logo" className="h-7 w-auto" />
              <div className="min-w-0 text-left">
                <p className="text-lg font-bold tracking-tight text-black">
                  RES<span className="text-[#FF6B35]">GRO</span>
                </p>
                <p className="truncate text-xs text-gray-500">
                  SaaS workspace for restaurant operators
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Badge className="rounded-full border-0 bg-[#FF6B35]/10 px-3 py-1 text-[#FF6B35]">{planLabel}</Badge>
            <Button
              type="button"
              onClick={() => {
                onLogout?.();
              }}
              variant="outline"
              className="rounded-full border-gray-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-[360px]">
          <div className="rounded-3xl border border-[#FF6B35]/15 bg-white p-5 shadow-sm">
            <div className="rounded-2xl bg-gradient-to-br from-[#FFF3EB] via-white to-[#FFF7F2] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">Workspace</p>
                  <h1 className="text-xl font-bold text-black">{displayBusinessName}</h1>
                </div>
                <div className="rounded-2xl bg-[#FF6B35]/10 p-3">
                  <Store className="text-[#FF6B35]" size={20} />
                </div>
              </div>
              <p className="mb-4 text-sm text-gray-600">{displayEmail}</p>
              <div className="grid grid-cols-2 gap-3">
                <MetricPill
                  label="Status"
                  value="Active"
                />
                <MetricPill
                  label="Next charge"
                  value={formatDate(billingDates.nextBilling.toISOString())}
                />
                {sessionUser ? (
                  <MetricPill
                    label="Locations"
                    value={String(sessionUser.metadata.restaurantCount)}
                  />
                ) : null}
                {sessionUser?.metadata.region ? (
                  <MetricPill label="Region" value={sessionUser.metadata.region} />
                ) : null}
              </div>
            </div>

            <nav className="mt-5 grid gap-2">
              {portalNavItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === "agents" && activeSection === "agents") {
                        setAgentResetKey((k) => k + 1);
                      }
                      setActiveSection(item.id);
                    }}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? "border-[#FF6B35] bg-[#FF6B35]/8 shadow-sm"
                        : "border-gray-200 bg-white hover:border-[#FF6B35]/40 hover:bg-[#FFF7F2]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-xl p-2 ${isSelected ? "bg-[#FF6B35] text-white" : "bg-gray-100 text-gray-600"}`}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                    </div>
                    <ArrowUpRight className={`h-4 w-4 ${isSelected ? "text-[#FF6B35]" : "text-gray-400"}`} />
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => { window.location.hash = "#/chat"; }}
              className="mt-5 w-full flex items-center justify-between rounded-2xl border border-[#FF6B35] bg-gradient-to-r from-[#FF6B35] to-[#FF8C42] px-4 py-3.5 text-left shadow-lg shadow-[#FF6B35]/15 hover:shadow-[#FF6B35]/25 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/20 p-2">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AI Chat</p>
                  <p className="text-xs text-white/70">Ask anything about your business</p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-white/80" />
            </button>

            <div className="mt-5 rounded-2xl border border-dashed border-[#FF6B35]/30 bg-[#FFF8F4] p-4">
              <p className="text-sm font-semibold text-black">Need help?</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                Billing dates are based on the day your workspace was activated. Product requests and bugs can be sent from the feedback module.
              </p>
              <a
                href="mailto:contact@resgro.ai"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#FF6B35]"
              >
                Contact support
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {activeSection === "dashboard" && (
            <DashboardSection
              billingDates={billingDates}
              planLabel={planLabel}
              sessionUser={sessionUser}
              setActiveSection={setActiveSection}
              skipPayments={skipPayments}
              subscription={portalSubscription}
            />
          )}
          {activeSection === "agents" && <AgentsSection key={agentResetKey} />}
          {activeSection === "billing" && !skipPayments && (
            <BillingSection
              billingDates={billingDates}
              planLabel={planLabel}
              sessionUser={sessionUser}
              subscription={portalSubscription}
            />
          )}
          {activeSection === "profile" && (
            <ProfileSection
              planLabel={planLabel}
              sessionUser={sessionUser}
              subscription={portalSubscription}
              isBillingAdmin={Boolean(sessionUser?.canManageUsers)}
            />
          )}
          {activeSection === "users" && sessionUser?.canManageUsers && (
            <UserManagementSection actor={sessionUser} />
          )}
          {activeSection === "feedback" && (
            <FeedbackSection email={portalSubscription.customer.email} />
          )}
        </main>
      </div>
    </div>
  );
}

function LockedPortalState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF7F2] px-4">
      <div className="w-full max-w-lg rounded-3xl border border-[#FF6B35]/20 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF6B35]/10">
          <Lock className="text-[#FF6B35]" size={28} />
        </div>
        <h1 className="text-2xl font-bold text-black">Workspace locked</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          This portal is available once checkout completes and your subscription is active. Start from pricing, finish
          payment, then create your workspace login on the next screen.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={() => {
              window.location.hash = "#/pricing";
            }}
            variant="cta"
            className="flex-1 rounded-full"
          >
            View Pricing
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function DashboardSection({
  billingDates,
  planLabel,
  sessionUser,
  setActiveSection,
  skipPayments,
  subscription,
}: {
  billingDates: ReturnType<typeof getBillingSnapshot>;
  planLabel: string;
  sessionUser: WorkspaceUser | null;
  setActiveSection: React.Dispatch<React.SetStateAction<PortalSection>>;
  skipPayments?: boolean;
  subscription: SubscriptionData;
}) {
  const cards = [
    {
      label: "Active plan",
      value: planLabel,
      detail: "Live workspace access",
      icon: Sparkles,
    },
    {
      label: "Account activated",
      value: formatDate(billingDates.activatedAt.toISOString()),
      detail: "Workspace activation date",
      icon: Calendar,
    },
    {
      label: "Next billing date",
      value: formatDate(billingDates.nextBilling.toISOString()),
      detail: "First paid billing date",
      icon: Calendar,
    },
    {
      label: "Primary contact",
      value: sessionUser?.email || subscription.customer.email || "No email on file",
      detail: "Signed-in workspace identity",
      icon: Mail,
    },
    ...(sessionUser
      ? [
          {
            label: "Restaurant locations",
            value: String(sessionUser.metadata.restaurantCount),
            detail: sessionUser.metadata.businessName,
            icon: Store,
          } as const,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Dashboard"
        title="SaaS command center"
        description={
          skipPayments
            ? "Billing navigation is hidden in this deployment. Agents, profile, and feedback stay available."
            : "Overview for your active subscription, workspace footprint from signup, and quick links into agents, billing, and support."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className="rounded-3xl border border-white bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                <div className="rounded-xl bg-[#FF6B35]/10 p-2">
                  <Icon className="text-[#FF6B35]" size={18} />
                </div>
              </div>
              <p className="mt-4 text-lg font-bold text-black">{card.value}</p>
              <p className="mt-1 text-sm text-gray-500">{card.detail}</p>
            </div>
          );
        })}
      </div>

      <div
        className={`grid gap-6 ${skipPayments ? "" : "xl:grid-cols-[1.2fr_0.8fr]"}`}
      >
        <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-black">Workspace modules</h2>
              <p className="text-sm text-gray-500">Quick links into the new paid-app sections.</p>
            </div>
            <Badge className="rounded-full bg-[#FF6B35]/10 text-[#FF6B35]">Updated</Badge>
          </div>
          <div className={`grid gap-3 md:grid-cols-2 ${skipPayments ? "md:grid-cols-3" : ""}`}>
            <ModuleCard
              title="Agents"
              description="Analysis Engine, campaign flows, and monthly reporting for operators."
              onClick={() => setActiveSection("agents")}
            />
            {!skipPayments && sessionUser?.canManageUsers ? (
              <ModuleCard
                title="Billing"
                description="See account activation, free trial expiry, next billing date, and billing cycle."
                onClick={() => setActiveSection("billing")}
              />
            ) : null}
            <ModuleCard
              title="Profile"
              description="Restaurant operator identity, plan info, and account metadata."
              onClick={() => setActiveSection("profile")}
            />
            {sessionUser?.canManageUsers ? (
              <ModuleCard
                title="Users"
                description="Add or edit workspace logins and signup metadata."
                onClick={() => setActiveSection("users")}
              />
            ) : null}
            <ModuleCard
              title="Feedback"
              description="Capture bugs, feature requests, and billing issues from inside the app."
              onClick={() => setActiveSection("feedback")}
            />
          </div>
        </div>

        {!skipPayments && sessionUser?.canManageUsers ? (
          <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-black">Billing summary</h2>
            <div className="mt-5 grid gap-4">
              <BillingStat icon={Calendar} label="Account activated" value={formatDate(billingDates.activatedAt.toISOString())} />
              <BillingStat icon={Calendar} label="Free trial expiry" value={formatDate(billingDates.trialExpiry.toISOString())} />
              <BillingStat icon={Calendar} label="Next billing date" value={formatDate(billingDates.nextBilling.toISOString())} />
              <BillingStat
                icon={Calendar}
                label="Billing cycle"
                value={`${formatDate(billingDates.cycleStart.toISOString())} - ${formatDate(billingDates.cycleEnd.toISOString())}`}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-3xl border border-gray-100 bg-[#FFF9F6] p-5 text-left transition-all hover:border-[#FF6B35]/40 hover:bg-white"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-black">{title}</h3>
        <ArrowUpRight className="h-4 w-4 text-[#FF6B35]" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
    </button>
  );
}

function AgentsSection() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Agents"
        title="Operator agents"
        description="Run Analysis Engine, campaign setup, and monthly reporting."
      />
      <div className="rounded-3xl border border-white bg-white p-4 shadow-sm sm:p-6">
        <OperatorAgentsPanel />
      </div>
    </div>
  );
}

function BillingSection({
  billingDates,
  planLabel,
  sessionUser,
  subscription,
}: {
  billingDates: ReturnType<typeof getBillingSnapshot>;
  planLabel: string;
  sessionUser: WorkspaceUser | null;
  subscription: SubscriptionData;
}) {
  const [invoices, setInvoices] = useState<StripeBillingInvoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const planAmount = subscription.subscription.plan.amount;
  const currency = (subscription.subscription.plan.currency || "aud").toUpperCase();
  const restaurantCount = sessionUser?.metadata.restaurantCount || 1;
  const perRestaurant = restaurantCount > 0 ? planAmount / restaurantCount : planAmount;

  useEffect(() => {
    const customerId = subscription.customer.id;
    const subscriptionId = subscription.subscription.id;
    if (!customerId) return;
    setInvoiceLoading(true);
    fetchStripeBillingData(customerId, subscriptionId)
      .then((data) => setInvoices(data.invoices))
      .catch(() => setInvoices([]))
      .finally(() => setInvoiceLoading(false));
  }, [subscription.customer.id, subscription.subscription.id]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Billing"
        title="Billing & invoices"
        description="Payment summary, plan details, and invoice history from Stripe."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">Monthly total</p>
            <div className="rounded-xl bg-[#FF6B35]/10 p-2">
              <DollarSign className="text-[#FF6B35]" size={18} />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-black">${planAmount}</p>
          <p className="mt-1 text-sm text-gray-500">{currency} / month</p>
        </div>
        <div className="rounded-3xl border border-white bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">Per restaurant</p>
            <div className="rounded-xl bg-[#FF6B35]/10 p-2">
              <Store className="text-[#FF6B35]" size={18} />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-black">${perRestaurant.toFixed(2)}</p>
          <p className="mt-1 text-sm text-gray-500">{restaurantCount} location{restaurantCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-3xl border border-white bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">Active plan</p>
            <div className="rounded-xl bg-[#FF6B35]/10 p-2">
              <CreditCard className="text-[#FF6B35]" size={18} />
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-black">{planLabel}</p>
          <p className="mt-1 text-sm text-gray-500">{subscription.subscription.status}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-black">Plan details</h2>
            <p className="mt-1 text-sm text-gray-500">
              {sessionUser?.email || subscription.customer.email || "Workspace billing profile"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="w-fit rounded-full bg-[#FF6B35]/10 text-[#FF6B35]">Active</Badge>
            {subscription.customer.id && (
              <Button
                type="button"
                onClick={() => openBillingPortal(subscription.customer.id!)}
                variant="cta"
                className="rounded-full"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Manage plan
              </Button>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Upgrades, downgrades, and plan switches you make in the Stripe billing portal apply on your next billing cycle
          (or at the end of the current period), per Stripe&apos;s rules for your subscription.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <BillingStat icon={Calendar} label="Account activated" value={formatDate(billingDates.activatedAt.toISOString())} />
          <BillingStat icon={Calendar} label="Free trial expiry" value={formatDate(billingDates.trialExpiry.toISOString())} />
          <BillingStat icon={Calendar} label="Next billing date" value={formatDate(billingDates.nextBilling.toISOString())} />
          <BillingStat
            icon={Calendar}
            label="Billing cycle"
            value={`${formatDate(billingDates.cycleStart.toISOString())} - ${formatDate(billingDates.cycleEnd.toISOString())}`}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-black">Invoices</h2>
            <p className="mt-1 text-sm text-gray-500">
              Payment history and upcoming charges from Stripe.
            </p>
          </div>
          <div className="rounded-xl bg-[#FF6B35]/10 p-2">
            <FileText className="text-[#FF6B35]" size={18} />
          </div>
        </div>
        {invoiceLoading ? (
          <p className="text-sm text-gray-500">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-5">
            <p className="text-sm text-gray-500">No invoices yet. Invoices will appear here after your first billing cycle.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black">{inv.label}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {inv.date ? formatDate(inv.date) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-black">${inv.amount.toFixed(2)} {currency}</p>
                  <Badge className={`rounded-full text-xs ${inv.status === "Paid" ? "bg-green-100 text-green-700" : inv.status === "Upcoming" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                    {inv.status}
                  </Badge>
                  {inv.hostedInvoiceUrl && (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[#FF6B35] hover:text-[#FF8C42]"
                    >
                      View
                    </a>
                  )}
                  {inv.invoicePdf && (
                    <a
                      href={inv.invoicePdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-500 hover:text-[#FF6B35]"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BillingStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon size={16} />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function ProfileSection({
  planLabel,
  sessionUser,
  subscription,
  isBillingAdmin,
}: {
  planLabel: string;
  sessionUser: WorkspaceUser | null;
  subscription: SubscriptionData;
  isBillingAdmin: boolean;
}) {
  const displayName =
    sessionUser?.metadata.businessName?.trim() || subscription.customer.name || "Restaurant Operator";
  const displayEmail = sessionUser?.email || subscription.customer.email || "No email on file";

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Profile"
        title="User and restaurant account"
        description="Signed-in profile merges your workspace signup metadata with Stripe billing identity."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FF6B35]/10">
              <User className="text-[#FF6B35]" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-black">{displayName}</h2>
              <p className="text-sm text-gray-500">{displayEmail}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <ProfileRow label="Workspace" value="Paid tenant" />
            <ProfileRow label="Plan" value={planLabel} />
            {isBillingAdmin ? (
              <>
                <ProfileRow label="Subscription ID" value={subscription.subscription.id || "Not available"} />
                <ProfileRow label="Stripe customer" value={subscription.customer.id || "Not linked"} />
              </>
            ) : null}
            {sessionUser ? (
              <>
                <ProfileRow label="Locations (signup)" value={String(sessionUser.metadata.restaurantCount)} />
                {sessionUser.metadata.region ? (
                  <ProfileRow label="Region (signup)" value={sessionUser.metadata.region} />
                ) : null}
                <ProfileRow label="User admin" value={sessionUser.canManageUsers ? "Yes" : "No"} />
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-black">Account notes</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ProfileInfoCard
              icon={Mail}
              title="Delivery reports"
              description="Weekly insight summaries and billing notices should route to the primary email on the account."
            />
            <ProfileInfoCard
              icon={CreditCard}
              title="Commercial profile"
              description="Stripe customer, subscription, and invoice management now sit inside the billing module."
            />
            <ProfileInfoCard
              icon={Bot}
              title="Agents access"
              description="Operator workflows for deep dive, portal campaigns, and monthly reporting live under Agents."
            />
            <ProfileInfoCard
              icon={Shield}
              title="Support handling"
              description="Feedback and support issues can be submitted in-app and escalated over email when needed."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-black">{value}</p>
    </div>
  );
}

function ProfileInfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
      <div className="flex items-center gap-2 text-[#FF6B35]">
        <Icon size={16} />
        <p className="text-sm font-semibold text-black">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
    </div>
  );
}

function FeedbackSection({
  email,
}: {
  email: string | null;
}) {
  const [category, setCategory] = useState<FeedbackPriority>("Product");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    const mailto = new URL("mailto:contact@resgro.ai");
    mailto.searchParams.set(
      "subject",
      `[ResGro ${category}] ${subject.trim()}`
    );
    mailto.searchParams.set(
      "body",
      `${message.trim()}\n\nContext:\n- Source: Signed-in workspace\n- Contact: ${email || "Unknown"}`
    );

    window.location.href = mailto.toString();
    setSubmitted(true);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Feedback"
        title="Product requests and issue reporting"
        description="This gives users an in-app place to send bugs, billing issues, and feature ideas instead of forcing them back to email first."
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-black">What to send here</h2>
          <div className="mt-5 space-y-4">
            <FeedbackHint
              title="Product feedback"
              description="Ideas for dashboards, modules, permissions, and reporting workflows."
            />
            <FeedbackHint
              title="Billing issues"
              description="Unexpected invoices, missing customer data, or checkout problems."
            />
            <FeedbackHint
              title="Support requests"
              description="Agent run failures, portal access issues, or account clarification."
            />
          </div>
        </div>

        <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-black">Send feedback</h2>
          <p className="mt-1 text-sm text-gray-500">
            Submissions open the configured mail client so the team receives the full context immediately.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="flex flex-wrap gap-3">
              {(["Product", "Billing", "Support"] as FeedbackPriority[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    category === option
                      ? "border-[#FF6B35] bg-[#FF6B35] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-[#FF6B35]/40"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black" htmlFor="feedback-subject">
                Subject
              </label>
              <Input
                id="feedback-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Short summary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black" htmlFor="feedback-message">
                Message
              </label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, what you expected, and any business context."
                className="min-h-40"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="submit"
                variant="cta"
                className="rounded-full"
              >
                Submit Feedback
              </Button>
              <p className="text-xs text-gray-500">
                Contact context: {email || "Not available"}
              </p>
            </div>

            {submitted && (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                Feedback draft prepared. If the mail client did not open, email `contact@resgro.ai` manually.
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function FeedbackHint({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-[#FFF9F6] p-4">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
      <Badge className="rounded-full bg-[#FF6B35]/10 text-[#FF6B35]">{eyebrow}</Badge>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-black">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">{description}</p>
    </div>
  );
}
