"""
GitHub URL handling.

The URL is user input that gets fed to an outbound HTTP client, so the
validation here is a security control (SSRF), not a convenience check.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from github_service import GitHubServiceError, parse_repo_url
from schemas import GitHubBatchImportRequest, GitHubImportRequest, GitHubUsernameRequest


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data",  # cloud metadata service
        "https://github.com.evil.com/owner/repo",   # lookalike domain
        "file:///etc/passwd",
        "https://internal.corp/admin",
        "//github.com/owner/repo",
    ],
)
def test_non_github_urls_are_rejected(url):
    with pytest.raises(ValidationError):
        GitHubImportRequest(repo_url=url)


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/tiangolo/fastapi",
        "https://www.github.com/owner/repo/",
        "https://github.com/owner/repo.git",
    ],
)
def test_github_urls_are_accepted(url):
    assert GitHubImportRequest(repo_url=url)


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://github.com/tiangolo/fastapi", ("tiangolo", "fastapi")),
        ("https://github.com/owner/repo.git", ("owner", "repo")),
        ("https://www.github.com/owner/repo/", ("owner", "repo")),
    ],
)
def test_repo_urls_are_parsed(url, expected):
    assert parse_repo_url(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/owner/repo/tree/main/src",  # deep link, ambiguous
        "https://github.com/owner",                      # no repo
        "not a url at all",
    ],
)
def test_unparseable_repo_urls_raise(url):
    with pytest.raises(GitHubServiceError):
        parse_repo_url(url)


@pytest.mark.parametrize(
    "username, valid",
    [
        ("octocat", True),
        ("@octocat", True),          # leading @ is stripped
        ("some-user-123", True),
        ("-leading-hyphen", False),
        ("double--hyphen", False),
        ("has_underscore", False),
        ("a" * 40, False),           # over GitHub's 39-char limit
        ("../etc/passwd", False),    # path traversal into the API URL
    ],
)
def test_github_usernames_are_validated(username, valid):
    if valid:
        assert GitHubUsernameRequest(username=username).username.lstrip("@")
    else:
        with pytest.raises(ValidationError):
            GitHubUsernameRequest(username=username)


def test_batch_import_is_bounded_and_shape_checked():
    """Each repo costs a Gemini call, so an unbounded list is a real cost."""
    from schemas import MAX_BATCH_IMPORT

    assert GitHubBatchImportRequest(
        repo_full_names=[f"owner/repo{i}" for i in range(MAX_BATCH_IMPORT)]
    )
    with pytest.raises(ValidationError):
        GitHubBatchImportRequest(
            repo_full_names=[f"owner/repo{i}" for i in range(MAX_BATCH_IMPORT + 1)]
        )
    with pytest.raises(ValidationError):
        GitHubBatchImportRequest(repo_full_names=["not-a-pair"])
    with pytest.raises(ValidationError):
        GitHubBatchImportRequest(repo_full_names=[])
