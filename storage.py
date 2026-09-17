"""依伴儿本地 SQLite 数据层。"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from bone_risk import (
    QUESTION_BY_ID as BONE_QUESTION_BY_ID,
    QUESTIONS as BONE_QUESTIONS,
    applicable as bone_question_applicable,
    option_label as bone_option_label,
)
from pro_scale import DOMAIN_LABELS, QUESTION_BY_ID, concern_score, option_label
from demo_patient_data import TEST_PATIENT_CASE


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("YIBAN_DB_PATH", str(ROOT / "data" / "yiban.db")))


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                age INTEGER,
                sex TEXT,
                condition_summary TEXT,
                medical_history TEXT,
                updated_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS patient_reports (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                file_name TEXT NOT NULL,
                file_type TEXT,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                note TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                patient_id TEXT NOT NULL REFERENCES patients(id),
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pro_followups (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                question_id INTEGER NOT NULL,
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                source_excerpt TEXT NOT NULL,
                ai_reason TEXT NOT NULL,
                suggested_value INTEGER,
                confidence REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                answered_at TEXT,
                assistant_message_id INTEGER REFERENCES messages(id),
                assistant_excerpt TEXT
            );

            CREATE TABLE IF NOT EXISTS pro_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                followup_id TEXT NOT NULL REFERENCES pro_followups(id),
                patient_id TEXT NOT NULL REFERENCES patients(id),
                session_date TEXT NOT NULL,
                question_id INTEGER NOT NULL,
                option_value INTEGER NOT NULL,
                option_label TEXT NOT NULL,
                concern_score REAL,
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                source_excerpt TEXT NOT NULL,
                ai_reason TEXT NOT NULL,
                created_at TEXT NOT NULL,
                answer_message_id INTEGER REFERENCES messages(id),
                answer_excerpt TEXT,
                answer_reason TEXT,
                extraction_confidence REAL
            );

            CREATE TABLE IF NOT EXISTS bone_risk_followups (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                question_id TEXT NOT NULL,
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                source_excerpt TEXT NOT NULL,
                ai_reason TEXT NOT NULL,
                confidence REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                answered_at TEXT,
                assistant_message_id INTEGER REFERENCES messages(id),
                assistant_excerpt TEXT
            );

            CREATE TABLE IF NOT EXISTS bone_risk_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                followup_id TEXT NOT NULL REFERENCES bone_risk_followups(id),
                patient_id TEXT NOT NULL REFERENCES patients(id),
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                question_id TEXT NOT NULL,
                value_json TEXT NOT NULL,
                display_value TEXT NOT NULL,
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                source_excerpt TEXT NOT NULL,
                ai_reason TEXT NOT NULL,
                created_at TEXT NOT NULL,
                answer_message_id INTEGER REFERENCES messages(id),
                answer_excerpt TEXT,
                answer_reason TEXT,
                extraction_confidence REAL
            );

            CREATE TABLE IF NOT EXISTS medication_followups (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                medication_name TEXT NOT NULL,
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                source_excerpt TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'awaiting_start',
                start_time_text TEXT,
                start_answer_message_id INTEGER REFERENCES messages(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS medication_records (
                id TEXT PRIMARY KEY,
                followup_id TEXT NOT NULL UNIQUE REFERENCES medication_followups(id),
                patient_id TEXT NOT NULL REFERENCES patients(id),
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                medication_name TEXT NOT NULL,
                start_time_text TEXT NOT NULL,
                source_label TEXT NOT NULL DEFAULT '患者描述',
                source_message_id INTEGER NOT NULL REFERENCES messages(id),
                confirmation_message_id INTEGER NOT NULL REFERENCES messages(id),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_items (
                id TEXT PRIMARY KEY,
                department TEXT NOT NULL,
                title TEXT NOT NULL,
                content_type TEXT NOT NULL,
                source_url TEXT,
                summary TEXT,
                status TEXT NOT NULL DEFAULT 'published',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS followup_pathways (
                id TEXT PRIMARY KEY,
                department TEXT NOT NULL,
                name TEXT NOT NULL,
                trigger_rule TEXT NOT NULL,
                cadence TEXT NOT NULL,
                push_content TEXT NOT NULL,
                channel TEXT NOT NULL,
                escalation_rule TEXT,
                status TEXT NOT NULL DEFAULT 'enabled',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS patient_clinical_profiles (
                patient_id TEXT PRIMARY KEY REFERENCES patients(id),
                first_diagnosis_date TEXT,
                primary_diagnosis TEXT,
                current_diagnosis TEXT,
                molecular_subtype TEXT,
                current_hospital TEXT,
                current_regimen TEXT,
                next_followup_date TEXT,
                family_history TEXT,
                menstrual_history TEXT,
                data_source TEXT NOT NULL DEFAULT '测试病历数据',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS clinical_events (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                event_date TEXT NOT NULL,
                end_date TEXT,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                hospital TEXT,
                treatment TEXT,
                outcome TEXT,
                details TEXT,
                status TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS adverse_events (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                onset_date TEXT NOT NULL,
                name TEXT NOT NULL,
                grade TEXT,
                related_treatment TEXT,
                details TEXT,
                management TEXT,
                outcome TEXT
            );

            CREATE TABLE IF NOT EXISTS clinical_measurements (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL REFERENCES patients(id),
                measured_at TEXT NOT NULL,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                unit TEXT,
                flag TEXT,
                source TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_messages_patient_time
                ON messages(patient_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_followups_patient_status
                ON pro_followups(patient_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_responses_patient_date
                ON pro_responses(patient_id, session_date, created_at);
            CREATE INDEX IF NOT EXISTS idx_bone_followups_patient_status
                ON bone_risk_followups(patient_id, conversation_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_bone_answers_patient_time
                ON bone_risk_answers(patient_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_patient_reports_patient_time
                ON patient_reports(patient_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_medication_followups_patient_status
                ON medication_followups(patient_id, conversation_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_medication_records_patient_time
                ON medication_records(patient_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_clinical_events_patient_date
                ON clinical_events(patient_id, event_date, sort_order);
            CREATE INDEX IF NOT EXISTS idx_adverse_events_patient_date
                ON adverse_events(patient_id, onset_date);
            CREATE INDEX IF NOT EXISTS idx_measurements_patient_date
                ON clinical_measurements(patient_id, measured_at);
            """
        )
        # 兼容已经由旧版本创建的本地数据库。
        patient_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(patients)").fetchall()
        }
        for name, definition in {
            "age": "INTEGER",
            "sex": "TEXT",
            "condition_summary": "TEXT",
            "medical_history": "TEXT",
            "updated_at": "TEXT",
        }.items():
            if name not in patient_columns:
                db.execute(f"ALTER TABLE patients ADD COLUMN {name} {definition}")
        followup_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(pro_followups)").fetchall()
        }
        response_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(pro_responses)").fetchall()
        }
        for name, definition in {
            "assistant_message_id": "INTEGER REFERENCES messages(id)",
            "assistant_excerpt": "TEXT",
        }.items():
            if name not in followup_columns:
                db.execute(f"ALTER TABLE pro_followups ADD COLUMN {name} {definition}")
        for name, definition in {
            "answer_message_id": "INTEGER REFERENCES messages(id)",
            "answer_excerpt": "TEXT",
            "answer_reason": "TEXT",
            "extraction_confidence": "REAL",
        }.items():
            if name not in response_columns:
                db.execute(f"ALTER TABLE pro_responses ADD COLUMN {name} {definition}")
        db.execute(
            "INSERT OR IGNORE INTO patients(id, display_name, created_at) VALUES (?, ?, ?)",
            ("P001", "演示患者", now_iso()),
        )
        seed_time = now_iso()
        db.executemany(
            """INSERT OR IGNORE INTO knowledge_items(
                   id, department, title, content_type, source_url, summary, status, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                ("kb-breast-01", "乳腺肿瘤科", "内分泌治疗期间的用药要点", "文章", "", "主任审核的患者用药科普与就医提示。", "published", seed_time),
                ("kb-breast-02", "乳腺肿瘤科", "治疗期间安全运动指导", "视频", "", "5 分钟居家活动示范，根据患者体力分层推送。", "published", seed_time),
            ],
        )
        db.executemany(
            """INSERT OR IGNORE INTO followup_pathways(
                   id, department, name, trigger_rule, cadence, push_content, channel,
                   escalation_rule, status, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                ("path-breast-01", "乳腺肿瘤科", "新方案启动后 14 天随访", "医生登记新治疗方案", "第3、7、14天", "PRO 症状追问 + 用药提醒", "患者端消息", "出现高负担条目时推送医生工作台", "enabled", seed_time),
                ("path-breast-02", "乳腺肿瘤科", "复诊前资料准备", "距复诊日期 3 天", "复诊前3天", "检查报告、用药清单和近期症状提醒", "患者端消息", "资料未完成时纳入待跟进列表", "enabled", seed_time),
            ],
        )


