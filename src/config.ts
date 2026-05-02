import { readFileSync, existsSync } from "fs";

interface Config {
  adGuardUrls: string[];
  adGuardUsernames: string[];
  adGuardPasswords: string[];
  scrapeIntervalSeconds: number;
  port: number;
}

// Helper to read file content (trimming whitespace)
function readFileSecret(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Secret file not found: ${path}`);
  }
  return readFileSync(path, "utf8").trim();
}

// 1. Try to load using Indexed Env Vars (ADGUARD_URL_1, ADGUARD_URL_2, etc.)
function loadIndexedConfig(): Partial<Config> | null {
  const urls: string[] = [];
  const users: string[] = [];
  const passwords: string[] = [];
  
  let i = 1; // Start counting at 1
  let foundAny = false;

  while (true) {
    // Check for ADGUARD_URL_1, ADGUARD_URL_2...
    const urlEnv = process.env[`ADGUARD_URL_${i}`];
    
    // If we don't find the URL, we assume the list is finished
    if (!urlEnv) {
      break; 
    }

    foundAny = true;
    
    // Process URL
    urls.push(urlEnv.startsWith("http") ? urlEnv : `http://${urlEnv}`);

    // Process Username (Check _FILE_1 first, then _1)
    const userFile = process.env[`ADGUARD_USERNAME_FILE_${i}`];
    const userRaw = process.env[`ADGUARD_USERNAME_${i}`];

    if (userFile) {
      users.push(readFileSecret(userFile));
    } else if (userRaw) {
      users.push(userRaw);
    } else {
      throw new Error(`Configuration Error: Found ADGUARD_URL_${i} but missing ADGUARD_USERNAME_${i} or ADGUARD_USERNAME_FILE_${i}`);
    }

    // Process Password (Check _FILE_1 first, then _1)
    const passFile = process.env[`ADGUARD_PASSWORD_FILE_${i}`];
    const passRaw = process.env[`ADGUARD_PASSWORD_${i}`];

    if (passFile) {
      passwords.push(readFileSecret(passFile));
    } else if (passRaw) {
      passwords.push(passRaw);
    } else {
      throw new Error(`Configuration Error: Found ADGUARD_URL_${i} but missing ADGUARD_PASSWORD_${i} or ADGUARD_PASSWORD_FILE_${i}`);
    }

    i++;
  }

  if (!foundAny) return null;

  return {
    adGuardUrls: urls,
    adGuardUsernames: users,
    adGuardPasswords: passwords
  };
}

// 2. Fallback: Load using Legacy Comma-Separated Env Vars
function loadLegacyConfig(): Partial<Config> {
  const getRequiredEnvArray = (name: string): string[] => {
    const value = process.env[name];
    if (!value) return []; 
    return value.split(",");
  };

  const urls = getRequiredEnvArray("ADGUARD_URLS");
  const users = getRequiredEnvArray("ADGUARD_USERNAMES");
  const passwords = getRequiredEnvArray("ADGUARD_PASSWORDS");

  if (urls.length === 0) {
    // If neither indexed nor legacy config is found
    throw new Error("No configuration found. Please set ADGUARD_URL_1 (indexed) or ADGUARD_URLS (legacy).");
  }

  if (urls.length !== users.length || urls.length !== passwords.length) {
    throw new Error(
      `Legacy Configuration Error: Array lengths mismatch. Got ${urls.length} URLs, ${users.length} users, ${passwords.length} passwords.`
    );
  }

  return {
    adGuardUrls: urls.map((url) => (url.startsWith("http") ? url : `http://${url}`)),
    adGuardUsernames: users,
    adGuardPasswords: passwords,
  };
}

// Main Loading Logic
const commonConfig = {
  scrapeIntervalSeconds: process.env.SCRAPE_INTERVAL_SECONDS ? parseInt(process.env.SCRAPE_INTERVAL_SECONDS) : 30,
  port: process.env.PORT ? parseInt(process.env.PORT) : 9100,
};

let serverConfig = loadIndexedConfig();

if (!serverConfig) {
  // If no indexed vars found, try legacy
  serverConfig = loadLegacyConfig();
}

export const config: Config = {
  ...commonConfig,
  adGuardUrls: serverConfig.adGuardUrls!,
  adGuardUsernames: serverConfig.adGuardUsernames!,
  adGuardPasswords: serverConfig.adGuardPasswords!,
};