"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AnswerFeedback, CareerProfile, InterviewPrep, JDAnalysis, PrepQuestion } from "@/lib/types";
import { Card, scoreTone } from "./ui";

const CATEGORY = {
  role_fit: "Role fit",
  technical: "Technical",
  behavioral: "Behavioral",
  gap: "Gap",
} as const;
const STAR: [keyof AnswerFeedback["star"], string][] = [
  ["situation", "S"],
  ["task", "T"],
  ["action", "A"],
  ["result", "R"],
];

const lowerFirst = (t: string) => (t.slice(0, 2) === t.slice(0, 2).toUpperCase() ? t : t[0].toLowerCase() + t.slice(1));

/** Turn the STAR facts into a spoken first-person starting point the user then personalises. */
function storyDraft(q: PrepQuestion): string {
  const s = q.story;
  if (!s) return "";
  return [
    s.situation,
    s.task || "[What problem or goal prompted this?]",
    s.action ? `I ${lowerFirst(s.action)}` : "",
    s.result ? `The result: ${lowerFirst(s.result)}` : "[What changed because of it, with a number?]",
  ]
    .filter(Boolean)
    .join(" ");
}

function QuestionCard({ q, jd, onPracticed }: { q: PrepQuestion; jd: JDAnalysis; onPracticed: (id: string, score: number) => void }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const f = await api.grade(answer, jd);
      setFeedback(f);
      onPracticed(q.id, f.score);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card prep-q ${open ? "open" : ""}`}>
      <button className="prep-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`pill ${q.category}`}>{CATEGORY[q.category]}</span>
        <span className="prep-question">{q.question}</span>
        {feedback && <span className={`grade small-grade ${scoreTone(feedback.score)}`}>{feedback.score}</span>}
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="prep-body">
          <p className="muted small">{q.why_they_ask}</p>
          {q.story && (
            <div className="star">
              <h4>Your story (from your own facts)</h4>
              {(["situation", "task", "action", "result"] as const).map((part) => (
                <div key={part} className="star-row">
                  <span className="star-key">{part[0].toUpperCase()}</span>
                  {q.story![part] ? (
                    <span>{q.story![part]}</span>
                  ) : (
                    <span className="hint">
                      {q.story!.missing.find((m) => m.startsWith(part))?.split(": ")[1] ?? "Add this part in your own words."}
                    </span>
                  )}
                </div>
              ))}
              <code className="cite">{q.story.source_ids.join(", ")}</code>
            </div>
          )}
          {q.talking_points.length > 0 && (
            <ul className="points">
              {q.talking_points.map((t, i) => (
                <li key={`${i}-${t}`}>{t}</li>
              ))}
            </ul>
          )}
          <h4>Practice your answer</h4>
          <textarea
            rows={6}
            value={answer}
            placeholder="Type your answer the way you'd say it out loud: situation, what you were trying to do, what you did, what changed."
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="row">
            <button className="primary" disabled={busy || answer.trim().length < 10} onClick={check}>
              {busy ? "Scoring…" : feedback ? "Score again" : "Get feedback"}
            </button>
            {q.story && !answer && (
              <button onClick={() => setAnswer(storyDraft(q))}>Start from my story</button>
            )}
            <span className="muted small">
              {answer.trim() ? `${answer.trim().split(/\s+/).length} words · ~${Math.round(answer.trim().split(/\s+/).length / 2.5)}s spoken` : ""}
            </span>
          </div>
          {error && <p className="error">{error}</p>}
          {feedback && (
            <div className="feedback">
              <div className="star-badges">
                {STAR.map(([k, label]) => (
                  <span key={k} className={`star-badge ${feedback.star[k] ? "on" : ""}`} title={k}>
                    {label}
                  </span>
                ))}
                <strong className={scoreTone(feedback.score)}>{feedback.score}/100</strong>
              </div>
              {feedback.strengths.length > 0 && (
                <ul className="good small">
                  {feedback.strengths.map((s, i) => (
                    <li key={`${i}-${s}`}>{s}</li>
                  ))}
                </ul>
              )}
              {feedback.improvements.length > 0 && (
                <ul className="hint-list small">
                  {feedback.improvements.map((s, i) => (
                    <li key={`${i}-${s}`}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function InterviewPrepStep({
  profile,
  jd,
  company,
}: {
  profile: CareerProfile;
  jd: JDAnalysis;
  company: string;
}) {
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [pitch, setPitch] = useState("");
  const [filter, setFilter] = useState<"all" | PrepQuestion["category"]>("all");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setPrep(null);
    api
      .prep(profile, jd, company)
      .then((p) => {
        if (!live) return;
        setPrep(p);
        setPitch(p.elevator_pitch);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [profile, jd, company]);

  const shown = useMemo(
    () => (prep?.questions ?? []).filter((q) => filter === "all" || q.category === filter),
    [prep, filter],
  );
  const practiced = Object.keys(scores).length;
  const avg = practiced ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / practiced) : null;

  if (error) return <p className="error">{error}</p>;
  if (!prep) return <p className="muted">Predicting the questions for {jd.title} and matching your stories…</p>;

  const counts = prep.questions.reduce<Record<string, number>>((m, q) => ({ ...m, [q.category]: (m[q.category] ?? 0) + 1 }), {});

  return (
    <div className="stack">
      <section className="card prep-hero">
        <div>
          <h2>Interview prep · {prep.role}</h2>
          <p className="muted">
            {prep.questions.length} likely questions, each with a story built from your own facts. Practice out loud,
            then type your answer for instant STAR feedback.
          </p>
        </div>
        <div className="prep-progress">
          <strong>
            {practiced}/{prep.questions.length}
          </strong>
          <span className="muted small">practiced{avg != null ? ` · avg ${avg}` : ""}</span>
        </div>
      </section>

      <Card
        title="Your 30-second pitch"
        actions={
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pitch);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        }
      >
        <p className="muted small">Your answer to “Tell me about yourself”. Make it sound like you, then say it out loud.</p>
        <textarea rows={4} value={pitch} onChange={(e) => setPitch(e.target.value)} />
        <p className="muted small">
          ~{Math.round(pitch.split(/\s+/).length / 2.5)} seconds spoken · built from{" "}
          <code className="cite">{prep.pitch_source_ids.join(", ")}</code>
        </p>
      </Card>

      <div className="seg">
        {(["all", "role_fit", "technical", "behavioral", "gap"] as const).filter((c) => c === "all" || counts[c]).map((c) => (
          <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>
            {c === "all" ? `All (${prep.questions.length})` : `${CATEGORY[c]} (${counts[c] ?? 0})`}
          </button>
        ))}
      </div>

      {shown.map((q) => (
        <QuestionCard key={q.id} q={q} jd={jd} onPracticed={(id, s) => setScores((m) => ({ ...m, [id]: s }))} />
      ))}

      <Card title="Questions to ask them">
        <p className="muted small">Ask two or three. Thoughtful questions are part of how they judge you.</p>
        <ol className="points">
          {prep.questions_to_ask.map((q, i) => (
            <li key={`${i}-${q}`}>{q}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
