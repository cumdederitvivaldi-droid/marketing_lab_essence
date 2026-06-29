"""
Google Sheets 모듈 - 감시 목록 관리

시트 구조:
  | 주문번호 | 상담ID | 감지시간 | 배차상태 | 차량번호 | 라이더 | 배차확인시간 | 발송완료 |

기능:
  1. 채널톡 태그 감지된 주문 자동 적재
  2. 배차 확인 후 차량번호/라이더 업데이트
  3. 발송 완료 플래그 관리 (중복 발송 방지)
"""
import logging
import time
from datetime import datetime, timedelta, timezone

import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import config

logger = logging.getLogger("sheets")

KST = timezone(timedelta(hours=9))

# 시트 헤더 (A~L열)
HEADERS = ["주문코드", "주문ID", "상담ID", "감지시간", "배차상태", "차량번호", "라이더", "배차확인시간", "발송완료", "전화번호", "실패원인", "태그"]

# 열 인덱스 (0-based)
COL_ORDER_CODE = 0   # 영숫자 8자리 (FRTV6ECX) - 채널톡 봇에서 추출
COL_ORDER_ID = 1     # 숫자 주문ID (1283492) - BigQuery에서 매핑
COL_CHAT_ID = 2
COL_DETECTED_AT = 3
COL_DISPATCH_STATUS = 4
COL_VEHICLE_NUMBER = 5
COL_RIDER = 6
COL_DISPATCH_TIME = 7
COL_SENT = 8
COL_PHONE = 9        # 전화번호 - 폴백 시 추출된 번호 (수동 확인용)
COL_FAIL_REASON = 10 # 실패원인 - 수동처리필요 행에만 기록
COL_TAG = 11         # 태그 - 차량등록/차량등록2

# 서비스 객체 캐시 (매번 재생성 방지)
_service = None


def _get_service():
    """Google Sheets API 서비스 객체 생성 (캐싱)"""
    global _service
    if _service is None:
        _SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
        creds = config.get_google_service_account_credentials(_SCOPES)
        if creds is None:
            creds, _ = google.auth.default(scopes=_SCOPES)
        _service = build("sheets", "v4", credentials=creds)
    return _service


def _reset_service():
    """BrokenPipe 등 연결 오류 시 서비스 캐시 초기화 (재생성 트리거)"""
    global _service
    _service = None


def _sheet_range(range_str: str) -> str:
    """시트명 + 범위 조합"""
    return f"'{config.GOOGLE_SHEETS_WORKSHEET_NAME}'!{range_str}"


