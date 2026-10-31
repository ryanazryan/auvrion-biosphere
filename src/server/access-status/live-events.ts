import "server-only";

import { Client } from "pg";

// One dedicated PG LISTEN connection per Node.js process, shared by all
// authorized applicant streams. NOTIFY delivers cross-process/cross-VPS events.
const CHANNEL = "ab_applicant_status_events";
const MAX_SUBSCRIBERS = 32;
type Signal = "changed" | "disconnected";
type Subscriber = (event: Signal) => void;
const subscribers = new Map<string, Set<Subscriber>>();
let listener: Client | null = null;
let connecting: Promise<void> | null = null;

function disconnect(candidate: Client) {
  if (listener !== candidate) return;
  listener = null;
  // The SSE endpoints close their streams; EventSource will reconnect.
  for (const callbacks of subscribers.values()) {
    for (const callback of [...callbacks]) callback("disconnected");
  }
  void candidate.end().catch(() => undefined);
}

async function ensureListening(): Promise<void> {
  if (listener) return;
  if (connecting) return connecting;
  connecting = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL_MISSING");
    const candidate = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    candidate.on("notification", (message) => {
      if (message.channel !== CHANNEL || !message.payload) return;
      // The payload is an application UUID, never an email, token or user data.
      const callbacks = subscribers.get(message.payload);
      if (!callbacks) return;
      for (const callback of [...callbacks]) callback("changed");
    });
    candidate.on("error", () => disconnect(candidate));
    candidate.on("end", () => disconnect(candidate));
    try {
      await candidate.connect();
      await candidate.query(`LISTEN ${CHANNEL}`);
      listener = candidate;
    } catch (error) {
      void candidate.end().catch(() => undefined);
      throw error;
    }
  })();
  try {
    await connecting;
  } finally {
    connecting = null;
  }
}

export async function subscribeApplicantStatus(
  applicationId: string,
  callback: Subscriber,
): Promise<() => void> {
  let count = 0;
  for (const callbacks of subscribers.values()) count += callbacks.size;
  if (count >= MAX_SUBSCRIBERS) throw new Error("STREAM_LIMIT_REACHED");
  await ensureListening();
  const callbacks = subscribers.get(applicationId) ?? new Set<Subscriber>();
  callbacks.add(callback);
  subscribers.set(applicationId, callbacks);
  return () => {
    callbacks.delete(callback);
    if (!callbacks.size) subscribers.delete(applicationId);
  };
}
