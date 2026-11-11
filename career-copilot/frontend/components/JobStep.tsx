"use client";

import { Card } from "./ui";

export function JobStep({
  jdText,
  company,
  onJdText,
  onCompany,
  onRun,
  busy,
}: {
  jdText: string;
  company: string;
  onJdText: (v: string) => void;
  onCompany: (v: string) => void;
  onRun: () => void;
  busy: boolean;
}) {
  const ready = jdText.trim().length >= 80;
  return (
    <Card title="Which job are you going for?">
      <p className="muted">
        Paste the full posting, including requirements and nice-to-haves. The agents extract what the employer screens
        for and tailor your resume to it.
      </p>
      <label className="field">
        <span>Company</span>
        <input value={company} onChange={(e) => onCompany(e.target.value)} placeholder="e.g. Acme Freight" />
      </label>
      <label className="field">
        <span>Job description</span>
        <textarea rows={14} value={jdText} onChange={(e) => onJdText(e.target.value)} placeholder="Paste the job description" />
      </label>
      <div className="row">
        <button className="primary" disabled={!ready || busy} onClick={onRun}>
          {busy ? "Analyzing, tailoring, verifying…" : "Tailor my resume"}
        </button>
        {!ready && <span className="muted small">Paste at least a few lines of the posting.</span>}
      </div>
    </Card>
  );
}