def ensure_patient(patient_id: str, display_name: str = "演示患者") -> None:
    with connect() as db:
        db.execute(
            "INSERT OR IGNORE INTO patients(id, display_name, created_at) VALUES (?, ?, ?)",
            (patient_id, display_name, now_iso()),
        )


def register_patient(
    patient_id: str,
    display_name: str,
    age: int,
    sex: str,
    condition_summary: str,
    medical_history: str = "",
    reports: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """创建或更新患者的首次登记资料，并保存既往报告元数据。"""
    timestamp = now_iso()
    normalized_reports = reports or []
    with connect() as db:
        db.execute(
            """INSERT INTO patients(
                   id, display_name, age, sex, condition_summary, medical_history, updated_at, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   display_name = excluded.display_name,
                   age = excluded.age,
                   sex = excluded.sex,
                   condition_summary = excluded.condition_summary,
                   medical_history = excluded.medical_history,
                   updated_at = excluded.updated_at""",
            (
                patient_id,
                display_name,
                age,
                sex,
                condition_summary,
                medical_history,
                timestamp,
                timestamp,
            ),
        )
        db.execute("DELETE FROM patient_reports WHERE patient_id = ?", (patient_id,))
        for report in normalized_reports:
            db.execute(
                """INSERT INTO patient_reports(
                       id, patient_id, file_name, file_type, size_bytes, note, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    uuid.uuid4().hex,
                    patient_id,
                    str(report.get("name") or "未命名报告"),
                    str(report.get("type") or ""),
                    int(report.get("size") or 0),
                    str(report.get("note") or ""),
                    timestamp,
                ),
            )
    profile = get_patient_profile(patient_id)
    if profile is None:
        raise RuntimeError("患者资料保存失败")
    return profile


def get_patient_profile(patient_id: str) -> dict[str, Any] | None:
    with connect() as db:
        patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
        if not patient:
            return None
        reports = db.execute(
            """SELECT id, file_name, file_type, size_bytes, note, created_at
               FROM patient_reports WHERE patient_id = ? ORDER BY created_at DESC, id DESC""",
            (patient_id,),
        ).fetchall()
    result = dict(patient)
    result["reports"] = [dict(row) for row in reports]
    return result


def list_patients() -> list[dict[str, Any]]:
    """返回医生端可查看的患者，最近有对话的排在前面。"""
    with connect() as db:
        rows = db.execute(
            """SELECT p.id, p.display_name, p.age, p.sex, p.condition_summary,
                      p.medical_history, p.updated_at, p.created_at,
                      COUNT(DISTINCT pr.id) AS report_count,
                      MAX(c.updated_at) AS last_active_at
               FROM patients AS p
               LEFT JOIN conversations AS c ON c.patient_id = p.id
               LEFT JOIN patient_reports AS pr ON pr.patient_id = p.id
               GROUP BY p.id, p.display_name, p.age, p.sex, p.condition_summary,
                        p.medical_history, p.updated_at, p.created_at
               ORDER BY COALESCE(MAX(c.updated_at), p.created_at) DESC, p.id ASC"""
        ).fetchall()
    return [dict(row) for row in rows]


def save_message(
    conversation_id: str,
    patient_id: str,
    role: str,
    content: str,
) -> int:
    timestamp = now_iso()
    ensure_patient(patient_id)
    with connect() as db:
        db.execute(
            """INSERT OR IGNORE INTO conversations(id, patient_id, created_at, updated_at)
               VALUES (?, ?, ?, ?)""",
            (conversation_id, patient_id, timestamp, timestamp),
        )
        db.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (timestamp, conversation_id),
        )
        cursor = db.execute(
            """INSERT INTO messages(conversation_id, patient_id, role, content, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (conversation_id, patient_id, role, content, timestamp),
        )
        return int(cursor.lastrowid)


def create_medication_followup(
    patient_id: str,
    conversation_id: str,
    medication_name: str,
    source_message_id: int,
    source_excerpt: str,
) -> dict[str, Any]:
    followup_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO medication_followups(
                   id, patient_id, conversation_id, medication_name, source_message_id,
                   source_excerpt, status, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_start', ?, ?)""",
            (
                followup_id,
                patient_id,
                conversation_id,
                medication_name[:80],
                source_message_id,
                source_excerpt[:500],
                timestamp,
                timestamp,
            ),
        )
    return get_medication_followup(followup_id) or {}


def get_medication_followup(followup_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM medication_followups WHERE id = ?", (followup_id,)
        ).fetchone()
    return dict(row) if row else None


def pending_medication_followup(
    patient_id: str,
    conversation_id: str,
) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            """SELECT * FROM medication_followups
               WHERE patient_id = ? AND conversation_id = ?
                 AND status IN ('awaiting_start', 'awaiting_confirmation')
               ORDER BY created_at DESC LIMIT 1""",
            (patient_id, conversation_id),
        ).fetchone()
    return dict(row) if row else None


def set_medication_start(
    followup_id: str,
    start_time_text: str,
    answer_message_id: int,
) -> dict[str, Any]:
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """UPDATE medication_followups
               SET start_time_text = ?, start_answer_message_id = ?,
                   status = 'awaiting_confirmation', updated_at = ?
               WHERE id = ? AND status = 'awaiting_start'""",
            (start_time_text[:200], answer_message_id, timestamp, followup_id),
        )
    followup = get_medication_followup(followup_id)
    if not followup:
        raise ValueError("用药追问不存在")
    return followup


