/** No credentials printed. Validates production WebAuthn origin configuration. */
const raw = process.env.BETTER_AUTH_URL;
if (!raw) {
  console.error("BETTER_AUTH_URL missing");
  process.exit(2);
}
try {
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const secure =
    url.protocol === "https:" || (local && url.protocol === "http:");
  if (!secure || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Must be HTTPS origin or localhost; no path/query/hash");
  console.log("Passkey RP host:", url.hostname);
  console.log("WebAuthn origin:", url.origin);
  console.log(
    "Passkey login enabled:",
    process.env.ENABLE_PASSKEY_SIGNIN === "YES" ? "YES" : "NO",
  );
  console.log(
    "NOTE: Keys registered on localhost are not portable to a different domain's RP ID.",
  );
} catch (error) {
  console.error(
    "Passkey configuration invalid:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 2;
}
