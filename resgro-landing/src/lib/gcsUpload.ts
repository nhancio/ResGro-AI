import { resolveAgentsApiUrl } from "./agentsApi";

/** Match backend / Cloud Run direct multipart limit. Local dev has no body limit. */
export const DIRECT_UPLOAD_MAX_BYTES = import.meta.env.DEV
  ? 500 * 1024 * 1024
  : 30 * 1024 * 1024;

const GCS_PUT_TIMEOUT_MS = 45 * 60 * 1000;
const GCS_API_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Cloud upload timed out. Keep this tab open and try again with a stable connection.",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface GcsObjectRef {
  object_path: string;
  filename: string;
}

export interface UploadsStatus {
  enabled: boolean;
  bucket: string | null;
  direct_upload_max_bytes: number;
  gcs_max_bytes_per_file: number;
}

export function shouldUseGcsUpload(files: File[]): boolean {
  if (files.some((f) => f.size > DIRECT_UPLOAD_MAX_BYTES)) return true;
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return total > DIRECT_UPLOAD_MAX_BYTES;
}

export function assertDirectUploadSizeWithinLimit(files: File[]) {
  for (const f of files) {
    if (f.size > DIRECT_UPLOAD_MAX_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      throw new Error(
        `File "${f.name}" is ${mb} MB (over direct upload limit). Large-file cloud upload should be used — refresh the page if this persists.`,
      );
    }
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > DIRECT_UPLOAD_MAX_BYTES) {
    const mb = (total / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Upload too large (${mb} MB total) for direct upload. Use cloud storage upload (automatic for large files).`,
    );
  }
}

let uploadsStatusCache: { at: number; value: UploadsStatus } | null = null;

export async function fetchUploadsStatus(): Promise<UploadsStatus> {
  const now = Date.now();
  if (uploadsStatusCache && now - uploadsStatusCache.at < 60_000) {
    return uploadsStatusCache.value;
  }
  const resp = await fetchWithTimeout(
    resolveAgentsApiUrl("/api/uploads/status"),
    {},
    GCS_API_TIMEOUT_MS,
  );
  if (!resp.ok) {
    return {
      enabled: false,
      bucket: null,
      direct_upload_max_bytes: DIRECT_UPLOAD_MAX_BYTES,
      gcs_max_bytes_per_file: 2 * 1024 * 1024 * 1024,
    };
  }
  const value = (await resp.json()) as UploadsStatus;
  uploadsStatusCache = { at: now, value };
  return value;
}

export async function uploadFilesViaGcs(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<{ upload_id: string; objects: GcsObjectRef[] }> {
  const status = await fetchUploadsStatus();
  if (!status.enabled) {
    throw new Error(
      "Large file uploads are not configured on the server yet. Ask your admin to run ./scripts/setup-gcs-uploads.sh and redeploy agents.",
    );
  }

  for (const f of files) {
    if (f.size > status.gcs_max_bytes_per_file) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      const cap = (status.gcs_max_bytes_per_file / (1024 * 1024)).toFixed(0);
      throw new Error(`File "${f.name}" is ${mb} MB. Maximum allowed is ${cap} MB.`);
    }
  }

  onProgress?.("Requesting secure upload URLs…");
  const signResp = await fetchWithTimeout(
    resolveAgentsApiUrl("/api/uploads/sign"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: files.map((f) => ({
          filename: f.name,
          content_type: f.type || "application/octet-stream",
          size_bytes: f.size,
        })),
      }),
    },
    GCS_API_TIMEOUT_MS,
  );
  if (!signResp.ok) {
    const err = await signResp.json().catch(() => ({}));
    const detail = (err as { detail?: string }).detail || signResp.statusText;
    throw new Error(detail || `Failed to sign upload URLs (${signResp.status})`);
  }

  const signed = (await signResp.json()) as {
    upload_id: string;
    files: Array<{
      filename: string;
      object_path: string;
      upload_url: string;
      content_type: string;
    }>;
  };

  const byName = new Map(files.map((f) => [f.name, f]));
  let index = 0;
  for (const spec of signed.files) {
    index += 1;
    const file = byName.get(spec.filename);
    if (!file) {
      throw new Error(`Signed URL missing for ${spec.filename}`);
    }
    onProgress?.(
      `Uploading ${spec.filename} to cloud storage (${index}/${signed.files.length})…`,
    );
    const putResp = await fetchWithTimeout(
      spec.upload_url,
      {
        method: "PUT",
        headers: { "Content-Type": spec.content_type },
        body: file,
      },
      GCS_PUT_TIMEOUT_MS,
    );
    if (!putResp.ok) {
      throw new Error(
        `Cloud upload failed for ${spec.filename} (${putResp.status}). Check bucket CORS allows PUT from this site.`,
      );
    }
  }

  return {
    upload_id: signed.upload_id,
    objects: signed.files.map((f) => ({
      object_path: f.object_path,
      filename: f.filename,
    })),
  };
}
