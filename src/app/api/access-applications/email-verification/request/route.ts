import { issueVerificationEmail } from "@/server/access-verification/issue";
import {
  isAllowedOnboardingOrigin,
  onboardingEnabled,
} from "@/server/account-activation/onboarding-environment";
import { consumeOnboardingBudget } from "@/server/account-activation/public-rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

const responseHeaders = {
  "Cache-Control": "no-store",
};

function accepted() {
  return Response.json(
    {
      message:
        "Jika permohonan memenuhi syarat, email verifikasi akan dikirim.",
    },
    {
      status: 202,
      headers: responseHeaders,
    },
  );
}

function reject(error: string, status: number) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

function isLocalRequestAllowed(request: Request): boolean {
  return isAllowedOnboardingOrigin(request, process.env);
}

async function readEmail(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();

  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    const body: unknown = JSON.parse(text);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !("email" in body) ||
      typeof body.email !== "string"
    ) {
      return null;
    }

    const email = body.email.trim().toLowerCase();

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return null;
    }

    return email;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!onboardingEnabled(process.env)) {
    return reject("NOT_AVAILABLE", 404);
  }

  if (!isLocalRequestAllowed(request)) {
    return reject("INVALID_ORIGIN", 403);
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return reject("INVALID_CONTENT_TYPE", 415);
  }

  const email = await readEmail(request);

  if (!email) {
    return reject("INVALID_INPUT", 400);
  }

  // Unknown emails and rate-limited requests receive identical 202s.
  try {
    if (await consumeOnboardingBudget(request, "verification-email", email)) {
      await issueVerificationEmail(email);
    }
  } catch {
    console.error("Applicant email dispatch unavailable");
  }

  return accepted();
}
