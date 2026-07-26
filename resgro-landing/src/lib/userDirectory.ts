/**
 * Client-side workspace user directory (localStorage).
 *
 * Passwords are hashed with PBKDF2-SHA-256 (100 000 iterations) and a
 * per-user random salt.  The demo account uses a pre-computed hash so it
 * works without an async init step.
 *
 * Replace with a real backend before production.
 */

const USERS_KEY = "resgro_workspace_users";
const SESSION_USER_ID_KEY = "resgro_session_user_id";
const SESSION_EXPIRES_AT_KEY = "resgro_session_expires_at";
/** Absolute session lifetime for portal login (24 hours). */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEMO_USERNAME = "demouser@resgro.ai";
export const DEMO_PASSWORD = "demo@123";
export const DEMO_EMAIL = "demouser@resgro.ai";
export const DEMO_USER_ID = "usr_demo0000000001";
const PBKDF2_ITERATIONS = 100_000;

const DEMO_SALT = "a1b2c3d4e5f6a7b8";
const DEMO_PASSWORD_HASH = "a1b2c3d4e5f6a7b8:pbkdf2$will-be-set-on-first-run";

export type WorkspaceUserMetadata = {
  businessName: string;
  restaurantCount: number;
  region?: string;
};

export type WorkspaceUser = {
  id: string;
  email: string;
  /** "salt:hex-digest" (PBKDF2) or legacy plain SHA-256 hex */
  passwordHash: string;
  stripeCustomerId: string | null;
  paymentStatus?: "pending" | "trialing" | "active" | "past_due" | "unpaid" | "cancelled";
  canManageUsers: boolean;
  metadata: WorkspaceUserMetadata;
  createdAt: string;
};

function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2Hash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `${salt}:${bytesToHex(bits)}`;
}

async function legacySha256(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return bytesToHex(buf);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  return pbkdf2Hash(password, salt);
}

async function verifyHash(password: string, stored: string): Promise<boolean> {
  if (stored.includes(":")) {
    const [salt] = stored.split(":");
    const computed = await pbkdf2Hash(password, salt);
    return computed === stored;
  }
  const legacy = await legacySha256(password);
  return legacy === stored;
}

function readUsers(): WorkspaceUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return ensureDemoUserRecord([]);
    const parsed = JSON.parse(raw) as unknown;
    const users = Array.isArray(parsed) ? (parsed as WorkspaceUser[]) : [];
    return ensureDemoUserRecord(users);
  } catch {
    return ensureDemoUserRecord([]);
  }
}

function writeUsers(users: WorkspaceUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

let _demoHashPromise: Promise<string> | null = null;
function getDemoHash(): Promise<string> {
  if (!_demoHashPromise) {
    _demoHashPromise = pbkdf2Hash(DEMO_PASSWORD, DEMO_SALT);
  }
  return _demoHashPromise;
}

function ensureDemoUserRecord(users: WorkspaceUser[]): WorkspaceUser[] {
  const hasDemo = users.some((u) => u.id === DEMO_USER_ID || u.email.toLowerCase() === DEMO_EMAIL);
  if (hasDemo) return users;
  const demoUser: WorkspaceUser = {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    passwordHash: DEMO_PASSWORD_HASH,
    stripeCustomerId: "cus_demo_paid",
    canManageUsers: true,
    metadata: {
      businessName: "Demo Restaurant Group",
      restaurantCount: 3,
      region: "AU",
    },
    createdAt: new Date().toISOString(),
  };
  const next = [...users, demoUser];
  writeUsers(next);

  getDemoHash().then((hash) => {
    const current = readUsersRaw();
    const idx = current.findIndex((u) => u.id === DEMO_USER_ID);
    if (idx >= 0 && current[idx].passwordHash !== hash) {
      current[idx] = { ...current[idx], passwordHash: hash };
      writeUsers(current);
    }
  });

  return next;
}

function readUsersRaw(): WorkspaceUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkspaceUser[]) : [];
  } catch {
    return [];
  }
}

export function listWorkspaceUsers(): WorkspaceUser[] {
  return readUsers();
}

