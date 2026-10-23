export type AccessUserFilterRecord = {
  name: string;
  email: string;
  accessStatus: string;
};

export function filterAccessUsers<T extends AccessUserFilterRecord>(
  users: readonly T[],
  query: string,
  status: string,
): T[] {
  const term = query.trim().toLocaleLowerCase();

  return users.filter(
    (user) =>
      `${user.name} ${user.email}`.toLocaleLowerCase().includes(term) &&
      (status === "all" || user.accessStatus === status),
  );
}