def dismiss_medication_followup(followup_id: str) -> None:
    with connect() as db:
        db.execute(
            """UPDATE medication_followups SET status = 'dismissed', updated_at = ?
               WHERE id = ? AND status IN ('awaiting_start', 'awaiting_confirmation')""",
            (now_iso(), followup_id),
        )


def save_medication_record(
    followup_id: str,
    confirmation_message_id: int,
) -> dict[str, Any]:
    followup = get_medication_followup(followup_id)
    if not followup or followup["status"] != "awaiting_confirmation":
        raise ValueError("用药记录状态无效")
    record_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO medication_records(
                   id, followup_id, patient_id, conversation_id, medication_name,
                   start_time_text, source_label, source_message_id,
                   confirmation_message_id, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, '患者描述', ?, ?, ?)""",
            (
                record_id,
                followup_id,
                followup["patient_id"],
                followup["conversation_id"],
                followup["medication_name"],
                followup["start_time_text"],
                followup["source_message_id"],
                confirmation_message_id,
                timestamp,
            ),
        )
        db.execute(
            """UPDATE medication_followups SET status = 'saved', updated_at = ?
               WHERE id = ?""",
            (timestamp, followup_id),
        )
    records = list_medication_records(str(followup["patient_id"]))
    return next(item for item in records if item["id"] == record_id)


def list_medication_records(patient_id: str) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """SELECT * FROM medication_records
               WHERE patient_id = ? ORDER BY created_at DESC""",
            (patient_id,),
        ).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            trace_rows = db.execute(
                """SELECT id, role, content, created_at FROM messages
                   WHERE conversation_id = ? AND id BETWEEN ? AND ?
                   ORDER BY id ASC""",
                (
                    item["conversation_id"],
                    item["source_message_id"],
                    item["confirmation_message_id"],
                ),
            ).fetchall()
            item["source_messages"] = [dict(message) for message in trace_rows]
            result.append(item)
    return result


def list_knowledge_items(department: str | None = None) -> list[dict[str, Any]]:
    with connect() as db:
        if department:
            rows = db.execute(
                "SELECT * FROM knowledge_items WHERE department = ? ORDER BY updated_at DESC",
                (department,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM knowledge_items ORDER BY department, updated_at DESC"
            ).fetchall()
    return [dict(row) for row in rows]


def create_knowledge_item(
    department: str,
    title: str,
    content_type: str,
    source_url: str,
    summary: str,
) -> dict[str, Any]:
    item_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO knowledge_items(
                   id, department, title, content_type, source_url, summary, status, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?)""",
            (item_id, department, title, content_type, source_url, summary, timestamp),
        )
        row = db.execute("SELECT * FROM knowledge_items WHERE id = ?", (item_id,)).fetchone()
    return dict(row) if row else {}


