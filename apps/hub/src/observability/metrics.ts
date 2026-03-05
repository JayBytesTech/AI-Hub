type Labels = Record<string, string>;

type CounterPoint = {
  name: string;
  labels: Labels;
  value: number;
};

type HistogramPoint = {
  name: string;
  labels: Labels;
  count: number;
  sum: number;
  avg: number;
};

type HistogramStore = {
  labels: Labels;
  count: number;
  sum: number;
};

function labelsKey(labels: Labels) {
  const keys = Object.keys(labels).sort();
  return keys.map((key) => `${key}=${labels[key]}`).join("|");
}

function metricKey(name: string, labels: Labels) {
  return `${name}::${labelsKey(labels)}`;
}

export class HubMetrics {
  private counters = new Map<string, CounterPoint>();
  private histograms = new Map<string, HistogramStore & { name: string }>();

  increment(name: string, labels: Labels = {}, value = 1) {
    const key = metricKey(name, labels);
    const current = this.counters.get(key);
    if (current) {
      current.value += value;
      return;
    }
    this.counters.set(key, { name, labels: { ...labels }, value });
  }

  observe(name: string, value: number, labels: Labels = {}) {
    const key = metricKey(name, labels);
    const current = this.histograms.get(key);
    if (current) {
      current.count += 1;
      current.sum += value;
      return;
    }
    this.histograms.set(key, {
      name,
      labels: { ...labels },
      count: 1,
      sum: value
    });
  }

  snapshot() {
    const counters = [...this.counters.values()].sort((a, b) =>
      metricKey(a.name, a.labels).localeCompare(metricKey(b.name, b.labels))
    );
    const histograms: HistogramPoint[] = [...this.histograms.values()]
      .map((entry) => ({
        name: entry.name,
        labels: entry.labels,
        count: entry.count,
        sum: entry.sum,
        avg: entry.count > 0 ? entry.sum / entry.count : 0
      }))
      .sort((a, b) => metricKey(a.name, a.labels).localeCompare(metricKey(b.name, b.labels)));

    return {
      generatedAt: Date.now(),
      counters,
      histograms
    };
  }

  resetForTests() {
    this.counters.clear();
    this.histograms.clear();
  }
}

export const hubMetrics = new HubMetrics();
