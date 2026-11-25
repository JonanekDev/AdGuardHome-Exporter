import promClient from "prom-client";
import type { AdGuardAPIStats, AdGuardAPIStatus, AdGuardServer, StatEntry } from "./types.ts";
import { addDeltas, type Sample } from "./utils.ts";

export const register = new promClient.Registry();

const metrics = {
  // Status
  running: new promClient.Gauge({
    name: "adguard_running",
    help: "Indicates if AdGuard Home is reachable and its DNS server is running (1=true, 0=false)",
    labelNames: ["instance"],
    registers: [register],
  }),
  protectionEnabled: new promClient.Gauge({
    name: "adguard_protection_enabled",
    help: "Indicates if protection is enabled (1=true, 0=false)",
    labelNames: ["instance"],
    registers: [register],
  }),
  DHCPAvailable: new promClient.Gauge({
    name: "adguard_dhcp_available",
    help: "Indicates if DHCP is available (1=true, 0=false)",
    labelNames: ["instance"],
    registers: [register],
  }),
  adguardProtectionDisabledDuration: new promClient.Gauge({
    name: "adguard_protection_disabled_duration_seconds",
    help: "Seconds remaining until paused protection is enabled again (0=not paused)",
    labelNames: ["instance"],
    registers: [register],
  }),

  statsUp: new promClient.Gauge({
    name: "adguard_stats_up",
    help: "Indicates if the last statistics fetch succeeded (1=true, 0=false)",
    labelNames: ["instance"],
    registers: [register],
  }),

  // Total counters
  dnsQueriesTotal: new promClient.Counter({
    name: "adguard_dns_queries_total",
    help: "Total number of DNS queries",
    labelNames: ["instance"],
    registers: [register],
  }),
  blockedQueriesTotal: new promClient.Counter({
    name: "adguard_blocked_queries_total",
    help: "Total number of DNS queries blocked by filtering rules",
    labelNames: ["instance"],
    registers: [register],
  }),
  replacedSafeBrowsingTotal: new promClient.Counter({
    name: "adguard_replaced_safebrowsing_total",
    help: "Total number of Safe Browsing replacements",
    labelNames: ["instance"],
    registers: [register],
  }),
  replacedSafeSearchTotal: new promClient.Counter({
    name: "adguard_replaced_safesearch_total",
    help: "Total number of Safe Search replacements",
    labelNames: ["instance"],
    registers: [register],
  }),
  replacedParentalTotal: new promClient.Counter({
    name: "adguard_replaced_parental_total",
    help: "Total number of Parental replacements",
    labelNames: ["instance"],
    registers: [register],
  }),

  avgProcessingTime: new promClient.Gauge({
    name: "adguard_avg_processing_time_ms",
    help: "Average processing time for DNS queries in the current hour in ms",
    labelNames: ["instance"],
    registers: [register],
  }),

  // Top stats
  topQueriedDomains: new promClient.Counter({
    name: "adguard_top_queried_domains_total",
    help: "Top queried domains (total requests)",
    labelNames: ["instance", "domain"],
    registers: [register],
  }),
  topBlockedDomains: new promClient.Counter({
    name: "adguard_top_blocked_domains_total",
    help: "Top blocked domains (total requests)",
    labelNames: ["instance", "domain"],
    registers: [register],
  }),
  topClients: new promClient.Counter({
    name: "adguard_top_clients_total",
    help: "Top clients by number of queries (total requests)",
    labelNames: ["instance", "client"],
    registers: [register],
  }),
  topUpstreamsResponses: new promClient.Counter({
    name: "adguard_top_upstreams_responses_total",
    help: "Top upstream responses (total count)",
    labelNames: ["instance", "upstream"],
    registers: [register],
  }),
  topUpstreamsAvgTime: new promClient.Gauge({
    name: "adguard_top_upstreams_avg_time_ms",
    help: "Top upstream average response time in the current hour in ms",
    labelNames: ["instance", "upstream"],
    registers: [register],
  }),
};

const HOUR_MS = 3_600_000;
const TIMEOUT_MS = 10_000;
// AdGuard switches to a new hourly bucket up to about a second late, so right
// after a full hour the response may still hold the previous hour.
const HOUR_SWITCH_GRACE_MS = 5_000;

