/**
 * Daily scheduler (default 08:00 America/Toronto). Runs inside the API process when
 * DISCOVERY_SCHEDULE_ENABLED=true, so it needs an always-on server (not serverless). For serverless
 * hosting use the CLI (`npm run discovery`) from a platform cron instead — see docs/JOB_DISCOVERY.md.
 */

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The next instant strictly after `now` when the wall clock in `timeZone` reads hour:minute. */
export function nextRunAt(now: Date, hour: number, minute: number, timeZone = "America/Toronto"): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  for (let addDays = 0; addDays < 3; addDays++) {
    const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + addDays, hour, minute);
    // Resolve the offset at the target instant (handles DST changes between now and then).
    let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
    utc = wall - zoneOffsetMs(new Date(utc), timeZone);
    if (utc > now.getTime()) return new Date(utc);
  }
  throw new Error("Could not compute next run time");
}

export function startDailyScheduler(opts: {
  hour: number;
  minute: number;
  timeZone: string;
  task: () => Promise<void>;
  log?: (m: string) => void;
}): () => void {
  const log = opts.log ?? console.log;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const at = nextRunAt(new Date(), opts.hour, opts.minute, opts.timeZone);
    log(`[scheduler] next discovery run at ${at.toISOString()} (${opts.hour}:${String(opts.minute).padStart(2, "0")} ${opts.timeZone})`);
    // setTimeout caps at ~24.8 days; daily delays are far below that.
    timer = setTimeout(async () => {
      try {
        await opts.task();
      } catch (error) {
        log(`[scheduler] discovery run failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      schedule();
    }, at.getTime() - Date.now());
    timer.unref?.();
  };
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
