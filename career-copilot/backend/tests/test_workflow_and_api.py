from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.agents.jd_analyzer import JDAnalyzer
from app.agents.llm import FALLBACK_BETA, AnthropicLLM, LLMError
from app.agents.renderer import render_docx
from app.agents.resume_tailor import ResumeTailor, TailoredRole, TailorOutput
from app.main import app
from app.orchestrator.workflow import TailorWorkflow
from app.schemas.jd import JDExtraction
from app.schemas.resume import ResumeBullet
from tests.conftest import FakeLLM


def _output(text: str) -> TailorOutput:
    return TailorOutput(
        summary="Backend engineer building Python and Java services.",
        roles=[TailoredRole(experience_id="e1", bullets=[ResumeBullet(text=text, source_ids=["e1.b1"])])],
        skills=["Python", "FastAPI", "Kubernetes"],
    )


# --- workflow ------------------------------------------------------------------------------------

def test_heuristic_workflow_is_ready_to_export(profile, jd_text):
    result = TailorWorkflow(JDAnalyzer(), ResumeTailor()).run(profile, jd_text)
    assert result.status == "ready"
    assert result.docx and result.score.band == "strong"
    assert result.attempts == 1


def test_verifier_feedback_drives_a_rewrite(profile, jd_text):
    llm = FakeLLM([
        _output("Built a FastAPI service for 2M events/day, cutting p95 latency by 65%"),
        _output("Built a FastAPI service for 2M events/day, cutting p95 latency by 40%"),
    ])
    result = TailorWorkflow(JDAnalyzer(), ResumeTailor(llm)).run(profile, jd_text)
    assert result.status == "ready" and result.attempts == 2
    assert "65%" in llm.calls[1]["user"] and "<feedback>" in llm.calls[1]["user"]
    assert llm.calls[0]["tier"] == "main" and llm.calls[0]["effort"] == "high"
    assert "jordan.rivera@example.com" not in llm.calls[0]["user"]  # contact never sent to the model


def test_persistent_hallucination_goes_to_user_review(profile, jd_text):
    llm = FakeLLM([_output("Grew revenue by 300%")] * 3)
    result = TailorWorkflow(JDAnalyzer(), ResumeTailor(llm), max_rewrites=2).run(profile, jd_text)
    assert result.status == "needs_user_review"
    assert result.docx is None and result.attempts == 3


# --- LLM gateway (no network: fake SDK client) ----------------------------------------------------

class _FakeSDK:
    def __init__(self, stop_reason="end_turn"):
        self.kwargs = None
        parsed = JDExtraction(title="Engineer")
        response = SimpleNamespace(stop_reason=stop_reason, parsed_output=parsed, stop_details=None)

        def parse(**kwargs):
            self.kwargs = kwargs
            return response

        self.messages = SimpleNamespace(parse=parse)
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=parse))


def test_gateway_main_tier_uses_fallbacks_and_redacts_pii():
    sdk = _FakeSDK()
    llm = AnthropicLLM("claude-opus-5-5", "claude-haiku-5-5", client=sdk)
    llm.structured(system="s", user="email me at a.b@example.com", schema=JDExtraction, tier="main")
    assert sdk.kwargs["model"] == "claude-opus-5-5"
    assert sdk.kwargs["betas"] == [FALLBACK_BETA] and sdk.kwargs["fallbacks"] == "default"
    assert sdk.kwargs["output_config"] == {"effort": "high"}
    assert "[EMAIL]" in sdk.kwargs["messages"][0]["content"]


def test_gateway_worker_tier_has_no_fallback_and_refusal_raises():
    sdk = _FakeSDK()
    AnthropicLLM("m", "claude-haiku-5-5", client=sdk).structured(
        system="s", user="u", schema=JDExtraction, tier="worker", effort="low"
    )
    assert sdk.kwargs["model"] == "claude-haiku-5-5" and "fallbacks" not in sdk.kwargs
    with pytest.raises(LLMError):
        AnthropicLLM("m", "w", client=_FakeSDK("refusal")).structured(system="s", user="u", schema=JDExtraction)


# --- API -----------------------------------------------------------------------------------------

def test_api_parse_tailor_and_download(profile, jd_text, jd):
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok", "llm": "heuristic"}

    docx = render_docx(ResumeTailor().run(profile, jd))
    parsed = client.post("/api/profile/parse", files={"file": ("resume.docx", docx)})
    assert parsed.status_code == 200
    assert parsed.json()["experiences"][0]["company"] == "Northwind Logistics"

    tailored = client.post("/api/tailor", json={"profile": parsed.json(), "jd_text": jd_text}).json()
    assert tailored["status"] == "ready" and tailored["verification"]["passed"] is True
    assert tailored["score"]["band"] in {"strong", "tailor_further"}

    assert tailored["exportable"] is True

    # Export is rendered on demand from the resume on screen: nothing stored, nothing to expire.
    body = {"profile": tailored["profile"], "resume": tailored["resume"], "jd": tailored["jd"]}
    download = client.post("/api/resume/export", json=body)
    assert download.status_code == 200
    assert download.content[:2] == b"PK"  # a real .docx (zip) file
    assert "Jordan-Rivera-Resume" in download.headers["content-disposition"]

    # Unverified claims are still never exported.
    body["resume"]["experiences"][0]["bullets"][0]["text"] = "Cut latency by 99% for 50M users"
    blocked = client.post("/api/resume/export", json=body)
    assert blocked.status_code == 422 and "Fix before export" in blocked.json()["detail"]


def test_api_rejects_unsupported_upload():
    client = TestClient(app)
    response = client.post("/api/profile/parse", files={"file": ("resume.png", b"\x89PNG")})
    assert response.status_code == 415
