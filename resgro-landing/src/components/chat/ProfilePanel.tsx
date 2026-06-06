import React, { useState } from "react";
import {
  User,
  Mail,
  Store,
  MapPin,
  Calendar,
  Shield,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { SubscriptionData } from "../../hooks/useSubscription";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { formatDate, getPlanLabel } from "../../lib/format";
import { apiUpdateProfile } from "../../config/authApi";
import { syncUserToLocal } from "../../hooks/usePortalAuth";

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

function EditRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#1e1e22] border border-[#FF6B35]/30">
      <div className="w-8 h-8 rounded-lg bg-[#242428] flex items-center justify-center shrink-0">
        <Icon size={14} className="text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</p>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-[#16161a] border border-[#2a2a2e] text-sm text-white focus:outline-none focus:border-[#FF6B35]/50 transition-colors [color-scheme:dark]";

export function ProfilePanel({ subscription, sessionUser }: ProfilePanelProps) {
  // Local copy so edits reflect immediately (also synced to localStorage).
  const [user, setUser] = useState<WorkspaceUser>(sessionUser);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [businessName, setBusinessName] = useState(user.metadata.businessName || "");
  const [restaurantCount, setRestaurantCount] = useState(user.metadata.restaurantCount || 1);
  const [region, setRegion] = useState(user.metadata.region || "");

  const displayBusinessName =
    user.metadata.businessName?.trim() || subscription.customer.name || "Restaurant Account";
  const displayEmail = user.email || subscription.customer.email || "—";
  const planLabel = getPlanLabel(subscription.subscription.planName);

  const startEditing = () => {
    setBusinessName(user.metadata.businessName || "");
    setRestaurantCount(user.metadata.restaurantCount || 1);
    setRegion(user.metadata.region || "");
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!businessName.trim()) {
      setError("Business name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await apiUpdateProfile({
        userId: user.id,
        businessName: businessName.trim(),
        restaurantCount: Math.max(1, Number(restaurantCount) || 1),
        region: region.trim(),
      });
      const merged: WorkspaceUser = {
        ...user,
        ...updated,
        metadata: { ...user.metadata, ...updated.metadata },
      };
      setUser(merged);
      syncUserToLocal(merged);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

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

        {/* Edit toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Profile details
          </span>
          {!editing ? (
            <button
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] text-xs font-medium hover:bg-[#FF6B35]/25 transition-colors"
            >
              <Pencil size={12} />
              Edit profile
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2e] text-gray-300 text-xs font-medium hover:bg-[#242428] transition-colors"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6B35] text-white text-xs font-medium hover:bg-[#FF8C42] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save changes
              </button>
            </div>
          )}
        </div>

        {saved && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400">
            Profile updated successfully.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Info Grid */}
        <div className="space-y-2">
          <InfoRow icon={Mail} label="Email" value={displayEmail} />

          {editing ? (
            <>
              <EditRow icon={Store} label="Business">
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className={inputCls}
                  placeholder="Business name"
                />
              </EditRow>
              <EditRow icon={MapPin} label="Locations">
                <input
                  type="number"
                  min={1}
                  value={restaurantCount}
                  onChange={(e) => setRestaurantCount(Number(e.target.value))}
                  className={inputCls}
                />
              </EditRow>
              <EditRow icon={MapPin} label="Region">
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. AU, US"
                />
              </EditRow>
            </>
          ) : (
            <>
              <InfoRow icon={Store} label="Business" value={displayBusinessName} />
              <InfoRow
                icon={MapPin}
                label="Locations"
                value={`${user.metadata.restaurantCount || "—"} restaurant${(user.metadata.restaurantCount || 0) > 1 ? "s" : ""}`}
              />
              {user.metadata.region && (
                <InfoRow icon={MapPin} label="Region" value={user.metadata.region} />
              )}
              {user.createdAt && (
                <InfoRow icon={Calendar} label="Member since" value={formatDate(user.createdAt)} />
              )}
            </>
          )}
        </div>

        {/* Workspace ID */}
        <div className="rounded-xl bg-[#1e1e22] border border-[#2a2a2e] p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">User ID</p>
          <code className="text-xs text-gray-400 font-mono break-all">{user.id}</code>
        </div>
      </div>
    </div>
  );
}
