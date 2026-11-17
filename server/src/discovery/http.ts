/**
 * Minimal polite HTTP client for public job-board APIs: timeouts, bounded retries with backoff on
 * 429/5xx, and a per-host minimum interval so one run never hammers a provider.
 */

export interface HttpClient {
  getJson<T = unknown>(url: string): Promise<T>;
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

interface Options {
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const USER_AGENT = "SmartJobTracker/1.0 (+job-discovery; respects rate limits)";

export function createHttpClient(options: Options = {}): HttpClient {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const minIntervalMs = options.minIntervalMs ?? 400;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const lastRequestAt = new Map<string, number>();

  async function throttle(host: string) {
    const last = lastRequestAt.get(host) ?? 0;
    const wait = last + minIntervalMs - Date.now();
    lastRequestAt.set(host, Math.max(Date.now(), last + minIntervalMs));
    if (wait > 0) await sleep(wait);
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      const host = new URL(url).host;
      let attempt = 0;
      for (;;) {
        await throttle(host);
        try {
          const res = await doFetch(url, {
            headers: { Accept: "application/json", "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (res.ok) return (await res.json()) as T;
          const retryable = res.status === 429 || res.status >= 500;
          if (!retryable || attempt >= retries) {
            throw new HttpError(res.status, `GET ${url} -> HTTP ${res.status}`);
          }
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          if (attempt >= retries) throw error;
          await sleep(1000 * 2 ** attempt);
        }
        attempt++;
      }
    },
  };
}
