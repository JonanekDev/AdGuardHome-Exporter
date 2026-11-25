import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";

const one = { ADGUARD_URL_1: "a", ADGUARD_USERNAME_1: "u", ADGUARD_PASSWORD_1: "p" };
const list = (urls: string, users: string, passwords: string) =>
  ({ ADGUARD_URLS: urls, ADGUARD_USERNAMES: users, ADGUARD_PASSWORDS: passwords });

test("defaults and valid numbers", () => {
  assert.equal(loadConfig(one).scrapeIntervalSeconds, 30);
  assert.equal(loadConfig(one).port, 9100);
  assert.equal(loadConfig({ ...one, SCRAPE_INTERVAL_SECONDS: " 15 ", PORT: "9617" }).scrapeIntervalSeconds, 15);
});

test("invalid numbers are rejected", () => {
  for (const value of ["abc", "0", "-5", "30s", "1.5", "3601"]) {
    assert.throws(() => loadConfig({ ...one, SCRAPE_INTERVAL_SECONDS: value }), /SCRAPE_INTERVAL_SECONDS/, value);
  }
  assert.throws(() => loadConfig({ ...one, PORT: "65536" }), /PORT/);
});

test("URLs are trimmed and completed", () => {
  const config = loadConfig(list("a, httpdns.lan ,https://c/,HTTP://d:8080/adguard//", "u, u,u,u", "p, p ,p,p"));
  assert.deepEqual(config.servers.map((s) => s.url), ["http://a", "http://httpdns.lan", "https://c", "HTTP://d:8080/adguard"]);
  assert.equal(config.servers[1]!.username, "u");
  assert.equal(config.servers[1]!.password, " p ", "passwords are not trimmed");
});

test("bad URLs are rejected without leaking credentials", () => {
  assert.throws(() => loadConfig(list("a,", "u,u", "p,p")), /Item 2 of ADGUARD_URLS/);
  assert.throws(
    () => loadConfig({ ...one, ADGUARD_URL_1: "http://admin:hunter2@a" }),
    (error: Error) => /credentials/.test(error.message) && !error.message.includes("hunter2"),
  );
});

test("gaps, duplicates and missing values are rejected", () => {
  assert.throws(() => loadConfig({ ...one, ADGUARD_URL_3: "c" }), /ADGUARD_URL_2 is missing.*ADGUARD_URL_3/);
  assert.throws(() => loadConfig({ ADGUARD_URL_2: "b" }), /ADGUARD_URL_1 is missing/);
  assert.throws(() => loadConfig(list("a,http://a/", "u,u", "p,p")), /more than once/);
  assert.throws(() => loadConfig({ ADGUARD_URL_1: "a", ADGUARD_USERNAME_1: "u" }), /PASSWORD_1/);
  assert.throws(() => loadConfig(list("a", "u", "p,q")), /same number/);
  assert.throws(() => loadConfig({}), /No configuration/);
});

test("secret files win over plain values and may contain commas", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "adg-"));
  t.after(() => rmSync(dir, { recursive: true }));
  writeFileSync(join(dir, "pass"), "se,cret\n");
  const config = loadConfig({ ...one, ADGUARD_PASSWORD_FILE_1: join(dir, "pass") });
  assert.equal(config.servers[0]!.password, "se,cret");
});
