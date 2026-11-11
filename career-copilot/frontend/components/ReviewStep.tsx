"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { BulletFeedback, Resume, ResumeBullet, TailorResponse } from "@/lib/types";
import { Card, IssueList, Meter, Ring, scoreTone } from "./ui";

const BAND = { strong: "Strong match", tailor_further: "Tailor further", weak_fit: "Weak fit" } as const;
const COMPONENTS: [string, string][] = [
  ["must_have_coverage", "Must-have skills"],
  ["other_coverage", "Nice-to-haves & tools"],
  ["placement", "Keywords in experience"],
  ["title_seniority_alignment", "Title & seniority"],
  ["parse_fidelity", "ATS parse fidelity"],
  ["structure", "Format & structure"],
];

type Suggestions = Record<string, { loading?: boolean; items?: ResumeBullet[]; message?: string | null }>;

export function ReviewStep({
  result,
  previousReadiness,
  onResult,
  onStrengthen,
  onCoverLetter,
  onPrep,
}: {
  result: TailorResponse;
  previousReadiness: number | null;
  onResult: (r: TailorResponse) => void;
  onStrengthen: () => void;
  onCoverLetter: () => void;
  onPrep: () => void;
}) {
  const [draft, setDraft] = useState<Resume>(result.resume);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions>({});

  useEffect(() => {
    setDraft(result.resume);
    setDirty(false);
    setSuggestions({});
  }, [result]);

  const feedback = useMemo(() => {
    const map = new Map<string, BulletFeedback>();
    result.coach.bullets.forEach((f) => map.set(`${f.experience_id}:${f.text}`, f));
    return map;
  }, [result]);

  function update(fn: (r: Resume) => void) {
    const next: Resume = structuredClone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
  }

  async function recheck() {
    setBusy(true);
    setError(null);
    try {
      onResult(await api.review(result.profile, draft, result.jd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await api.downloadDocx(result.profile, result.resume, result.jd);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rewrite(expId: string, i: number, bullet: ResumeBullet) {
    const key = `${expId}:${i}`;
    setSuggestions((s) => ({ ...s, [key]: { loading: true } }));
    try {
      const res = await api.rewrite(result.profile, expId, bullet, result.jd);
      setSuggestions((s) => ({ ...s, [key]: { items: res.suggestions, message: res.message } }));
    } catch (e) {
      setSuggestions((s) => ({ ...s, [key]: { message: e instanceof Error ? e.message : String(e) } }));
    }
  }

  const { score, coach } = result;
  const delta = previousReadiness == null ? null : Math.round((result.readiness - previousReadiness) * 10) / 10;
  const errors = result.verification.issues.filter((i) => i.severity === "error");
  const mustGaps = score.missing_keywords.filter((k) => k.category === "must_have");

  return (
    <div className="stack">
      <section className="card hero">
        <Ring value={result.readiness} label="Interview readiness" size={132} />
        <div className="hero-body">
          <h2>{result.jd.title}</h2>
          <p className={`badge ${result.status}`}>
            {result.status === "ready" ? "Verified and ready to export" : "Needs your review before export"}
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? "delta up" : "delta down"}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since last check
              </span>
            )}
          </p>
          <div className="mini-scores">
            <span className={`chip-score ${scoreTone(score.total)}`}>
              ATS match <strong>{score.total}</strong> · {BAND[score.band]}
            </span>
            <span className={`chip-score ${scoreTone(coach.overall)}`}>
              Bullet impact <strong>{coach.overall}</strong>
            </span>
          </div>
          {coach.top_actions.length + mustGaps.length > 0 && (
            <ul className="actions">
              {mustGaps.length > 0 && (
                <li>
                  {mustGaps.length} required skill{mustGaps.length > 1 ? "s" : ""} not evidenced:{" "}
                  <strong>{mustGaps.map((k) => k.term).join(", ")}</strong>
                </li>
              )}
              {coach.top_actions.map((a, i) => (
                <li key={`${i}-${a}`}>{a}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="hero-cta">
          {result.exportable && !dirty ? (
            <button className="primary" disabled={busy} onClick={download}>
              {busy ? "Preparing…" : "Download DOCX"}
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={recheck}>
              {busy ? "Checking…" : dirty ? "Re-check my edits" : "Re-check"}
            </button>
          )}
          <button onClick={onStrengthen}>Close gaps & boost score →</button>
          <button onClick={onCoverLetter}>Write cover letter →</button>
          <button onClick={onPrep}>Prep for interviews →</button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        <Card title="What the ATS sees">
          {COMPONENTS.map(([key, label]) => (
            <Meter key={key} label={label} value={score.components[key] ?? 0} />
          ))}
          {score.components.stuffing_penalty > 0 && (
            <p className="error small">Keyword stuffing penalty −{score.components.stuffing_penalty}</p>
          )}
          <p className="muted small">{score.label}. Vendors don&apos;t publish their ranking logic.</p>
        </Card>
        <Card title="Skill gaps">
          {score.missing_keywords.length === 0 ? (
            <p className="good">Every keyword in this posting is backed by your experience.</p>
          ) : (
            <>
              <div className="chips">
                {score.missing_keywords.map((k, i) => (
                  <span key={`${i}-${k.term}`}className={`chip ${k.category}`} title={k.category.replace("_", " ")}>
                    {k.term}
                  </span>
                ))}
              </div>
              <p className="muted small">
                Never added without evidence. If you have used one, answer its question in the next step.
              </p>
              <button onClick={onStrengthen}>Answer gap questions →</button>
            </>
          )}
          {score.knockouts_to_confirm.length > 0 && (
            <>
              <h4>Hard requirements</h4>
              <ul className="small">
                {score.knockouts_to_confirm.map((k, i) => (
                  <li key={`${i}-${k}`}>
                    {k}{" "}
                    {result.profile.attestations[k] === true && <span className="good">✓ confirmed</span>}
                    {result.profile.attestations[k] === false && <span className="error">✗ not met</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {(errors.length > 0 || (result.lint?.violations.length ?? 0) > 0) && (
        <Card title="Fix before export">
          <IssueList issues={[...errors, ...(result.lint?.violations ?? [])]} />
        </Card>
      )}

      <Card
        title="Your tailored resume"
        actions={
          <button className="primary" disabled={busy || !dirty} onClick={recheck}>
            {busy ? "Checking…" : "Re-check edits"}
          </button>
        }
      >
        <p className="muted small">
          Edit anything. Text you write is saved as your own claim; AI suggestions only use facts you already gave.
        </p>
        <label className="field">
          <span>Summary</span>
          <textarea
            rows={3}
            value={draft.summary ?? ""}
            onChange={(e) => update((r) => void (r.summary = e.target.value))}
          />
        </label>

        {draft.experiences.map((exp, ei) => (
          <div key={exp.id} className="role-block">
            <div className="role-head">
              <strong>{exp.title}</strong> · {exp.company}
              <span className="muted small"> (title, company and dates come from your profile)</span>
            </div>
            {exp.bullets.map((b, bi) => {
              const fb = feedback.get(`${exp.id}:${b.text}`);
              const key = `${exp.id}:${bi}`;
              const sug = suggestions[key];
              return (
                <div key={bi} className="bullet">
                  <div className="bullet-main">
                    {fb ? (
                      <span className={`grade ${scoreTone(fb.score)}`} title="Impact score">
                        {fb.score}
                      </span>
                    ) : (
                      <span className="grade edited" title="Edited: re-check to grade">
                        ✎
                      </span>
                    )}
                    <textarea
                      rows={2}
                      value={b.text}
                      onChange={(e) =>
                        update((r) => {
                          r.experiences[ei].bullets[bi].text = e.target.value;
                          r.experiences[ei].bullets[bi].user_edited = true;
                        })
                      }
                    />
                    <div className="bullet-tools">
                      <button title="AI rewrite" onClick={() => rewrite(exp.id, bi, b)}>
                        ✨
                      </button>
                      <button
                        title="Move up"
                        disabled={bi === 0}
                        onClick={() =>
                          update((r) => {
                            const list = r.experiences[ei].bullets;
                            [list[bi - 1], list[bi]] = [list[bi], list[bi - 1]];
                          })
                        }
                      >
                        ↑
                      </button>
                      <button title="Remove" onClick={() => update((r) => void r.experiences[ei].bullets.splice(bi, 1))}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="bullet-meta">
                    <code className="cite">{b.source_ids.join(", ") || "your edit"}</code>
                    {fb?.issues.map((i, n) => (
                      <span key={`${n}-${i}`} className="hint">
                        {i}
                      </span>
                    ))}
                  </div>
                  {sug && (
                    <div className="suggestions">
                      {sug.loading && <span className="muted small">Writing grounded rewrites…</span>}
                      {sug.message && <span className="muted small">{sug.message}</span>}
                      {sug.items?.map((s, si) => (
                        <button
                          key={si}
                          className="suggestion"
                          onClick={() => {
                            update((r) => void (r.experiences[ei].bullets[bi] = { ...s, user_edited: false }));
                            setSuggestions((x) => ({ ...x, [key]: {} }));
                          }}
                        >
                          {s.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className="link"
              onClick={() => update((r) => void r.experiences[ei].bullets.push({ text: "", source_ids: [], user_edited: true }))}
            >
              + Add a bullet
            </button>
          </div>
        ))}

        <h4>Skills</h4>
        <div className="chips">
          {draft.skills.map((s, i) => (
            <span key={`${i}-${s}`} className="chip removable">
              {s}
              <button aria-label={`Remove ${s}`} onClick={() => update((r) => void r.skills.splice(i, 1))}>
                ×
              </button>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
