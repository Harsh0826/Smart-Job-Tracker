from app.agents.resume_tailor import ResumeTailor
from app.agents.verifier import verify
from app.schemas.resume import ResumeBullet


def _rules(resume, profile):
    return {i.rule for i in verify(resume, profile).issues if i.severity == "error"}


def test_grounded_resume_passes(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    report = verify(resume, profile)
    assert report.passed, report.issues


def test_invented_number_is_blocked(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[0].bullets[0] = ResumeBullet(
        text="Built a Python service handling 2M events per day, cutting latency by 60%",
        source_ids=["e1.b1"],
    )
    assert "unsupported_number" in _rules(resume, profile)


def test_supported_numbers_pass(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[0].bullets = [
        ResumeBullet(text="Cut p95 latency 40% on a FastAPI service routing 2M events/day", source_ids=["e1.b1"])
    ]
    assert verify(resume, profile).passed


def test_promotion_is_blocked(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[1].title = "Senior Software Engineer"
    assert "role_changed" in _rules(resume, profile)


def test_uncited_and_cross_role_bullets_are_blocked(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[0].bullets.append(ResumeBullet(text="Led the platform roadmap", source_ids=[]))
    resume.experiences[1].bullets.append(ResumeBullet(text="Mentored engineers", source_ids=["e1.b3"]))
    assert {"uncited", "cross_role_source"} <= _rules(resume, profile)


def test_unsupported_skills_are_blocked(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.experiences[0].bullets[0].text += " using Rust"
    resume.skills.append("Kafka")
    rules = verify(resume, profile).issues
    assert any(i.rule == "unsupported_skill" and "rust" in i.message for i in rules)
    assert any(i.rule == "unsupported_skill" and "Kafka" in i.message for i in rules)


def test_unknown_certification_is_blocked(profile, jd):
    resume = ResumeTailor().run(profile, jd)
    resume.certifications.append("CKA")
    assert "unknown_certification" in _rules(resume, profile)
