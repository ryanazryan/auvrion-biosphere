export const ROLE_HOME = {
  supervisor: "/supervisor/overview",
  operator: "/operator/overview",
  ranger: "/ranger",
} as const;

export type HomeRole = keyof typeof ROLE_HOME;

export const HOME_ROLE_PRIORITY: readonly HomeRole[] = [
  "supervisor",
  "operator",
  "ranger",
];

export function getRoleHomeCandidates(
  assignments: readonly { role: string; organizationId: string }[],
) {
  return HOME_ROLE_PRIORITY.flatMap((role) =>
    assignments
      .filter((assignment) => assignment.role === role)
      .map((assignment) => ({
        role,
        organizationId: assignment.organizationId,
        href: ROLE_HOME[role],
      })),
  );
}
