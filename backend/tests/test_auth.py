"""
JWT verification.

This is the security boundary of the whole API, so it is tested against a real
signed token rather than a mock: a keypair is generated here, served as a JWKS,
and `auth.verify_auth_token` is pointed at it. Every rejection path below is a
way someone could otherwise get in.
"""

from __future__ import annotations

import datetime
import json

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException

import auth

KID = "test-key-1"


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


@pytest.fixture(name="signing")
def signing_fixture(monkeypatch):
    """Generate an Ed25519 keypair and make `auth` verify against it.

    Ed25519 because that is what Better Auth actually signs with by default -
    testing with RS256 would not exercise the same code path in PyJWT.
    """
    private_key = Ed25519PrivateKey.generate()
    jwk = json.loads(jwt.algorithms.OKPAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": KID, "alg": "EdDSA", "use": "sig"})

    class FakeJWKClient:
        def __init__(self, *_args, **_kwargs):
            pass

        def get_signing_key_from_jwt(self, token):
            header = jwt.get_unverified_header(token)
            if header.get("kid") != KID:
                raise jwt.PyJWKClientError(f"Unable to find key: {header.get('kid')}")
            return jwt.PyJWK(jwk)

    monkeypatch.setattr(auth, "PyJWKClient", FakeJWKClient)
    monkeypatch.setattr(auth, "_jwks_client", None)
    return private_key


def _make_token(private_key, **overrides) -> str:
    claims = {
        "sub": "user_abc123",
        "email": "ananya@vit.ac.in",
        "name": "Ananya Krishnan",
        "iat": _now(),
        "exp": _now() + datetime.timedelta(minutes=15),
        "iss": auth.BETTER_AUTH_URL,
        "aud": auth.BETTER_AUTH_URL,
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="EdDSA", headers={"kid": KID})


def test_valid_token_is_accepted(signing):
    claims = auth.verify_auth_token(_make_token(signing))
    assert claims["sub"] == "user_abc123"
    assert claims["email"] == "ananya@vit.ac.in"


@pytest.mark.parametrize(
    "overrides, reason",
    [
        pytest.param({"exp": _now() - datetime.timedelta(minutes=1)},
                     "expired", id="expired"),
        pytest.param({"iss": "https://evil.example"}, "wrong issuer", id="bad-issuer"),
        pytest.param({"aud": "https://evil.example"}, "wrong audience", id="bad-audience"),
        pytest.param({"sub": None}, "no subject", id="missing-sub"),
    ],
)
def test_bad_claims_are_rejected(signing, overrides, reason):
    with pytest.raises(HTTPException) as exc:
        auth.verify_auth_token(_make_token(signing, **overrides))
    assert exc.value.status_code == 401, reason


def test_tampered_signature_is_rejected(signing):
    head, payload, signature = _make_token(signing).split(".")
    with pytest.raises(HTTPException) as exc:
        auth.verify_auth_token(f"{head}.{payload}.{'A' * len(signature)}")
    assert exc.value.status_code == 401


def test_token_signed_by_someone_else_is_rejected(signing):
    """The classic algorithm-confusion attempt: a self-signed HS256 token."""
    forged = jwt.encode(
        {
            "sub": "evil", "iat": _now(),
            "exp": _now() + datetime.timedelta(hours=1),
            "iss": auth.BETTER_AUTH_URL, "aud": auth.BETTER_AUTH_URL,
        },
        "not-the-real-key",
        algorithm="HS256",
        headers={"kid": KID},
    )
    with pytest.raises(HTTPException) as exc:
        auth.verify_auth_token(forged)
    assert exc.value.status_code == 401


def test_unknown_key_id_is_rejected(signing):
    token = jwt.encode(
        {
            "sub": "u", "iat": _now(),
            "exp": _now() + datetime.timedelta(hours=1),
            "iss": auth.BETTER_AUTH_URL, "aud": auth.BETTER_AUTH_URL,
        },
        signing,
        algorithm="EdDSA",
        headers={"kid": "some-other-key"},
    )
    with pytest.raises(HTTPException) as exc:
        auth.verify_auth_token(token)
    assert exc.value.status_code == 401


@pytest.mark.parametrize(
    "full_name, expected",
    [
        ("Ananya Krishnan", ("Ananya", "Krishnan")),
        ("Ananya Krishnan Iyer", ("Ananya", "Krishnan Iyer")),
        ("Ananya", ("Ananya", "")),
        ("", ("", "")),
        ("   ", ("", "")),
    ],
)
def test_name_splitting(full_name, expected):
    assert auth._split_name(full_name) == expected