export function findUserByEmail(email: string): WorkspaceUser | undefined {
  const normalized = email.trim().toLowerCase();
  if (normalized === DEMO_USERNAME) {
    return readUsers().find((u) => u.id === DEMO_USER_ID);
  }
  return readUsers().find((u) => u.email.toLowerCase() === normalized);
}

export function getDemoUser(): WorkspaceUser | null {
  return readUsers().find((u) => u.id === DEMO_USER_ID) ?? null;
}

export function findUserByStripeCustomerId(customerId: string | null): WorkspaceUser | undefined {
  if (!customerId) return undefined;
  return readUsers().find((u) => u.stripeCustomerId === customerId);
}

export function getSessionUser(): WorkspaceUser | null {
  const id = localStorage.getItem(SESSION_USER_ID_KEY);
  if (!id) return null;
  const expiresRaw = localStorage.getItem(SESSION_EXPIRES_AT_KEY);
  if (expiresRaw) {
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      clearSessionUser();
      return null;
    }
  }
  return readUsers().find((u) => u.id === id) ?? null;
}

export function touchSessionExpiry() {
  if (!localStorage.getItem(SESSION_USER_ID_KEY)) return;
  localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_MAX_AGE_MS));
}

export function setSessionUserId(userId: string | null) {
  if (userId) {
    localStorage.setItem(SESSION_USER_ID_KEY, userId);
    localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_MAX_AGE_MS));
  } else {
    localStorage.removeItem(SESSION_USER_ID_KEY);
    localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
  }
}

export function clearSessionUser() {
  localStorage.removeItem(SESSION_USER_ID_KEY);
  localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
}

export async function createWorkspaceUser(input: {
  email: string;
  password: string;
  stripeCustomerId: string | null;
  metadata: WorkspaceUserMetadata;
  canManageUsers: boolean;
}): Promise<WorkspaceUser> {
  const email = input.email.trim().toLowerCase();
  if (findUserByEmail(email)) {
    throw new Error("An account with this email already exists.");
  }
  const passwordHash = await hashPassword(input.password);
  const user: WorkspaceUser = {
    id: `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    email,
    passwordHash,
    stripeCustomerId: input.stripeCustomerId,
    canManageUsers: input.canManageUsers,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

export async function updateWorkspaceUser(
  id: string,
  patch: Partial<Pick<WorkspaceUser, "email" | "stripeCustomerId" | "canManageUsers" | "metadata">> & {
    password?: string;
  },
): Promise<WorkspaceUser | null> {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  const cur = users[idx]!;
  const nextEmail = patch.email?.trim().toLowerCase() ?? cur.email;
  if (nextEmail !== cur.email && users.some((u) => u.id !== id && u.email.toLowerCase() === nextEmail)) {
    throw new Error("Another user already uses this email.");
  }
  let passwordHash = cur.passwordHash;
  if (patch.password) {
    passwordHash = await hashPassword(patch.password);
  }
  const next: WorkspaceUser = {
    ...cur,
    email: nextEmail,
    passwordHash,
    stripeCustomerId: patch.stripeCustomerId ?? cur.stripeCustomerId,
    canManageUsers: patch.canManageUsers ?? cur.canManageUsers,
    metadata: patch.metadata ? { ...cur.metadata, ...patch.metadata } : cur.metadata,
  };
  users[idx] = next;
  writeUsers(users);
  return next;
}

export function deleteWorkspaceUser(id: string): boolean {
  const users = readUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  writeUsers(next);
  if (localStorage.getItem(SESSION_USER_ID_KEY) === id) {
    clearSessionUser();
  }
  return true;
}

export async function verifyCredentials(email: string, password: string): Promise<WorkspaceUser | null> {
  const user = findUserByEmail(email);
  if (!user) return null;
  const ok = await verifyHash(password, user.passwordHash);
  if (!ok) return null;

  if (!user.passwordHash.includes(":")) {
    const upgraded = await hashPassword(password);
    const users = readUsersRaw();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = { ...users[idx], passwordHash: upgraded };
      writeUsers(users);
    }
  }

  return user;
}
