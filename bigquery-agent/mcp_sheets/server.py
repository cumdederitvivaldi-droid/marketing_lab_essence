#!/usr/bin/env python3
"""Google Sheets MCP Server — Claude가 스프레드시트를 직접 읽고 씁니다."""

import asyncio
import json
import os
from typing import Any

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ─── Google Sheets API 인증 ───────────────────────────────────
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def get_service():
    """환경변수에서 서비스 계정 자격증명을 읽어 Sheets 서비스를 반환합니다."""
    json_str = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    path     = os.environ.get("GOOGLE_SERVICE_ACCOUNT_PATH", "service_account.json")

    if json_str:
        info  = json.loads(json_str)
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        creds = service_account.Credentials.from_service_account_file(path, scopes=SCOPES)

    return build("sheets", "v4", credentials=creds)

# ─── MCP 서버 초기화 ──────────────────────────────────────────
app = Server("google-sheets-mcp")

# ─── 도구 목록 ────────────────────────────────────────────────
@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="sheets_read",
            description="Google Sheets의 특정 범위 데이터를 읽습니다. 결과는 2D 배열(JSON)로 반환됩니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {
                        "type": "string",
                        "description": "스프레드시트 ID — URL의 /d/XXXX/ 부분"
                    },
                    "range": {
                        "type": "string",
                        "description": "범위 표기 (예: 메타_raw!A1:H100, 또는 시트명만 입력 시 전체)"
                    },
                },
                "required": ["spreadsheet_id", "range"],
            },
        ),
        types.Tool(
            name="sheets_write",
            description="Google Sheets 특정 셀부터 2D 배열 데이터를 씁니다 (기존 내용 덮어씀).",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "range": {
                        "type": "string",
                        "description": "시작 셀 (예: 시트명!A1)"
                    },
                    "values": {
                        "type": "array",
                        "description": "2D 배열. 예: [[\"헤더1\",\"헤더2\"],[\"값1\",\"값2\"]]",
                        "items": {"type": "array"},
                    },
                },
                "required": ["spreadsheet_id", "range", "values"],
            },
        ),
        types.Tool(
            name="sheets_clear",
            description="Google Sheets의 시트 또는 특정 범위를 비웁니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "range": {
                        "type": "string",
                        "description": "초기화할 범위 또는 시트명"
                    },
                },
                "required": ["spreadsheet_id", "range"],
            },
        ),
        types.Tool(
            name="sheets_append",
            description="시트의 마지막 데이터 행 이후에 새 행을 추가합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "sheet_name": {"type": "string", "description": "시트(탭) 이름"},
                    "values": {
                        "type": "array",
                        "description": "추가할 2D 배열",
                        "items": {"type": "array"},
                    },
                },
                "required": ["spreadsheet_id", "sheet_name", "values"],
            },
        ),
        types.Tool(
            name="sheets_create_tab",
            description="스프레드시트에 새 시트 탭을 만듭니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "sheet_name": {"type": "string", "description": "생성할 탭 이름"},
                },
                "required": ["spreadsheet_id", "sheet_name"],
            },
        ),
        types.Tool(
            name="sheets_list",
            description="스프레드시트의 모든 시트(탭) 이름과 ID 목록을 반환합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                },
                "required": ["spreadsheet_id"],
            },
        ),
        types.Tool(
            name="sheets_format_header",
            description="지정한 행을 헤더 스타일(볼드 + 배경색)로 서식 지정합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "sheet_id": {
                        "type": "integer",
                        "description": "시트 ID (sheets_list 결과의 id 값)"
                    },
                    "row_index": {
                        "type": "integer",
                        "description": "서식 적용할 행 번호 (0-indexed, 헤더는 보통 0)"
                    },
                    "num_columns": {
                        "type": "integer",
                        "description": "적용할 열 수"
                    },
                    "bg_color": {
                        "type": "object",
                        "description": "배경색 RGB (0~1 범위). 예: {\"red\":0.2,\"green\":0.6,\"blue\":0.9}",
                        "properties": {
                            "red":   {"type": "number"},
                            "green": {"type": "number"},
                            "blue":  {"type": "number"},
                        },
                    },
                },
                "required": ["spreadsheet_id", "sheet_id", "row_index", "num_columns"],
            },
        ),
        types.Tool(
            name="sheets_freeze",
            description="시트의 행/열을 고정합니다 (스크롤 시 헤더 유지).",
            inputSchema={
                "type": "object",
                "properties": {
                    "spreadsheet_id": {"type": "string"},
                    "sheet_id":       {"type": "integer"},
                    "frozen_rows":    {"type": "integer", "description": "고정할 행 수 (기본 1)"},
                    "frozen_cols":    {"type": "integer", "description": "고정할 열 수 (기본 0)"},
                },
                "required": ["spreadsheet_id", "sheet_id"],
            },
        ),
    ]


