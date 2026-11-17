import type { ScoreBreakdown } from "../../api/discovery";

const DIMENSION_LABELS: Record<string, string> = {
  technicalSkills: "Technical skills",
  experience: "Experience & seniority",
  responsibilities: "Responsibilities",
  roleRelevance: "Role relevance",
  location: "Location & arrangement",
};

type Props = {
  breakdown: ScoreBreakdown;
};

export default function ScoreBreakdownList({ breakdown }: Props) {
  return (
    <>
      <h3 className="detail-heading">Why it scored {breakdown.total}</h3>

      <ul className="score-breakdown">
        {Object.entries(breakdown.dimensions).map(([key, dimension]) => {
          const label = DIMENSION_LABELS[key] ?? key;
          const weightPercent = Math.round(dimension.weight * 100);
          const points = Math.round(dimension.score * dimension.weight * 100);
          const barWidth = `${Math.round(dimension.score * 100)}%`;
          const isLowConfidence = breakdown.lowConfidence.includes(key);

          return (
            <li key={key}>
              <div className="score-row">
                <span>
                  {label} ({weightPercent}%)
                </span>
                <strong>
                  {points} / {weightPercent}
                </strong>
              </div>

              <div className="score-bar">
                <span style={{ width: barWidth }} />
              </div>

              <div className="muted-small">
                {dimension.explanation}
                {isLowConfidence ? " · low confidence" : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
