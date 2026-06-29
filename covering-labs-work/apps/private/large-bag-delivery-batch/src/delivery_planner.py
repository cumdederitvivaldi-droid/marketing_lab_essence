"""후보 선정 — 중복·형식 판정."""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import phone_utils as phone_util
from config import EXCLUSION_REASONS, PHONE_DUPLICATE_DAYS

KST = timezone(timedelta(hours=9))

# 출입 비밀번호 추출 패턴
# 고객이 설문폼 메모에 공동현관 비밀번호를 다양한 형식으로 입력함
# 예: "종5216", "#0605#", "비밀번호 1234", "비번1234", "1234#"
_PW_PATTERNS = [
    re.compile(r"[#종]\D*(\d{4,})"),    # "종5216", "#0605"
    re.compile(r"비밀번호\D*(\d{4,})"),  # "비밀번호 1234"
    re.compile(r"비번\D*(\d{4,})"),      # "비번1234"
    re.compile(r"(\d{4})#"),             # "1234#"
]

_ZIPCODE_RE = re.compile(r"^\(\d{5}\)\s*")
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


# ── 데이터 구조 ──────────────────────────────────

@dataclass
class Candidate:
    index: int
    name: str
    phone: str
    address: str
    clean_addr: str
    memo: str
    frontdoor_password: str


@dataclass
class Duplicate:
    index: int
    reason: str


@dataclass
class InvalidPhone:
    index: int
    name: str
    phone: str
    raw_phone: str
    address: str


@dataclass
class InvalidAddress:
    index: int
    name: str
    phone: str
    raw_phone: str


@dataclass
class Plan:
    candidates: list[Candidate] = field(default_factory=list)
    duplicates: list[Duplicate] = field(default_factory=list)
    invalid_phones: list[InvalidPhone] = field(default_factory=list)
    invalid_addresses: list[InvalidAddress] = field(default_factory=list)


# ── 유틸 ──────────────────────────────────────────

def _cell(row: list, idx: int) -> str:
    """행에서 idx번째 값을 문자열로 반환."""
    if idx >= len(row):
        return ""
    return str(row[idx] or "").strip()


def _parse_submitted_at(value) -> datetime | None:
    """A열 신청 시각을 datetime으로 파싱."""
    if isinstance(value, datetime):
        return value
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        pass
    # Google Sheets 기본 포맷들 시도
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%m/%d/%Y %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def is_delivered(row: list) -> bool:
    """완료 행 판정.
    - H열에 값이 있으면 완료
    - I열에 bookId가 있으면 H열과 무관하게 완료 (두발히어로 접수 확인)
    """
    status = _cell(row, 7)
    book_id = _cell(row, 8)
    return status != "" or book_id != ""


def is_excluded_by_product(row: list) -> bool:
    """J열에 제외 사유가 기재되어 있으면 True."""
    return _cell(row, 9) in EXCLUSION_REASONS


def _extract_frontdoor_pw(memo: str) -> str:
    """메모에서 출입 비밀번호 추출."""
    for pattern in _PW_PATTERNS:
        m = pattern.search(memo)
        if m:
            return m.group(1)
    return ""


def _looks_like_response_id(value: str) -> bool:
    """응답 ID처럼 보이는 UUID 문자열인지 확인."""
    return bool(_UUID_RE.match(value or ""))


def _looks_like_address(value: str) -> bool:
    """주소 형태인지 느슨하게 판정한다."""
    if not value:
        return False
    if _ZIPCODE_RE.match(value):
        return True
    return any(token in value for token in ("시 ", "도 ", "군 ", "구 ", "로 ", "길 ", "동 "))


def _resolve_row_fields(row: list) -> tuple[str, str, str]:
    """출입 방법, 메모, 주소를 현재/레거시 특이 행까지 포함해 해석한다."""
    exit_method = _cell(row, 1)
    delivery_memo = _cell(row, 3)
    address = _cell(row, 6)

    # 04/07 이전 일부 행은 응답 ID가 B열, 출입 방법이 C열, 주소가 D열로 밀려 저장됐다.
    # 현재 남은 재실패 행도 이 패턴이라, 주소가 비어 있으면 특이 행 패턴만 안전하게 복구한다.
    possible_response_id = _cell(row, 1)
    possible_exit_method = _cell(row, 2)
    possible_address = _cell(row, 3)
    if (
        not address
        and _looks_like_response_id(possible_response_id)
        and possible_exit_method
        and _looks_like_address(possible_address)
    ):
        exit_method = possible_exit_method
        delivery_memo = ""
        address = possible_address

    return exit_method, delivery_memo, address


# ── 메인 로직 ──────────────────────────────────────

def build_plan(
    data: list[list],
    notes: list[list[str]],
) -> Plan:
    """후보, 중복, 전화번호 형식 이상을 분류한다."""
    seen_phones: dict[str, bool] = {}
    plan = Plan()

    # 최근 N일 내 배송완료 전화번호를 미리 수집하여 중복 접수 방지
    # 시트가 시간순 정렬이므로 아래→위 역순 탐색, 7일 넘는 행에서 break (전체 순회 방지)
    now = datetime.now(KST)
    cutoff = now - timedelta(days=PHONE_DUPLICATE_DAYS)
    for p in range(len(data) - 1, -1, -1):
        row = data[p]
        submitted_at = _parse_submitted_at(row[0] if row else None)
        if not submitted_at:
            continue
        # naive datetime이면 KST로 가정
        if submitted_at.tzinfo is None:
            submitted_at = submitted_at.replace(tzinfo=KST)
        if submitted_at < cutoff:
            break
        note = notes[p][0] if p < len(notes) and notes[p] else ""
        if not is_delivered(row):
            continue
        p_phone = phone_util.normalize(row[4] if len(row) > 4 else "")
        if p_phone:
            seen_phones[p_phone] = True

    # 후보 선정
    for i, row in enumerate(data):
        if not _parse_submitted_at(row[0] if row else None):
            continue
        if is_delivered(row):
            continue
        if is_excluded_by_product(row):
            continue

        name = _cell(row, 5)
        exit_method, delivery_memo, address = _resolve_row_fields(row)
        if not name and not address:
            continue

        raw_phone = _cell(row, 4)
        normalized = phone_util.normalize(raw_phone)
        if not normalized:
            continue

        if not phone_util.is_valid(normalized):
            plan.invalid_phones.append(
                InvalidPhone(index=i, name=name, phone=normalized, raw_phone=raw_phone, address=address)
            )
            continue

        if not address:
            plan.invalid_addresses.append(
                InvalidAddress(index=i, name=name, phone=normalized, raw_phone=raw_phone)
            )
            continue

        if normalized in seen_phones:
            plan.duplicates.append(Duplicate(index=i, reason="전화번호 중복 (7일 이내)"))
            continue

        seen_phones[normalized] = True

        # B열(출입방법) + D열(배송메모)를 합쳐서 두발히어로 메모로 전달
        # 고객이 공동현관 비밀번호를 이 두 칸에 나눠 입력하므로 합친 텍스트에서 추출
        memo = " ".join(filter(None, [exit_method, delivery_memo]))
        frontdoor_pw = _extract_frontdoor_pw(memo)
        clean_addr = _ZIPCODE_RE.sub("", address)

        plan.candidates.append(
            Candidate(
                index=i,
                name=name,
                phone=normalized,
                address=address,
                clean_addr=clean_addr,
                memo=memo,
                frontdoor_password=frontdoor_pw,
            )
        )

    return plan
