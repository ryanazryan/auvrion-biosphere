import "server-only";

import { createHash } from "node:crypto";

/**
 * The Perch worker is never exposed to the browser or public network.
 * URL is deliberately fixed to IPv4 loopback to avoid SSRF / DNS rebinding.
 */
export type PerchCandidate = {
  label: string;
  scientificName: string | null;
  modelScore: number;
  startMs: number | null;
  endMs: number | null;
};
export type PerchInference = {
  status: "succeeded" | "no_candidates";
  verification: "unverified";
  provider: "Google";
  modelId: "perch-v2";
  modelVersion: string;
  candidates: PerchCandidate[];
};

export class PerchWorkerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const cleanLabel = (s: unknown): s is string =>
  typeof s === "string" &&
  s.length > 0 &&
  s.length <= 180 &&
  s.trim() === s &&
  !/\p{Cc}/u.test(s);

export function parsePerchWorkerResponse(
  input: unknown,
): PerchInference | null {
  if (
    !isObj(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          "status",
          "verification",
          "provider",
          "modelId",
          "modelVersion",
          "candidates",
        ].includes(key),
    ) ||
    (input.status !== "succeeded" && input.status !== "no_candidates") ||
    input.verification !== "unverified" ||
    input.provider !== "Google" ||
    input.modelId !== "perch-v2" ||
    !cleanLabel(input.modelVersion) ||
    !Array.isArray(input.candidates) ||
    input.candidates.length > 5 ||
    (input.status === "succeeded" && input.candidates.length === 0) ||
    (input.status === "no_candidates" && input.candidates.length !== 0)
  )
    return null;
  for (const c of input.candidates) {
    if (
      !isObj(c) ||
      Object.keys(c).some(
        (key) =>
          ![
            "label",
            "scientificName",
            "modelScore",
            "startMs",
            "endMs",
          ].includes(key),
      ) ||
      !cleanLabel(c.label) ||
      (c.scientificName !== null && !cleanLabel(c.scientificName)) ||
      typeof c.modelScore !== "number" ||
      !Number.isFinite(c.modelScore) ||
      c.modelScore < -1000 ||
      c.modelScore > 1000 ||
      c.startMs !== null ||
      c.endMs !== null
    )
      return null;
  }
  return input as PerchInference;
}

export async function inferPerchFromVerifiedWav(
  bytes: Buffer,
): Promise<PerchInference> {
  const secret = process.env.AUVRION_PERCH_WORKER_TOKEN;
  if (!secret || secret.length < 32)
    throw new PerchWorkerError("PERCH_WORKER_NOT_CONFIGURED");
  const portStr = process.env.AUVRION_PERCH_WORKER_PORT ?? "8765";
  if (!/^\d{2,5}$/.test(portStr))
    throw new PerchWorkerError("PERCH_WORKER_NOT_CONFIGURED");
  const port = Number(portStr);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new PerchWorkerError("PERCH_WORKER_NOT_CONFIGURED");
  }
  try {
    // SHA sent only over loopback for worker-side consistency checks.
    const sha = createHash("sha256").update(bytes).digest("hex");
    const response = await fetch(`http://127.0.0.1:${port}/infer`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        Authorization: `Bearer ${secret}`,
        "X-Audio-SHA256": sha,
        "Content-Length": String(bytes.length),
      },
      body: new Uint8Array(bytes),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new PerchWorkerError("PERCH_WORKER_UNAVAILABLE");
    // Bound response before parsing; never trust even a local process blindly.
    const raw = await response.text();
    if (raw.length > 16_384) throw new PerchWorkerError("PERCH_INVALID_RESULT");
    const parsed = parsePerchWorkerResponse(JSON.parse(raw) as unknown);
    if (!parsed) throw new PerchWorkerError("PERCH_INVALID_RESULT");
    return parsed;
  } catch (error) {
    if (error instanceof PerchWorkerError) throw error;
    throw new PerchWorkerError("PERCH_WORKER_UNAVAILABLE");
  }
}
