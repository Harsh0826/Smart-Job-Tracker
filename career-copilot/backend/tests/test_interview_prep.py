from fastapi.testclient import TestClient

from app.agents.interview_prep import _split_fact, build_prep, grade_answer
from app.main import app
from app.schemas.prep import StoryDraft, StoryDrafts
from tests.conftest import FakeLLM

STRONG_ANSWER = (
    "At Northwind Logistics our shipment routing service was too slow during peak season, and the "
    "platform team was getting paged most nights. My goal was to bring p95 latency down before the holidays. "
    "I profiled the service, found that synchronous carrier lookups were the bottleneck, and I rebuilt the "
    "routing path in FastAPI with async calls and a small cache. I also added load tests to our CI pipeline "
    "so the regression could not come back, and I walked the team through the design in a review. "
    "As a result, p95 latency dropped by 40% while we handled 2M events per day, and the overnight pages "
    "stopped. It also gave us a pattern we reused for two other services the following quarter."
)


def test_split_fact_separates_action_and_result():
    action, result = _split_fact("Tuned PostgreSQL queries and indexes, cutting report generation from 10 minutes to 45 seconds")
    assert action == "Tuned PostgreSQL queries and indexes"
    assert result == "Cutting report generation from 10 minutes to 45 seconds."
    action, result = _split_fact("Wrote PostgreSQL migrations that reduced dashboard load time by 3x")
    assert (action, result) == ("Wrote PostgreSQL migrations", "Reduced dashboard load time by 3x.")
    assert _split_fact("Mentored 4 engineers") == ("Mentored 4 engineers.", "")


def test_prep_covers_every_category_with_grounded_stories(profile, jd):
    prep = build_prep(profile, jd, company="Acme Freight")
    cats = {q.category for q in prep.questions}
    assert cats == {"role_fit", "technical", "behavioral", "gap"}
    assert "Acme Freight" in next(q.question for q in prep.questions if q.id == "fit:why")
    index = profile.bullet_index()
    for q in prep.questions:
        if q.story:
            fact = index[q.story.source_ids[0]][1].text
            assert q.story.action.rstrip(".") in fact  # Action is lifted from a real fact
            assert any(m.startswith("task") for m in q.story.missing)
    tech = {q.keyword for q in prep.questions if q.category == "technical"}
    assert {"Python", "Kubernetes"} <= tech
    assert any(q.keyword == "Kafka" for q in prep.questions if q.category == "gap")


def test_elevator_pitch_uses_real_facts(profile, jd):
    prep = build_prep(profile, jd)
    assert prep.elevator_pitch.startswith("I'm a Senior Software Engineer at Northwind Logistics")
    assert "Before that, at Contoso Health" in prep.elevator_pitch
    assert all(i in profile.bullet_index() for i in prep.pitch_source_ids)


def test_llm_story_fields_are_kept_only_when_grounded(profile, jd):
    base = build_prep(profile, jd)
    q = next(q for q in base.questions if q.story and q.story.source_ids == ["e1.b1"])
    llm = FakeLLM([StoryDrafts(stories=[StoryDraft(
        question_id=q.id,
        situation="Shipment routing at Northwind was a latency bottleneck.",
        task="Bring p95 latency down by 60%.",  # invented number -> dropped
        result="p95 latency fell 40% at 2M events per day.",
    )])])
    enriched = next(x for x in build_prep(profile, jd, llm).questions if x.id == q.id)
    assert enriched.story.situation.startswith("Shipment routing")
    assert enriched.story.task == ""
    assert enriched.story.result.startswith("p95 latency fell 40%")
    assert any(m.startswith("task") for m in enriched.story.missing)


def test_grader_rewards_a_complete_star_answer(jd):
    good = grade_answer(STRONG_ANSWER, jd)
    assert good.star == {"situation": True, "task": True, "action": True, "result": True}
    assert good.score >= 90 and "FastAPI" in good.keywords_used

    weak = grade_answer("We worked on making things faster and the team was happy with it.", jd)
    assert weak.score <= 40
    assert any("number" in i for i in weak.improvements)
    assert any("Short" in i for i in weak.improvements)


def test_api_prep_and_grade(profile, jd):
    c = TestClient(app)
    prep = c.post("/api/interview-prep", json={"profile": profile.model_dump(), "jd": jd.model_dump(),
                                               "company": "Acme"}).json()
    assert prep["questions"] and prep["questions_to_ask"]
    graded = c.post("/api/interview-prep/grade", json={"answer": STRONG_ANSWER, "jd": jd.model_dump()}).json()
    assert graded["score"] >= 90
    assert c.post("/api/interview-prep/grade", json={"answer": "hi"}).status_code == 422
