"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { CareerProfile, CoverLetterResult, JDAnalysis } from "@/lib/types";
import { Card, IssueList } from "./ui";

export function CoverLetterStep({
  profile,
  jd,
  company: initialCompany,
}: {
  profile: CareerProfile;
  jd: JDAnalysis;
  company: string;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("confident");
  const [result, setResult] = useState<CoverLetterResult | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.coverLetter(profile, jd, company, notes, tone);
      setResult(r);
      setText(r.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed: select the text and copy it manually.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.contact.name.replace(/\s+/g, "-")}-Cover-Letter.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="stack">
      <Card title={`Cover letter for ${jd.title}`}>
        <p className="muted">
          Built on your 2–3 achievements that best match this job. Every claim traces back to your profile.
        </p>
        <div className="grid tight">
          <label className="field">
            <span>Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
          </label>
          <label className="field">
            <span>Tone</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="confident">Confident</option>
              <option value="warm">Warm</option>
              <option value="concise">Concise</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Why this company? (optional: mission, product, news you care about)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="primary" disabled={busy} onClick={generate}>
          {busy ? "Writing…" : result ? "Regenerate" : "Write my cover letter"}
        </button>
        {error && <p className="error">{error}</p>}
      </Card>

      {result && (
        <Card
          title="Your letter"
          actions={
            <div className="row">
              <span className={`muted small ${words > 400 ? "error" : ""}`}>{words} words · aim for 250–400</span>
              <button onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
              <button onClick={download}>Download .txt</button>
            </div>
          }
        >
          <IssueList issues={result.issues} />
          {words < 200 && (
            <p className="muted small">
              Short draft. Add why this company matters to you (field above) and regenerate, or connect Claude for a
              polished 250–400 word letter.
            </p>
          )}
          <textarea className="letter" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
        </Card>
      )}
    </div>
  );
}
