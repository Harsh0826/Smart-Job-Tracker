import type { ReactNode } from "react";
import type { Issue } from "@/lib/types";

export function scoreTone(score: number): "good" | "warn" | "bad" {
  return score >= 80 ? "good" : score >= 65 ? "warn" : "bad";
}

export function Ring({ value, label, size = 112 }: { value: number; label: string; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`ring-value ${scoreTone(value)}`}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <strong>{Math.round(value)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="meter">
      <span>{label}</span>
      <div className="meter-track">
        <div className={`meter-fill ${scoreTone(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="num">{pct}%</span>
    </div>
  );
}

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.severity}>
          <span className="pill">{i.severity}</span> {i.location ? <code>{i.location}</code> : null} {i.message}
        </li>
      ))}
    </ul>
  );
}
