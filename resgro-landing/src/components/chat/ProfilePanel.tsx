import React from "react";
import { User, Mail, Store, MapPin, Calendar, Shield } from "lucide-react";
import type { SubscriptionData } from "../../hooks/useSubscription";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { formatDate, getPlanLabel } from "../../lib/format";

interface ProfilePanelProps {
  subscription: SubscriptionData;
  sessionUser: WorkspaceUser;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#1e1e22] border border-[#2a2a2e]">
      <div className="w-8 h-8 rounded-lg bg-[#242428] flex items-center justify-center shrink-0">
        <Icon size={14} className="text-gray-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
        <p className="text-sm text-white mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

export function ProfilePanel({ subscription, sessionUser }: ProfilePanelProps) {
  const displayBusinessName =
    sessionUser.metadata.businessName?.trim() ||
    subscription.customer.name ||
    "Restaurant Account";
  const displayEmail = sessionUser.email || subscription.customer.email || "—";
  const planLabel = getPlanLabel(subscription.subscription.planName);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FF8C42] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#FF6B35]/20">
            <User size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">{displayBusinessName}</h1>
          <p className="text-sm text-gray-400 mt-1">{displayEmail}</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FF6B35]/15 text-[#FF6B35] mt-3">
            <Shield size={10} />
            {planLabel}
          </span>
        </div>

        {/* Info Grid */}
        <div className="space-y-2">
          <InfoRow icon={Mail} label="Email" value={displayEmail} />
          <InfoRow icon={Store} label="Business" value={displayBusinessName} />
          <InfoRow
            icon={MapPin}
            label="Locations"
            value={`${sessionUser.metadata.restaurantCount || "—"} restaurant${(sessionUser.metadata.restaurantCount || 0) > 1 ? "s" : ""}`}
          />
          {sessionUser.metadata.region && (
            <InfoRow icon={MapPin} label="Region" value={sessionUser.metadata.region} />
          )}
          {sessionUser.metadata.dob && (
            <InfoRow icon={Calendar} label="Date of Birth" value={sessionUser.metadata.dob} />
          )}
          {sessionUser.createdAt && (
            <InfoRow
              icon={Calendar}
              label="Member since"
              value={formatDate(sessionUser.createdAt)}
            />
          )}
        </div>

        {/* Workspace ID */}
        <div className="rounded-xl bg-[#1e1e22] border border-[#2a2a2e] p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">User ID</p>
          <code className="text-xs text-gray-400 font-mono break-all">{sessionUser.id}</code>
        </div>
      </div>
    </div>
  );
}
