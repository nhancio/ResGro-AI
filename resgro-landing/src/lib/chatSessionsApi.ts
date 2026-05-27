import { getApiBaseUrl } from "../config/app";

function accountsPath(path: string): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/api/accounts/${path}`;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(accountsPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface RemoteMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  agent?: string | null;
  files?: string[];
  agentResult?: unknown;
  process?: unknown;
}

export interface RemoteSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: RemoteMessage[];
}

export async function apiListChatSessions(
  userId: string,
): Promise<SessionSummary[]> {
  const data = await post<{ sessions: SessionSummary[] }>(
    "chat-sessions/list",
    { userId },
  );
  return data.sessions;
}

export async function apiGetChatSession(
  userId: string,
  sessionId: string,
): Promise<RemoteSession> {
  const data = await post<{ session: RemoteSession }>(
    "chat-sessions/get",
    { userId, sessionId },
  );
  return data.session;
}

export async function apiSaveChatSession(
  userId: string,
  session: { id: string; title: string; messages: RemoteMessage[] },
): Promise<void> {
  await post("chat-sessions/save", { userId, session });
}

export async function apiDeleteChatSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  await post("chat-sessions/delete", { userId, sessionId });
}