def list_followup_pathways(department: str | None = None) -> list[dict[str, Any]]:
    with connect() as db:
        if department:
            rows = db.execute(
                "SELECT * FROM followup_pathways WHERE department = ? ORDER BY updated_at DESC",
                (department,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM followup_pathways ORDER BY department, updated_at DESC"
            ).fetchall()
    return [dict(row) for row in rows]


def create_followup_pathway(
    department: str,
    name: str,
    trigger_rule: str,
    cadence: str,
    push_content: str,
    channel: str,
    escalation_rule: str,
) -> dict[str, Any]:
    pathway_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO followup_pathways(
                   id, department, name, trigger_rule, cadence, push_content, channel,
                   escalation_rule, status, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enabled', ?)""",
            (
                pathway_id,
                department,
                name,
                trigger_rule,
                cadence,
                push_content,
                channel,
                escalation_rule,
                timestamp,
            ),
        )
        row = db.execute(
            "SELECT * FROM followup_pathways WHERE id = ?", (pathway_id,)
        ).fetchone()
    return dict(row) if row else {}


def answered_today(patient_id: str) -> set[int]:
    with connect() as db:
        answered_rows = db.execute(
            "SELECT DISTINCT question_id FROM pro_responses WHERE patient_id = ? AND session_date = ?",
            (patient_id, date.today().isoformat()),
        ).fetchall()
        pending_rows = db.execute(
            "SELECT DISTINCT question_id FROM pro_followups WHERE patient_id = ? AND status = 'pending'",
            (patient_id,),
        ).fetchall()
    return {
        int(row["question_id"])
        for row in [*answered_rows, *pending_rows]
    }


def covered_questions(patient_id: str, conversation_id: str) -> set[int]:
    """返回当前对话中已回答、待回答或已跳过的题目。

    PRO 追问必须按对话隔离，不能让旧对话遗留的 pending 题目把新对话中的
    症状陈述误当作回答。
    """
    with connect() as db:
        rows = db.execute(
            """SELECT DISTINCT question_id
               FROM pro_followups
               WHERE patient_id = ? AND conversation_id = ?
                 AND status IN ('pending', 'answered', 'skipped')""",
            (patient_id, conversation_id),
        ).fetchall()
    return {int(row["question_id"]) for row in rows}


def skip_followup(followup_id: str) -> dict[str, Any] | None:
    """将未回答题目标记为本次对话已跳过。

    不保存任何量表分值，也不会在同一对话中立即重复追问。
    """
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """UPDATE pro_followups
               SET status = 'skipped', answered_at = ?
               WHERE id = ? AND status = 'pending'""",
            (timestamp, followup_id),
        )
    return get_followup(followup_id)


def create_followup(
    patient_id: str,
    conversation_id: str,
    question_id: int,
    source_message_id: int,
    source_excerpt: str,
    ai_reason: str,
    suggested_value: int | None,
    confidence: float,
    assistant_message_id: int | None = None,
    assistant_excerpt: str | None = None,
) -> dict[str, Any]:
    followup_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO pro_followups(
                   id, patient_id, conversation_id, question_id, source_message_id,
                   source_excerpt, ai_reason, suggested_value, confidence, status, created_at,
                   assistant_message_id, assistant_excerpt
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)""",
            (
                followup_id,
                patient_id,
                conversation_id,
                question_id,
                source_message_id,
                source_excerpt,
                ai_reason,
                suggested_value,
                confidence,
                timestamp,
                assistant_message_id,
                assistant_excerpt,
            ),
        )
    return get_followup(followup_id) or {}


def get_followup(followup_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM pro_followups WHERE id = ?", (followup_id,)).fetchone()
    return dict(row) if row else None


def pending_followups(
    patient_id: str,
    conversation_id: str | None = None,
) -> list[dict[str, Any]]:
    with connect() as db:
        if conversation_id:
            rows = db.execute(
                """SELECT * FROM pro_followups
                   WHERE patient_id = ? AND conversation_id = ? AND status = 'pending'
                   ORDER BY created_at DESC LIMIT 3""",
                (patient_id, conversation_id),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT * FROM pro_followups
                   WHERE patient_id = ? AND status = 'pending'
                   ORDER BY created_at DESC LIMIT 3""",
                (patient_id,),
            ).fetchall()
    return [dict(row) for row in rows]


