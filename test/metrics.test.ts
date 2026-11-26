import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { scrapeAll, register } from "../src/metrics.ts";

console.log = () => {};
console.error = () => {};

const HOUR = 3_600_000;
const START = 500_000 * HOUR + 600_000; // ten minutes into an hour

function baseStats(over: object = {}) {
  return {
    time_units: "hours",
    dns_queries: [0],
    num_dns_queries: 0,
    num_blocked_filtering: 0,
    num_replaced_safebrowsing: 0,
    num_replaced_safesearch: 0,
    num_replaced_parental: 0,
    avg_processing_time: 0,
    top_queried_domains: [],
    top_blocked_domains: [],
    top_clients: [],
    top_upstreams_responses: [],
    top_upstreams_avg_time: [],
    ...over,
  };
}

// Each fake has its own port, so exporter state never leaks between tests.
async function fakeAdGuard(t: { after(fn: () => void): void }) {
  const fake = {
    time: START,
    status: { running: true, protection_enabled: true, dhcp_available: false, protection_disabled_duration: 0 } as object | null,
    stats: baseStats() as object | null,
    filtering: { filters: [], whitelist_filters: null } as object | null,
    statsUrl: "",
    url: "",
    async scrape() {
      await scrapeAll([{ url: fake.url, username: "u", password: "p" }]);
    },
    // Value of one series of this instance, undefined when the series is absent.
    async value(name: string, labels: Record<string, string> = {}) {
      const metric = (await register.getMetricsAsJSON()).find((m) => m.name === name);
      const want = Object.entries({ instance: fake.url, ...labels });
      return (metric as any)?.values.find((v: any) => want.every(([k, x]) => v.labels[k] === x))?.value;
    },
  };
  const server = http.createServer((req, res) => {
    const isStats = req.url!.startsWith("/control/stats");
    if (isStats) fake.statsUrl = req.url!;
    const isFiltering = req.url === "/control/filtering/status";
    const body = isStats ? fake.stats : isFiltering ? fake.filtering : fake.status;
    res.setHeader("Date", new Date(fake.time).toUTCString());
    res.writeHead(body ? 200 : 500, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body ?? {}));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

test("domain in both top lists keeps separate state", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.stats = baseStats({ top_queried_domains: [{ "a.com": 100 }], top_blocked_domains: [{ "a.com": 10 }] });
  await fake.scrape();
  await fake.scrape(); // no traffic in between
  fake.stats = baseStats({ top_queried_domains: [{ "a.com": 101 }], top_blocked_domains: [{ "a.com": 12 }] });
  await fake.scrape();

  assert.equal(await fake.value("adguard_top_queried_domains_total", { domain: "a.com" }), 1);
  assert.equal(await fake.value("adguard_top_blocked_domains_total", { domain: "a.com" }), 2);
});

test("asks only for the current hour", async (t) => {
  const fake = await fakeAdGuard(t);
  await fake.scrape();
  assert.equal(fake.statsUrl, "/control/stats?recent=3600000");
});

test("counters follow hourly buckets", async (t) => {
  const fake = await fakeAdGuard(t);
  const scrape = async (queries: number, clients: object[] = []) => {
    fake.stats = baseStats({ num_dns_queries: queries, top_clients: clients });
    await fake.scrape();
    return fake.value("adguard_dns_queries_total");
  };

  assert.equal(await scrape(100), 0, "first scrape is a baseline");
  assert.equal(await scrape(130), 30, "growth within an hour");
  assert.equal(await scrape(130, [{ new: 7 }]), 30);
  assert.equal(await fake.value("adguard_top_clients_total", { client: "new" }), 7, "new key counts fully");

  fake.time += HOUR;
  assert.equal(await scrape(200, [{ new: 9 }]), 230, "new hour counts fully, even above the last value");
  assert.equal(await fake.value("adguard_top_clients_total", { client: "new" }), 16);

  assert.equal(await scrape(5), 230, "reset is only a new baseline");
  assert.equal(await scrape(8), 233);
});

test("response right after a full hour is not counted", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.stats = baseStats({ num_dns_queries: 500 });
  await fake.scrape();

  // AdGuard has not switched buckets yet: new Date header, old data.
  fake.time = START - (START % HOUR) + HOUR + 1000;
  await fake.scrape();
  fake.time += 30_000;
  fake.stats = baseStats({ num_dns_queries: 3 });
  await fake.scrape();

  assert.equal(await fake.value("adguard_dns_queries_total"), 3);
});

test("AdGuard ignoring 'recent' is reported and not counted", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.stats = baseStats({ dns_queries: [1, 2], num_dns_queries: 3 });
  await fake.scrape();
  assert.equal(await fake.value("adguard_stats_up"), 0);
  assert.equal(await fake.value("adguard_dns_queries_total"), undefined);
});