class SheetsWriteBuffer:
    """배치 쓰기 버퍼 — 개별 Sheets API 호출을 모아 한 번에 처리해 429 방지.

    사용법:
        buf = SheetsWriteBuffer()
        sheets.add_order(..., buffer=buf)
        sheets.update_order_id(..., buffer=buf)
        buf.flush()  # 한 번에 전송
    """

    CHUNK_SIZE = 50       # 한 번에 처리할 최대 행 수
    RATE_LIMIT_WAIT = 60  # 429 발생 시 대기 시간(초)

    def __init__(self):
        self._pending_appends: list[list] = []
        self._pending_updates: list[dict] = []

    def add_append(self, row: list):
        """행 추가 대기열에 등록"""
        self._pending_appends.append(row)

    def add_update(self, range_str: str, values: list):
        """셀 업데이트 대기열에 등록 (range_str: 시트명 없이 'A1', 'E2:H2' 형태)"""
        self._pending_updates.append({
            "range": _sheet_range(range_str),
            "values": values,
        })

    def flush(self):
        """대기열 일괄 처리 (append 먼저, 이후 batchUpdate)"""
        self._flush_appends()
        self._flush_updates()

    def _flush_appends(self):
        if not self._pending_appends:
            return
        total = len(self._pending_appends)
        for i in range(0, total, self.CHUNK_SIZE):
            chunk = self._pending_appends[i:i + self.CHUNK_SIZE]
            self._do_append(_get_service(), chunk)
            if i + self.CHUNK_SIZE < total:
                time.sleep(1)
        logger.info(f"버퍼 append 완료: {total}건")
        self._pending_appends.clear()

    def _do_append(self, service, rows: list, retry: bool = True):
        try:
            service.spreadsheets().values().append(
                spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
                range=_sheet_range("A:L"),
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": rows},
            ).execute()
        except HttpError as e:
            if e.resp.status == 429 and retry:
                logger.warning(f"Sheets API 429 (append) — {self.RATE_LIMIT_WAIT}초 대기 후 재시도")
                time.sleep(self.RATE_LIMIT_WAIT)
                self._do_append(service, rows, retry=False)
            else:
                raise
        except BrokenPipeError:
            if retry:
                logger.warning("Sheets API BrokenPipe (append) — 서비스 재생성 후 재시도")
                _reset_service()
                time.sleep(2)
                self._do_append(_get_service(), rows, retry=False)
            else:
                raise

    def _flush_updates(self):
        if not self._pending_updates:
            return
        total = len(self._pending_updates)
        for i in range(0, total, self.CHUNK_SIZE):
            chunk = self._pending_updates[i:i + self.CHUNK_SIZE]
            self._do_batchupdate(_get_service(), chunk)
            if i + self.CHUNK_SIZE < total:
                time.sleep(1)
        logger.info(f"버퍼 batchUpdate 완료: {total}건")
        self._pending_updates.clear()

    def _do_batchupdate(self, service, data: list, retry: bool = True):
        try:
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
                body={"valueInputOption": "RAW", "data": data},
            ).execute()
        except HttpError as e:
            if e.resp.status == 429 and retry:
                logger.warning(f"Sheets API 429 (batchUpdate) — {self.RATE_LIMIT_WAIT}초 대기 후 재시도")
                time.sleep(self.RATE_LIMIT_WAIT)
                self._do_batchupdate(service, data, retry=False)
            else:
                raise
        except BrokenPipeError:
            if retry:
                logger.warning("Sheets API BrokenPipe (batchUpdate) — 서비스 재생성 후 재시도")
                _reset_service()
                time.sleep(2)
                self._do_batchupdate(_get_service(), data, retry=False)
            else:
                raise


def ensure_headers():
    """시트에 헤더가 없으면 생성"""
    for attempt in range(2):
        try:
            service = _get_service()
            result = service.spreadsheets().values().get(
                spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
                range=_sheet_range("A1:L1"),
            ).execute()
            existing = result.get("values", [])
            if not existing or existing[0] != HEADERS:
                service.spreadsheets().values().update(
                    spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
                    range=_sheet_range("A1:L1"),
                    valueInputOption="RAW",
                    body={"values": [HEADERS]},
                ).execute()
                logger.info("시트 헤더 생성 완료")
            return
        except BrokenPipeError:
            if attempt == 0:
                logger.warning("Google Sheets BrokenPipe — 서비스 재생성 후 재시도")
                _reset_service()
                time.sleep(2)
            else:
                raise


def get_all_rows() -> list[list[str]]:
    """시트의 모든 데이터 행 조회 (헤더 제외)"""
    for attempt in range(2):
        try:
            service = _get_service()
            result = service.spreadsheets().values().get(
                spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
                range=_sheet_range("A2:L"),
            ).execute()
            return result.get("values", [])
        except BrokenPipeError:
            if attempt == 0:
                logger.warning("Google Sheets BrokenPipe — 서비스 재생성 후 재시도")
                _reset_service()
                time.sleep(2)
            else:
                raise


def get_pending_orders(rows: list[list[str]] = None) -> list[dict]:
    """
    미배차 또는 미발송 주문 목록 반환

    Args:
        rows: 사전에 로드한 행 데이터 (없으면 시트에서 조회)

    조건: 발송완료가 비어있거나 "N"인 행
    """
    if rows is None:
        rows = get_all_rows()
    pending = []

    for i, row in enumerate(rows):
        # 행 길이가 부족하면 빈칸으로 채움
        while len(row) < len(HEADERS):
            row.append("")

        sent = row[COL_SENT].strip().upper()
        status = row[COL_DISPATCH_STATUS].strip()
        # 최종 상태 행은 COL_SENT와 무관하게 제외 (중복 처리 방지)
        if status in ("수동발송완료", "유저취소", "발송 필요 X"):
            continue
        if sent not in ("Y", "TRUE", "완료"):
            pending.append({
                "row_index": i + 2,  # 시트 행번호 (1-based, 헤더 제외)
                "order_code": row[COL_ORDER_CODE],
                "order_id": row[COL_ORDER_ID],
                "chat_id": row[COL_CHAT_ID],
                "dispatch_status": row[COL_DISPATCH_STATUS],
                "vehicle_number": row[COL_VEHICLE_NUMBER],
                "rider": row[COL_RIDER],
                "detected_at": row[COL_DETECTED_AT],
                "phone": row[COL_PHONE],
                "fail_reason": row[COL_FAIL_REASON],
                "tag": row[COL_TAG],
            })

    return pending


