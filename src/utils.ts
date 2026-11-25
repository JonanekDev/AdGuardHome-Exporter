import type { Counter } from "prom-client";

export interface Sample {
  counter: Counter<string>;
  labels: Record<string, string>;
  value: number; // total within the current AdGuard hour
}

interface HourState {
  hour: number;
  values: Map<Counter<string>, Map<string, number>>; // per metric and its labels
}

const previous = new Map<string, HourState>();

// AdGuard statistics are bucketed by hour and values only grow within a bucket.
// ponytail: queries made between the last scrape and the end of the hour are
// lost; if that matters, read the previous bucket using recent=7200000.
export function addDeltas(instance: string, hour: number, samples: Sample[]) {
  const last = previous.get(instance);
  // A new hour starts from zero, so its whole values are new.
  const values: HourState["values"] = last?.hour === hour ? last.values : new Map();

  for (const { counter, labels, value } of samples) {
    const series = values.get(counter) ?? new Map<string, number>();
    values.set(counter, series);
    const key = JSON.stringify(labels);
    const delta = value - (series.get(key) ?? 0);
    // The first scrape is only a baseline. A negative delta means the
    // statistics were reset, which also just sets a new baseline.
    counter.inc(labels, last && delta > 0 ? delta : 0);
    series.set(key, value);
  }

  previous.set(instance, { hour, values });
}
