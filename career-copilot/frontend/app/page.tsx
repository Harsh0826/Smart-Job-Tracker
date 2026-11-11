"use client";

import { useEffect, useState } from "react";
import { CoverLetterStep } from "@/components/CoverLetterStep";
import { InterviewPrepStep } from "@/components/InterviewPrepStep";
import { JobStep } from "@/components/JobStep";
import { ResumeStep } from "@/components/ResumeStep";
import { ReviewStep } from "@/components/ReviewStep";
import { StrengthenStep } from "@/components/StrengthenStep";
import { api } from "@/lib/api";
import type { CareerProfile, TailorResponse } from "@/lib/types";

const STEPS = ["Resume", "Target job", "Review & edit", "Strengthen", "Cover letter", "Interview prep"] as const;
const STORE_KEY = "career-copilot:draft:v1";

type Saved = { profile: CareerProfile | null; jdText: string; company: string };

function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(data: Saved) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: drafts just won't persist */
  }
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [jdText, setJdText] = useState("");
  const [company, setCompany] = useState("");
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [previousReadiness, setPreviousReadiness] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string[]>([]);
  const [llm, setLlm] = useState<string | null>(null);

  useEffect(() => {
    const saved = load();
    if (saved) {
      setProfile(saved.profile);
      setJdText(saved.jdText);
      setCompany(saved.company);
    }
    api
      .health()
      .then((h) => setLlm(h.llm))
      .catch(() => setLlm("offline"));
  }, []);

  useEffect(() => save({ profile, jdText, company }), [profile, jdText, company]);

  function accept(next: TailorResponse) {
    setPreviousReadiness(result ? result.readiness : null);
    setResult(next);
    setProfile(next.profile);
  }

  async function run() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.tailor(profile, jdText);
      setPreviousReadiness(null);
      setResult(next);
      setProfile(next.profile);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function applied(newProfile: CareerProfile, messages: string[]) {
    if (!result) return;
    const next = await api.tailor(newProfile, undefined, result.jd);
    accept(next);
    setToast(messages.length ? messages : ["Nothing new to add."]);
    setStep(2);
  }

  function reset() {
    setProfile(null);
    setJdText("");
    setCompany("");
    setResult(null);
    setPreviousReadiness(null);
    setStep(0);
  }

  const unlocked = [true, !!profile, !!result, !!result, !!result, !!result];

  return (
    <main>
      <header className="top">
        <div>
          <h1>Career Copilot</h1>
          <p className="muted">Truthful, ATS-ready applications that get interviews.</p>
        </div>
        <div className="row">
          {llm && (
            <span className={`mode ${llm}`} title={llm === "anthropic" ? "Claude agents active" : "Rule-based agents (set ANTHROPIC_API_KEY for AI writing)"}>
              {llm === "anthropic" ? "AI agents on" : llm === "offline" ? "API offline" : "Offline mode"}
            </span>
          )}
          <button className="link" onClick={reset}>
            Start over
          </button>
        </div>
      </header>

      <nav className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={`step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
            disabled={!unlocked[i]}
            onClick={() => setStep(i)}
          >
            <span className="dot">{i < step ? "✓" : i + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {toast.length > 0 && (
        <div className="toast" role="status">
          <ul>
            {toast.map((t, i) => (
              <li key={`${i}-${t}`}>{t}</li>
            ))}
          </ul>
          <button className="link" onClick={() => setToast([])}>
            Dismiss
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {step === 0 && <ResumeStep profile={profile} onProfile={setProfile} onNext={() => setStep(1)} />}
      {step === 1 && (
        <JobStep jdText={jdText} company={company} onJdText={setJdText} onCompany={setCompany} onRun={run} busy={busy} />
      )}
      {step === 2 && result && (
        <ReviewStep
          result={result}
          previousReadiness={previousReadiness}
          onResult={accept}
          onStrengthen={() => setStep(3)}
          onCoverLetter={() => setStep(4)}
          onPrep={() => setStep(5)}
        />
      )}
      {step === 3 && result && (
        <StrengthenStep profile={result.profile} jd={result.jd} onApplied={applied} onSkip={() => setStep(2)} />
      )}
      {step === 4 && result && <CoverLetterStep profile={result.profile} jd={result.jd} company={company} />}
      {step === 5 && result && <InterviewPrepStep profile={result.profile} jd={result.jd} company={company} />}
    </main>
  );
}
