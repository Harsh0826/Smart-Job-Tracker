// Runs inside the API process. On serverless hosting, run the discovery CLI from a cron job instead.

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

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  const atWholeSecond = Math.floor(at.getTime() / 1000) * 1000;

  return asUtc - atWholeSecond;
}

export function nextRunAt(
  now: Date,
  hour: number,
  minute: number,
  timeZone = "America/Toronto"
): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));

  for (let addDays = 0; addDays < 3; addDays++) {
    const wall = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + addDays,
      hour,
      minute
    );

    // Look up the offset again at the target time in case DST changes before then.
    let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
    utc = wall - zoneOffsetMs(new Date(utc), timeZone);

    if (utc > now.getTime()) {
      return new Date(utc);
    }
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

  function schedule() {
    if (stopped) return;

    const at = nextRunAt(new Date(), opts.hour, opts.minute, opts.timeZone);
    const clock = `${opts.hour}:${String(opts.minute).padStart(2, "0")}`;

    log(`[scheduler] next discovery run at ${at.toISOString()} (${clock} ${opts.timeZone})`);

    timer = setTimeout(async () => {
      try {
        await opts.task();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`[scheduler] discovery run failed: ${message}`);
      }

      schedule();
    }, at.getTime() - Date.now());

    timer.unref?.();
  }

  schedule();

  return () => {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
    }
  };
}
