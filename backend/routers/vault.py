"""
routers/vault.py
================
CRUD for the Master Vault: education, experience, projects and bullets.

The one rule that matters
-------------------------
Every query is scoped by `current_user.id`, taken from the verified auth JWT.
Never look a row up by primary key alone - `session.get(Education, 5)` would
happily return another student's row. The `_owned_or_404` helper below is the
only sanctioned way to fetch a single record, and it returns 404 (not 403) for
someone else's data so the API does not confirm that the id exists.
"""

from __future__ import annotations

from typing import Sequence, Type, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, SQLModel, delete, select

from auth import get_current_user
from database import get_session
from models import Bullet, Education, EntityType, Experience, Project, User
from schemas import (
    BulletCreate,
    BulletRead,
    BulletUpdate,
    EducationCreate,
    EducationRead,
    EducationUpdate,
    ExperienceCreate,
    ExperienceRead,
    ExperienceUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    UserRead,
    UserUpdate,
    VaultRead,
)

router = APIRouter()

TableT = TypeVar("TableT", bound=SQLModel)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _owned_or_404(
    session: Session, model: Type[TableT], row_id: int, user_id: str
) -> TableT:
    """Fetch one row, but only if it belongs to `user_id`.

    Returning 404 rather than 403 for another user's row is deliberate: a 403
    would confirm the record exists, which is an information leak.
    """
    row = session.get(model, row_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model.__name__} not found.",
        )
    return row


def _list_owned(
    session: Session, model: Type[TableT], user_id: str
) -> Sequence[TableT]:
    return session.exec(select(model).where(model.user_id == user_id)).all()


def _apply_patch(row: SQLModel, patch: SQLModel) -> SQLModel:
    """Apply a partial update.

    `exclude_unset=True` is what makes PATCH semantics work: a field the client
    did not send stays untouched, while an explicit `null` clears it.
    """
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    return row


def _commit(session: Session, row: SQLModel) -> SQLModel:
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Whole vault / profile
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserRead, summary="Current signed-in student")
def read_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the caller's profile, creating the row on first ever call."""
    return current_user


@router.patch("/me", response_model=UserRead, summary="Update resume contact details")
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    """Edit the fields that feed the resume header.

    The auth service owns identity, so `email` is not editable here - only the
    contact details the resume template needs and sign-up does not collect
    (phone, location, LinkedIn, GitHub, portfolio).
    """
    return _commit(session, _apply_patch(current_user, payload))


@router.get("", response_model=VaultRead, summary="Entire vault in one call")
def read_vault(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> VaultRead:
    """Load the whole Vault for the dashboard.

    One request instead of four: a student's Vault is tens of rows, so the
    extra round trips cost more than the payload does.
    """
    return VaultRead(
        user=UserRead.model_validate(current_user, from_attributes=True),
        educations=[
            EducationRead.model_validate(e, from_attributes=True)
            for e in _list_owned(session, Education, current_user.id)
        ],
        experiences=[
            ExperienceRead.model_validate(e, from_attributes=True)
            for e in _list_owned(session, Experience, current_user.id)
        ],
        projects=[
            ProjectRead.model_validate(p, from_attributes=True)
            for p in _list_owned(session, Project, current_user.id)
        ],
        bullets=[
            BulletRead.model_validate(b, from_attributes=True)
            for b in _list_owned(session, Bullet, current_user.id)
        ],
    )


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------
@router.post(
    "/education",
    response_model=EducationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a qualification (Class X, Class XII or a degree)",
)
def create_education(
    payload: EducationCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Education:
    row = Education(**payload.model_dump(), user_id=current_user.id)
    return _commit(session, row)


@router.get("/education", response_model=list[EducationRead])
def list_education(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Sequence[Education]:
    return _list_owned(session, Education, current_user.id)


@router.patch("/education/{education_id}", response_model=EducationRead)
def update_education(
    education_id: int,
    payload: EducationUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Education:
    row = _owned_or_404(session, Education, education_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/education/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_education(
    education_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, Education, education_id, current_user.id)
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------
@router.post(
    "/experience",
    response_model=ExperienceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a job, internship or club role",
)
def create_experience(
    payload: ExperienceCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Experience:
    row = Experience(**payload.model_dump(), user_id=current_user.id)
    return _commit(session, row)


@router.get("/experience", response_model=list[ExperienceRead])
def list_experience(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Sequence[Experience]:
    return _list_owned(session, Experience, current_user.id)


@router.patch("/experience/{experience_id}", response_model=ExperienceRead)
def update_experience(
    experience_id: int,
    payload: ExperienceUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Experience:
    row = _owned_or_404(session, Experience, experience_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/experience/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experience(
    experience_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, Experience, experience_id, current_user.id)

    # Bullets point here polymorphically, so no FK cascade can clean them up.
    # Delete them explicitly or they become orphans that still surface in
    # tailoring queries.
    session.exec(
        delete(Bullet).where(
            Bullet.user_id == current_user.id,
            Bullet.entity_type == EntityType.EXPERIENCE,
            Bullet.entity_id == experience_id,
        )
    )
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
@router.post(
    "/project",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a project manually",
)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Project:
    # Manual creation always sets is_github_imported=False; the flag is owned
    # by the import flow, not by client input.
    row = Project(
        **payload.model_dump(), user_id=current_user.id, is_github_imported=False
    )
    return _commit(session, row)


@router.get("/project", response_model=list[ProjectRead])
def list_projects(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Sequence[Project]:
    return _list_owned(session, Project, current_user.id)


@router.patch("/project/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Project:
    row = _owned_or_404(session, Project, project_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/project/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, Project, project_id, current_user.id)

    # Same polymorphic-orphan problem as experiences - see above.
    session.exec(
        delete(Bullet).where(
            Bullet.user_id == current_user.id,
            Bullet.entity_type == EntityType.PROJECT,
            Bullet.entity_id == project_id,
        )
    )
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Bullets
# ---------------------------------------------------------------------------
def _assert_entity_exists(
    session: Session, entity_type: EntityType, entity_id: int, user_id: str
) -> None:
    """Stand in for the foreign key the polymorphic design cannot have.

    Without this check a client could attach bullets to a non-existent parent,
    or to another student's experience id.
    """
    model = Experience if entity_type == EntityType.EXPERIENCE else Project
    _owned_or_404(session, model, entity_id, user_id)


@router.post(
    "/bullet",
    response_model=BulletRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add an achievement line",
)
def create_bullet(
    payload: BulletCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Bullet:
    _assert_entity_exists(
        session, payload.entity_type, payload.entity_id, current_user.id
    )
    row = Bullet(**payload.model_dump(), user_id=current_user.id)
    return _commit(session, row)


@router.get("/bullet", response_model=list[BulletRead])
def list_bullets(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Sequence[Bullet]:
    return _list_owned(session, Bullet, current_user.id)


@router.patch("/bullet/{bullet_id}", response_model=BulletRead)
def update_bullet(
    bullet_id: int,
    payload: BulletUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Bullet:
    row = _owned_or_404(session, Bullet, bullet_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/bullet/{bullet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bullet(
    bullet_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, Bullet, bullet_id, current_user.id)
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