def save_pro_response(
    followup_id: str,
    question_id: int,
    value: int,
    *,
    answer_message_id: int | None = None,
    answer_excerpt: str | None = None,
    answer_reason: str | None = None,
    extraction_confidence: float | None = None,
) -> dict[str, Any]:
    followup = get_followup(followup_id)
    if not followup:
        raise ValueError("追问题目不存在")
    if followup["status"] == "answered":
        raise ValueError("该追问已经记录")
    if int(followup["question_id"]) != question_id:
        raise ValueError("题目与追问不匹配")

    label = option_label(question_id, value)
    if label is None:
        raise ValueError("选项无效")
    score = concern_score(question_id, value)
    timestamp = now_iso()
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO pro_responses(
                   followup_id, patient_id, session_date, question_id, option_value,
                   option_label, concern_score, source_message_id, source_excerpt,
                   ai_reason, created_at, answer_message_id, answer_excerpt,
                   answer_reason, extraction_confidence
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                followup_id,
                followup["patient_id"],
                date.today().isoformat(),
                question_id,
                value,
                label,
                score,
                followup["source_message_id"],
                followup["source_excerpt"],
                followup["ai_reason"],
                timestamp,
                answer_message_id,
                (answer_excerpt or "")[:500] or None,
                (answer_reason or "")[:300] or None,
                extraction_confidence,
            ),
        )
        db.execute(
            "UPDATE pro_followups SET status = 'answered', answered_at = ? WHERE id = ?",
            (timestamp, followup_id),
        )
        response_id = int(cursor.lastrowid)

    return {
        "id": response_id,
        "question_id": question_id,
        "option_value": value,
        "option_label": label,
        "recorded_at": timestamp,
    }


def covered_bone_questions(patient_id: str, conversation_id: str) -> set[str]:
    with connect() as db:
        rows = db.execute(
            """SELECT DISTINCT question_id FROM bone_risk_followups
               WHERE patient_id = ? AND conversation_id = ?
                 AND status IN ('pending', 'answered')""",
            (patient_id, conversation_id),
        ).fetchall()
    return {str(row["question_id"]) for row in rows}


def bone_answer_values(patient_id: str, conversation_id: str | None = None) -> dict[str, Any]:
    with connect() as db:
        if conversation_id:
            rows = db.execute(
                """SELECT question_id, value_json FROM bone_risk_answers
                   WHERE patient_id = ? AND conversation_id = ? ORDER BY id ASC""",
                (patient_id, conversation_id),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT question_id, value_json FROM bone_risk_answers
                   WHERE patient_id = ? ORDER BY id ASC""",
                (patient_id,),
            ).fetchall()
    values: dict[str, Any] = {}
    for row in rows:
        try:
            values[str(row["question_id"])] = json.loads(row["value_json"])
        except (TypeError, json.JSONDecodeError):
            continue
    return values


def create_bone_followup(
    *,
    patient_id: str,
    conversation_id: str,
    question_id: str,
    source_message_id: int,
    source_excerpt: str,
    ai_reason: str,
    confidence: float,
    assistant_message_id: int | None = None,
    assistant_excerpt: str | None = None,
) -> dict[str, Any]:
    if str(question_id) not in BONE_QUESTION_BY_ID:
        raise ValueError("BoneSight 字段不存在")
    followup_id = uuid.uuid4().hex
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT INTO bone_risk_followups(
                   id, patient_id, conversation_id, question_id, source_message_id,
                   source_excerpt, ai_reason, confidence, status, created_at,
                   assistant_message_id, assistant_excerpt
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)""",
            (
                followup_id,
                patient_id,
                conversation_id,
                str(question_id),
                source_message_id,
                source_excerpt[:500],
                ai_reason[:300],
                confidence,
                timestamp,
                assistant_message_id,
                (assistant_excerpt or "")[:1500] or None,
            ),
        )
    return get_bone_followup(followup_id) or {}


def get_bone_followup(followup_id: str) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM bone_risk_followups WHERE id = ?", (followup_id,)
        ).fetchone()
    return dict(row) if row else None


