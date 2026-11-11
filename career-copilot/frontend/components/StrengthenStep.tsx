"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CareerProfile, GapQuestion, JDAnalysis } from "@/lib/types";
import { Card } from "./ui";

const KIND_LABEL = { skill_gap: "Skill gap", quantify: "Add your result", confirm: "Requirement" } as const;

export function StrengthenStep({
  profile,
  jd,
  onApplied,
  onSkip,
}: {
  profile: CareerProfile;
  jd: JDAnalysis;
  onApplied: (profile: CareerProfile, applied: string[]) => Promise<void>;
  onSkip: () => void;
}) {
  const [questions, setQuestions] = useState<GapQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, { answer: string; experience_id?: string | null }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setQuestions(null);
    api
      .questions(profile, jd)
      .then((qs) => {
        if (!live) return;
        setQuestions(qs);
        setAnswers(
          Object.fromEntries(
            qs.map((q) => [q.id, { answer: q.kind === "quantify" ? q.prefill ?? "" : "", experience_id: q.experience_id }]),
          ),
        );
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [profile, jd]);

  const set = (id: string, patch: Partial<{ answer: string; experience_id: string | null }>) =>
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));

  const answered = (questions ?? []).filter((q) => {
    const a = answers[q.id]?.answer.trim() ?? "";
    return q.kind === "quantify" ? a && a !== q.prefill : a.length > 0;
  });

  async function submit() {
    if (!questions) return;
    setBusy(true);
    setError(null);
    try {
      const payload = answered.map((q) => ({ question: q, ...answers[q.id] }));
      const res = await api.answers(profile, payload);
      await onApplied(res.profile, res.applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Card title="Close the gaps — with real evidence">
        <p className="muted">
          A few quick questions turn what this job wants into facts you can prove. Skip anything that doesn&apos;t apply:
          a skill you haven&apos;t used stays a gap and is never invented.
        </p>
      </Card>

      {!questions && !error && <p className="muted">Finding the gaps that matter most for this job…</p>}
      {questions?.length === 0 && (
        <Card>
          <p className="good">No gaps found: your profile already evidences everything this posting screens for.</p>
          <button onClick={onSkip}>Back to review</button>
        </Card>
      )}

      {questions?.map((q, n) => {
        const a = answers[q.id] ?? { answer: "" };
        return (
          <section key={q.id} className="card question">
            <div className="q-head">
              <span className={`pill ${q.kind}`}>{KIND_LABEL[q.kind]}</span>
              <span className="muted small">
                {n + 1} of {questions.length}
              </span>
            </div>
            <p className="q-prompt">{q.prompt}</p>
            <p className="muted small">{q.why}</p>
            {q.kind === "confirm" ? (
              <div className="seg">
                {["yes", "no"].map((v) => (
                  <button key={v} className={a.answer === v ? "on" : ""} onClick={() => set(q.id, { answer: v })}>
                    {v === "yes" ? "Yes, I meet it" : "No"}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <textarea
                  rows={q.kind === "quantify" ? 2 : 3}
                  value={a.answer}
                  placeholder={
                    q.kind === "skill_gap"
                      ? `e.g. Built … with ${q.keyword}, which cut/raised … by …`
                      : "Add the number: by how much, for how many, how fast"
                  }
                  onChange={(e) => set(q.id, { answer: e.target.value })}
                />
                {q.kind === "skill_gap" && profile.experiences.length > 1 && (
                  <label className="field inline">
                    <span>Which role?</span>
                    <select value={a.experience_id ?? ""} onChange={(e) => set(q.id, { experience_id: e.target.value })}>
                      {profile.experiences.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title} · {e.company}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </section>
        );
      })}

      {error && <p className="error">{error}</p>}
      {questions && questions.length > 0 && (
        <div className="sticky-bar">
          <span className="muted">
            {answered.length} of {questions.length} answered
          </span>
          <button onClick={onSkip}>Back to review</button>
          <button className="primary" disabled={busy || answered.length === 0} onClick={submit}>
            {busy ? "Re-tailoring with your answers…" : "Apply answers & re-tailor"}
          </button>
        </div>
      )}
    </div>
  );
}
