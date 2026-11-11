import os

# Never call a real model from the test suite, even if ANTHROPIC_API_KEY is set locally.
os.environ["LLM_MODE"] = "heuristic"

import json  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app.agents.jd_analyzer import JDAnalyzer  # noqa: E402
from app.schemas.profile import CareerProfile  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


class FakeLLM:
    """Returns queued structured outputs in order and records every call."""

    def __init__(self, responses: list[BaseModel]):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def structured(self, *, system, user, schema, tier="main", effort="high"):
        self.calls.append({"system": system, "user": user, "schema": schema, "tier": tier, "effort": effort})
        response = self.responses.pop(0)
        assert isinstance(response, schema), f"queued {type(response).__name__}, asked for {schema.__name__}"
        return response


@pytest.fixture
def profile() -> CareerProfile:
    return CareerProfile.model_validate(json.loads((FIXTURES / "profile.json").read_text()))


@pytest.fixture
def jd_text() -> str:
    return (FIXTURES / "jd_backend.txt").read_text()


@pytest.fixture
def marketing_jd_text() -> str:
    return (FIXTURES / "jd_marketing.txt").read_text()


@pytest.fixture
def jd(jd_text):
    return JDAnalyzer().run(jd_text)