async function get<T>(server: AdGuardServer, path: string) {
  const auth = Buffer.from(`${server.username}:${server.password}`).toString("base64");
  const response = await fetch(`${server.url}/control/${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  return {
    data: (await response.json()) as T,
    // Server time decides which hourly bucket the data belongs to.
    time: Date.parse(response.headers.get("date") ?? "") || Date.now(),
  };
}

// Only changes are logged, so a server that stays offline does not flood the log.
const lastErrors = new Map<string, string>();

function logResult(what: string, error?: unknown) {
  const previousError = lastErrors.get(what);
  if (error === undefined) {
    if (previousError !== undefined) {
      lastErrors.delete(what);
      console.log(`[${new Date().toISOString()}] Recovered: ${what}`);
    }
    return;
  }

  // Native fetch hides the reason (ECONNREFUSED, ...) in error.cause.
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const reason = cause?.code || cause?.message;
  const message = (error instanceof Error ? error.message : String(error)) + (reason ? ` (${reason})` : "");
  if (message !== previousError) {
    lastErrors.set(what, message);
    console.error(`[${new Date().toISOString()}] Error: ${what}: ${message}`);
  }
}

async function removeUpstreamTimes(instance: string) {
  for (const { labels } of (await metrics.topUpstreamsAvgTime.get()).values) {
    if (labels.instance === instance) metrics.topUpstreamsAvgTime.remove(labels);
  }
}

async function scrapeStatus(server: AdGuardServer): Promise<void> {
  const labels = { instance: server.url };
  try {
    const { data: status } = await get<AdGuardAPIStatus>(server, "status");

    metrics.running.set(labels, status.running ? 1 : 0);
    metrics.protectionEnabled.set(labels, status.protection_enabled ? 1 : 0);
    metrics.DHCPAvailable.set(labels, status.dhcp_available ? 1 : 0);
    metrics.adguardProtectionDisabledDuration.set(labels, (status.protection_disabled_duration ?? 0) / 1000);
    logResult(`status of ${server.url}`);
  } catch (error) {
    metrics.running.set(labels, 0);
    // Old values would look current.
    metrics.protectionEnabled.remove(labels);
    metrics.DHCPAvailable.remove(labels);
    metrics.adguardProtectionDisabledDuration.remove(labels);
    logResult(`status of ${server.url}`, error);
  }
}

async function scrapeStats(server: AdGuardServer): Promise<void> {
  const instance = server.url;
  try {
    // Only the current hour. The whole retention window is a sliding sum, which
    // cannot be turned into counters.
    const { data: stats, time } = await get<AdGuardAPIStats>(server, `stats?recent=${HOUR_MS}`);
    if (stats.dns_queries.length !== 1) {
      throw new Error("AdGuard Home ignored the 'recent' parameter, please update AdGuard Home");
    }

    const top = (counter: promClient.Counter<string>, label: string, rows: StatEntry[]): Sample[] =>
      rows.flatMap((row) =>
        Object.entries(row).map(([key, value]) => ({ counter, labels: { instance, [label]: key }, value })),
      );
    const total = (counter: promClient.Counter<string>, value: number): Sample => ({
      counter,
      labels: { instance },
      value,
    });

    if (time % HOUR_MS >= HOUR_SWITCH_GRACE_MS) {
      addDeltas(instance, Math.floor(time / HOUR_MS), [
        total(metrics.dnsQueriesTotal, stats.num_dns_queries),
        total(metrics.blockedQueriesTotal, stats.num_blocked_filtering),
        total(metrics.replacedSafeBrowsingTotal, stats.num_replaced_safebrowsing),
        total(metrics.replacedSafeSearchTotal, stats.num_replaced_safesearch),
        total(metrics.replacedParentalTotal, stats.num_replaced_parental),
        ...top(metrics.topClients, "client", stats.top_clients),
        ...top(metrics.topQueriedDomains, "domain", stats.top_queried_domains),
        ...top(metrics.topBlockedDomains, "domain", stats.top_blocked_domains),
        ...top(metrics.topUpstreamsResponses, "upstream", stats.top_upstreams_responses),
      ]);
    }

    // An hour without queries has no average, 0 ms would be misleading.
    if (stats.num_dns_queries > 0) {
      metrics.avgProcessingTime.set({ instance }, stats.avg_processing_time * 1000);
    } else {
      metrics.avgProcessingTime.remove({ instance });
    }

    await removeUpstreamTimes(instance);
    for (const row of stats.top_upstreams_avg_time) {
      for (const [upstream, seconds] of Object.entries(row)) {
        metrics.topUpstreamsAvgTime.set({ instance, upstream }, seconds * 1000);
      }
    }

    metrics.statsUp.set({ instance }, 1);
    logResult(`stats of ${server.url}`);
  } catch (error) {
    metrics.statsUp.set({ instance }, 0);
    metrics.avgProcessingTime.remove({ instance });
    await removeUpstreamTimes(instance);
    logResult(`stats of ${server.url}`, error);
  }
}

export async function scrapeAll(servers: AdGuardServer[]): Promise<void> {
  await Promise.all(
    servers.flatMap((server) => [scrapeStatus(server), scrapeStats(server)]),
  );
}
