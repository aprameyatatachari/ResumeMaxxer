"""
github_service.py
=================
Fetches public repository data from GitHub's REST API for the Vault import
flow (product.md section 3A).

Only three pieces of data are needed to write good resume bullets:
  * repo metadata  -> name, description
  * README         -> what the project actually does
  * language stats -> the real tech stack, by bytes of code

Security
--------
The repo URL comes from the user, so it is parsed and rebuilt against a fixed
`https://api.github.com` base rather than being fetched directly. Combined with
the `github.com` prefix check in `schemas.GitHubImportRequest`, that closes the
SSRF hole this endpoint would otherwise be.
"""

from __future__ import annotations

import base64
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger("resumemaxxer.github")

GITHUB_API = "https://api.github.com"
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")

# owner/repo path segments: letters, digits, dot, dash, underscore.
_REPO_PATH_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/"
    r"(?P<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/"
    r"(?P<repo>[A-Za-z0-9._-]{1,100}?)"
    r"(?:\.git)?/?(?:[?#].*)?$",
    re.IGNORECASE,
)


class GitHubServiceError(RuntimeError):
    """Repository could not be read. Routers map this to HTTP 400 or 404."""


def parse_repo_url(url: str) -> tuple[str, str]:
    """Extract `(owner, repo)` from a GitHub URL, or raise.

    Rejects anything with extra path segments (tree/blob/issues links), which
    keeps the API path we build unambiguous.
    """
    match = _REPO_PATH_RE.match(url.strip())
    if not match:
        raise GitHubServiceError(
            "Could not parse that URL. Use the repository root, "
            "e.g. https://github.com/owner/repo"
        )
    return match.group("owner"), match.group("repo")


def _headers() -> dict[str, str]:
    """Standard GitHub API headers.

    Unauthenticated calls are capped at 60/hour per IP; a token raises that to
    5,000/hour. The token is optional so the app works out of the box.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "resumemaxxer",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def list_public_repos(username: str, *, include_forks: bool = False) -> list[dict]:
    """List a user's public repositories, newest push first.

    Powers the "type your username, tick the repos you want" import flow, which
    replaces pasting one URL at a time.

    Forks are excluded by default: a fork the student never committed to is
    someone else's work, and putting it on a resume is the kind of thing an
    interviewer notices. They can still import one by URL if they really did
    contribute to it.
    """
    repos: list[dict] = []

    with httpx.Client(timeout=15.0, headers=_headers(), follow_redirects=True) as client:
        # 100 is GitHub's per-page maximum. Two pages is a generous ceiling for
        # a student account and bounds the work this endpoint can do.
        for page in (1, 2):
            try:
                response = client.get(
                    f"{GITHUB_API}/users/{username}/repos",
                    params={
                        "per_page": 100,
                        "page": page,
                        "sort": "pushed",  # most recently worked on first
                        "type": "owner",  # exclude repos they only collaborate on
                    },
                )
            except httpx.RequestError as exc:
                raise GitHubServiceError(f"Could not reach GitHub: {exc}") from exc

            if response.status_code == 404:
                raise GitHubServiceError(f"No GitHub user named '{username}'.")
            if response.status_code == 403:
                raise GitHubServiceError(
                    "GitHub rate limit reached. Add a GITHUB_TOKEN to "
                    "backend/.env or try again in an hour."
                )
            if response.status_code >= 400:
                raise GitHubServiceError(
                    f"GitHub returned {response.status_code} listing repos."
                )

            batch = response.json()
            repos.extend(batch)
            if len(batch) < 100:
                break  # last page

    if not include_forks:
        repos = [repo for repo in repos if not repo.get("fork")]

    # Empty repos have nothing to summarise, so drop them before the student
    # can pick one and get a confusing failure at import time.
    return [repo for repo in repos if repo.get("size", 0) > 0]


class RepoData:
    """Plain container for what we scraped off a repository."""

    def __init__(
        self,
        *,
        full_name: str,
        description: Optional[str],
        readme: str,
        languages: list[str],
        html_url: str,
    ) -> None:
        self.full_name = full_name
        self.description = description
        self.readme = readme
        self.languages = languages
        self.html_url = html_url


def fetch_repo_data(repo_url: str) -> RepoData:
    """Fetch metadata, README and language stats for a public repository.

    All three calls share one client so the TLS handshake is paid once. A
    missing README is tolerated (many good repos have none); a missing repo is
    not.
    """
    owner, repo = parse_repo_url(repo_url)

    with httpx.Client(timeout=15.0, headers=_headers(), follow_redirects=True) as client:
        # --- 1. Repository metadata --------------------------------------
        try:
            meta_response = client.get(f"{GITHUB_API}/repos/{owner}/{repo}")
        except httpx.RequestError as exc:
            raise GitHubServiceError(f"Could not reach GitHub: {exc}") from exc

        if meta_response.status_code == 404:
            raise GitHubServiceError(
                f"Repository {owner}/{repo} not found. Is it public?"
            )
        if meta_response.status_code == 403:
            raise GitHubServiceError(
                "GitHub rate limit reached. Add a GITHUB_TOKEN to backend/.env "
                "or try again in an hour."
            )
        if meta_response.status_code >= 400:
            raise GitHubServiceError(
                f"GitHub returned {meta_response.status_code} for {owner}/{repo}."
            )

        meta = meta_response.json()

        # --- 2. README ---------------------------------------------------
        # Base64 in the JSON body, rather than the raw media type, so a
        # non-UTF8 README degrades gracefully instead of exploding.
        readme = ""
        readme_response = client.get(f"{GITHUB_API}/repos/{owner}/{repo}/readme")
        if readme_response.status_code == 200:
            encoded = readme_response.json().get("content", "")
            try:
                readme = base64.b64decode(encoded).decode("utf-8", errors="replace")
            except Exception:
                logger.warning("Could not decode README for %s/%s", owner, repo)
        elif readme_response.status_code != 404:
            logger.warning(
                "README fetch for %s/%s returned %s",
                owner,
                repo,
                readme_response.status_code,
            )

        # --- 3. Languages ------------------------------------------------
        # Response is {"Python": 12345, "TypeScript": 6789} - bytes per
        # language. Sorting by byte count puts the primary language first.
        languages: list[str] = []
        languages_response = client.get(f"{GITHUB_API}/repos/{owner}/{repo}/languages")
        if languages_response.status_code == 200:
            stats: dict[str, int] = languages_response.json()
            languages = sorted(stats, key=stats.get, reverse=True)

    if not readme and not languages:
        raise GitHubServiceError(
            "That repository has no README and no detected code, so there is "
            "nothing to summarise. Add a README first."
        )

    return RepoData(
        full_name=meta.get("full_name", f"{owner}/{repo}"),
        description=meta.get("description"),
        readme=readme,
        languages=languages,
        html_url=meta.get("html_url", f"https://github.com/{owner}/{repo}"),
    )
