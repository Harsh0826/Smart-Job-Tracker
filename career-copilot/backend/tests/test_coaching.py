from fastapi.testclient import TestClient

from app.agents.bullet_coach import coach_resume, grade, suggest_rewrites
from app.agents.cover_letter import write_cover_letter
from app.agents.gap_interviewer import apply_answers, generate_questions
from app.agents.resume_tailor import ResumeTailor
from app.main import app
from app.orchestrator.workflow import TailorWorkflow, absorb_user_edits, review
from app.agents.jd_analyzer import JDAnalyzer
from app.schemas.coaching import (
    CoverLetter, CoverLetterParagraph, GapAnswer, QuestionSet, RewriteSuggestions,
)
from app.schemas.resume import ResumeBullet
from tests.conftest import FakeLLM


# --- Bullet Coach ----------------------------------------------------------------------------------

def test_strong_bullet_outscores_weak_bullet():
    strong, *_ = grade("Cut p95 latency 40% by rebuilding the routing service in FastAPI for 2M events/day")
    weak, _, issues, _ = grade("Responsible for helping the team with various backend tasks")
    assert strong >= 90 and weak <= 40
    assert any("Weak opener" in i for i in issues) and any("No number" in i for i in issues)


def test_coach_report_lists_actions(profile, jd):
    report = coach_resume(ResumeTailor().run(profile, jd))
    assert 0 < report.overall <= 100
    assert len(report.bullets) == 8
    assert any("Quantify" in a for a in report.top_actions)


def test_rewrite_suggestions_drop_ungrounded_ones(profile, jd):
    llm = FakeLLM([RewriteSuggestions(suggestions=[
        ResumeBullet(text="Cut p95 latency 40% with a FastAPI service routing 2M events/day", source_ids=["e1.b1"]),
        ResumeBullet(text="Cut latency 70% with a FastAPI service", source_ids=["e1.b1"]),
        ResumeBullet(text="Built Kafka pipelines for 2M events/day", source_ids=["e1.b1"]),
    ])])
    out = suggest_rewrites(llm, profile, "e1", "Built a Python and FastAPI service", ["e1.b1"], jd)
    assert [s.text for s in out] == ["Cut p95 latency 40% with a FastAPI service routing 2M events/day"]


# --- Gap Interviewer -------------------------------------------------------------------------------

def test_questions_cover_gaps_weak_bullets_and_knockouts(profile, jd):
    qs = generate_questions(profile, jd)
    kinds = {q.kind for q in qs}
    assert kinds == {"skill_gap", "quantify", "confirm"}
    assert any(q.keyword == "Kafka" for q in qs)
    assert all(q.prefill for q in qs if q.kind == "quantify")


def test_llm_can_only_reword_question_prompts(profile, jd):
    drafts = generate_questions(profile, jd)
    reworded = [d.model_copy(update={"prompt": "Better prompt", "keyword": "rust"}) for d in drafts]
    llm = FakeLLM([QuestionSet(questions=reworded)])
    qs = generate_questions(profile, jd, llm)
    assert all(q.prompt == "Better prompt" for q in qs)
    assert [q.keyword for q in qs] == [d.keyword for d in drafts]  # structure stays deterministic


def test_answers_become_facts_and_close_the_gap(profile, jd, jd_text):
    qs = {q.id: q for q in generate_questions(profile, jd)}
    kafka = qs["skill:kafka"]
    quantify = next(q for q in qs.values() if q.kind == "quantify")
    confirm = next(q for q in qs.values() if q.kind == "confirm")
    updated, applied = apply_answers(profile, [
        GapAnswer(question=kafka, answer="Built Kafka consumers that ingest carrier tracking events"),
        GapAnswer(question=quantify, answer=quantify.prefill + ", cutting review time by 30%"),
        GapAnswer(question=confirm, answer="yes"),
        GapAnswer(question=qs["skill:infrastructure as code"], answer="no"),
    ])
    assert len(applied) == 3
    assert "kafka" in [s.lower() for s in updated.skills]
    assert updated.attestations[confirm.prefill] is True
    assert profile.experiences[0].bullets[-1].id == "e1.b4"  # original profile untouched

    before = TailorWorkflow(JDAnalyzer(), ResumeTailor()).run(profile, jd=jd)
    after = TailorWorkflow(JDAnalyzer(), ResumeTailor()).run(updated, jd=jd)
    assert after.status == "ready"
    assert "Kafka" not in {k.term for k in after.score.missing_keywords}
    assert after.score.total > before.score.total


