import promClient from "prom-client";
import { StatEntry } from "./types";
import { AxiosRequestConfig } from "axios";
const previousValues: Record<string, Record<string, number>> = {};

export function updateCounter(
  metric: promClient.Counter<string>,
  instance: string,
  field: string,
  newValue: number,
) {
  if (!previousValues[instance]) previousValues[instance] = {};

  const prev = previousValues[instance][field];

  // First load
  if (prev === undefined) {
    previousValues[instance][field] = newValue;
    return;
  }

  // Detected reset - save new value without incrementing
  if (newValue < prev) {
    previousValues[instance][field] = newValue;
    return;
  }

  // Nornal increment
  metric.inc({ instance }, newValue - prev);

  previousValues[instance][field] = newValue;
}

export function setTopStats(
  metric: promClient.Gauge<string>,
  instance: string,
  data: StatEntry[],
  label: string,
) {
  for (const row of data) {
    for (const [key, value] of Object.entries(row)) {
      metric.set({ instance, [label]: key }, value);
    }
  }
}

export function getHeaderAuth(
  username: string,
  password: string,
): AxiosRequestConfig {
  return {
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
    },
  };
}
