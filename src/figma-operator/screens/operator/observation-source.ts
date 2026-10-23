export function resolveObservationSourceCode(
  resolvedCode: string | undefined,
  observationCode: string,
): string {
  return resolvedCode ?? observationCode;
}
