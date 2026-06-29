"""전화번호 정규화/검증."""

import re

_STRIP_RE = re.compile(r"[\s\-]")
_VALID_RE = re.compile(r"^0\d{9,10}$")


def normalize(value: str) -> str:
    """전화번호를 정규화한다. +82 치환, 하이픈/공백 제거."""
    s = str(value or "").strip()
    if s.startswith("+82"):
        s = "0" + s[3:]
    return _STRIP_RE.sub("", s)


def is_valid(phone: str) -> bool:
    """정규화된 전화번호가 유효한지 확인한다."""
    return bool(_VALID_RE.match(phone))
