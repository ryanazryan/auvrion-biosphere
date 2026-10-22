/** AB-WC-013 Slice 00 — read-only scoped Ranger task query input. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QueryResult =
  | { ok: true; organizationId: string; limit: number }
  | { ok: false; error: string };

export type DetailQueryResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

export function isTaskUuid(input: unknown): input is string {
  return typeof input === "string" && UUID.test(input);
}

export function parseRangerTasksQuery(params: URLSearchParams): QueryResult {
  const organizationId = params.get("organizationId");
  const countOrg = params.getAll("organizationId").length;
  const countLimit = params.getAll("limit").length;
  if (
    !isTaskUuid(organizationId) ||
    countOrg !== 1 ||
    countLimit > 1 ||
    [...params.keys()].some(
      (key) => key !== "organizationId" && key !== "limit",
    )
  ) {
    return { ok: false, error: "INVALID_RANGER_TASK_QUERY" };
  }
  const rawLimit = params.get("limit");
  if (rawLimit === null) return { ok: true, organizationId, limit: 25 };
  if (!/^[1-9]\d*$/.test(rawLimit)) {
    return { ok: false, error: "INVALID_RANGER_TASK_QUERY" };
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > 50) {
    return { ok: false, error: "INVALID_RANGER_TASK_QUERY" };
  }
  return { ok: true, organizationId, limit };
}

export function parseRangerTaskDetailQuery(
  params: URLSearchParams,
): DetailQueryResult {
  const organizationId = params.get("organizationId");
  if (
    !isTaskUuid(organizationId) ||
    params.size !== 1 ||
    params.getAll("organizationId").length !== 1
  ) {
    return { ok: false, error: "INVALID_RANGER_TASK_QUERY" };
  }
  return { ok: true, organizationId };
}
