import app from "./app";
import { env } from "./config/env";
import { startDailyScheduler } from "./discovery/scheduler";
import { runDiscoveryForUser } from "./discovery/service";

app.listen(Number(env.port), () => {
  console.log(`Server running on http://localhost:${env.port}`);
});

if (process.env.DISCOVERY_SCHEDULE_ENABLED === "true") {
  const userId = process.env.DISCOVERY_USER_ID;

  if (!userId) {
    console.error(
      "[scheduler] DISCOVERY_SCHEDULE_ENABLED=true but DISCOVERY_USER_ID is not set; scheduler disabled"
    );
  } else {
    const scheduleTime = process.env.DISCOVERY_SCHEDULE_TIME || "08:00";
    const [hour, minute] = scheduleTime.split(":").map(Number);

    startDailyScheduler({
      hour,
      minute,
      timeZone: process.env.DISCOVERY_SCHEDULE_TZ || "America/Toronto",
      task: async () => {
        const summary = await runDiscoveryForUser(userId, "scheduled");
        const shortlistedCount = summary.shortlisted.length;

        console.log(
          `[scheduler] run ${summary.runId}: ${shortlistedCount} shortlisted of ${summary.postingsFetched} postings`
        );
      },
    });
  }
}
