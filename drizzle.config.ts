import { getDatabaseUrl } from "./src/server/db/config.mts";

// Prepared for the stable Drizzle Kit format; Kit installation is deferred.
// No schema or migration commands until the data contracts are approved.
const config = {
  dialect: "postgresql" as const,
  dbCredentials: { url: getDatabaseUrl() },
  strict: true,
  verbose: false,
};

export default config;
