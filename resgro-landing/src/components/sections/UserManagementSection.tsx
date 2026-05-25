import React, { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Loader2, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import type { WorkspaceUser } from "../../lib/userDirectory";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  listWorkspaceUsers,
  updateWorkspaceUser,
} from "../../lib/userDirectory";

interface UserManagementSectionProps {
  actor: WorkspaceUser;
}

export function UserManagementSection({ actor }: UserManagementSectionProps) {
  const [refresh, setRefresh] = useState(0);
  const users = useMemo(() => {
    void refresh;
    const all = listWorkspaceUsers();
    const cid = actor.stripeCustomerId;
    if (!cid) return all;
    return all.filter((u) => u.stripeCustomerId === cid);
  }, [actor.stripeCustomerId, refresh]);

  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newBusiness, setNewBusiness] = useState("");
  const [newCount, setNewCount] = useState("1");
  const [newDob, setNewDob] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<WorkspaceUser | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editBusiness, setEditBusiness] = useState("");
  const [editCount, setEditCount] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);

  const bump = () => setRefresh((n) => n + 1);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const n = Number.parseInt(newCount, 10);
    if (!newEmail.trim() || !newPassword || newPassword.length < 8) {
      setFormError("Email and password (8+ chars) are required.");
      return;
    }
    if (!newBusiness.trim() || !Number.isFinite(n) || n < 1) {
      setFormError("Business name and a valid location count are required.");
      return;
    }
    if (!newDob) {
      setFormError("Date of birth is required.");
      return;
    }
    setBusy(true);
    try {
      await createWorkspaceUser({
        email: newEmail.trim(),
        password: newPassword,
        stripeCustomerId: actor.stripeCustomerId,
        canManageUsers: false,
        metadata: {
          businessName: newBusiness.trim(),
          restaurantCount: n,
          dateOfBirth: newDob,
        },
      });
      setNewEmail("");
      setNewPassword("");
      setNewBusiness("");
      setNewCount("1");
      setNewDob("");
      setCreating(false);
      bump();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (u: WorkspaceUser) => {
    setEditing(u);
    setEditPassword("");
    setEditBusiness(u.metadata.businessName);
    setEditCount(String(u.metadata.restaurantCount));
    setEditDob(u.metadata.dateOfBirth || "");
    setEditRegion(u.metadata.region || "");
    setEditAdmin(u.canManageUsers);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    const n = Number.parseInt(editCount, 10);
    if (!editBusiness.trim() || !Number.isFinite(n) || n < 1) {
      setFormError("Invalid business name or location count.");
      return;
    }
    setBusy(true);
    try {
      await updateWorkspaceUser(editing.id, {
        password: editPassword || undefined,
        canManageUsers: editAdmin,
        metadata: {
          businessName: editBusiness.trim(),
          restaurantCount: n,
          dateOfBirth: editDob,
          region: editRegion.trim() || undefined,
        },
      });
      setEditing(null);
      bump();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (u: WorkspaceUser) => {
    if (u.id === actor.id) return;
    if (!window.confirm(`Remove access for ${u.email}?`)) return;
    deleteWorkspaceUser(u.id);
    bump();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white bg-white p-6 shadow-sm">
        <Badge className="rounded-full bg-[#FF6B35]/10 text-[#FF6B35]">Users</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black">Workspace directory</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
          Create and update people who can sign in to this workspace. Data is stored in this browser until you connect a
          backend.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-black">Accounts</h2>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-gray-300"
          onClick={() => {
            setCreating((c) => !c);
            setFormError(null);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {creating ? "Close form" : "Add user"}
        </Button>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="rounded-3xl border border-white bg-white p-6 shadow-sm space-y-4"
        >
          <h3 className="font-semibold text-black">New user</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-black">Email</label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-black">Password</label>
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-black">Business name (metadata)</label>
              <Input value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-black">Locations</label>
              <Input type="number" min={1} value={newCount} onChange={(e) => setNewCount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-black">Date of birth</label>
              <Input type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} required />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <Button type="submit" disabled={busy} variant="cta" className="rounded-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create user"}
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-black">{u.email}</TableCell>
                <TableCell>{u.metadata.businessName}</TableCell>
                <TableCell>{u.metadata.restaurantCount}</TableCell>
                <TableCell>
                  {u.canManageUsers ? (
                    <Badge className="rounded-full bg-[#FF6B35]/10 text-[#FF6B35]">Admin</Badge>
                  ) : (
                    <span className="text-sm text-gray-500">Member</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-red-600 disabled:opacity-30"
                    disabled={u.id === actor.id}
                    onClick={() => handleDelete(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <UserCog className="h-5 w-5 text-[#FF6B35]" />
              <h3 className="text-lg font-bold text-black">Edit {editing.email}</h3>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">New password (optional)</label>
                <Input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={editPassword ? 8 : 0}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Business name</label>
                <Input value={editBusiness} onChange={(e) => setEditBusiness(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Locations</label>
                <Input type="number" min={1} value={editCount} onChange={(e) => setEditCount(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Date of birth</label>
                <Input type="date" value={editDob} onChange={(e) => setEditDob(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Region</label>
                <Input value={editRegion} onChange={(e) => setEditRegion(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-black">
                <input type="checkbox" checked={editAdmin} onChange={(e) => setEditAdmin(e.target.checked)} />
                Can manage users
              </label>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} variant="cta" className="flex-1 rounded-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
