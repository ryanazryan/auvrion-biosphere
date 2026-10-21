/** WC-012 human-led Case intake: creates Received, never approves a transition. */
export type CaseIntakeInput = {
  organizationId: string;
  observationId: string;
  title: string;
  reason: string;
};

export class CaseIntakeFailure extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
  ) {
    super(code);
  }
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.trim().length <= max &&
  Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 || code === 9 || code === 10 || code === 13;
  });

export function parseCaseIntakeInput(raw: unknown): CaseIntakeInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CaseIntakeFailure(400, "INVALID_CASE_INTAKE");
  }
  const p = raw as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (key) =>
        !["organizationId", "observationId", "title", "reason"].includes(key),
    ) ||
    typeof p.organizationId !== "string" ||
    !uuid.test(p.organizationId) ||
    typeof p.observationId !== "string" ||
    !uuid.test(p.observationId) ||
    !safeText(p.title, 5, 160) ||
    !safeText(p.reason, 10, 2000)
  ) {
    throw new CaseIntakeFailure(400, "INVALID_CASE_INTAKE");
  }
  return {
    organizationId: p.organizationId,
    observationId: p.observationId,
    title: p.title.trim(),
    reason: p.reason.trim(),
  };
}
