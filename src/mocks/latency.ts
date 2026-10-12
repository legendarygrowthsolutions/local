import "server-only";

export const MOCK_LATENCY: [number, number] = [200, 600];

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function mockLatency() {
  // E2E runs set MOCK_LATENCY=off for speed and determinism.
  if (process.env.MOCK_LATENCY === "off") return Promise.resolve();
  const [min, max] = MOCK_LATENCY;
  return sleep(min + Math.random() * (max - min));
}