def add_order(order_code: str, chat_id: str, order_id: str = "", phone: str = "", status: str = "미배차", fail_reason: str = "", tag: str = "차량등록", buffer: "SheetsWriteBuffer | None" = None):
    """새 주문을 시트에 추가

    Args:
        status: 배차상태 초기값.
                "미배차" = 정상 감지, 시스템이 자동 처리 예정
                "수동처리필요" = 주문코드 추출 실패, CX팀 수동 확인 필요
        fail_reason: 추출 실패 원인 (status="수동처리필요"인 경우에만 의미 있음)
        tag: 감지된 채널톡 태그 (차량등록/차량등록2)
        buffer: 있으면 즉시 API 호출 대신 버퍼에 추가 (flush() 호출 시 일괄 전송)
    """
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    row = [order_code, order_id, chat_id, now, status, "", "", "", "", phone, fail_reason, tag]

    if buffer is not None:
        buffer.add_append(row)
        logger.info(f"버퍼 추가: 주문코드 {order_code}, 주문ID {order_id}, 상담 {chat_id}, 상태 {status}")
        return

    service = _get_service()
    service.spreadsheets().values().append(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range("A:L"),
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()
    logger.info(f"시트 추가: 주문코드 {order_code}, 주문ID {order_id}, 상담 {chat_id}, 상태 {status}")


def update_order_id(row_index: int, order_id: str, buffer: "SheetsWriteBuffer | None" = None):
    """주문코드 → 주문ID 매핑 결과를 시트에 업데이트"""
    if buffer is not None:
        buffer.add_update(f"B{row_index}", [[order_id]])
        logger.info(f"버퍼 주문ID 업데이트: 행 {row_index}, ID {order_id}")
        return

    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"B{row_index}"),
        valueInputOption="RAW",
        body={"values": [[order_id]]},
    ).execute()
    logger.info(f"시트 주문ID 업데이트: 행 {row_index}, ID {order_id}")


def update_order_code(row_index: int, order_code: str, buffer: "SheetsWriteBuffer | None" = None):
    """오입력 주문코드를 정정된 코드로 시트에 업데이트 (A열)"""
    if buffer is not None:
        buffer.add_update(f"A{row_index}", [[order_code]])
        logger.info(f"버퍼 주문코드 정정: 행 {row_index}, 코드 {order_code}")
        return

    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"A{row_index}"),
        valueInputOption="RAW",
        body={"values": [[order_code]]},
    ).execute()
    logger.info(f"시트 주문코드 정정: 행 {row_index}, 코드 {order_code}")


def update_dispatch(row_index: int, vehicle_number: str, rider: str, buffer: "SheetsWriteBuffer | None" = None, status: str = "배차완료"):
    """배차 정보 업데이트 (차량번호 + 라이더)"""
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M")

    if buffer is not None:
        buffer.add_update(f"E{row_index}:H{row_index}", [[status, vehicle_number, rider, now]])
        logger.info(f"버퍼 배차 업데이트: 행 {row_index}")
        return

    service = _get_service()
    # E~H열 업데이트 (배차상태, 차량번호, 라이더, 배차확인시간)
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"E{row_index}:H{row_index}"),
        valueInputOption="RAW",
        body={"values": [[status, vehicle_number, rider, now]]},
    ).execute()
    logger.info(f"시트 업데이트: 행 {row_index}")


def clear_dispatch(row_index: int):
    """배차 정보 초기화 (E~H열 클리어) — phone fallback 오매칭 정정용"""
    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"E{row_index}:H{row_index}"),
        valueInputOption="RAW",
        body={"values": [["", "", "", ""]]},
    ).execute()
    logger.info(f"배차 초기화: 행 {row_index}")


