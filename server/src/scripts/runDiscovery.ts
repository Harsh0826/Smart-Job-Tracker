/**
 * Job discovery CLI.
 *
 *   npm run discovery                         # full run for DISCOVERY_USER_ID, saves to Supabase
 *   npm run discovery -- --dry-run --profile ./master_profile.json
 *                                             # fetch + score, print results, write nothing
 *   npm run discovery -- --dry-run            # no resume: list fresh Canadian postings only (unscored)
 *   Options: --json <file> writes the dry-run report; --window <hours> (dry-run only, max 24)
 */
import fs from "node:fs";
import { loadBoards } from "../discovery/boards";
import { formatAge } from "../discovery/freshness";
import { createHttpClient } from "../discovery/http";
import { isCanadaJob } from "../discovery/location";
import { runDiscoveryPipeline } from "../discovery/pipeline";
import { buildCandidateProfile, masterProfileSchema } from "../discovery/profile";
import { roleFamilies } from "../discovery/scoring";
import { CandidateProfile } from "../discovery/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function dryRun() {
  const profilePath = arg("--profile");
  const windowHours = Math.min(24, Number(arg("--window") ?? 24));
  let candidate: CandidateProfile;
  let scored = true;
  if (profilePath) {
    const profile = masterProfileSchema.parse(JSON.parse(fs.readFileSync(profilePath, "utf8")));
    candidate = buildCandidateProfile(profile);
  } else {
    scored = false;
    // Without a Master Resume nothing can be scored; this placeholder only lets the pipeline run its
    // freshness / location / dedup gates. Scores from it are not shown.
    candidate = buildCandidateProfile({ contact: { name: "-" }, experiences: [], education: [], skills: [], certifications: [] });
  }

  const report = await runDiscoveryPipeline({
    boards: loadBoards(),
    candidate,
    http: createHttpClient(),
    known: [],
    windowHours,
    log: (m) => console.error(m),
  });

  console.log(`\nBoards: ${report.boardsQueried} (${report.boardErrors.length} errors) · postings fetched: ${report.postingsFetched}`);
  console.log("Rejected:", report.rejectedCounts);

  if (scored) {
    console.log(`\nShortlist (score >= 70, posted <= ${windowHours}h, Canada):`);
    for (const e of report.shortlisted) {
      console.log(`  ${e.score!.total}  ${e.job.company} — ${e.job.title} | ${e.job.location} | ${formatAge(e.freshness.ageHours!)} ago | ${e.job.applyUrl}`);
    }
    if (!report.shortlisted.length) console.log("  (none met the criteria)");
    console.log("\nNear misses:");
    for (const e of report.nearMisses) console.log(`  ${e.score!.total}  ${e.job.company} — ${e.job.title}`);
  } else {
    const fresh = report.evaluated.filter(
      (e) =>
        e.freshness.status === "fresh" &&
        isCanadaJob(e.job.locations, e.job.country) &&
        roleFamilies(e.job.title).length > 0 &&
        !["evergreen", "repost", "duplicate", "irrelevant_role"].includes(e.rejection ?? "")
    );
    console.log(`\nFresh (<= ${windowHours}h) Canadian postings in target role families — UNSCORED (no Master Resume):`);
    for (const e of fresh) {
      console.log(`  ${formatAge(e.freshness.ageHours!).padStart(4)}  ${e.job.company} — ${e.job.title} | ${e.job.location} | ${e.job.workArrangement} | ${e.job.applyUrl}`);
    }
    if (!fresh.length) console.log("  (none)");
  }

  const jsonPath = arg("--json");
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
}

async function fullRun() {
  const userId = process.env.DISCOVERY_USER_ID;
  if (!userId) throw new Error("Set DISCOVERY_USER_ID to the Supabase user ID that owns the tracker");
  // Imported lazily: config/env validates Supabase/AWS/OpenAI variables at import time.
  const { runDiscoveryForUser } = await import("../discovery/service");
  const summary = await runDiscoveryForUser(userId, "cli");
  console.log(JSON.stringify(summary, null, 2));
}

(process.argv.includes("--dry-run") ? dryRun() : fullRun()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