def pending_bone_followups(
    patient_id: str,
    conversation_id: str | None = None,
) -> list[dict[str, Any]]:
    with connect() as db:
        if conversation_id:
            rows = db.execute(
                """SELECT * FROM bone_risk_followups
                   WHERE patient_id = ? AND conversation_id = ? AND status = 'pending'
                   ORDER BY created_at DESC LIMIT 3""",
                (patient_id, conversation_id),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT * FROM bone_risk_followups
                   WHERE patient_id = ? AND status = 'pending'
                   ORDER BY created_at DESC LIMIT 3""",
                (patient_id,),
            ).fetchall()
    return [dict(row) for row in rows]


def save_bone_answer(
    followup_id: str,
    question_id: str,
    value: Any,
    *,
    answer_message_id: int | None = None,
    answer_excerpt: str | None = None,
    answer_reason: str | None = None,
    extraction_confidence: float | None = None,
) -> dict[str, Any]:
    followup = get_bone_followup(followup_id)
    if not followup:
        raise ValueError("BoneSight 追问题目不存在")
    if followup["status"] == "answered":
        raise ValueError("该 BoneSight 字段已经记录")
    if str(followup["question_id"]) != str(question_id):
        raise ValueError("BoneSight 字段与追问不匹配")
    display = bone_option_label(str(question_id), value)
    if display is None:
        raise ValueError("BoneSight 回答无效")

    timestamp = now_iso()
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO bone_risk_answers(
                   followup_id, patient_id, conversation_id, question_id, value_json,
                   display_value, source_message_id, source_excerpt, ai_reason,
                   created_at, answer_message_id, answer_excerpt, answer_reason,
                   extraction_confidence
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                followup_id,
                followup["patient_id"],
                followup["conversation_id"],
                str(question_id),
                json.dumps(value, ensure_ascii=False, separators=(",", ":")),
                display,
                followup["source_message_id"],
                followup["source_excerpt"],
                followup["ai_reason"],
                timestamp,
                answer_message_id,
                (answer_excerpt or "")[:500] or None,
                (answer_reason or "")[:300] or None,
                extraction_confidence,
            ),
        )
        db.execute(
            "UPDATE bone_risk_followups SET status = 'answered', answered_at = ? WHERE id = ?",
            (timestamp, followup_id),
        )
        answer_id = int(cursor.lastrowid)
    return {
        "id": answer_id,
        "question_id": str(question_id),
        "value": value,
        "display_value": display,
        "recorded_at": timestamp,
    }


def _latest_responses_by_day(rows: list[sqlite3.Row]) -> dict[str, dict[int, dict[str, Any]]]:
    snapshots: dict[str, dict[int, dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        snapshots[str(row["session_date"])][int(row["question_id"])] = dict(row)
    return snapshots


def _snapshot_score(responses: dict[int, dict[str, Any]]) -> dict[str, Any]:
    domain_values: dict[str, list[float]] = defaultdict(list)
    all_values: list[float] = []
    evidence: list[dict[str, Any]] = []

    for question_id, response in responses.items():
        question = QUESTION_BY_ID.get(question_id)
        score = response.get("concern_score")
        if not question or score is None:
            continue
        numeric_score = float(score)
        domain_values[question["domain"]].append(numeric_score)
        all_values.append(numeric_score)
        evidence.append(
            {
                "question_id": question_id,
                "question": question["text"],
                "domain": question["domain"],
                "domain_label": question["domain_label"],
                "answer": response["option_label"],
                "option_value": response["option_value"],
                "concern_score": numeric_score,
                "source_excerpt": response["source_excerpt"],
                "assistant_excerpt": response.get("assistant_excerpt"),
                "answer_excerpt": response.get("answer_excerpt") or response["source_excerpt"],
                "ai_reason": response["ai_reason"],
                "answer_reason": response.get("answer_reason"),
                "extraction_confidence": response.get("extraction_confidence"),
                "recorded_at": response["created_at"],
            }
        )

    normalized = round(sum(all_values) / (4 * len(all_values)) * 100, 1) if all_values else None
    domain_scores = []
    for domain, values in domain_values.items():
        domain_scores.append(
            {
                "domain": domain,
                "label": DOMAIN_LABELS[domain],
                "score": round(sum(values) / (4 * len(values)) * 100, 1),
                "answered": len(values),
            }
        )
    domain_scores.sort(key=lambda item: item["score"], reverse=True)
    evidence.sort(key=lambda item: (item["concern_score"], item["recorded_at"]), reverse=True)

    if len(all_values) < 3:
        level = "insufficient"
        label = "信息不足，继续随访"
    elif any(value >= 3 for value in all_values) or (normalized is not None and normalized >= 60):
        level = "high"
        label = "存在高负担项目，建议医护关注"
    elif normalized is not None and normalized >= 35:
        level = "medium"
        label = "存在一定症状负担"
    else:
        level = "low"
        label = "当前已记录项目负担较低"

    return {
        "answered": len(responses),
        "scored_answered": len(all_values),
        "coverage_percent": round(len(responses) / 38 * 100, 1),
        "burden_score": normalized,
        "level": level,
        "label": label,
        "domain_scores": domain_scores,
        "evidence": evidence,
    }


def _bone_risk_summary(rows: list[sqlite3.Row]) -> dict[str, Any]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = dict(row)
        try:
            item["value"] = json.loads(item["value_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        latest[str(item["question_id"])] = item

    values = {question_id: item["value"] for question_id, item in latest.items()}
    applicable_questions = [
        question for question in BONE_QUESTIONS if bone_question_applicable(question, values)
    ]
    answered_fields = sum(1 for question in applicable_questions if question["id"] in latest)
    required_fields = len(applicable_questions)
    completion_percent = round(answered_fields / required_fields * 100, 1) if required_fields else 0

    sections: dict[str, dict[str, Any]] = {}
    for question in applicable_questions:
        section = sections.setdefault(
            question["section"], {"section": question["section"], "answered": 0, "total": 0}
        )
        section["total"] += 1
        if question["id"] in latest:
            section["answered"] += 1

    evidence: list[dict[str, Any]] = []
    for question in BONE_QUESTIONS:
        item = latest.get(question["id"])
        if not item:
            continue
        evidence.append(
            {
                "question_id": question["id"],
                "official_id": question["official_id"],
                "section": question["section"],
                "question": question["text"],
                "answer": item["display_value"],
                "source_excerpt": item["source_excerpt"],
                "assistant_excerpt": item.get("assistant_excerpt"),
                "answer_excerpt": item.get("answer_excerpt") or item["source_excerpt"],
                "ai_reason": item["ai_reason"],
                "answer_reason": item.get("answer_reason"),
                "extraction_confidence": item.get("extraction_confidence"),
                "recorded_at": item["created_at"],
            }
        )

    missing = [
        {"question_id": question["id"], "official_id": question["official_id"], "question": question["text"]}
        for question in applicable_questions
        if question["id"] not in latest
    ]
    has_data = bool(evidence)
    ready = has_data and not missing
    return {
        "has_data": has_data,
        "status": "ready" if ready else ("collecting" if has_data else "not_started"),
        "label": (
            "资料已齐，待官方 BoneSight 模型计算"
            if ready
            else ("正在通过对话补充 BoneSight 资料" if has_data else "尚未开始 BoneSight 资料采集")
        ),
        "answered_fields": answered_fields,
        "required_fields": required_fields,
        "answered_official_questions": len({item["official_id"] for item in evidence}),
        "official_question_count": 26,
        "completion_percent": completion_percent,
        "sections": list(sections.values()),
        "missing": missing,
        "evidence": evidence,
        "risk_result": None,
        "risk_note": "BoneSight 预测算法及系数未公开，本系统不伪造高/中/低风险或发生率。资料齐全后应由医护人员在官方工具中复核计算。",
        "privacy_note": "本地原型只保存对话提取结果，未将患者医疗数据自动发送至 BoneSight 官网。",
        "source_url": "https://bonesight.nccbc.cn/#/mobile/questionFilling",
        "rules_version": "bonesight-fields-2026-08-30",
    }


def seed_test_patient_case(case: dict[str, Any] = TEST_PATIENT_CASE) -> None:
    """幂等导入测试病例；已存在的同 ID 记录不会被重复创建。"""
    patient = case["patient"]
    profile = case["clinical_profile"]
    timestamp = now_iso()
    with connect() as db:
        db.execute(
            """INSERT OR IGNORE INTO patients(
                   id, display_name, age, sex, condition_summary, medical_history,
                   updated_at, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                patient["id"], patient["display_name"], patient["age"], patient["sex"],
                patient["condition_summary"], patient["medical_history"], timestamp, timestamp,
            ),
        )
        db.execute(
            """INSERT OR IGNORE INTO patient_clinical_profiles(
                   patient_id, first_diagnosis_date, primary_diagnosis, current_diagnosis,
                   molecular_subtype, current_hospital, current_regimen,
                   next_followup_date, family_history, menstrual_history,
                   data_source, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                patient["id"], profile["first_diagnosis_date"], profile["primary_diagnosis"],
                profile["current_diagnosis"], profile["molecular_subtype"],
                profile["current_hospital"], profile["current_regimen"],
                profile["next_followup_date"], profile["family_history"],
                profile["menstrual_history"], profile["data_source"], timestamp,
            ),
        )
        for report_id, name, report_date, note in case.get("reports", []):
            db.execute(
                """INSERT OR IGNORE INTO patient_reports(
                       id, patient_id, file_name, file_type, size_bytes, note, created_at
                   ) VALUES (?, ?, ?, '结构化测试数据', 0, ?, ?)""",
                (report_id, patient["id"], name, note, f"{report_date}T12:00:00+08:00"),
            )
        for index, event in enumerate(case.get("events", []), start=1):
            db.execute(
                """INSERT OR IGNORE INTO clinical_events(
                       id, patient_id, event_date, end_date, category, title, hospital,
                       treatment, outcome, details, status, sort_order
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event[0], patient["id"], *event[1:], index),
            )
        for event in case.get("adverse_events", []):
            db.execute(
                """INSERT OR IGNORE INTO adverse_events(
                       id, patient_id, onset_date, name, grade, related_treatment,
                       details, management, outcome
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (event[0], patient["id"], *event[1:]),
            )
        for measurement in case.get("measurements", []):
            db.execute(
                """INSERT OR IGNORE INTO clinical_measurements(
                       id, patient_id, measured_at, name, value, unit, flag, source
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (measurement[0], patient["id"], *measurement[1:]),
            )


def get_clinical_case(patient_id: str) -> dict[str, Any] | None:
    with connect() as db:
        profile = db.execute(
            "SELECT * FROM patient_clinical_profiles WHERE patient_id = ?", (patient_id,)
        ).fetchone()
        if not profile:
            return None
        events = db.execute(
            """SELECT * FROM clinical_events WHERE patient_id = ?
               ORDER BY event_date ASC, sort_order ASC""",
            (patient_id,),
        ).fetchall()
        adverse = db.execute(
            """SELECT * FROM adverse_events WHERE patient_id = ?
               ORDER BY onset_date DESC, id DESC""",
            (patient_id,),
        ).fetchall()
        measurements = db.execute(
            """SELECT * FROM clinical_measurements WHERE patient_id = ?
               ORDER BY measured_at DESC, id DESC""",
            (patient_id,),
        ).fetchall()
    return {
        "profile": dict(profile),
        "events": [dict(row) for row in events],
        "adverse_events": [dict(row) for row in adverse],
        "measurements": [dict(row) for row in measurements],
    }


def doctor_summary(patient_id: str) -> dict[str, Any]:
    with connect() as db:
        patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
        rows = db.execute(
            """SELECT r.*, f.assistant_excerpt
               FROM pro_responses AS r
               JOIN pro_followups AS f ON f.id = r.followup_id
               WHERE r.patient_id = ?
               ORDER BY r.session_date ASC, r.created_at ASC, r.id ASC""",
            (patient_id,),
        ).fetchall()
        bone_rows = db.execute(
            """SELECT a.*, f.assistant_excerpt
               FROM bone_risk_answers AS a
               JOIN bone_risk_followups AS f ON f.id = a.followup_id
               WHERE a.patient_id = ? ORDER BY a.created_at ASC, a.id ASC""",
            (patient_id,),
        ).fetchall()
        recent_messages = db.execute(
            """SELECT id, role, content, created_at FROM messages
               WHERE patient_id = ? ORDER BY id DESC LIMIT 20""",
            (patient_id,),
        ).fetchall()
        reports = db.execute(
            """SELECT id, file_name, file_type, size_bytes, note, created_at
               FROM patient_reports WHERE patient_id = ? ORDER BY created_at DESC, id DESC""",
            (patient_id,),
        ).fetchall()

    if not patient:
        return {"patient": None, "assessment": None, "bone_risk": _bone_risk_summary([]), "timeline": [], "messages": [], "medication_records": [], "clinical_case": None}

    snapshots = _latest_responses_by_day(rows)
    dates = sorted(snapshots)
    scored_snapshots = [(day, _snapshot_score(snapshots[day])) for day in dates]
    current = scored_snapshots[-1][1] if scored_snapshots else _snapshot_score({})
    current_date = scored_snapshots[-1][0] if scored_snapshots else None

    trend = {"status": "insufficient", "label": "暂无可比较的历史记录", "delta": None, "comparable_items": 0}
    if len(dates) >= 2:
        previous_date = dates[-2]
        previous = snapshots[previous_date]
        latest = snapshots[dates[-1]]
        common_ids = [
            question_id for question_id in set(previous) & set(latest)
            if previous[question_id].get("concern_score") is not None
            and latest[question_id].get("concern_score") is not None
        ]
        if common_ids:
            old_mean = sum(float(previous[qid]["concern_score"]) for qid in common_ids) / len(common_ids)
            new_mean = sum(float(latest[qid]["concern_score"]) for qid in common_ids) / len(common_ids)
            delta = round((new_mean - old_mean) / 4 * 100, 1)
            if delta >= 10:
                status, label = "worse", "较上次趋于变差"
            elif delta <= -10:
                status, label = "better", "较上次趋于好转"
            else:
                status, label = "stable", "较上次总体稳定"
            trend = {
                "status": status,
                "label": label,
                "delta": delta,
                "comparable_items": len(common_ids),
                "previous_date": previous_date,
            }

    reasons: list[str] = []
    if current["scored_answered"] < 3:
        reasons.append("当前有效评分条目少于 3 项，只能展示已记录事实，暂不形成趋势结论。")
    if trend["delta"] is not None:
        reasons.append(f"与上次 {trend['comparable_items']} 个相同条目相比，症状负担变化 {trend['delta']:+.1f} 分。")
    high_evidence = [item for item in current["evidence"] if item["concern_score"] >= 3]
    if high_evidence:
        names = "、".join(f"Q{item['question_id']} {item['question']}（{item['answer']}）" for item in high_evidence[:3])
        reasons.append(f"存在患者确认的高负担条目：{names}。")
    if not reasons and current["evidence"]:
        reasons.append("当前已回答条目未出现“相当/非常”等高负担记录。")

    timeline = [
        {
            "date": day,
            "score": snapshot["burden_score"],
            "answered": snapshot["answered"],
            "level": snapshot["level"],
        }
        for day, snapshot in scored_snapshots
    ]

    return {
        "patient": {**dict(patient), "reports": [dict(row) for row in reports]},
        "assessment": {
            **current,
            "date": current_date,
            "trend": trend,
            "reasons": reasons,
            "title": trend["label"] if trend["status"] != "insufficient" else current["label"],
            "disclaimer": "这是基于患者自报数据的辅助研判，不是医学诊断；请结合病史、检查和临床评估。",
            "rules_version": "prototype-trend-v1",
        },
        "bone_risk": _bone_risk_summary(bone_rows),
        "timeline": timeline,
        "messages": [dict(row) for row in reversed(recent_messages)],
        "medication_records": list_medication_records(patient_id),
        "clinical_case": get_clinical_case(patient_id),
    }


init_db()
seed_test_patient_case()
