"""
gemini_key.py
=============
Reads a student's own Gemini API key off the request.

The model: browser-held, never stored
-------------------------------------
The key lives in the student's browser (`frontend/src/lib/gemini-key.ts`,
localStorage) and rides along on the requests that need it, in the
`X-Gemini-Api-Key` header. This service uses it for that one call and forgets
it.

Nothing persists it. There is no column for it, no encryption key to manage,
and no table that becomes interesting to an attacker. That is the entire point
of the design: the key has to reach the server either way - Gemini is called
server-side, so a browser-only key is not possible - but at-rest storage is
avoidable, so it is avoided.

The trade the student makes is per-device: the key is in one browser's
localStorage, so they re-paste it on their phone. For a free key that takes
thirty seconds to mint, that is the right side of the trade.

Two rules this file exists to enforce
-------------------------------------
* The key NEVER gets logged. Not in an access log, not in an exception, not in
  a debug line. `ai_service._redact` covers the error paths; this module simply
  never writes the value anywhere.
* The key NEVER gets stored, echoed back, or included in a response. The API
  reports *whether* a key was used, never what it was.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, status

# Custom header rather than a query parameter or the body, for three reasons:
# it survives multipart uploads (the tailoring endpoint is multipart), it never
# lands in a URL and therefore never in a server access log or browser history,
# and it is uniform across every endpoint that needs it.
HEADER_NAME = "X-Gemini-Api-Key"

# Google AI Studio keys are currently 39 characters and start with "AIza". The
# bounds below are deliberately wider than that: a hard format check would
# reject a perfectly good key the day Google changes the format, and the real
# validation is Gemini's answer. This only catches the obvious mistakes -
# pasting a truncated key, or a whole URL - so the student gets a useful
# message in milliseconds instead of a generic AI failure after an upload.
MIN_KEY_LENGTH = 20
MAX_KEY_LENGTH = 200


def get_student_api_key(
    x_gemini_api_key: Optional[str] = Header(
        default=None,
        alias=HEADER_NAME,
        description=(
            "The student's own Google Gemini API key. When present, it is used "
            "for this request instead of the app's key and the request does not "
            "count against the free weekly allowance. Never stored."
        ),
    ),
) -> Optional[str]:
    """The student's own key for this request, or None to use the free allowance.

    FastAPI dependency. Returns None for both "header absent" and "header
    present but empty", because a frontend that clears a saved key may well
    send the empty string, and treating that as a malformed key rather than as
    "no key" would be a confusing error for a student who just removed theirs.
    """
    if x_gemini_api_key is None:
        return None

    key = x_gemini_api_key.strip()
    if not key:
        return None

    if len(key) < MIN_KEY_LENGTH or len(key) > MAX_KEY_LENGTH:
        # The message must not echo the value back - see the module docstring.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That does not look like a Gemini API key. Copy the whole key "
                "from Google AI Studio - it starts with 'AIza' and has no "
                "spaces."
            ),
        )

    # Whitespace inside a key means a line break survived the copy-paste, which
    # would otherwise fail as an authentication error and read as "my key is
    # wrong" rather than "my paste is wrong".
    if any(character.isspace() for character in key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That key contains a space or line break, so it was probably "
                "copied with extra characters. Paste it again."
            ),
        )

    return key
