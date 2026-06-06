/**
 * Shared upload + agent-run workflow for chat UI and OperatorAgentsPanel.
 * Large files → GCS signed URLs; long agent runs → extended timeouts (up to ~55 min).
 */
import { resolveAgentsApiUrl } from "./agentsApi";
import {
  shouldUseGcsUpload,
  uploadFilesViaGcs,
  type GcsObjectRef,
} from "./gcsUpload";

export const TIMEOUT_QUICK_MS = 2 * 60 * 1000;
export const TIMEOUT_UPLOAD_MS = 45 * 60 * 1000;
export const TIMEOUT_AGENT_RUN_MS = 55 * 60 * 1000;

export function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg || "");
        }
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return fallback;
}

export type FetchTimeoutKind = "quick" | "upload" | "agent_run" | "none";

function timeoutForKind(kind: FetchTimeoutKind): number | undefined {
  switch (kind) {
    case "quick":
      return TIMEOUT_QUICK_MS;
    case "upload":
      return TIMEOUT_UPLOAD_MS;
    case "agent_run":
      return TIMEOUT_AGENT_RUN_MS;
    case "none":
      return undefined;
    default:
      return TIMEOUT_QUICK_MS;
  }
}

function timeoutErrorMessage(kind: FetchTimeoutKind): string {
  switch (kind) {
    case "upload":
      return "Upload or ingest timed out. Very large files can take 10–20 minutes — keep this tab open and try again.";
    case "agent_run":
      return "Agent run timed out (limit ~55 minutes). Try a smaller date range in your export, or run one agent at a time.";
    default:
      return "Request timed out. Please try again.";
  }
}

