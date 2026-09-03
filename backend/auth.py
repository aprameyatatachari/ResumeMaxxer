"""
auth.py
=======
Better Auth authentication for the FastAPI backend.

How it works
------------
Better Auth is a Node library, so it runs as its own service (`auth-server/`)
rather than inside this API. The two are bridged by JWTs:

    browser  --cookie-->  auth-server  --JWT-->  browser  --Bearer-->  FastAPI
                                                                          |
                                              verified against  <---------+
                                        {BETTER_AUTH_URL}/api/auth/jwks

The React app holds a session cookie with the auth service, calls
`GET /api/auth/token` to mint a short-lived JWT, and sends that JWT here as
`Authorization: Bearer <jwt>`. We fetch the auth service's public keys once,
cache them, and verify every request locally - no network hop per request, and
no shared secret between the two services.

Better Auth signs with **EdDSA (Ed25519)** by default rather than RS256, so
both are accepted below; changing `jwks.keyPairConfig` in `auth-server` will
not break this.

Unlike the Clerk setup this replaces, the JWT payload already carries `email`
and `name`, so provisioning a user needs no second API call.

Security notes (please do not "simplify" these away)
----------------------------------------------------
* Signature, `exp`, `iat`, `iss` and `aud` are all verified. Never call
  ``jwt.decode(..., options={"verify_signature": False})`` on a real request:
  a JWT is attacker-controlled input until the signature checks out.
* The user id comes exclusively from the verified `sub` claim. No endpoint
  should ever accept a `user_id` from a request body or query string.
* The JWKS cache is keyed on `kid` and refreshed on a miss, so key rotation
  works without a redeploy - but a refresh is rate-limited so an attacker
  cannot use unknown `kid` values to hammer the auth service.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlmodel import Session, select

from database import get_session
from models import User

logger = logging.getLogger("resumemaxxer.auth")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Must match `BETTER_AUTH_URL` in auth-server/.env exactly: Better Auth uses
# its own base URL as both the `iss` and `aud` claim, and both are checked.
BETTER_AUTH_URL: str = os.getenv("BETTER_AUTH_URL", "http://localhost:3000").rstrip("/")
JWKS_URL: str = f"{BETTER_AUTH_URL}/api/auth/jwks"

# Ed25519 is Better Auth's default; RS256 is accepted so switching the key type
# in the auth service does not require a backend change.
ALLOWED_ALGORITHMS = ["EdDSA", "RS256", "ES256"]

# `auto_error=False` lets us raise our own 401 with a useful message instead of
# FastAPI's terse default when the header is missing entirely.
_bearer_scheme = HTTPBearer(auto_error=False)

# PyJWKClient keeps its own in-memory cache of the fetched key set and handles
# `kid` lookup plus refresh-on-miss for us.
_jwks_client: Optional[PyJWKClient] = None
_jwks_lock = threading.Lock()

# Minimum seconds between JWKS refreshes triggered by an unknown `kid`.
_JWKS_MIN_REFRESH_INTERVAL = 60.0
_last_jwks_refresh = 0.0


def _get_jwks_client() -> PyJWKClient:
    """Lazily build the process-wide JWKS client (thread-safe)."""
    global _jwks_client

    if _jwks_client is None:
        with _jwks_lock:
            # Re-check inside the lock: another thread may have won the race.
            if _jwks_client is None:
                _jwks_client = PyJWKClient(
                    JWKS_URL,
                    cache_keys=True,
                    lifespan=3600,  # re-fetch the key set hourly
                )
    return _jwks_client


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------
def verify_auth_token(token: str) -> dict[str, Any]:
    """Verify a Better Auth JWT and return its claims.

    Raises HTTP 401 for anything that fails verification. The error detail is
    deliberately vague on the wire (the log line carries the specifics) so we
    do not hand an attacker a debugging oracle.
    """
    global _last_jwks_refresh

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientError as exc:
        # Unknown `kid` - most likely the auth service rotated keys. Refresh
        # once, rate limited, then give up.
        now = time.monotonic()
        if now - _last_jwks_refresh > _JWKS_MIN_REFRESH_INTERVAL:
            _last_jwks_refresh = now
            with _jwks_lock:
                globals()["_jwks_client"] = None
            try:
                signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            except Exception:
                logger.warning("JWKS refresh did not resolve signing key: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication token.",
                ) from exc
        else:
            logger.warning("Unknown JWT kid, refresh rate-limited: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not reach the auth service JWKS endpoint at %s", JWKS_URL)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        ) from exc

    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            issuer=BETTER_AUTH_URL,
            audience=BETTER_AUTH_URL,
            options={
                "require": ["exp", "iat", "sub"],
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
            },
            leeway=10,  # tolerate small clock skew between the two services
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        logger.warning("Rejected JWT: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from exc

    if not claims.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    return claims


def _split_name(full_name: str) -> tuple[str, str]:
    """Split Better Auth's single `name` field into first and last.

    Better Auth stores one name; the resume header wants them separately. The
    split is on the first space, so "Ananya Krishnan Iyer" becomes
    ("Ananya", "Krishnan Iyer") - which is the right call for Indian names,
    where the trailing part is often a compound surname or a patronymic. The
    student can correct either field in the vault regardless.
    """
    cleaned = (full_name or "").strip()
    if not cleaned:
        return "", ""
    first, _, last = cleaned.partition(" ")
    return first, last.strip()


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Resolve the caller into a `User` row, creating it on first sight.

    Every protected endpoint depends on this. Downstream code can therefore
    treat `current_user.id` as trusted and MUST scope all queries by it.

    Note this table is the API's own `users`, separate from Better Auth's
    `user` table in the same database. They are joined by id: this row's
    primary key is the auth service's user id, taken from the verified `sub`.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = verify_auth_token(credentials.credentials)
    auth_user_id: str = claims["sub"]

    user = session.get(User, auth_user_id)
    if user is not None:
        return user

    # --- Just-in-time provisioning ---------------------------------------
    # The JWT already carries the profile, so unlike the Clerk implementation
    # this needs no call back to the auth service.
    first_name, last_name = _split_name(claims.get("name", ""))
    # Placeholder keeps the NOT NULL + UNIQUE constraint satisfiable if a
    # provider ever issues a token without an email.
    email = claims.get("email") or f"{auth_user_id}@placeholder.local"

    user = User(
        id=auth_user_id,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    session.add(user)

    try:
        session.commit()
    except Exception:
        # Two concurrent first requests can race to insert the same id. The
        # loser rolls back and reads the winner's row.
        session.rollback()
        existing = session.exec(select(User).where(User.id == auth_user_id)).first()
        if existing is None:
            logger.exception("Could not provision user %s", auth_user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not create user account.",
            )
        return existing

    session.refresh(user)
    logger.info("Provisioned new user %s", auth_user_id)
    return user
