const witaFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatWita(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "Tidak tersedia";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Tidak tersedia";
  }

  return `${witaFormatter.format(timestamp)} WITA`;
}