def mark_sent(row_index: int, buffer: "SheetsWriteBuffer | None" = None):
    """발송 완료 표시 (중복 발송 방지)"""
    if buffer is not None:
        buffer.add_update(f"I{row_index}", [["Y"]])
        logger.info(f"버퍼 발송완료: 행 {row_index}")
        return

    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"I{row_index}"),
        valueInputOption="RAW",
        body={"values": [["Y"]]},
    ).execute()
    logger.info(f"시트 발송완료: 행 {row_index}")


def mark_no_send_needed(row_index: int, reason: str = "유저취소", buffer: "SheetsWriteBuffer | None" = None):
    """발송 불필요 건 기록 (취소 등) — I열: 발송 필요 X, E열: reason"""
    if buffer is not None:
        buffer.add_update(f"I{row_index}", [["발송 필요 X"]])
        buffer.add_update(f"E{row_index}", [[reason]])
        logger.info(f"버퍼 발송필요X: 행 {row_index} ({reason})")
        return

    service = _get_service()
    service.spreadsheets().values().batchUpdate(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        body={
            "valueInputOption": "RAW",
            "data": [
                {"range": _sheet_range(f"I{row_index}"), "values": [["발송 필요 X"]]},
                {"range": _sheet_range(f"E{row_index}"), "values": [[reason]]},
            ],
        },
    ).execute()
    logger.info(f"시트 발송필요X: 행 {row_index} ({reason})")


def update_status(row_index: int, status: str, buffer: "SheetsWriteBuffer | None" = None):
    """배차상태 업데이트 (E열)"""
    if buffer is not None:
        buffer.add_update(f"E{row_index}", [[status]])
        logger.info(f"버퍼 상태 업데이트: 행 {row_index}, 상태 {status}")
        return

    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"E{row_index}"),
        valueInputOption="RAW",
        body={"values": [[status]]},
    ).execute()
    logger.info(f"시트 상태 업데이트: 행 {row_index}, 상태 {status}")


def update_fail_reason(row_index: int, fail_reason: str, buffer: "SheetsWriteBuffer | None" = None):
    """실패원인 업데이트 (K열)"""
    if buffer is not None:
        buffer.add_update(f"K{row_index}", [[fail_reason]])
        logger.info(f"버퍼 실패원인 업데이트: 행 {row_index}")
        return

    service = _get_service()
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range(f"K{row_index}"),
        valueInputOption="RAW",
        body={"values": [[fail_reason]]},
    ).execute()
    logger.info(f"시트 실패원인 업데이트: 행 {row_index}")


def update_server_heartbeat():
    """맥미니 서버 → 현재 타임스탬프를 M1 셀에 기록 (watchdog 감시용)"""
    service = _get_service()
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    service.spreadsheets().values().update(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range("M1"),
        valueInputOption="RAW",
        body={"values": [[now]]},
    ).execute()
    logger.info(f"서버 heartbeat 기록: {now}")


def get_server_heartbeat() -> str:
    """GitHub Actions watchdog → M1에서 마지막 heartbeat 타임스탬프 읽기"""
    service = _get_service()
    result = service.spreadsheets().values().get(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        range=_sheet_range("M1"),
    ).execute()
    values = result.get("values", [])
    return values[0][0] if values else ""


def _get_sheet_metadata() -> tuple[int, list]:
    """워크시트 sheetId + 기존 rowGroups 한 번에 조회"""
    service = _get_service()
    result = service.spreadsheets().get(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        fields="sheets(properties(sheetId,title),rowGroups)",
    ).execute()
    for sheet in result.get("sheets", []):
        if sheet["properties"]["title"] == config.GOOGLE_SHEETS_WORKSHEET_NAME:
            return sheet["properties"]["sheetId"], sheet.get("rowGroups", [])
    raise ValueError(f"워크시트 '{config.GOOGLE_SHEETS_WORKSHEET_NAME}' 미발견")