def test_unmet_knockout_caps_readiness(profile, jd):
    confirm = next(q for q in generate_questions(profile, jd) if q.kind == "confirm")
    updated, _ = apply_answers(profile, [GapAnswer(question=confirm, answer="no")])
    result = TailorWorkflow(JDAnalyzer(), ResumeTailor()).run(updated, jd=jd)
    assert result.score.total <= 60


# --- Interactive review ----------------------------------------------------------------------------

def test_user_edits_become_user_stated_facts(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[0].bullets[0] = ResumeBullet(
        text="Led a 6-person rebuild of shipment routing, cutting p95 latency by 40%",
        source_ids=["e1.b1"], user_edited=True,
    )
    # Without absorbing, the new number would be rejected...
    assert not review(profile, resume, jd).verification.passed
    # ...but an explicit user edit is the user's own claim and is recorded as such.
    new_profile, new_resume = absorb_user_edits(profile, resume)
    result = review(new_profile, new_resume, jd)
    assert result.verification.passed and result.status == "ready"
    fact = new_profile.bullet_index()[new_resume.experiences[0].bullets[0].source_ids[0]][1]
    assert fact.source == "user_stated"


# --- Cover letter ----------------------------------------------------------------------------------

def test_offline_cover_letter_is_grounded(profile, jd):
    result = write_cover_letter(profile, jd, company="Acme Freight")
    assert result.issues == []
    assert "Acme Freight" in result.text and "Senior Backend Engineer" in result.text
    assert "2M shipment events" in result.text
    assert result.text.endswith("Jordan Rivera")


def test_llm_cover_letter_invented_numbers_are_flagged(profile, jd):
    letter = CoverLetter(greeting="Dear Hiring Manager,", closing="Best,\nJordan Rivera", paragraphs=[
        CoverLetterParagraph(text="At Northwind I cut latency by 75%.", source_ids=["e1.b1"]),
    ])
    llm = FakeLLM([letter])
    result = write_cover_letter(profile, jd, llm, company="Acme")
    assert any(i.rule == "unsupported_number" for i in result.issues)
    assert llm.calls[0]["tier"] == "main"


# --- API -------------------------------------------------------------------------------------------

def test_api_guided_journey(profile, jd_text):
    c = TestClient(app)
    first = c.post("/api/tailor", json={"profile": profile.model_dump(), "jd_text": jd_text}).json()
    assert first["readiness"] > 0 and first["coach"]["bullets"]

    qs = c.post("/api/interview/questions", json={"profile": first["profile"], "jd": first["jd"]}).json()
    kafka = next(q for q in qs if q["id"] == "skill:kafka")
    answered = c.post("/api/interview/answers", json={"profile": first["profile"], "answers": [
        {"question": kafka, "answer": "Built Kafka consumers for carrier tracking events"}]}).json()
    second = c.post("/api/tailor", json={"profile": answered["profile"], "jd": first["jd"]}).json()
    assert second["score"]["total"] > first["score"]["total"]

    resume = second["resume"]
    resume["experiences"][0]["bullets"][0].update(text="Shipped a routing service used by 12 carriers",
                                                  user_edited=True)
    reviewed = c.post("/api/resume/review",
                      json={"profile": second["profile"], "resume": resume, "jd": second["jd"]}).json()
    assert reviewed["status"] == "ready" and reviewed["exportable"]

    letter = c.post("/api/cover-letter", json={"profile": reviewed["profile"], "jd": second["jd"],
                                               "company": "Acme Freight"}).json()
    assert letter["issues"] == [] and 80 < letter["word_count"] < 400

    rewrite = c.post("/api/coach/rewrite", json={"profile": reviewed["profile"], "experience_id": "e1",
                                                 "bullet": resume["experiences"][0]["bullets"][0],
                                                 "jd": second["jd"]}).json()
    assert rewrite["available"] is False  # offline mode explains instead of failing