export async function fetchAgentsApi(
  path: string,
  init: RequestInit & { timeoutKind?: FetchTimeoutKind; timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutKind = "quick", timeoutMs, ...rest } = init;
  const ms = timeoutMs ?? timeoutForKind(timeoutKind);
  const controller = ms ? new AbortController() : null;
  const timer =
    ms && controller
      ? window.setTimeout(() => controller.abort(), ms)
      : undefined;
  try {
    return await fetch(resolveAgentsApiUrl(path), {
      ...rest,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(timeoutErrorMessage(timeoutKind));
    }
    throw err;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export async function uploadFilesToSession(
  files: File[],
  options: {
    operatorId?: string;
    operatorName?: string;
    dateRange?: string;
    onProgress?: (message: string) => void;
  } = {},
): Promise<string> {
  const result = await createDataSession(files, options);
  const sid = result.session_id || result.id;
  if (!sid) throw new Error("No session ID returned from upload");
  return String(sid);
}

/** Same as uploadFilesToSession but returns the full session-creation result
 *  (including generic-analysis fallback payloads for unrecognized files). */
export async function createDataSession(
  files: File[],
  options: {
    operatorId?: string;
    operatorName?: string;
    dateRange?: string;
    onProgress?: (message: string) => void;
  } = {},
): Promise<Record<string, any>> {
  const operatorId = options.operatorId ?? "chat-upload";
  const operatorName = options.operatorName ?? "Chat Upload";
  const onProgress = options.onProgress;

  if (shouldUseGcsUpload(files)) {
    onProgress?.("Uploading large files to cloud storage…");
    const { objects } = await uploadFilesViaGcs(files, onProgress);
    onProgress?.("Processing uploaded data on server…");
    const resp = await fetchAgentsApi("/api/sessions/from-gcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_id: operatorId,
        operator_name: operatorName,
        date_range: options.dateRange ?? "",
        objects,
      }),
      timeoutKind: "upload",
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(
        formatApiErrorDetail(
          (e as { detail?: unknown }).detail,
          `Upload failed: ${resp.status}`,
        ),
      );
    }
    return (await resp.json()) as Record<string, any>;
  }

  const fd = new FormData();
  fd.append("operator_id", operatorId);
  fd.append("operator_name", operatorName);
  fd.append("mode", "manual");
  if (options.dateRange) fd.append("date_range", options.dateRange);
  for (const f of files) {
    fd.append(f.name.endsWith(".zip") ? "zip_files" : "csv_files", f);
  }
  const resp = await fetchAgentsApi("/api/sessions", {
    method: "POST",
    body: fd,
    timeoutKind: "upload",
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(
      formatApiErrorDetail(
        (e as { detail?: unknown }).detail,
        `Upload failed: ${resp.status}`,
      ),
    );
  }
  return (await resp.json()) as Record<string, any>;
}

export async function runSessionAgent(
  sessionId: string,
  agentSlug: string,
  options: { operatorId?: string } = {},
): Promise<Record<string, unknown>> {
  const resp = await fetchAgentsApi(
    `/api/sessions/${encodeURIComponent(sessionId)}/run/${agentSlug}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_id: options.operatorId ?? "chat-upload",
      }),
      timeoutKind: "agent_run",
    },
  );
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    const detail = formatApiErrorDetail(
      (e as { detail?: unknown }).detail,
      `Agent run failed: ${resp.status}`,
    );
    if (resp.status === 503) {
      throw new Error(
        detail ||
          "Agent server unavailable (may be out of memory). Retry in a minute.",
      );
    }
    throw new Error(detail);
  }
  return (await resp.json()) as Record<string, unknown>;
}

/** Upload + run in one call for session-based agents (DeepDive, Marketing, etc.). */
export async function uploadAndRunSessionAgent(
  files: File[],
  agentSlug: string,
  options: {
    operatorId?: string;
    operatorName?: string;
    onProgress?: (message: string) => void;
  } = {},
): Promise<{ sessionId: string; result: Record<string, unknown> }> {
  const sessionId = await uploadFilesToSession(files, options);
  options.onProgress?.(
    `Running ${agentSlug.replace(/-/g, " ")}… This may take several minutes. Do not close this tab.`,
  );
  const result = await runSessionAgent(sessionId, agentSlug, {
    operatorId: options.operatorId,
  });
  return { sessionId, result };
}

export type MonthlyReporterGcsBody = ReturnType<typeof buildMonthlyReporterGcsBody>;

export function classifyMonthlyReporterFilename(
  name: string,
): "dd" | "ue" | "marketing" {
  const n = name.toUpperCase();
  if (n.includes("MARKETING")) return "marketing";
  if (
    n.includes("FINANCIAL") ||
    n.includes("DD-DATA") ||
    n.includes("DOORDASH") ||
    n.startsWith("DD_")
  ) {
    return "dd";
  }
  if (
    n.includes("UBER") ||
    n.includes("UNITED_STATES") ||
    n.startsWith("UE") ||
    n.includes("UE-") ||
    n.includes("UE_")
  ) {
    return "ue";
  }
  return "dd";
}

export function buildMonthlyReporterGcsBody(objects: GcsObjectRef[]) {
  let ddObject: GcsObjectRef | undefined;
  let ueObject: GcsObjectRef | undefined;
  const marketingObjects: GcsObjectRef[] = [];

  for (const obj of objects) {
    const kind = classifyMonthlyReporterFilename(obj.filename);
    if (kind === "marketing") {
      marketingObjects.push(obj);
    } else if (kind === "ue") {
      if (!ueObject) ueObject = obj;
      else marketingObjects.push(obj);
    } else if (!ddObject) {
      ddObject = obj;
    } else if (!ueObject) {
      ueObject = obj;
    } else {
      marketingObjects.push(obj);
    }
  }

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const range = (a: Date, b: Date) => `${fmt(a)} - ${fmt(b)}`;
  const now = new Date();
  const postEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const postStart = new Date(postEnd.getFullYear(), postEnd.getMonth(), 1);
  const preEnd = new Date(postStart.getFullYear(), postStart.getMonth(), 0);
  const preStart = new Date(preEnd.getFullYear(), preEnd.getMonth(), 1);

  return {
    operator_id: "chat-upload",
    operator_name: "Chat Upload",
    pre_range: range(preStart, preEnd),
    post_range: range(postStart, postEnd),
    dd_object: ddObject,
    ue_object: ueObject,
    marketing_objects: marketingObjects,
  };
}

export function appendMonthlyReporterFormFiles(fd: FormData, uploadFiles: File[]) {
  let ddSet = false;
  let ueSet = false;
  for (const f of uploadFiles) {
    const kind = classifyMonthlyReporterFilename(f.name);
    if (kind === "marketing") {
      fd.append("marketing_files", f);
    } else if (kind === "ue") {
      if (!ueSet) {
        fd.append("ue_file", f);
        ueSet = true;
      } else {
        fd.append("marketing_files", f);
      }
    } else if (!ddSet) {
      fd.append("dd_file", f);
      ddSet = true;
    } else if (!ueSet) {
      fd.append("ue_file", f);
      ueSet = true;
    } else {
      fd.append("marketing_files", f);
    }
  }
}

export async function runMonthlyReporterWithFiles(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  if (files.some((f) => f.name.toLowerCase().endsWith(".zip"))) {
    throw new Error(
      "Monthly Report expects CSV files, not ZIP archives. Unzip your exports first.",
    );
  }

  if (shouldUseGcsUpload(files)) {
    onProgress?.("Uploading large files to cloud storage…");
    const { objects } = await uploadFilesViaGcs(files, onProgress);
    onProgress?.("Generating monthly report… This may take several minutes.");
    const resp = await fetchAgentsApi("/api/runs/monthly-reporter/from-gcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildMonthlyReporterGcsBody(objects)),
      timeoutKind: "agent_run",
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(
        formatApiErrorDetail(
          (e as { detail?: unknown }).detail,
          `Report failed: ${resp.status}`,
        ),
      );
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  const fd = new FormData();
  fd.append("operator_id", "chat-upload");
  fd.append("operator_name", "Chat Upload");
  const body = buildMonthlyReporterGcsBody([]);
  fd.append("pre_range", body.pre_range);
  fd.append("post_range", body.post_range);
  appendMonthlyReporterFormFiles(fd, files);

  onProgress?.("Generating monthly report…");
  const resp = await fetchAgentsApi("/api/runs/monthly-reporter", {
    method: "POST",
    body: fd,
    timeoutKind: "agent_run",
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(
      formatApiErrorDetail(
        (e as { detail?: unknown }).detail,
        `Report failed: ${resp.status}`,
      ),
    );
  }
  return (await resp.json()) as Record<string, unknown>;
}

/** Standalone marketing reco (Operator panel) with GCS for large financial file. */
export async function runMarketingRecoStandalone(
  operatorId: string,
  financialFile: File,
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  if (shouldUseGcsUpload([financialFile])) {
    onProgress?.("Uploading financial file to cloud storage…");
    const { objects } = await uploadFilesViaGcs([financialFile], onProgress);
    onProgress?.("Running marketing recommendations… This may take several minutes.");
    const resp = await fetchAgentsApi("/api/runs/marketingreco/from-gcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_id: operatorId,
        mode: "manual",
        financial_object: objects[0],
      }),
      timeoutKind: "agent_run",
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(
        formatApiErrorDetail(
          (e as { detail?: unknown }).detail,
          `Marketing reco failed: ${resp.status}`,
        ),
      );
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  const fd = new FormData();
  fd.append("operator_id", operatorId);
  fd.append("mode", "manual");
  fd.append("financial_file", financialFile);
  const resp = await fetchAgentsApi("/api/runs/marketingreco", {
    method: "POST",
    body: fd,
    timeoutKind: "agent_run",
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(
      formatApiErrorDetail(
        (e as { detail?: unknown }).detail,
        `Marketing reco failed: ${resp.status}`,
      ),
    );
  }
  return (await resp.json()) as Record<string, unknown>;
}

/** Standalone DeepDive (Operator panel) with GCS for large zip uploads. */
export async function runDeepDiveWithFiles(
  operatorId: string,
  files: File[],
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  if (shouldUseGcsUpload(files)) {
    onProgress?.("Uploading large files to cloud storage…");
    const { objects } = await uploadFilesViaGcs(files, onProgress);
    onProgress?.("Running DeepDive analysis… This may take several minutes.");
    const resp = await fetchAgentsApi("/api/runs/deepdive/from-gcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operator_id: operatorId, objects }),
      timeoutKind: "agent_run",
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(
        formatApiErrorDetail(
          (e as { detail?: unknown }).detail,
          `DeepDive failed: ${resp.status}`,
        ),
      );
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  const fd = new FormData();
  fd.append("operator_id", operatorId);
  for (const f of files) fd.append("zip_files", f);
  onProgress?.("Running DeepDive analysis…");
  const resp = await fetchAgentsApi("/api/runs/deepdive", {
    method: "POST",
    body: fd,
    timeoutKind: "agent_run",
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(
      formatApiErrorDetail(
        (e as { detail?: unknown }).detail,
        `DeepDive failed: ${resp.status}`,
      ),
    );
  }
  return (await resp.json()) as Record<string, unknown>;
}

/** Standalone campaign review (Operator panel) with GCS for large marketing exports. */
export async function runCampaignReviewWithFiles(
  operatorId: string,
  files: File[],
  options: { dataDir?: string } = {},
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  if (shouldUseGcsUpload(files)) {
    onProgress?.("Uploading marketing files to cloud storage…");
    const { objects } = await uploadFilesViaGcs(files, onProgress);
    onProgress?.("Running campaign review… This may take several minutes.");
    const resp = await fetchAgentsApi("/api/runs/campaign-review/from-gcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_id: operatorId,
        mode: "manual",
        data_dir: options.dataDir?.trim() || "",
        objects,
      }),
      timeoutKind: "agent_run",
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(
        formatApiErrorDetail(
          (e as { detail?: unknown }).detail,
          `Campaign review failed: ${resp.status}`,
        ),
      );
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  const fd = new FormData();
  fd.append("operator_id", operatorId);
  fd.append("mode", "manual");
  if (options.dataDir?.trim()) fd.append("data_dir", options.dataDir.trim());
  for (const f of files) fd.append("marketing_files", f);
  onProgress?.("Running campaign review…");
  const resp = await fetchAgentsApi("/api/runs/campaign-review", {
    method: "POST",
    body: fd,
    timeoutKind: "agent_run",
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(
      formatApiErrorDetail(
        (e as { detail?: unknown }).detail,
        `Campaign review failed: ${resp.status}`,
      ),
    );
  }
  return (await resp.json()) as Record<string, unknown>;
}
