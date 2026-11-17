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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt;
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return backoffMs(attempt);
}

export function createHttpClient(options: Options = {}): HttpClient {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const minIntervalMs = options.minIntervalMs ?? 400;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const lastRequestAt = new Map<string, number>();

  async function throttle(host: string) {
    const now = Date.now();
    const nextAllowedAt = (lastRequestAt.get(host) ?? 0) + minIntervalMs;

    // Reserve the slot before waiting so parallel requests to the same host queue up.
    lastRequestAt.set(host, Math.max(now, nextAllowedAt));

    if (nextAllowedAt > now) {
      await sleep(nextAllowedAt - now);
    }
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      const host = new URL(url).host;
      let attempt = 0;

      while (true) {
        await throttle(host);

        try {
          const res = await doFetch(url, {
            headers: { Accept: "application/json", "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (res.ok) {
            return (await res.json()) as T;
          }

          const retryable = res.status === 429 || res.status >= 500;

          if (!retryable || attempt >= retries) {
            throw new HttpError(res.status, `GET ${url} -> HTTP ${res.status}`);
          }

          await sleep(retryDelayMs(res, attempt));
        } catch (error) {
          if (error instanceof HttpError) throw error;
          if (attempt >= retries) throw error;

          await sleep(backoffMs(attempt));
        }

        attempt++;
      }
    },
  };
}
