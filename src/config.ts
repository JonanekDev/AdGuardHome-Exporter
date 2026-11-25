import { readFileSync } from "node:fs";
import type { AdGuardServer } from "./types.ts";

export interface Config {
  servers: AdGuardServer[];
  scrapeIntervalSeconds: number;
  port: number;
}

type Env = Record<string, string | undefined>;

function positiveInt(env: Env, name: string, fallback: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new Error(`${name} must be a whole number from 1 to ${max}, got "${raw}"`);
  }
  return value;
}

// The value itself is never put into an error, it may contain a password.
function normalizeUrl(raw: string, source: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = trimmed ? URL.parse(withProtocol) : null;
  if (!url) throw new Error(`${source} is not a valid URL`);
  if (url.username || url.password) {
    throw new Error(`${source} must not contain credentials, set the username and password separately`);
  }
  return withProtocol.replace(/\/+$/, "");
}

// ADGUARD_USERNAME_FILE_1 (a secret file) wins over ADGUARD_USERNAME_1.
function credential(env: Env, field: "USERNAME" | "PASSWORD", i: number): string {
  const file = env[`ADGUARD_${field}_FILE_${i}`];
  const value = file ? readFileSync(file, "utf8").trim() : env[`ADGUARD_${field}_${i}`];
  if (!value) {
    throw new Error(`ADGUARD_URL_${i} is set but ADGUARD_${field}_${i} or ADGUARD_${field}_FILE_${i} is missing or empty`);
  }
  return value;
}

function indexedServers(env: Env): AdGuardServer[] {
  const servers: AdGuardServer[] = [];
  for (let i = 1; env[`ADGUARD_URL_${i}`]; i++) {
    servers.push({
      url: normalizeUrl(env[`ADGUARD_URL_${i}`]!, `ADGUARD_URL_${i}`),
      username: credential(env, "USERNAME", i),
      password: credential(env, "PASSWORD", i),
    });
  }

  // A gap in the numbering would silently drop the servers after it.
  const skipped = Object.keys(env).filter((name) => {
    const index = /^ADGUARD_URL_(\d+)$/.exec(name)?.[1];
    return index !== undefined && env[name] && !(Number(index) >= 1 && Number(index) <= servers.length);
  });
  if (skipped.length > 0) {
    throw new Error(`Servers must be numbered from 1 without gaps: ADGUARD_URL_${servers.length + 1} is missing, so ${skipped.join(", ")} cannot be used`);
  }
  return servers;
}

// Comma-separated variant, so neither usernames nor passwords can contain commas.
function listServers(env: Env): AdGuardServer[] {
  if (!env.ADGUARD_URLS) {
    throw new Error("No configuration found. Set ADGUARD_URL_1 (indexed) or ADGUARD_URLS (comma-separated).");
  }
  const urls = env.ADGUARD_URLS.split(",");
  const usernames = env.ADGUARD_USERNAMES?.split(",") ?? [];
  const passwords = env.ADGUARD_PASSWORDS?.split(",") ?? [];
  if (urls.length !== usernames.length || urls.length !== passwords.length) {
    throw new Error(
      `ADGUARD_URLS, ADGUARD_USERNAMES and ADGUARD_PASSWORDS must have the same number of items, got ${urls.length}, ${usernames.length} and ${passwords.length}. Passwords with commas need the indexed variables.`,
    );
  }
  return urls.map((url, i) => ({
    url: normalizeUrl(url, `Item ${i + 1} of ADGUARD_URLS`),
    username: usernames[i]!.trim(),
    password: passwords[i]!, // spaces may be part of a password
  }));
}

export function loadConfig(env: Env): Config {
  const indexed = indexedServers(env);
  const servers = indexed.length > 0 ? indexed : listServers(env);

  // The URL is the metric label and the state key, so it has to be unique.
  const duplicate = servers.find((server, i) => servers.findIndex((s) => s.url === server.url) !== i);
  if (duplicate) throw new Error(`Server ${duplicate.url} is configured more than once`);

  return {
    servers,
    // Statistics are read per hour, a longer interval would skip whole hours.
    scrapeIntervalSeconds: positiveInt(env, "SCRAPE_INTERVAL_SECONDS", 30, 3600),
    port: positiveInt(env, "PORT", 9100, 65535),
  };
}
