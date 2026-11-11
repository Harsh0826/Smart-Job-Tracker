"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { CareerProfile } from "@/lib/types";
import { Card } from "./ui";

export function ResumeStep({
  profile,
  onProfile,
  onNext,
}: {
  profile: CareerProfile | null;
  onProfile: (p: CareerProfile) => void;
  onNext: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse(file: File) {
    setBusy(true);
    setError(null);
    try {
      onProfile(await api.parseResume(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const facts = profile?.experiences.reduce((n, e) => n + e.bullets.length, 0) ?? 0;
  const yours = profile?.experiences.reduce((n, e) => n + e.bullets.filter((b) => b.source === "user_stated").length, 0) ?? 0;

  return (
    <div className="stack">
      <Card title="Start with your current resume">
        <p className="muted">
          It becomes your <strong>career profile</strong>: every line is a fact the agents can use, and nothing outside
          it ever goes on your resume.
        </p>
        <div className="seg">
          <button className={mode === "upload" ? "on" : ""} onClick={() => setMode("upload")}>
            Upload file
          </button>
          <button className={mode === "paste" ? "on" : ""} onClick={() => setMode("paste")}>
            Paste text
          </button>
        </div>
        {mode === "upload" ? (
          <label className="drop">
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])}
            />
            <span>{busy ? "Reading your resume…" : "Choose a PDF, DOCX or TXT file (max 5 MB)"}</span>
          </label>
        ) : (
          <>
            <textarea
              rows={12}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"Name\nemail | phone | City, ST\n\nExperience\nJob Title\nCompany | City, ST\nJan 2021 – Present\n• What you did and the result"}
            />
            <button
              className="primary"
              disabled={busy || pasted.trim().length < 40}
              onClick={() => parse(new File([pasted], "resume.txt", { type: "text/plain" }))}
            >
              {busy ? "Reading…" : "Use this text"}
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </Card>

      {profile && (
        <Card
          title={`${profile.contact.name || "Your profile"}`}
          actions={
            <button className="primary" onClick={onNext}>
              Next: target job →
            </button>
          }
        >
          <p className="muted">
            {profile.experiences.length} roles · {facts} facts{yours ? ` (${yours} added by you)` : ""} ·{" "}
            {profile.skills.length} skills
          </p>
          {profile.experiences.length === 0 && (
            <p className="error">
              No roles were recognised. Make sure each role has a date line like “Jan 2021 – Present”, or paste the
              text instead.
            </p>
          )}
          <ul className="roles">
            {profile.experiences.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong> · {e.company} <span className="muted">({e.bullets.length} facts)</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