def collapse_past_date_rows(all_rows: list[list[str]] = None):
    """
    과거 날짜 행 전체를 단일 그룹 1개로 접기 (▶ 버튼으로 펼치기 가능)

    - 과거 행 전체를 하나의 그룹으로 묶음 (날짜별 별도 그룹 X)
    - 기존 그룹 범위가 달라졌으면 삭제 후 재생성
    - 1일 1회만 호출할 것 (run_loop에서 관리)
    """
    if all_rows is None:
        all_rows = get_all_rows()

    today = datetime.now(KST).strftime("%Y-%m-%d")

    # 과거 날짜 행 전체 범위 계산 (단일 그룹용 min/max)
    min_idx = None
    max_idx = None
    for i, row in enumerate(all_rows):
        if len(row) <= COL_DETECTED_AT or not row[COL_DETECTED_AT]:
            continue
        row_date = row[COL_DETECTED_AT][:10]  # "YYYY-MM-DD"
        if row_date >= today:
            continue
        dim_idx = i + 1  # 0-based: header=0, 첫 데이터행=1
        if min_idx is None:
            min_idx = dim_idx
        max_idx = dim_idx + 1  # endIndex (exclusive)

    if min_idx is None:
        logger.info("접을 과거 날짜 행 없음")
        return

    try:
        sheet_id, existing_groups = _get_sheet_metadata()
    except Exception as e:
        logger.warning(f"시트 메타데이터 조회 실패, 행 그룹화 스킵: {e}")
        return

    # 동일 범위 그룹이 이미 있는지 확인
    exact_match = any(
        g["range"]["startIndex"] == min_idx and g["range"]["endIndex"] == max_idx
        for g in existing_groups
    )

    requests_batch = []

    # 범위가 다른 기존 그룹 모두 삭제
    for g in existing_groups:
        if not (g["range"]["startIndex"] == min_idx and g["range"]["endIndex"] == max_idx):
            requests_batch.append({
                "deleteDimensionGroup": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": g["range"]["startIndex"],
                        "endIndex": g["range"]["endIndex"],
                    }
                }
            })

    # 신규 그룹 추가 (동일 범위 없는 경우)
    if not exact_match:
        requests_batch.append({
            "addDimensionGroup": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": min_idx,
                    "endIndex": max_idx,
                }
            }
        })

    # 그룹 접기 (delete/add 이후 순서로 실행)
    requests_batch.append({
        "updateDimensionGroup": {
            "dimensionGroup": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": min_idx,
                    "endIndex": max_idx,
                },
                "depth": 1,
                "collapsed": True,
            },
            "fields": "collapsed",
        }
    })

    service = _get_service()
    service.spreadsheets().batchUpdate(
        spreadsheetId=config.GOOGLE_SHEETS_SPREADSHEET_ID,
        body={"requests": requests_batch},
    ).execute()
    logger.info(f"과거 날짜 행 그룹 접기 완료: rows {min_idx}~{max_idx - 1} (단일 그룹)")


# CHANGED: 오늘 누적 집계 함수 추가
def get_today_summary(all_rows: list[list[str]] = None) -> dict:
    """
    오늘 날짜 행의 상태별 누적 집계

    Returns:
        {
            "completed": int,         # 발송완료
            "cancelled": int,         # 발송 필요 X (유저취소 등)
            "waiting_dispatch": int,  # 배차대기 (미배차, 배차완료-미발송)
            "manual_required": int,   # 수동처리필요
            "tomorrow_pickup": int,   # 익일수거
        }
    """
    if all_rows is None:
        all_rows = get_all_rows()

    today = datetime.now(KST).strftime("%Y-%m-%d")
    summary = {
        "completed": 0,
        "cancelled": 0,
        "waiting_dispatch": 0,
        "manual_required": 0,
        "tomorrow_pickup": 0,
    }

    for row in all_rows:
        while len(row) < len(HEADERS):
            row.append("")

        row_date = row[COL_DETECTED_AT][:10] if row[COL_DETECTED_AT] else ""
        if row_date != today:
            continue

        sent = row[COL_SENT].strip().upper()
        status = row[COL_DISPATCH_STATUS]

        if sent in ("Y", "TRUE", "완료"):
            summary["completed"] += 1
            continue

        if sent == "발송 필요 X" or status == "유저취소":
            summary["cancelled"] += 1
            continue

        if status == "수동처리필요":
            summary["manual_required"] += 1
        elif status == "익일수거":
            summary["tomorrow_pickup"] += 1
        else: # 미배차, 배차완료, 추출실패 등
            summary["waiting_dispatch"] += 1

    return summary
