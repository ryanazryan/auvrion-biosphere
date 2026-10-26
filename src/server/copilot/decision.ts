/** Pure, dependency-free request classification. Never authorizes a database read. */
export const UUID_IN_TEXT =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
export const EXACT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CopilotMode = "overview" | "observation" | "listen" | "environment";

export function classifyCopilotQuestion(
  question: string,
  requestedMode: CopilotMode,
  explicitObservationId?: string,
) {
  const observationId =
    explicitObservationId || question.match(UUID_IN_TEXT)?.[0] || null;
  const species =
    question
      .match(
        /(?:referensi spesies|taksonomi spesies)\s*:\s*([A-Za-z][A-Za-z .-]{2,78})/i,
      )?.[1]
      ?.trim() ?? null;
  const environmental =
    requestedMode === "environment" ||
    /\b(bmkg|firms|hotspot|prakiraan|cuaca|kebakaran|iklim)\b/i.test(question);
  const asksAboutObservation =
    /\b(observasi|rekaman|hasil audio|listen)\b/i.test(question);
  const useObservation =
    observationId &&
    (asksAboutObservation ||
      requestedMode === "observation" ||
      requestedMode === "listen");
  const mode: CopilotMode = useObservation
    ? requestedMode === "listen"
      ? "listen"
      : "observation"
    : environmental
      ? "environment"
      : observationId
        ? "observation"
        : requestedMode;
  return { observationId, speciesName: species, mode };
}