test("status values and units", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.status = { running: false, protection_enabled: false, dhcp_available: true, protection_disabled_duration: 60_000 };
  await fake.scrape();
  assert.equal(await fake.value("adguard_running"), 0);
  assert.equal(await fake.value("adguard_protection_disabled_duration_seconds"), 60);
});

test("failures drop stale gauges but keep counters", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.stats = baseStats({ num_dns_queries: 1, avg_processing_time: 0.01, top_upstreams_avg_time: [{ "1.1.1.1": 0.002 }] });
  await fake.scrape();
  assert.equal(await fake.value("adguard_top_upstreams_avg_time_ms", { upstream: "1.1.1.1" }), 2);

  fake.stats = null;
  await fake.scrape();
  assert.equal(await fake.value("adguard_stats_up"), 0);
  assert.equal(await fake.value("adguard_running"), 1, "broken stats do not mean AdGuard is down");
  assert.equal(await fake.value("adguard_avg_processing_time_ms"), undefined);
  assert.equal(await fake.value("adguard_top_upstreams_avg_time_ms", { upstream: "1.1.1.1" }), undefined);

  fake.status = null;
  await fake.scrape();
  assert.equal(await fake.value("adguard_running"), 0);
  assert.equal(await fake.value("adguard_protection_enabled"), undefined);
  assert.equal(await fake.value("adguard_dns_queries_total"), 0);
});

test("vanished upstream and idle hour leave no series", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.stats = baseStats({ num_dns_queries: 1, top_upstreams_avg_time: [{ old: 0.001 }] });
  await fake.scrape();
  fake.stats = baseStats();
  await fake.scrape();
  assert.equal(await fake.value("adguard_top_upstreams_avg_time_ms", { upstream: "old" }), undefined);
  assert.equal(await fake.value("adguard_avg_processing_time_ms"), undefined);
});

test("only new errors and recoveries are logged", async (t) => {
  const fake = await fakeAdGuard(t);
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));
  t.mock.method(console, "error", (line: string) => lines.push(line));

  await fake.scrape();
  assert.equal(lines.length, 0, "success is silent");
  fake.stats = null;
  await fake.scrape();
  await fake.scrape();
  assert.equal(lines.length, 1, "a repeating error is logged once");
  assert.match(lines[0]!, /stats of .*HTTP 500/);
  fake.stats = baseStats();
  await fake.scrape();
  assert.match(lines[1]!, /Recovered: stats of/);
});

test("version and start time", async (t) => {
  const fake = await fakeAdGuard(t);
  fake.status = { running: true, version: "v1", start_time: 1_700_000_000_500 };
  await fake.scrape();
  assert.equal(await fake.value("adguard_info", { version: "v1" }), 1);
  assert.equal(await fake.value("adguard_start_time_seconds"), 1_700_000_000.5);

  fake.status = { running: true, version: "v2" };
  await fake.scrape();
  assert.equal(await fake.value("adguard_info", { version: "v1" }), undefined, "old version disappears");
  assert.equal(await fake.value("adguard_info", { version: "v2" }), 1);

  fake.status = null;
  await fake.scrape();
  assert.equal(await fake.value("adguard_info"), undefined);
  assert.equal(await fake.value("adguard_start_time_seconds"), undefined);
});

test("filter lists", async (t) => {
  const fake = await fakeAdGuard(t);
  const list = { id: 1, name: "ads", enabled: true, rules_count: 42, last_updated: "2026-11-24T13:00:00Z" };
  fake.filtering = {
    filters: [list, { id: 2, name: "never", enabled: false, rules_count: 0 }],
    whitelist_filters: [{ ...list, id: 3, name: "allow" }],
  };
  await fake.scrape();
  assert.equal(await fake.value("adguard_filter_rules", { filter_id: "1", filter: "ads" }), 42);
  assert.equal(await fake.value("adguard_filter_enabled", { filter: "never" }), 0);
  assert.equal(await fake.value("adguard_filter_last_updated_seconds", { filter: "ads" }), Date.parse(list.last_updated) / 1000);
  assert.equal(await fake.value("adguard_filter_last_updated_seconds", { filter: "never" }), undefined);
  assert.equal(await fake.value("adguard_filter_rules", { filter: "allow" }), 42);

  fake.filtering = { filters: null, whitelist_filters: null };
  await fake.scrape();
  assert.equal(await fake.value("adguard_filter_rules"), undefined, "removed lists disappear");

  fake.filtering = { filters: [list] };
  await fake.scrape();
  fake.filtering = null;
  await fake.scrape();
  assert.equal(await fake.value("adguard_filter_rules"), undefined);
  assert.equal(await fake.value("adguard_running"), 1);
});
