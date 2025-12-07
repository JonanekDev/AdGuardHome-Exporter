import promClient from "prom-client";
import { AdGuardAPIStats, AdGuardAPIStatus, AdGuardServer, StatEntry } from "./types";
import axios, { AxiosResponse } from "axios";
import { updateCounter, setTopStats, updateTopStatsCounter, getHeaderAuth } from "./utils";

export const register = new promClient.Registry();

const metrics = {
  // Status
  running: new promClient.Gauge({
    name: "adguard_running",
    help: "Indicates if the application is running (1=true, 0=false)",
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
    help: "Duration in seconds for which protection has been disabled",
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
    help: "Total number of blocked DNS queries",
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
    help: "Average processing time for DNS queries in ms",
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
    help: "Top upstream average response time in ms",
    labelNames: ["instance", "upstream"],
    registers: [register],
  }),
};

async function fetchAdGuardStatus(server: AdGuardServer): Promise<void> {
  try {
    const response: AxiosResponse<AdGuardAPIStatus> =
      await axios.get<AdGuardAPIStatus>(
        `${server.url}/control/status`,
        getHeaderAuth(server.username, server.password),
      );
    const status: AdGuardAPIStatus = response.data;

    metrics.running.set({ instance: server.url }, 1);

    metrics.protectionEnabled.set(
      { instance: server.url },
      status.protection_enabled ? 1 : 0,
    );

    metrics.DHCPAvailable.set(
      { instance: server.url },
      status.dhcp_available ? 1 : 0,
    );

    metrics.adguardProtectionDisabledDuration.set(
      { instance: server.url },
      status.protection_disabled_duration,
    );
  } catch (error) {
    console.error(
      `Error fetching status from ${server.url}:`,
      error instanceof Error ? error.message : error,
    );
    metrics.running.set({ instance: server.url }, 0);
  }
}

async function fetchAdGuardStats(server: AdGuardServer): Promise<void> {
  try {
    const response: AxiosResponse<AdGuardAPIStats> =
      await axios.get<AdGuardAPIStats>(
        `${server.url}/control/stats`,
        getHeaderAuth(server.username, server.password),
      );
    const stats: AdGuardAPIStats = response.data;

    // Top stats
    updateTopStatsCounter(metrics.topClients, server.url, stats.top_clients, "client");

    updateTopStatsCounter(
      metrics.topBlockedDomains,
      server.url,
      stats.top_blocked_domains,
      "domain",
    );

    updateTopStatsCounter(
      metrics.topQueriedDomains,
      server.url,
      stats.top_queried_domains,
      "domain",
    );

    setTopStats(
      metrics.topUpstreamsAvgTime,
      server.url,
      stats.top_upstreams_avg_time.map((entry) => {
        // Convert to ms
        const convertedEntry: StatEntry = {};
        for (const [key, value] of Object.entries(entry)) {
          convertedEntry[key] = value * 1000;
        }
        return convertedEntry;
      }),
      "upstream",
    );

    updateTopStatsCounter(
      metrics.topUpstreamsResponses,
      server.url,
      stats.top_upstreams_responses,
      "upstream",
    );

    // Counters
    updateCounter(
      metrics.dnsQueriesTotal,
      server.url,
      "num_dns_queries",
      stats.num_dns_queries,
    );

    updateCounter(
      metrics.blockedQueriesTotal,
      server.url,
      "num_blocked_filtering",
      stats.num_blocked_filtering,
    );

    updateCounter(
      metrics.replacedSafeSearchTotal,
      server.url,
      "num_replaced_safesearch",
      stats.num_replaced_safesearch,
    );

    updateCounter(
      metrics.replacedSafeBrowsingTotal,
      server.url,
      "num_replaced_safebrowsing",
      stats.num_replaced_safebrowsing,
    );

    updateCounter(
      metrics.replacedParentalTotal,
      server.url,
      "num_replaced_parental",
      stats.num_replaced_parental,
    );

    metrics.avgProcessingTime.set(
      { instance: server.url },
      stats.avg_processing_time * 1000,
    );
  } catch (error) {
    console.error(
      `Error fetching stats from ${server.url}:`,
      error instanceof Error ? error.message : error,
    );
    metrics.running.set({ instance: server.url }, 0);
  }
}

export async function fetch(servers: AdGuardServer[]): Promise<void> {
  for (const server of servers) {
    await fetchAdGuardStatus(server);
    await fetchAdGuardStats(server);
  }
}
