import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { subscribeApplicantStatus } from "@/server/access-status/live-events";
import {
  STATUS_COOKIE_NAME,
  verifyStatusSessionValue,
} from "@/server/access-status/tokens";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!onboardingEnabled(process.env))
    return new Response(null, { status: 404 });

  // SSE is read-only, uses the existing signed applicant-status cookie, and
  // never returns application data, roles, or the application ID to the browser.
  const cookieStore = await cookies();
  const applicationId = verifyStatusSessionValue(
    cookieStore.get(STATUS_COOKIE_NAME)?.value,
  );
  if (!applicationId) return new Response(null, { status: 401 });

  try {
    const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
    if (new URL(request.url).origin !== origin) {
      return new Response(null, { status: 403 });
    }
    const [application] = await getDb()
      .select({ id: accessApplications.id })
      .from(accessApplications)
      .where(eq(accessApplications.id, applicationId))
      .limit(1);
    if (!application) return new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 503 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let abortListener: (() => void) | null = null;

  function send(chunk: string) {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      close();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    if (abortListener)
      request.signal.removeEventListener("abort", abortListener);
    try {
      controllerRef?.close();
    } catch {
      // Stream may have already been cancelled by the client.
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      abortListener = close;
      request.signal.addEventListener("abort", close, { once: true });
      // SSE keepalives preserve the connection; they NEVER refresh the page.
      heartbeat = setInterval(() => send(": keepalive\n\n"), 25_000);
      void (async () => {
        try {
          const cleanup = await subscribeApplicantStatus(
            applicationId,
            (event) => {
              if (event === "changed") send("event: changed\ndata: {}\n\n");
              else close();
            },
          );
          if (closed) {
            cleanup();
            return;
          }
          unsubscribe = cleanup;
          send("retry: 3000\nevent: ready\ndata: {}\n\n");
        } catch {
          close();
        }
      })();
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
