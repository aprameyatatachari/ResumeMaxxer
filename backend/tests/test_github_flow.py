"""
The GitHub import flow, with the network and the AI mocked out.

Covers the behaviour that only exists once the pieces are wired together:
forks and empty repos are filtered, already-imported repos are flagged rather
than hidden, and a batch is explicitly NOT all-or-nothing.
"""

from __future__ import annotations

import pytest

import ai_service
import github_service
from models import Bullet, EntityType, Project
from schemas import RepoAnalysis, RepoBullet


class FakeResponse:
    def __init__(self, status_code: int, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeClient:
    """Stands in for `httpx.Client` as a context manager."""

    def __init__(self, routes: dict[str, FakeResponse]):
        self.routes = routes
        self.requests: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def get(self, url, params=None):
        self.requests.append(url)
        for pattern, response in self.routes.items():
            if url.endswith(pattern):
                return response
        return FakeResponse(404, {})


@pytest.fixture(name="fake_github")
def fake_github_fixture(monkeypatch):
    def install(routes):
        client = FakeClient(routes)
        monkeypatch.setattr(github_service.httpx, "Client", lambda **_kw: client)
        return client

    return install


REPOS = [
    {"name": "scheduler", "full_name": "ananyak/scheduler", "description": "Timetables",
     "html_url": "https://github.com/ananyak/scheduler", "language": "Python",
     "stargazers_count": 12, "pushed_at": "2026-01-02T00:00:00Z", "fork": False, "size": 400},
    {"name": "forked-lib", "full_name": "ananyak/forked-lib", "description": None,
     "html_url": "https://github.com/ananyak/forked-lib", "language": "Go",
     "stargazers_count": 0, "pushed_at": "2025-01-02T00:00:00Z", "fork": True, "size": 900},
    {"name": "empty", "full_name": "ananyak/empty", "description": None,
     "html_url": "https://github.com/ananyak/empty", "language": None,
     "stargazers_count": 0, "pushed_at": "2025-01-02T00:00:00Z", "fork": False, "size": 0},
]


def test_listing_excludes_forks_and_empty_repos(fake_github):
    fake_github({"/users/ananyak/repos": FakeResponse(200, REPOS)})
    repos = github_service.list_public_repos("ananyak")
    assert [r["name"] for r in repos] == ["scheduler"]


def test_listing_can_include_forks_on_request(fake_github):
    fake_github({"/users/ananyak/repos": FakeResponse(200, REPOS)})
    repos = github_service.list_public_repos("ananyak", include_forks=True)
    assert {r["name"] for r in repos} == {"scheduler", "forked-lib"}


@pytest.mark.parametrize(
    "status, expected_message",
    [
        (404, "No GitHub user named"),
        (403, "rate limit"),
        (500, "GitHub returned 500"),
    ],
)
def test_listing_maps_github_errors_to_readable_messages(
    fake_github, status, expected_message
):
    fake_github({"/users/ananyak/repos": FakeResponse(status, {})})
    with pytest.raises(github_service.GitHubServiceError) as exc:
        github_service.list_public_repos("ananyak")
    assert expected_message in str(exc.value)


def test_repo_listing_flags_what_is_already_in_the_vault(client, session, user, fake_github):
    fake_github({"/users/ananyak/repos": FakeResponse(200, REPOS)})
    session.add(Project(
        user_id=user.id, title="Scheduler", tech_stack="Python",
        repo_url="https://github.com/ananyak/scheduler", is_github_imported=True,
    ))
    session.commit()

    body = client.get("/api/github/repos/ananyak").json()
    assert body["username"] == "ananyak"
    assert body["repos"][0]["already_imported"] is True


def test_invalid_username_is_rejected_before_calling_github(client):
    assert client.get("/api/github/repos/..%2Fetc").status_code in (400, 404)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------
def _fake_repo(full_name="ananyak/scheduler"):
    return github_service.RepoData(
        full_name=full_name,
        description="Timetable solver",
        readme="# Scheduler\nBuilt with FastAPI and PostgreSQL.",
        languages=["Python"],
        html_url=f"https://github.com/{full_name}",
    )


ANALYSIS = RepoAnalysis(
    project_title="Course Scheduler",
    tech_stack=["Python", "FastAPI"],
    bullets=[RepoBullet(text="Built a constraint solver", tags=["python", "fastapi"])],
)


def test_batch_import_reports_partial_success(client, session, user, monkeypatch):
    """One unreadable repo must not discard the others."""
    def fake_fetch(repo_url):
        if "broken" in repo_url:
            raise github_service.GitHubServiceError("That repository has no README.")
        return _fake_repo(repo_url.split("github.com/")[1])

    monkeypatch.setattr(github_service, "fetch_repo_data", fake_fetch)
    monkeypatch.setattr(ai_service, "analyse_repository", lambda **_kw: ANALYSIS)

    response = client.post("/api/github/import-batch", json={
        "repo_full_names": ["ananyak/scheduler", "ananyak/broken"],
    })

    assert response.status_code == 201
    body = response.json()
    assert len(body["imported"]) == 1
    assert body["imported"][0]["project"]["title"] == "Course Scheduler"
    assert body["imported"][0]["project"]["is_github_imported"] is True
    assert body["failed"][0]["repo_full_name"] == "ananyak/broken"

    # The bullets landed and are attached to the new project.
    bullets = session.exec(
        __import__("sqlmodel").select(Bullet).where(
            Bullet.entity_type == EntityType.PROJECT
        )
    ).all()
    assert len(bullets) == 1
    assert bullets[0].tags == "python,fastapi"


def test_batch_import_surfaces_ai_failure_per_repo(client, monkeypatch):
    monkeypatch.setattr(github_service, "fetch_repo_data", lambda url: _fake_repo())

    def boom(**_kw):
        raise ai_service.AIServiceError("Gemini returned an empty response.")

    monkeypatch.setattr(ai_service, "analyse_repository", boom)

    body = client.post("/api/github/import-batch", json={
        "repo_full_names": ["ananyak/scheduler"],
    }).json()
    assert body["imported"] == []
    assert "AI could not summarise" in body["failed"][0]["error"]


def test_importing_the_same_repo_twice_is_refused(client, monkeypatch):
    monkeypatch.setattr(github_service, "fetch_repo_data", lambda url: _fake_repo())
    monkeypatch.setattr(ai_service, "analyse_repository", lambda **_kw: ANALYSIS)

    first = client.post("/api/github/import",
                        json={"repo_url": "https://github.com/ananyak/scheduler"})
    assert first.status_code == 201

    second = client.post("/api/github/import",
                         json={"repo_url": "https://github.com/ananyak/scheduler"})
    assert second.status_code == 400
    assert "already in your vault" in second.text


# ---------------------------------------------------------------------------
# Fetching one repo's data
# ---------------------------------------------------------------------------
import base64  # noqa: E402

META = {"full_name": "ananyak/scheduler", "description": "Timetables",
        "html_url": "https://github.com/ananyak/scheduler"}


def _readme(text: str) -> FakeResponse:
    return FakeResponse(200, {"content": base64.b64encode(text.encode()).decode()})


def test_fetch_returns_readme_and_languages_ordered_by_size(fake_github):
    fake_github({
        "/repos/ananyak/scheduler": FakeResponse(200, META),
        "/readme": _readme("# Scheduler\nBuilt with FastAPI."),
        "/languages": FakeResponse(200, {"Python": 9000, "HTML": 100, "CSS": 500}),
    })
    repo = github_service.fetch_repo_data("https://github.com/ananyak/scheduler")

    assert "FastAPI" in repo.readme
    # Primary language first, so the AI weights the stack correctly.
    assert repo.languages == ["Python", "CSS", "HTML"]
    assert repo.html_url == META["html_url"]


def test_a_missing_readme_is_tolerated_when_there_is_code(fake_github):
    fake_github({
        "/repos/ananyak/scheduler": FakeResponse(200, META),
        "/readme": FakeResponse(404, {}),
        "/languages": FakeResponse(200, {"Python": 9000}),
    })
    repo = github_service.fetch_repo_data("https://github.com/ananyak/scheduler")
    assert repo.readme == ""
    assert repo.languages == ["Python"]


def test_a_repo_with_neither_readme_nor_code_is_refused(fake_github):
    """There is nothing to summarise, so fail before spending a Gemini call."""
    fake_github({
        "/repos/ananyak/scheduler": FakeResponse(200, META),
        "/readme": FakeResponse(404, {}),
        "/languages": FakeResponse(200, {}),
    })
    with pytest.raises(github_service.GitHubServiceError) as exc:
        github_service.fetch_repo_data("https://github.com/ananyak/scheduler")
    assert "nothing to summarise" in str(exc.value)


@pytest.mark.parametrize(
    "status, expected",
    [(404, "not found"), (403, "rate limit"), (500, "GitHub returned 500")],
)
def test_fetch_maps_github_errors(fake_github, status, expected):
    fake_github({"/repos/ananyak/scheduler": FakeResponse(status, {})})
    with pytest.raises(github_service.GitHubServiceError) as exc:
        github_service.fetch_repo_data("https://github.com/ananyak/scheduler")
    assert expected in str(exc.value)
