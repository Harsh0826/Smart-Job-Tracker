const MS_PER_HOUR = 60 * 60 * 1000;

export function formatPostedAgo(value: string | null): string {
  if (!value) return "Unverified";

  const hours = (Date.now() - new Date(value).getTime()) / MS_PER_HOUR;

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes}m ago`;
  }

  if (hours < 48) {
    return `${Math.round(hours)}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

export function getScoreClassName(score: number | null): string {
  if (score === null) return "score-pill";

  if (score >= 85) return "score-pill score-high";

  if (score >= 70) return "score-pill score-mid";

  return "score-pill score-low";
}