# ─── 도구 실행 ────────────────────────────────────────────────
@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        service = get_service()
        sid = arguments.get("spreadsheet_id", "")

        # ── sheets_read ──────────────────────────────────────
        if name == "sheets_read":
            result = (
                service.spreadsheets()
                .values()
                .get(spreadsheetId=sid, range=arguments["range"])
                .execute()
            )
            values = result.get("values", [])
            return [types.TextContent(type="text", text=json.dumps(values, ensure_ascii=False))]

        # ── sheets_write ─────────────────────────────────────
        elif name == "sheets_write":
            result = (
                service.spreadsheets()
                .values()
                .update(
                    spreadsheetId=sid,
                    range=arguments["range"],
                    valueInputOption="USER_ENTERED",
                    body={"values": arguments["values"]},
                )
                .execute()
            )
            return [types.TextContent(
                type="text",
                text=f"✅ {result['updatedCells']}개 셀 업데이트 완료 (범위: {result['updatedRange']})",
            )]

        # ── sheets_clear ─────────────────────────────────────
        elif name == "sheets_clear":
            service.spreadsheets().values().clear(
                spreadsheetId=sid, range=arguments["range"]
            ).execute()
            return [types.TextContent(type="text", text=f"✅ 초기화 완료: {arguments['range']}")]

        # ── sheets_append ────────────────────────────────────
        elif name == "sheets_append":
            result = (
                service.spreadsheets()
                .values()
                .append(
                    spreadsheetId=sid,
                    range=arguments["sheet_name"],
                    valueInputOption="USER_ENTERED",
                    insertDataOption="INSERT_ROWS",
                    body={"values": arguments["values"]},
                )
                .execute()
            )
            return [types.TextContent(type="text", text=f"✅ {len(arguments['values'])}행 추가 완료")]

        # ── sheets_create_tab ─────────────────────────────────
        elif name == "sheets_create_tab":
            service.spreadsheets().batchUpdate(
                spreadsheetId=sid,
                body={"requests": [{"addSheet": {"properties": {"title": arguments["sheet_name"]}}}]},
            ).execute()
            return [types.TextContent(type="text", text=f"✅ 탭 생성: {arguments['sheet_name']}")]

        # ── sheets_list ───────────────────────────────────────
        elif name == "sheets_list":
            result = service.spreadsheets().get(spreadsheetId=sid).execute()
            sheets = [
                {"id": s["properties"]["sheetId"], "name": s["properties"]["title"]}
                for s in result.get("sheets", [])
            ]
            return [types.TextContent(type="text", text=json.dumps(sheets, ensure_ascii=False))]

        # ── sheets_format_header ──────────────────────────────
        elif name == "sheets_format_header":
            row = arguments["row_index"]
            cols = arguments["num_columns"]
            bg = arguments.get("bg_color", {"red": 0.267, "green": 0.533, "blue": 0.961})
            service.spreadsheets().batchUpdate(
                spreadsheetId=sid,
                body={
                    "requests": [{
                        "repeatCell": {
                            "range": {
                                "sheetId": arguments["sheet_id"],
                                "startRowIndex": row,
                                "endRowIndex":   row + 1,
                                "startColumnIndex": 0,
                                "endColumnIndex":   cols,
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "backgroundColor": bg,
                                    "textFormat": {
                                        "bold": True,
                                        "foregroundColor": {"red": 1, "green": 1, "blue": 1},
                                    },
                                    "horizontalAlignment": "CENTER",
                                }
                            },
                            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
                        }
                    }]
                },
            ).execute()
            return [types.TextContent(type="text", text="✅ 헤더 서식 적용 완료")]

        # ── sheets_freeze ─────────────────────────────────────
        elif name == "sheets_freeze":
            service.spreadsheets().batchUpdate(
                spreadsheetId=sid,
                body={
                    "requests": [{
                        "updateSheetProperties": {
                            "properties": {
                                "sheetId": arguments["sheet_id"],
                                "gridProperties": {
                                    "frozenRowCount": arguments.get("frozen_rows", 1),
                                    "frozenColumnCount": arguments.get("frozen_cols", 0),
                                },
                            },
                            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
                        }
                    }]
                },
            ).execute()
            return [types.TextContent(type="text", text="✅ 행/열 고정 완료")]

        else:
            return [types.TextContent(type="text", text=f"❌ 알 수 없는 도구: {name}")]

    except HttpError as e:
        return [types.TextContent(type="text", text=f"❌ Google API 오류: {e.status_code} {e.reason}")]
    except Exception as e:
        return [types.TextContent(type="text", text=f"❌ 오류: {type(e).__name__}: {e}")]


# ─── 진입점 ───────────────────────────────────────────────────
async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
