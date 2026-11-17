// Usage: npm run discovery [-- --dry-run [--profile <file>] [--json <file>] [--window <hours>]]
import fs from "node:fs";
import { loadBoards } from "../discovery/boards";
import { formatAge } from "../discovery/freshness";
import { createHttpClient } from "../discovery/http";
import { isCanadaJob } from "../discovery/location";
import { runDiscoveryPipeline } from "../discovery/pipeline";
import { buildCandidateProfile, masterProfileSchema } from "../discovery/profile";
import { roleFamilies } from "../discovery/scoring";
import { CandidateProfile, EvaluatedJob } from "../discovery/types";

const EXCLUDED_REJECTIONS = ["evergreen", "repost", "duplicate", "irrelevant_role"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function isFreshTargetPosting(evaluation: EvaluatedJob): boolean {
  return (
    evaluation.freshness.status === "fresh" &&
    isCanadaJob(evaluation.job.locations, evaluation.job.country) &&
    roleFamilies(evaluation.job.title).length > 0 &&
    !EXCLUDED_REJECTIONS.includes(evaluation.rejection ?? "")
  );
}

async function dryRun() {
  const profilePath = arg("--profile");
  const windowHours = Math.min(24, Number(arg("--window") ?? 24));

  let candidate: CandidateProfile;
  let scored = true;

  if (profilePath) {
    const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    const profile = masterProfileSchema.parse(raw);
    candidate = buildCandidateProfile(profile);
  } else {
    scored = false;

    // Placeholder so the freshness, location and dedup checks can still run. Its scores are not shown.
    candidate = buildCandidateProfile({
      contact: { name: "-" },
      experiences: [],
      education: [],
      skills: [],
      certifications: [],
    });
  }

  const report = await runDiscoveryPipeline({
    boards: loadBoards(),
    candidate,
    http: createHttpClient(),
    known: [],
    windowHours,
    log: (m) => console.error(m),
  });

  const errorCount = report.boardErrors.length;

  console.log(
    `\nBoards: ${report.boardsQueried} (${errorCount} errors) · postings fetched: ${report.postingsFetched}`
  );
  console.log("Rejected:", report.rejectedCounts);

  if (scored) {
    console.log(`\nShortlist (score >= 70, posted <= ${windowHours}h, Canada):`);

    for (const e of report.shortlisted) {
      const age = formatAge(e.freshness.ageHours!);
      console.log(
        `  ${e.score!.total}  ${e.job.company} - ${e.job.title} | ${e.job.location} | ${age} ago | ${e.job.applyUrl}`
      );
    }

    if (!report.shortlisted.length) {
      console.log("  (none met the criteria)");
    }

    console.log("\nNear misses:");

    for (const e of report.nearMisses) {
      console.log(`  ${e.score!.total}  ${e.job.company} - ${e.job.title}`);
    }
  } else {
    const fresh = report.evaluated.filter(isFreshTargetPosting);

    console.log(
      `\nFresh (<= ${windowHours}h) Canadian postings in target role families - UNSCORED (no Master Resume):`
    );

    for (const e of fresh) {
      const age = formatAge(e.freshness.ageHours!).padStart(4);
      console.log(
        `  ${age}  ${e.job.company} - ${e.job.title} | ${e.job.location} | ${e.job.workArrangement} | ${e.job.applyUrl}`
      );
    }

    if (!fresh.length) {
      console.log("  (none)");
    }
  }

  const jsonPath = arg("--json");

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  }
}

async function fullRun() {
  const userId = process.env.DISCOVERY_USER_ID;

  if (!userId) {
    throw new Error("Set DISCOVERY_USER_ID to the Supabase user ID that owns the tracker");
  }

  // Imported lazily because config/env requires Supabase, AWS and OpenAI variables on import.
  const { runDiscoveryForUser } = await import("../discovery/service");
  const summary = await runDiscoveryForUser(userId, "cli");

  console.log(JSON.stringify(summary, null, 2));
}

const run = process.argv.includes("--dry-run") ? dryRun : fullRun;

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
