"""
routers/github.py
=================
GitHub import (product.md section 3A), in two flavours:

* ``GET  /api/github/repos/{username}`` - list a student's public repos so the
  UI can show a tick-list. No AI, no writes; safe to call freely.
* ``POST /api/github/import-batch``     - import the ticked repos in one go.
* ``POST /api/github/import``           - import a single repo by URL, for a
  repo the username listing cannot reach.

Each import is its own transaction: if bullet generation fails for repo 3 of 5,
repos 1, 2, 4 and 5 still land. A titled-but-empty Project is never committed.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

import ai_service
import github_service
from auth import get_current_user
from database import get_session
from models import Bullet, EntityType, Project, User
from schemas import (
    BulletRead,
    GitHubBatchImportRequest,
    GitHubBatchImportResponse,
    GitHubImportFailure,
    GitHubImportRequest,
    GitHubImportResponse,
    GitHubRepoListResponse,
    GitHubRepoSummary,
    GitHubUsernameRequest,
    ProjectRead,
)

logger = logging.getLogger("resumemaxxer.github_router")

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared import routine
# ---------------------------------------------------------------------------
def _import_one(
    *, repo_url: str, current_user: User, session: Session
) -> GitHubImportResponse:
    """Fetch, summarise and persist a single repository.

    Raises `github_service.GitHubServiceError` for anything the student can fix
    (bad URL, private repo, rate limit) and `ai_service.AIServiceError` when
    Gemini fails. Callers map those to status codes or per-repo failures.
    """
    repo = github_service.fetch_repo_data(repo_url)

    # Re-check for duplicates against the canonical URL GitHub returned, which
    # catches the case where the student pasted a differently-cased or
    # trailing-slash variant of a repo they already imported.
    existing = session.exec(
        select(Project).where(
            Project.user_id == current_user.id,
            Project.repo_url == repo.html_url,
        )
    ).first()
    if existing is not None:
        raise github_service.GitHubServiceError(
            f"{repo.full_name} is already in your vault."
        )

    analysis = ai_service.analyse_repository(
        repo_name=repo.full_name,
        readme=repo.readme,
        languages=repo.languages,
        description=repo.description,
    )

    project = Project(
        user_id=current_user.id,
        title=analysis.project_title or repo.full_name.split("/")[-1],
        repo_url=repo.html_url,
        tech_stack=",".join(analysis.tech_stack or repo.languages),
        is_github_imported=True,
    )
    session.add(project)
    # Flush (not commit) to get the generated project.id while staying inside
    # the transaction - the bullets need it as their entity_id.
    session.flush()

    bullets = [
        Bullet(
            user_id=current_user.id,
            entity_type=EntityType.PROJECT,
            entity_id=project.id,
            original_text=item.text,
            # Bullets from an import are AI-written from the start, so the two
            # text columns begin life identical. If the student later edits
            # `original_text`, the pair diverges as intended.
            ai_enhanced_text=item.text,
            tags=",".join(tag.lower().strip() for tag in item.tags if tag.strip()),
        )
        for item in analysis.bullets
    ]
    session.add_all(bullets)
    session.commit()

    session.refresh(project)
    for bullet in bullets:
        session.refresh(bullet)

    return GitHubImportResponse(
        project=ProjectRead.model_validate(project, from_attributes=True),
        bullets=[BulletRead.model_validate(b, from_attributes=True) for b in bullets],
    )


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------
@router.get(
    "/repos/{username}",
    response_model=GitHubRepoListResponse,
    summary="List a GitHub user's public repos",
)
def list_repos(
    username: str,
    include_forks: bool = False,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> GitHubRepoListResponse:
    """Return public repos so the student can tick the ones worth importing.

    Read-only and AI-free, so it is cheap and instant. Repos already in the
    vault are flagged rather than hidden - "already imported" is more useful
    feedback than a silently missing row.
    """
    # Validate through the schema so the username rules live in one place.
    clean = GitHubUsernameRequest(username=username).username

    try:
        raw_repos = github_service.list_public_repos(clean, include_forks=include_forks)
    except github_service.GitHubServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    # `session.exec` on a single-column select yields scalars, not row tuples -
    # unpacking these as `for (url,) in ...` raises "too many values to unpack"
    # for any user who already has an imported repo.
    imported_urls = {
        url
        for url in session.exec(
            select(Project.repo_url).where(
                Project.user_id == current_user.id,
                Project.repo_url.is_not(None),
            )
        ).all()
        if url
    }

    repos = [
        GitHubRepoSummary(
            name=repo.get("name", ""),
            full_name=repo.get("full_name", ""),
            description=repo.get("description"),
            html_url=repo.get("html_url", ""),
            language=repo.get("language"),
            stars=repo.get("stargazers_count", 0),
            updated_at=repo.get("pushed_at"),
            is_fork=bool(repo.get("fork")),
            already_imported=repo.get("html_url", "") in imported_urls,
        )
        for repo in raw_repos
    ]

    return GitHubRepoListResponse(username=clean, repos=repos)


# ---------------------------------------------------------------------------
# Batch import
# ---------------------------------------------------------------------------
@router.post(
    "/import-batch",
    response_model=GitHubBatchImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import several repos at once",
)
def import_batch(
    payload: GitHubBatchImportRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> GitHubBatchImportResponse:
    """Import every ticked repo, reporting per-repo success and failure.

    Partial success is the whole point: each repo is a separate transaction, so
    one unreadable README does not throw away the others. The response always
    has HTTP 201 - read `failed` for what did not land.

    This is the slowest endpoint in the app: one Gemini call per repo, run
    sequentially to stay inside API rate limits.
    """
    imported: list[GitHubImportResponse] = []
    failed: list[GitHubImportFailure] = []

    for full_name in payload.repo_full_names:
        # `full_name` is validated as "owner/name", so this URL is well-formed
        # and still goes through the same SSRF-safe parser as a pasted link.
        repo_url = f"https://github.com/{full_name}"
        try:
            imported.append(
                _import_one(
                    repo_url=repo_url, current_user=current_user, session=session
                )
            )
        except github_service.GitHubServiceError as exc:
            failed.append(GitHubImportFailure(repo_full_name=full_name, error=str(exc)))
        except ai_service.AIServiceError as exc:
            logger.error("Repo analysis failed for %s: %s", full_name, exc)
            failed.append(
                GitHubImportFailure(
                    repo_full_name=full_name,
                    error=f"AI could not summarise this repo: {exc}",
                )
            )
        except Exception:
            # Roll back the partial transaction so the next repo starts clean.
            session.rollback()
            logger.exception("Unexpected failure importing %s", full_name)
            failed.append(
                GitHubImportFailure(
                    repo_full_name=full_name, error="Unexpected error importing this repo."
                )
            )

    logger.info(
        "Batch import for %s: %d imported, %d failed",
        current_user.id,
        len(imported),
        len(failed),
    )
    return GitHubBatchImportResponse(imported=imported, failed=failed)


# ---------------------------------------------------------------------------
# Single import by URL
# ---------------------------------------------------------------------------
@router.post(
    "/import",
    response_model=GitHubImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import one public GitHub repo by URL",
)
def import_repository(
    payload: GitHubImportRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> GitHubImportResponse:
    """Import a repo the username listing cannot reach - someone else's repo
    that the student contributed to, for instance.

    Error mapping:
      * 400 - bad URL, private repo, empty repo, GitHub rate limit, duplicate
      * 502 - Gemini failed or returned something unusable
    """
    try:
        return _import_one(
            repo_url=payload.repo_url, current_user=current_user, session=session
        )
    except github_service.GitHubServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except ai_service.AIServiceError as exc:
        logger.error("Repo analysis failed for %s: %s", payload.repo_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI could not summarise that repository: {exc}",
        ) from exc
    except Exception:
        session.rollback()
        logger.exception("Could not save imported repo %s", payload.repo_url)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the imported project.",
        )
