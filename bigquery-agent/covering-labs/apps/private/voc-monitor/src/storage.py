"""SQLite 스토리지 — voc_messages / voc_items / themes 3테이블."""
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from config import DB_DIR, DB_PATH

KST = timezone(timedelta(hours=9))


def init_db():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS voc_messages (
                slack_ts        TEXT PRIMARY KEY,
                channel_id      TEXT NOT NULL,
                posted_at       TEXT NOT NULL,
                raw_text        TEXT,
                permalink       TEXT,
                user_key        TEXT,
                has_attachments INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS voc_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                slack_ts        TEXT NOT NULL REFERENCES voc_messages(slack_ts),
                theme_id        TEXT,
                category        TEXT,
                severity        TEXT,
                sentiment       TEXT,
                quote           TEXT,
                impact_score    REAL,
                effort_hint     REAL,
                classified_at   TEXT
            );

            CREATE TABLE IF NOT EXISTS themes (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                problem_statement TEXT,
                first_seen_at   TEXT NOT NULL,
                last_seen_at    TEXT NOT NULL,
                total_count     INTEGER DEFAULT 0,
                rice_reach      INTEGER DEFAULT 0,
                rice_impact     REAL DEFAULT 1.0,
                rice_confidence REAL DEFAULT 0.5,
                rice_effort     REAL DEFAULT 1.0,
                rice_score      REAL DEFAULT 0.0,
                lens            TEXT,
                status          TEXT DEFAULT '발견',
                embedding_json  TEXT
            );
        """)
        conn.commit()


# ── messages ──────────────────────────────────────────────────────────────────

def upsert_messages(msgs: list[dict]):
    """새 메시지를 저장. 이미 있으면 무시."""
    if not msgs:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO voc_messages
               (slack_ts, channel_id, posted_at, raw_text, permalink, user_key, has_attachments)
               VALUES (:slack_ts, :channel_id, :posted_at, :raw_text, :permalink, :user_key, :has_attachments)
            """,
            msgs,
        )
        conn.commit()


def get_latest_ts() -> Optional[str]:
    """가장 최근 수집된 메시지의 slack_ts 반환. 없으면 None."""
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT slack_ts FROM voc_messages ORDER BY slack_ts DESC LIMIT 1"
        ).fetchone()
    return row[0] if row else None


def get_unthemed_items() -> list[dict]:
    """theme_id가 NULL인 voc_items + message posted_at/quote 반환."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT i.id, i.slack_ts, i.category, i.severity, i.sentiment,
                   i.quote, i.impact_score, i.effort_hint,
                   m.posted_at, m.raw_text
            FROM voc_items i
            JOIN voc_messages m ON i.slack_ts = m.slack_ts
            WHERE i.theme_id IS NULL
        """).fetchall()
    return [dict(r) for r in rows]


def update_item_theme(item_id: int, theme_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "UPDATE voc_items SET theme_id = ? WHERE id = ?",
            (theme_id, item_id),
        )
        conn.commit()


def get_unclassified_messages() -> list[dict]:
    """voc_items 미등록 메시지 전부 반환."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT m.* FROM voc_messages m
            LEFT JOIN voc_items i ON m.slack_ts = i.slack_ts
            WHERE i.id IS NULL AND m.raw_text != ''
        """).fetchall()
    return [dict(r) for r in rows]


# ── items ──────────────────────────────────────────────────────────────────────

def insert_items(items: list[dict]):
    now = datetime.now(KST).isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            """INSERT INTO voc_items
               (slack_ts, theme_id, category, severity, sentiment, quote, impact_score, effort_hint, classified_at)
               VALUES (:slack_ts, :theme_id, :category, :severity, :sentiment, :quote, :impact_score, :effort_hint, :now)
            """,
            [{**i, "now": now} for i in items],
        )
        conn.commit()


# ── themes ────────────────────────────────────────────────────────────────────

def upsert_theme(theme: dict):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO themes
               (id, title, problem_statement, first_seen_at, last_seen_at, total_count,
                rice_reach, rice_impact, rice_confidence, rice_effort, rice_score, lens, status, embedding_json)
               VALUES (:id, :title, :problem_statement, :first_seen_at, :last_seen_at, :total_count,
                :rice_reach, :rice_impact, :rice_confidence, :rice_effort, :rice_score, :lens, :status, :embedding_json)
               ON CONFLICT(id) DO UPDATE SET
                 last_seen_at = excluded.last_seen_at,
                 total_count  = excluded.total_count,
                 rice_reach   = excluded.rice_reach,
                 rice_impact  = excluded.rice_impact,
                 rice_confidence = excluded.rice_confidence,
                 rice_effort  = excluded.rice_effort,
                 rice_score   = excluded.rice_score,
                 lens         = excluded.lens,
                 embedding_json = COALESCE(excluded.embedding_json, themes.embedding_json)
            """,
            theme,
        )
        conn.commit()


def get_all_themes() -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM themes ORDER BY rice_score DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_theme(theme_id: str) -> Optional[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM themes WHERE id = ?", (theme_id,)).fetchone()
    return dict(row) if row else None


def get_recent_items(since_iso: str, theme_id: Optional[str] = None, limit: Optional[int] = None) -> list[dict]:
    """특정 시각 이후 수집된 voc_items + message 정보 JOIN.
    theme_id 지정 시 해당 테마 항목만, limit 지정 시 최대 N건."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if theme_id is not None:
            sql = """
                SELECT i.*, m.raw_text, m.permalink, m.posted_at
                FROM voc_items i
                JOIN voc_messages m ON i.slack_ts = m.slack_ts
                WHERE m.posted_at >= ? AND i.theme_id = ?
                ORDER BY m.posted_at DESC
            """
            params: tuple = (since_iso, theme_id)
        else:
            sql = """
                SELECT i.*, m.raw_text, m.permalink, m.posted_at
                FROM voc_items i
                JOIN voc_messages m ON i.slack_ts = m.slack_ts
                WHERE m.posted_at >= ?
                ORDER BY m.posted_at DESC
            """
            params = (since_iso,)
        if limit is not None:
            sql += f" LIMIT {int(limit)}"
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]
