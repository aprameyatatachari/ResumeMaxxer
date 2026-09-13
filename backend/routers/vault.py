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
from pydantic import BaseModel, ValidationError
from sqlmodel import Session, SQLModel, delete, select

from auth import get_current_user
from database import get_session
from models import (
    Achievement,
    Bullet,
    Education,
    EntityType,
    Experience,
    ProfileLink,
    Project,
    User,
)
from schemas import (
    AchievementCreate,
    AchievementRead,
    AchievementUpdate,
    BulletCreate,
    BulletRead,
    BulletUpdate,
    EducationCreate,
    EducationRead,
    EducationUpdate,
    ExperienceCreate,
    ExperienceRead,
    ExperienceUpdate,
    OrderUpdate,
    ProfileLinkCreate,
    ProfileLinkRead,
    ProfileLinkUpdate,
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
    """Every row of `model` the user owns, in the order the student arranged.

    Tables with a `position` column come back sorted by it, then by id, so rows
    that predate ordering (all position 0) keep their creation order.
    """
    query = select(model).where(model.user_id == user_id)
    if hasattr(model, "position"):
        query = query.order_by(model.position, model.id)
    return session.exec(query).all()


def next_position(session: Session, model: Type[TableT], user_id: str) -> int:
    """Position for a new row: after everything already in the section, so a
    new entry lands at the bottom where the student can see it and move it."""
    positions = [row.position for row in _list_owned(session, model, user_id)]
    return max(positions, default=-1) + 1


def _reorder(session: Session, model: Type[TableT], user_id: str, ids: list[int]) -> None:
    """Apply a complete new order to one section.

    The list must be exactly the student's own rows, each once. Anything else -
    a missing row, a duplicate, someone else's id - is a 400, not a best
    effort: a partial order has no single right interpretation, and a foreign
    id would otherwise reveal whether that row exists.
    """
    rows = {row.id: row for row in _list_owned(session, model, user_id)}
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new order must list every entry in this section exactly once.",
        )
    for index, row_id in enumerate(ids):
        rows[row_id].position = index
        session.add(rows[row_id])
    session.commit()


def _apply_patch(row: SQLModel, patch: SQLModel) -> SQLModel:
    """Apply a partial update.

    `exclude_unset=True` is what makes PATCH semantics work: a field the client
    did not send stays untouched, while an explicit `null` clears it.
    """
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    return row


def _merge_validated(row: SQLModel, patch: BaseModel, create_model: type[BaseModel]) -> SQLModel:
    """Apply a PATCH, but only if the resulting row would pass creation rules.

    A partial body cannot be cross-field validated on its own - "end date
    before start date" or "a stream on Class X" only show up once the patch is
    merged with what is stored. So the merge happens first, the whole result
    is validated as if it were being created, and only then is it written.
    Otherwise editing could save exactly the combinations adding rejects.
    """
    current = {name: getattr(row, name) for name in create_model.model_fields}
    merged = {**current, **patch.model_dump(exclude_unset=True)}
    try:
        validated = create_model(**merged)
    except ValidationError as exc:
        # Same shape FastAPI uses for request validation, so the frontend's
        # error handling needs nothing new.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {"loc": list(error["loc"]), "msg": error["msg"].removeprefix("Value error, ")}
                for error in exc.errors()
            ],
        ) from exc
    for name, value in validated.model_dump().items():
        setattr(row, name, value)
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
        links=[
            ProfileLinkRead.model_validate(link, from_attributes=True)
            for link in _list_owned(session, ProfileLink, current_user.id)
        ],
        achievements=[
            AchievementRead.model_validate(a, from_attributes=True)
            for a in _list_owned(session, Achievement, current_user.id)
        ],
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
    row = Education(
        **payload.model_dump(),
        user_id=current_user.id,
        position=next_position(session, Education, current_user.id),
    )
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
    return _commit(session, _merge_validated(row, payload, EducationCreate))


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
    row = Experience(
        **payload.model_dump(),
        user_id=current_user.id,
        position=next_position(session, Experience, current_user.id),
    )
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
    return _commit(session, _merge_validated(row, payload, ExperienceCreate))


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
        **payload.model_dump(), user_id=current_user.id, is_github_imported=False,
        position=next_position(session, Project, current_user.id),
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


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------
# Declared as literal paths ("/education/order"), which FastAPI matches before
# the "/education/{education_id}" routes only because those are PATCH/DELETE -
# a PUT to /education/order can never be mistaken for an id.
@router.put("/education/order", status_code=status.HTTP_204_NO_CONTENT,
            summary="Set the order of education entries")
def order_education(
    payload: OrderUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _reorder(session, Education, current_user.id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/experience/order", status_code=status.HTTP_204_NO_CONTENT,
            summary="Set the order of experience entries")
def order_experience(
    payload: OrderUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _reorder(session, Experience, current_user.id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/project/order", status_code=status.HTTP_204_NO_CONTENT,
            summary="Set the order of projects")
def order_projects(
    payload: OrderUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _reorder(session, Project, current_user.id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Extra profile links
# ---------------------------------------------------------------------------
@router.post("/link", response_model=ProfileLinkRead, status_code=status.HTTP_201_CREATED,
             summary="Add a profile link (LeetCode, Kaggle, a blog...)")
def create_link(
    payload: ProfileLinkCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProfileLink:
    row = ProfileLink(
        **payload.model_dump(),
        user_id=current_user.id,
        position=next_position(session, ProfileLink, current_user.id),
    )
    return _commit(session, row)


@router.put("/link/order", status_code=status.HTTP_204_NO_CONTENT,
            summary="Set the order of profile links")
def order_links(
    payload: OrderUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _reorder(session, ProfileLink, current_user.id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/link/{link_id}", response_model=ProfileLinkRead)
def update_link(
    link_id: int,
    payload: ProfileLinkUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProfileLink:
    row = _owned_or_404(session, ProfileLink, link_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/link/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(
    link_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, ProfileLink, link_id, current_user.id)
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Achievements
# ---------------------------------------------------------------------------
@router.post("/achievement", response_model=AchievementRead,
             status_code=status.HTTP_201_CREATED, summary="Add an achievement")
def create_achievement(
    payload: AchievementCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Achievement:
    row = Achievement(
        **payload.model_dump(),
        user_id=current_user.id,
        position=next_position(session, Achievement, current_user.id),
    )
    return _commit(session, row)


@router.put("/achievement/order", status_code=status.HTTP_204_NO_CONTENT,
            summary="Set the order of achievements")
def order_achievements(
    payload: OrderUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    _reorder(session, Achievement, current_user.id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/achievement/{achievement_id}", response_model=AchievementRead)
def update_achievement(
    achievement_id: int,
    payload: AchievementUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Achievement:
    row = _owned_or_404(session, Achievement, achievement_id, current_user.id)
    return _commit(session, _apply_patch(row, payload))


@router.delete("/achievement/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_achievement(
    achievement_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    row = _owned_or_404(session, Achievement, achievement_id, current_user.id)
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
