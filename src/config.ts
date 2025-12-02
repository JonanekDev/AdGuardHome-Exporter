interface Config {
  adGuardUrls: string[];
  adGuardUsernames: string[];
  adGuardPasswords: string[];
  scrapeIntervalSeconds: number;
  port: number;
}

function getRequiredEnvArray(name: string): string[] {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.split(",");
}

export const config: Config = {
  adGuardUrls: getRequiredEnvArray("ADGUARD_URLS").map((url) =>
    url.startsWith("http") ? url : `http://${url}`,
  ),
  adGuardUsernames: getRequiredEnvArray("ADGUARD_USERNAMES"),
  adGuardPasswords: getRequiredEnvArray("ADGUARD_PASSWORDS"),
  scrapeIntervalSeconds: process.env.SCRAPE_INTERVAL_SECONDS
    ? parseInt(process.env.SCRAPE_INTERVAL_SECONDS)
    : 30,
  port: process.env.PORT ? parseInt(process.env.PORT) : 9100,
};

if (
  config.adGuardUrls.length !== config.adGuardUsernames.length ||
  config.adGuardUrls.length !== config.adGuardPasswords.length
) {
  throw new Error(
    `Configuration error: ADGUARD__URLS, ADGUARD_USERNAMES, and ADGUARD_PASSWORDS must have the same number of values. ` +
      `Got ${config.adGuardUrls.length} URLs, ${config.adGuardUsernames.length} usernames, and ${config.adGuardPasswords.length} passwords.`,
  );
}
