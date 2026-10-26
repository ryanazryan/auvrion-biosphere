/** Return one active Ranger navigation item, including nested task routes. */
export function activeRangerNavPath(path: string, href: string): boolean {
  if (href === "/ranger") return path === href;

  const inTaskHistory = /^\/ranger\/tasks\/[^/]+\/history(?:\/|$)/.test(path);
  const inTaskFindings = path.includes("/findings/");

  if (href === "/ranger/history") {
    return path === href || path.startsWith(`${href}/`) || inTaskHistory;
  }
  if (href === "/ranger/findings") {
    return path === href || path.startsWith(`${href}/`) || inTaskFindings;
  }
  if (href === "/ranger/tasks") {
    return (
      (path === href || path.startsWith(`${href}/`)) &&
      !inTaskHistory &&
      !inTaskFindings
    );
  }
  return path === href || path.startsWith(`${href}/`);
}
