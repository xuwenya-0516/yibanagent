#!/usr/bin/env python3
"""依伴儿：Qwen 对话、PRO 与 BoneSight 信息采集、医生端辅助研判服务。"""

from __future__ import annotations

import hmac
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
MAX_BODY_SIZE = 1_000_000
MAX_MESSAGES = 40
MAX_MESSAGE_LENGTH = 20_000
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ACCESSIBLE_MODEL_CACHE: str | None = None


def load_env(path: Path) -> None:
    """加载简单的 KEY=VALUE 格式，不覆盖系统中已有的环境变量。"""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


load_env(ROOT / ".env")

# 需要先读取 .env，数据库路径才可通过环境变量覆盖。
from bone_risk import (  # noqa: E402
    EXPLICIT_TRIGGERS as BONE_EXPLICIT_TRIGGERS,
    QUESTION_BY_ID as BONE_QUESTION_BY_ID,
    QUESTIONS as BONE_QUESTIONS,
    find_candidate_questions as find_bone_candidates,
    next_unanswered as next_bone_unanswered,
    normalize_answer as normalize_bone_answer,
    public_question as public_bone_question,
)
from pro_scale import (  # noqa: E402
    QUESTION_BY_ID,
    QUESTIONS,
    find_candidate_questions,
    next_related_question,
    public_question,
)
from storage import (  # noqa: E402
    bone_answer_values,
    covered_questions,
    covered_bone_questions,
    create_bone_followup,
    create_followup_pathway,
    create_followup,
    create_knowledge_item,
    create_medication_followup,
    dismiss_medication_followup,
    doctor_summary,
    get_patient_profile,
    list_followup_pathways,
    list_knowledge_items,
    list_medication_records,
    list_patients,
    pending_bone_followups,
    pending_followups,
    pending_medication_followup,
    register_patient,
    save_bone_answer,
    save_medication_record,
    save_message,
    save_pro_response,
    set_medication_start,
    skip_followup,
)


PRO_SKIP_PATTERNS = (
    "先不回答",
    "不想回答",
    "稍后再说",
    "晚点再说",
    "跳过这题",
    "换个话题",
)


def wants_to_skip_pro(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    return any(pattern in compact for pattern in PRO_SKIP_PATTERNS)


def exact_pro_prompt(question: dict[str, Any], *, continuation: bool = False) -> str:
    lead = (
        "如果您愿意，我们再确认一个相关感受；不方便可以先跳过："
        if continuation
        else "为了更准确了解您过去两周的感受，请选择最接近的一项；不方便可以先跳过："
    )
    return f"\n\n{lead}\n{question['text']}"


def wants_to_collect_bone_risk(text: str) -> bool:
    compact = re.sub(r"\s+", "", text).lower()
    return any(trigger.lower() in compact for trigger in BONE_EXPLICIT_TRIGGERS)


def exact_bone_prompt(question: dict[str, Any], *, continuation: bool = False) -> str:
    lead = (
        "我们继续补充下一项："
        if continuation
        else "我们会按顺序逐项补充，每次只确认一项："
    )
    return f"\n\n{lead}\n【{question['section']}】{question['text']}"


MEDICATION_MENTION_PATTERNS = (
    re.compile(r"(?:最近|目前|现在|这段时间)?(?:一直)?(?:在)?(?:开始)?(?:用|服用|吃|注射|打)(?:了)?(?P<drug>[A-Za-z0-9\u4e00-\u9fff·\-*]{2,40}?(?:片|胶囊|针|注射液|口服液|药))(?=[，。！？,!?\s]|$)"),
    re.compile(r"(?:最近|目前|现在|这段时间)(?:在)?(?:用|服用|吃)(?:了)?(?P<drug>[A-Za-z0-9\u4e00-\u9fff·\-*]{2,24})(?=[，。！？,!?\s]|$)"),
)


def extract_medication_name(text: str) -> str | None:
    """识别患者主动提及的在用药物，只用于启动一次明确确认。"""
    compact = re.sub(r"\s+", "", text)
    if any(word in compact for word in ("怎么用药", "用药查询", "想查询用药", "什么药")):
        return None
    for pattern in MEDICATION_MENTION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        name = match.group("drug").strip("，。！？,!? ")
        if name and name not in {"用药", "药", "这个药", "那个药"}:
            return name[:80]
    return None


def medication_confirmation(text: str) -> bool | None:
    compact = re.sub(r"[\s，。！？、,.!?;；]", "", text)
    if any(word in compact for word in ("不用", "不要", "不整理", "先不", "取消")):
        return False
    if any(word in compact for word in ("可以", "好的", "好啊", "好", "是", "帮我整理", "整理到病历", "同意")):
        return True
    return None


def clean_medication_start_time(text: str) -> str:
    value = text.strip("，。！？,!? ")
    value = re.sub(r"(?:开始)?(?:用|服用|使用)?的$", "", value).strip()
    value = re.sub(r"开始$", "", value).strip()
    return value or text.strip()


def send_ndjson(handler: SimpleHTTPRequestHandler, payload: dict[str, Any]) -> None:
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    handler.wfile.write(line.encode("utf-8"))
    handler.wfile.flush()


def qwen_endpoint() -> str:
    base_url = os.getenv(
        "QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).rstrip("/")
    return f"{base_url}/chat/completions"


def accessible_model(api_key: str, preferred: str) -> str:
    """在兼容接口返回模型无权限时，选择该密钥实际可用的模型。"""
    global _ACCESSIBLE_MODEL_CACHE
    if _ACCESSIBLE_MODEL_CACHE:
        return _ACCESSIBLE_MODEL_CACHE
    base_url = os.getenv(
        "QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).rstrip("/")
    request = urllib.request.Request(
        f"{base_url}/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        model_ids = [str(item.get("id")) for item in payload.get("data", []) if item.get("id")]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
        return preferred
    if preferred in model_ids:
        _ACCESSIBLE_MODEL_CACHE = preferred
        return preferred
    priorities = (
        [item for item in model_ids if item.lower().startswith("qwen")]
        + [item for item in model_ids if item == "GLM-4.5-Flash"]
        + [item for item in model_ids if "Flash" in item and "CogView" not in item and "OCR" not in item]
        + model_ids
    )
    if priorities:
        _ACCESSIBLE_MODEL_CACHE = priorities[0]
        return priorities[0]
    return preferred


def qwen_json_analysis(
    text: str,
    candidates: list[dict[str, Any]],
    api_key: str,
) -> dict[str, Any] | None:
    """让 Qwen 在关键词候选中确认最相关的 PRO 题目并提取建议等级。"""
    if not candidates:
        return None

    candidate_payload = [
        {
            "question_id": item["id"],
            "question": item["text"],
            "domain": item["domain_label"],
            "options": item["options"],
        }
        for item in candidates
    ]
    prompt = f"""患者刚才说：{text}

候选 NCC-BC-A PRO 题目：
{json.dumps(candidate_payload, ensure_ascii=False)}

请判断患者原话是否明确涉及其中某一个题目。只返回 JSON，不要医学诊断：
{{"matched":true或false,"question_id":整数或null,"confidence":0到1,"reason":"一句话说明原话与题目的关系","suggested_value":0到4或null}}

规则：
1. 只有语义确实相关才 matched=true；不能因为是乳腺癌患者就猜测症状。
2. suggested_value 仅在患者已明确表达程度时填写，否则为 null。
3. 最多选择一个最相关题目。
"""
    payload = {
        "model": accessible_model(api_key, os.getenv("PRO_ANALYZER_MODEL", os.getenv("QWEN_FALLBACK_MODEL", "qwen-plus"))),
        "messages": [
            {
                "role": "system",
                "content": "你是患者报告结局量表的信息抽取器。你只做语义匹配和结构化提取，不做诊断。",
            },
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "temperature": 0,
        "max_tokens": 300,
    }
    request = urllib.request.Request(
        qwen_endpoint(),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        parsed = json.loads(match.group(0) if match else content)
        candidate_ids = {item["id"] for item in candidates}
        question_id = parsed.get("question_id")
        confidence = float(parsed.get("confidence", 0))
        if not parsed.get("matched") or question_id not in candidate_ids or confidence < 0.55:
            return None
        suggested = parsed.get("suggested_value")
        allowed_values = {
            int(option["value"])
            for option in QUESTION_BY_ID[int(question_id)]["options"]
        }
        if not isinstance(suggested, int) or suggested not in allowed_values:
            suggested = None
        return {
            "question_id": int(question_id),
            "confidence": min(confidence, 1.0),
            "reason": str(parsed.get("reason") or "患者原话与该 PRO 条目相关。")[:300],
            "suggested_value": suggested,
            "analysis_method": "qwen-structured-extraction",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError):
        # 网络或模型结构化输出失败时保留确定性降级，避免漏掉明显症状。
        first = candidates[0]
        return {
            "question_id": first["id"],
            "confidence": 0.55,
            "reason": "患者原话命中了该 PRO 条目的明确症状关键词，等待患者确认。",
            "suggested_value": None,
            "analysis_method": "keyword-fallback",
        }


def qwen_answer_analysis(
    text: str,
    followup: dict[str, Any],
    api_key: str,
) -> dict[str, Any] | None:
    """从患者对上一轮追问的自然语言回答中提取标准选项。"""
    question = QUESTION_BY_ID.get(int(followup.get("question_id", 0)))
    if not question:
        return None

    compact = re.sub(r"[\s，。！？、,.!?；;：:]", "", text)
    for option in question["options"]:
        label = str(option["label"])
        directly_matched = compact == label if len(label) == 1 else label in compact
        if directly_matched:
            return {
                "value": int(option["value"]),
                "confidence": 0.99,
                "reason": f"患者回答中直接包含标准选项“{label}”。",
                "analysis_method": "exact-option-match",
            }

    payload = {
        "model": accessible_model(api_key, os.getenv("PRO_ANALYZER_MODEL", os.getenv("QWEN_FALLBACK_MODEL", "qwen-plus"))),
        "messages": [
            {
                "role": "system",
                "content": "你是患者报告结局量表的自然语言回答提取器，只做信息抽取，不做医学判断。",
            },
            {
                "role": "user",
                "content": f"""AI 上一轮向患者追问：{followup.get('assistant_excerpt') or question['text']}

需要提取的标准问题：{question['text']}
标准选项：{json.dumps(question['options'], ensure_ascii=False)}
患者本轮回答：{text}

判断患者是否在回答这个问题，并映射到最接近的一个标准选项。只返回 JSON：
{{"answered":true或false,"value":整数或null,"confidence":0到1,"reason":"一句话说明映射依据"}}

只有患者明确表达了频率、程度或肯否时才 answered=true；如果患者换了话题、反问或信息不足，必须 answered=false。""",
            },
        ],
        "stream": False,
        "temperature": 0,
        "max_tokens": 220,
    }
    request = urllib.request.Request(
        qwen_endpoint(),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        parsed = json.loads(match.group(0) if match else content)
        value = parsed.get("value")
        allowed_values = {int(option["value"]) for option in question["options"]}
        confidence = float(parsed.get("confidence", 0))
        if not parsed.get("answered") or value not in allowed_values or confidence < 0.65:
            return None
        return {
            "value": int(value),
            "confidence": min(confidence, 1.0),
            "reason": str(parsed.get("reason") or "患者自然语言回答与该选项语义一致。")[:300],
            "analysis_method": "qwen-answer-extraction",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError):
        return None


def qwen_bone_answer_analysis(
    text: str,
    followup: dict[str, Any],
    api_key: str,
) -> dict[str, Any] | None:
    """从自然语言中提取 BoneSight 当前字段；先确定性解析，再让 Qwen 兜底。"""
    question_id = str(followup.get("question_id") or "")
    question = BONE_QUESTION_BY_ID.get(question_id)
    if not question:
        return None
    direct = normalize_bone_answer(question_id, text)
    if direct:
        return direct

    payload = {
        "model": accessible_model(api_key, os.getenv("PRO_ANALYZER_MODEL", os.getenv("QWEN_FALLBACK_MODEL", "qwen-plus"))),
        "messages": [
            {
                "role": "system",
                "content": "你是乳腺癌随访字段的自然语言信息抽取器。只提取患者明确陈述的事实，不做诊断或风险推断。",
            },
            {
                "role": "user",
                "content": f"""当前需要确认的字段：{json.dumps(public_bone_question(question), ensure_ascii=False)}
AI 上一轮追问：{followup.get('assistant_excerpt') or question['text']}
患者本轮回答：{text}

只返回 JSON：
{{"answered":true或false,"value":标准选项值、数值或多选值数组,"confidence":0到1,"reason":"一句话说明原话依据"}}

只有患者明确回答了当前字段才 answered=true；不允许根据常识、其他病史或默认值猜测。""",
            },
        ],
        "stream": False,
        "temperature": 0,
        "max_tokens": 260,
    }
    request = urllib.request.Request(
        qwen_endpoint(),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", content, flags=re.DOTALL)
        parsed = json.loads(match.group(0) if match else content)
        confidence = float(parsed.get("confidence", 0))
        if not parsed.get("answered") or confidence < 0.7:
            return None
        value = parsed.get("value")
        input_type = question["input_type"]
        if input_type == "number":
            if not isinstance(value, (int, float)) or not question["min"] <= value <= question["max"]:
                return None
        elif input_type == "multi_select":
            allowed = {str(option["value"]) for option in question["options"]}
            if not isinstance(value, list) or not value or any(str(item) not in allowed for item in value):
                return None
            value = [str(item) for item in value]
        else:
            allowed = {str(option["value"]) for option in question["options"]}
            if str(value) not in allowed:
                return None
            value = next(option["value"] for option in question["options"] if str(option["value"]) == str(value))
        return {
            "value": value,
            "confidence": min(confidence, 1.0),
            "reason": str(parsed.get("reason") or "患者原话明确回答了当前 BoneSight 字段。")[:300],
            "analysis_method": "qwen-bonesight-answer-extraction",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError):
        return None


def public_followup(followup: dict[str, Any]) -> dict[str, Any] | None:
    question = QUESTION_BY_ID.get(int(followup.get("question_id", 0)))
    if not question:
        return None
    suggested = followup.get("suggested_value")
    return {
        "followup_id": followup["id"],
        "question": public_question(question),
        "reason": followup["ai_reason"],
        "suggested_value": suggested,
        "confidence": followup["confidence"],
        "source_excerpt": followup["source_excerpt"],
        "created_at": followup["created_at"],
    }


def public_bone_followup(followup: dict[str, Any]) -> dict[str, Any] | None:
    question = BONE_QUESTION_BY_ID.get(str(followup.get("question_id") or ""))
    if not question:
        return None
    return {
        "followup_id": followup["id"],
        "question": public_bone_question(question),
        "reason": followup["ai_reason"],
        "confidence": followup["confidence"],
        "source_excerpt": followup["source_excerpt"],
        "created_at": followup["created_at"],
    }


class ChatHandler(SimpleHTTPRequestHandler):
    server_version = "YibanAI/2.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def has_demo_access(self, parsed: urllib.parse.ParseResult) -> bool:
        """公开演示环境可选的轻量访问保护。

        未配置 DEMO_ACCESS_TOKEN 时保持本地开发体验；配置后，前端会从
        ?invite=... 取得体验码，并通过请求头发送给 API。
        """
        expected = os.getenv("DEMO_ACCESS_TOKEN", "").strip()
        if not expected:
            return True
        query = urllib.parse.parse_qs(parsed.query)
        provided = self.headers.get("X-Demo-Token", "").strip()
        if not provided:
            provided = str((query.get("invite") or [""])[0]).strip()
        if provided and hmac.compare_digest(provided, expected):
            return True
        self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "体验链接无效或已缺少访问码。"})
        return False

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path.startswith("/api/") and parsed.path != "/api/health" and not self.has_demo_access(parsed):
            return

        if parsed.path == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "configured": bool(os.getenv("DASHSCOPE_API_KEY", "").strip()),
                    "model": os.getenv("QWEN_MODEL", "qwen-plus"),
                    "pro_enabled": True,
                    "bone_risk_enabled": True,
                    "database": "sqlite",
                },
            )
            return

        if parsed.path == "/api/pro/questions":
            self.send_json(HTTPStatus.OK, {"questions": [public_question(item) for item in QUESTIONS]})
            return

        if parsed.path == "/api/pro/pending":
            patient_id = self.safe_query_id(query, "patient_id", "P001")
            if patient_id is None:
                return
            followups = [public_followup(item) for item in pending_followups(patient_id)]
            self.send_json(HTTPStatus.OK, {"followups": [item for item in followups if item]})
            return

        if parsed.path == "/api/bone-risk/questions":
            self.send_json(
                HTTPStatus.OK,
                {
                    "questions": [public_bone_question(item) for item in BONE_QUESTIONS],
                    "source": "BoneSight",
                    "official_url": "https://bonesight.nccbc.cn/#/mobile/questionFilling",
                    "prediction_algorithm_included": False,
                },
            )
            return

        if parsed.path == "/api/bone-risk/pending":
            patient_id = self.safe_query_id(query, "patient_id", "P001")
            if patient_id is None:
                return
            conversation_id = (query.get("conversation_id") or [""])[0]
            if conversation_id and not SAFE_ID.fullmatch(conversation_id):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "conversation_id 格式无效"})
                return
            followups = [
                public_bone_followup(item)
                for item in pending_bone_followups(patient_id, conversation_id or None)
            ]
            self.send_json(HTTPStatus.OK, {"followups": [item for item in followups if item]})
            return

        if parsed.path == "/api/doctor/patients":
            self.send_json(HTTPStatus.OK, {"patients": list_patients()})
            return

        if parsed.path == "/api/patient/profile":
            patient_id = self.safe_query_id(query, "patient_id", "P001")
            if patient_id is None:
                return
            profile = get_patient_profile(patient_id)
            if not profile:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "未找到患者资料"})
                return
            self.send_json(HTTPStatus.OK, {"patient": profile})
            return

        if parsed.path == "/api/patient/medication-records":
            patient_id = self.safe_query_id(query, "patient_id", "P001")
            if patient_id is None:
                return
            self.send_json(
                HTTPStatus.OK,
                {"records": list_medication_records(patient_id)},
            )
            return

        if parsed.path == "/api/doctor/knowledge":
            department = str((query.get("department") or [""])[0]).strip()
            self.send_json(
                HTTPStatus.OK,
                {"items": list_knowledge_items(department or None)},
            )
            return

        if parsed.path == "/api/doctor/followup-pathways":
            department = str((query.get("department") or [""])[0]).strip()
            self.send_json(
                HTTPStatus.OK,
                {"pathways": list_followup_pathways(department or None)},
            )
            return

        if parsed.path == "/api/doctor/summary":
            patient_id = self.safe_query_id(query, "patient_id", "P001")
            if patient_id is None:
                return
            self.send_json(HTTPStatus.OK, doctor_summary(patient_id))
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/") and not self.has_demo_access(parsed):
            return
        if parsed.path == "/api/chat":
            self.handle_chat()
            return
        if parsed.path == "/api/patient/register":
            self.handle_patient_registration()
            return
        if parsed.path == "/api/pro/response":
            self.handle_pro_response()
            return
        if parsed.path == "/api/doctor/knowledge":
            self.handle_create_knowledge_item()
            return
        if parsed.path == "/api/doctor/followup-pathways":
            self.handle_create_followup_pathway()
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "接口不存在"})

    def handle_create_knowledge_item(self) -> None:
        try:
            body = self.read_json_body()
            department = str(body.get("department") or "").strip()
            title = str(body.get("title") or "").strip()
            content_type = str(body.get("content_type") or "").strip()
            source_url = str(body.get("source_url") or "").strip()
            summary = str(body.get("summary") or "").strip()
            if not department or len(department) > 80:
                raise ValueError("请填写有效科室")
            if not title or len(title) > 160:
                raise ValueError("请填写有效标题")
            if content_type not in {"文章", "视频", "图文", "文件"}:
                raise ValueError("内容类型无效")
            if len(source_url) > 1000 or len(summary) > 1000:
                raise ValueError("内容信息过长")
            item = create_knowledge_item(
                department, title, content_type, source_url, summary
            )
        except (ValueError, TypeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        self.send_json(HTTPStatus.CREATED, {"ok": True, "item": item})

    def handle_create_followup_pathway(self) -> None:
        try:
            body = self.read_json_body()
            fields = {
                name: str(body.get(name) or "").strip()
                for name in (
                    "department", "name", "trigger_rule", "cadence",
                    "push_content", "channel", "escalation_rule",
                )
            }
            required = ("department", "name", "trigger_rule", "cadence", "push_content", "channel")
            if any(not fields[name] for name in required):
                raise ValueError("请填写完整的随访路径规则")
            if any(len(value) > 1000 for value in fields.values()):
                raise ValueError("随访路径信息过长")
            pathway = create_followup_pathway(**fields)
        except (ValueError, TypeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        self.send_json(HTTPStatus.CREATED, {"ok": True, "pathway": pathway})

    def handle_patient_registration(self) -> None:
        try:
            body = self.read_json_body()
            patient_id = str(body.get("patient_id") or "")
            display_name = str(body.get("display_name") or "").strip()
            sex = str(body.get("sex") or "").strip()
            condition_summary = str(body.get("condition_summary") or "").strip()
            medical_history = str(body.get("medical_history") or "").strip()
            age = int(body.get("age"))
            reports = body.get("reports") or []

            if not SAFE_ID.fullmatch(patient_id):
                raise ValueError("患者标识格式无效")
            if not 1 <= len(display_name) <= 40:
                raise ValueError("姓名需为 1–40 个字符")
            if not 0 <= age <= 120:
                raise ValueError("年龄需在 0–120 岁之间")
            if sex not in {"女", "男", "其他", "不愿透露"}:
                raise ValueError("请选择有效的性别")
            if not condition_summary or len(condition_summary) > 5000:
                raise ValueError("请填写病情，且不超过 5000 个字符")
            if len(medical_history) > 5000:
                raise ValueError("既往病史不能超过 5000 个字符")
            if not isinstance(reports, list) or len(reports) > 10:
                raise ValueError("最多登记 10 份既往报告")

            cleaned_reports: list[dict[str, Any]] = []
            for item in reports:
                if not isinstance(item, dict):
                    raise ValueError("报告信息格式无效")
                name = str(item.get("name") or "").strip()
                file_type = str(item.get("type") or "").strip()
                size = int(item.get("size") or 0)
                note = str(item.get("note") or "").strip()
                if not name or len(name) > 255:
                    raise ValueError("报告文件名无效")
                if size < 0 or size > 20 * 1024 * 1024:
                    raise ValueError("单份报告不能超过 20MB")
                if len(file_type) > 120 or len(note) > 1000:
                    raise ValueError("报告信息过长")
                cleaned_reports.append({"name": name, "type": file_type, "size": size, "note": note})

            profile = register_patient(
                patient_id=patient_id,
                display_name=display_name,
                age=age,
                sex=sex,
                condition_summary=condition_summary,
                medical_history=medical_history,
                reports=cleaned_reports,
            )
        except (ValueError, TypeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        self.send_json(HTTPStatus.CREATED, {"ok": True, "patient": profile})

    def safe_query_id(
        self,
        query: dict[str, list[str]],
        name: str,
        default: str,
    ) -> str | None:
        value = (query.get(name) or [default])[0]
        if not SAFE_ID.fullmatch(value):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": f"{name} 格式无效"})
            return None
        return value

    def read_json_body(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("请求长度无效") from exc
        if length <= 0 or length > MAX_BODY_SIZE:
            raise ValueError("请求内容为空或过大")
        try:
            body = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("请求不是有效的 JSON") from exc
        if not isinstance(body, dict):
            raise ValueError("请求内容必须是对象")
        return body

    def read_chat_request(self) -> tuple[list[dict[str, str]], str, str]:
        body = self.read_json_body()
        raw_messages = body.get("messages")
        if not isinstance(raw_messages, list) or not raw_messages:
            raise ValueError("messages 必须是非空数组")

        cleaned: list[dict[str, str]] = []
        for item in raw_messages[-MAX_MESSAGES:]:
            if not isinstance(item, dict):
                raise ValueError("消息格式无效")
            role = item.get("role")
            content = item.get("content")
            if role not in {"user", "assistant"} or not isinstance(content, str):
                raise ValueError("消息角色或内容无效")
            content = content.strip()
            if not content or len(content) > MAX_MESSAGE_LENGTH:
                raise ValueError("消息内容为空或过长")
            cleaned.append({"role": role, "content": content})

        if cleaned[-1]["role"] != "user":
            raise ValueError("最后一条消息必须来自用户")

        patient_id = str(body.get("patient_id") or "P001")
        conversation_id = str(body.get("conversation_id") or uuid.uuid4().hex)
        if not SAFE_ID.fullmatch(patient_id) or not SAFE_ID.fullmatch(conversation_id):
            raise ValueError("患者或会话标识格式无效")
        return cleaned, patient_id, conversation_id

    def handle_chat(self) -> None:
        try:
            messages, patient_id, conversation_id = self.read_chat_request()
        except ValueError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        latest_text = messages[-1]["content"]
        bone_collection_requested = wants_to_collect_bone_risk(latest_text)
        source_message_id = save_message(conversation_id, patient_id, "user", latest_text)

        medication_followup = pending_medication_followup(patient_id, conversation_id)
        medication_name = extract_medication_name(latest_text) if not medication_followup else None
        if medication_followup or medication_name:
            self.handle_medication_conversation(
                patient_id=patient_id,
                conversation_id=conversation_id,
                source_message_id=source_message_id,
                latest_text=latest_text,
                active_followup=medication_followup,
                medication_name=medication_name,
            )
            return

        api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
        if not api_key:
            self.send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": "尚未配置 DASHSCOPE_API_KEY，请先填写 .env 文件并重启服务。"},
            )
            return
        pro_followups = pending_followups(patient_id, conversation_id)
        active_followup = pro_followups[0] if pro_followups else None
        bone_followups = pending_bone_followups(patient_id, conversation_id)
        active_bone_followup = bone_followups[0] if bone_followups and not active_followup else None
        recorded_answer = None
        recorded_bone_answer = None
        skipped_pro = False

        if active_followup:
            if bone_collection_requested:
                # 快捷入口代表患者主动切换到骨转移资料采集。
                skip_followup(active_followup["id"])
                active_followup = None
            elif wants_to_skip_pro(latest_text):
                skip_followup(active_followup["id"])
                active_followup = None
                skipped_pro = True
            else:
                extracted = qwen_answer_analysis(latest_text, active_followup, api_key)
                if extracted:
                    recorded_answer = save_pro_response(
                        active_followup["id"],
                        int(active_followup["question_id"]),
                        extracted["value"],
                        answer_message_id=source_message_id,
                        answer_excerpt=latest_text,
                        answer_reason=extracted["reason"],
                        extraction_confidence=extracted["confidence"],
                    )
                else:
                    # 没有明确回答时不连续催问，本对话先跳过这题。
                    skip_followup(active_followup["id"])
                    active_followup = None
                    skipped_pro = True
        elif active_bone_followup:
            extracted = qwen_bone_answer_analysis(latest_text, active_bone_followup, api_key)
            if extracted:
                recorded_bone_answer = save_bone_answer(
                    active_bone_followup["id"],
                    str(active_bone_followup["question_id"]),
                    extracted["value"],
                    answer_message_id=source_message_id,
                    answer_excerpt=latest_text,
                    answer_reason=extracted["reason"],
                    extraction_confidence=extracted["confidence"],
                )

        pro_signal = None
        bone_signal = None
        if recorded_answer:
            next_question = next_related_question(
                int(recorded_answer["question_id"]),
                int(recorded_answer["option_value"]),
                covered_questions(patient_id, conversation_id),
            )
            if next_question:
                pro_signal = {
                    "question_id": next_question["id"],
                    "confidence": 1.0,
                    "reason": "患者已回答上一项，继续确认一个语义紧密的 PRO 原题。",
                    "continuation": True,
                }
        elif not active_followup and not active_bone_followup and not skipped_pro:
            if bone_collection_requested:
                # 快捷入口会从该患者历史上第一个未完成字段继续。
                values = bone_answer_values(patient_id)
                question = next_bone_unanswered(values, set())
                if question:
                    bone_signal = {
                        "question_id": question["id"],
                        "confidence": 1.0,
                        "reason": "患者主动从快捷入口开始或继续骨转移风险资料采集。",
                        "continuation": bool(values),
                    }
            else:
                excluded = covered_questions(patient_id, conversation_id)
                candidates = find_candidate_questions(latest_text, excluded)
                if candidates:
                    pro_signal = qwen_json_analysis(latest_text, candidates, api_key)
            if not pro_signal and not bone_signal and not bone_collection_requested:
                bone_excluded = covered_bone_questions(patient_id, conversation_id)
                bone_candidates = find_bone_candidates(latest_text, bone_excluded)
                if bone_candidates:
                    question = bone_candidates[0]
                    bone_signal = {
                        "question_id": question["id"],
                        "confidence": 0.82,
                        "reason": f"患者原话涉及 BoneSight 字段“{question['text']}”，需要患者确认标准答案。",
                    }
        elif recorded_bone_answer:
            values = bone_answer_values(patient_id)
            question = next_bone_unanswered(values, covered_bone_questions(patient_id, conversation_id))
            if question:
                bone_signal = {
                    "question_id": question["id"],
                    "confidence": 1.0,
                    "reason": "患者正在继续完成 BoneSight 骨转移风险资料采集。",
                    "continuation": True,
                }

        self.stream_qwen(
            messages,
            api_key,
            patient_id,
            conversation_id,
            source_message_id,
            latest_text,
            pro_signal,
            active_followup if not recorded_answer else None,
            recorded_answer,
            bone_signal,
            active_bone_followup if not recorded_bone_answer else None,
            recorded_bone_answer,
        )

    def handle_medication_conversation(
        self,
        *,
        patient_id: str,
        conversation_id: str,
        source_message_id: int,
        latest_text: str,
        active_followup: dict[str, Any] | None,
        medication_name: str | None,
    ) -> None:
        event: dict[str, Any] | None = None
        if not active_followup and medication_name:
            create_medication_followup(
                patient_id,
                conversation_id,
                medication_name,
                source_message_id,
                latest_text,
            )
            response = (
                f"好的，我记下您最近在用{medication_name}。"
                f"您是什么时候开始用{medication_name}的？知道大概时间就可以。"
            )
        elif active_followup and active_followup["status"] == "awaiting_start":
            compact = re.sub(r"\s+", "", latest_text)
            if any(word in compact for word in ("不想记", "先不", "算了", "取消")):
                dismiss_medication_followup(active_followup["id"])
                response = "好的，这次先不整理。之后您想记录时再告诉我就可以。"
            else:
                updated = set_medication_start(
                    active_followup["id"], clean_medication_start_time(latest_text), source_message_id
                )
                response = (
                    f"收到：{updated['medication_name']}，{updated['start_time_text']}开始使用。"
                    "是否帮您整理到病历本中？我会标注为“患者描述”，方便医生复核。"
                )
                event = {
                    "medication_confirmation": {
                        "followup_id": updated["id"],
                        "options": ["帮我整理", "先不整理"],
                    }
                }
        elif active_followup and active_followup["status"] == "awaiting_confirmation":
            confirmed = medication_confirmation(latest_text)
            if confirmed is True:
                record = save_medication_record(active_followup["id"], source_message_id)
                response = (
                    f"已把“{record['medication_name']}，{record['start_time_text']}开始使用”"
                    "整理到病历本，并标注为“患者描述”。"
                    "您可以在右上角“···”的“病程档案”中查看，"
                    "点开还能回溯这段对话。"
                )
                event = {"medication_record_saved": {"record": record}}
            elif confirmed is False:
                dismiss_medication_followup(active_followup["id"])
                response = "好的，这次先不整理到病历本，对话仍保留在当前会话中。"
            else:
                response = (
                    "我先不自动写入病历。如果您希望整理，回复“帮我整理”就可以；"
                    "也可以回复“先不整理”。"
                )
                event = {
                    "medication_confirmation": {
                        "followup_id": active_followup["id"],
                        "options": ["帮我整理", "先不整理"],
                    }
                }
        else:
            response = "收到，我会先把这条信息保留在对话中。"
        self.stream_local_response(
            response,
            patient_id=patient_id,
            conversation_id=conversation_id,
            event=event,
        )

    def stream_local_response(
        self,
        text: str,
        *,
        patient_id: str,
        conversation_id: str,
        event: dict[str, Any] | None = None,
    ) -> None:
        save_message(conversation_id, patient_id, "assistant", text)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            send_ndjson(self, {"delta": text})
            if event:
                send_ndjson(self, event)
            send_ndjson(self, {"done": True, "model": "local-medication-record"})
        except (BrokenPipeError, ConnectionResetError):
            return

    def handle_pro_response(self) -> None:
        try:
            body = self.read_json_body()
            followup_id = str(body.get("followup_id") or "")
            question_id = int(body.get("question_id"))
            value = int(body.get("value"))
            if not re.fullmatch(r"[a-f0-9]{32}", followup_id):
                raise ValueError("追问标识无效")
            result = save_pro_response(followup_id, question_id, value)
        except (ValueError, TypeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        self.send_json(
            HTTPStatus.CREATED,
            {
                "ok": True,
                "response": result,
                "message": "已记录到 PRO 随访档案，医护端可查看本次回答及原对话依据。",
            },
        )

    def stream_qwen(
        self,
        messages: list[dict[str, str]],
        api_key: str,
        patient_id: str,
        conversation_id: str,
        source_message_id: int,
        source_text: str,
        pro_signal: dict[str, Any] | None,
        active_followup: dict[str, Any] | None,
        recorded_answer: dict[str, Any] | None,
        bone_signal: dict[str, Any] | None,
        active_bone_followup: dict[str, Any] | None,
        recorded_bone_answer: dict[str, Any] | None,
    ) -> None:
        model = os.getenv("QWEN_MODEL", "qwen-plus").strip() or "qwen-plus"
        system_prompt = os.getenv("QWEN_SYSTEM_PROMPT", "你是一个乳腺癌照护 AI 助手。").strip()
        profile = get_patient_profile(patient_id)
        profile_instruction = ""
        if profile:
            report_names = [str(item.get("file_name") or "") for item in profile.get("reports", [])]
            profile_payload = {
                "姓名": profile.get("display_name"),
                "年龄": profile.get("age"),
                "性别": profile.get("sex"),
                "当前病情": profile.get("condition_summary"),
                "既往病史与治疗": profile.get("medical_history"),
                "既往报告": report_names,
            }
            profile_instruction = (
                "\n以下是患者主动登记的背景资料，只作为照护对话背景，不可当作已核实诊断；"
                "如与患者本轮表述冲突，应优先温和确认最新情况："
                + json.dumps(profile_payload, ensure_ascii=False)
            )
        pro_instruction = (
            "\n患者端的原则是：患者只负责像聊微信一样说话，你负责理解、记住和温和追问。"
            "回复尽量简短、有温度，一次最多推进一个主问题，避免连续审问式提问。"
            "患者提到‘我看到/刷到/听说/病友推荐/AI建议’时，要结合已知病程说明该信息是否可能适用，明确区分通用科普与个体医嘱。"
            "遇到‘害怕、拖累、没意思、不想动、好累’等表达，先共情，再温和了解当下安全状况；"
            "如涉及自伤或即时危险，明确建议立即联系家属、医生或紧急服务。"
            "要通过普通聊天自然收集随访信息。不要提到 PRO、量表、评分、数据库或信息抽取，"
            "不要在正文生成独立表单、卡片或按钮，也不要声称已经完成诊断或风险预测。"
        )
        if pro_signal:
            question = QUESTION_BY_ID[pro_signal["question_id"]]
            pro_instruction += (
                f"\n患者原话与随访原题“{question['text']}”有关。"
                "请只用简短、共情的话回应患者当前内容，不要自己改写、复述或提出任何问题，"
                "也不要列出选项。系统会在你的回复后自动追加与题库完全一致的原题和选项。"
            )
        elif active_followup:
            question = QUESTION_BY_ID[int(active_followup["question_id"])]
            pro_instruction += (
                f"\n此前仍在确认“{question['text']}”，患者这次没有给出可可靠提取的程度。"
                "只回应患者当前内容，不要重复催问，也不要强迫回答。"
            )
        elif recorded_answer:
            pro_instruction += "\n患者刚才已经回答了上一轮随访追问。自然表示理解即可，不要向患者展示分值或声称系统已自动记录。"
        elif bone_signal:
            question = BONE_QUESTION_BY_ID[str(bone_signal["question_id"])]
            pro_instruction += (
                f"\n现在需要在普通聊天中自然确认一项乳腺癌随访资料：“{question['text']}”。"
                "只简短说明将逐项补充资料，不要自己改写、复述或提出任何问题；"
                "不要提到 BoneSight、模型、风险分数或第三方网站。"
                "系统会在回复后自动追加与字段表完全一致的题干和控件。"
                "这些资料只能用于后续医护复核，不能据此向患者给出骨转移结论。"
            )
        elif active_bone_followup:
            question = BONE_QUESTION_BY_ID[str(active_bone_followup["question_id"])]
            pro_instruction += (
                f"\n此前仍在确认随访资料“{question['text']}”，患者本轮没有给出可可靠提取的答案。"
                "先回应患者当前内容；只有语境合适时才温和澄清，不要强迫回答，也不要猜测。"
            )
        elif recorded_bone_answer:
            pro_instruction += "\n患者刚才补充了一项随访资料。自然表示理解即可，不要声称已完成风险预测。"
        upstream_messages: list[dict[str, str]] = []
        if system_prompt:
            upstream_messages.append({"role": "system", "content": system_prompt + profile_instruction + pro_instruction})
        upstream_messages.extend(messages)

        def build_request(selected_model: str) -> urllib.request.Request:
            request_body = json.dumps(
                {"model": selected_model, "messages": upstream_messages, "stream": True},
                ensure_ascii=False,
            ).encode("utf-8")
            return urllib.request.Request(
                qwen_endpoint(),
                data=request_body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                method="POST",
            )

        try:
            upstream = urllib.request.urlopen(build_request(model), timeout=120)
        except urllib.error.HTTPError as exc:
            message = self.upstream_error(exc)
            configured_fallback = os.getenv("QWEN_FALLBACK_MODEL", "qwen-plus").strip() or "qwen-plus"
            fallback_model = accessible_model(api_key, configured_fallback)
            if fallback_model != model and "not allowed to access model" in message.lower():
                model = fallback_model
                try:
                    upstream = urllib.request.urlopen(build_request(model), timeout=120)
                except urllib.error.HTTPError as fallback_exc:
                    self.send_json(
                        fallback_exc.code if 400 <= fallback_exc.code < 600 else 502,
                        {"error": self.upstream_error(fallback_exc)},
                    )
                    return
                except (urllib.error.URLError, TimeoutError) as fallback_exc:
                    reason = fallback_exc.reason if hasattr(fallback_exc, "reason") else fallback_exc
                    self.send_json(HTTPStatus.BAD_GATEWAY, {"error": f"无法连接 Qwen：{reason}"})
                    return
            else:
                self.send_json(exc.code if 400 <= exc.code < 600 else 502, {"error": message})
                return
        except (urllib.error.URLError, TimeoutError) as exc:
            reason = exc.reason if hasattr(exc, "reason") else exc
            self.send_json(HTTPStatus.BAD_GATEWAY, {"error": f"无法连接 Qwen：{reason}"})
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        assistant_parts: list[str] = []
        saved_assistant = False
        try:
            with upstream:
                for raw_line in upstream:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        event = json.loads(data)
                        delta = event.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            assistant_parts.append(content)
                            send_ndjson(self, {"delta": content})
                    except (json.JSONDecodeError, IndexError, AttributeError):
                        continue

            if pro_signal:
                question = QUESTION_BY_ID[pro_signal["question_id"]]
                suffix = exact_pro_prompt(question, continuation=bool(pro_signal.get("continuation")))
                assistant_parts.append(suffix)
                send_ndjson(self, {"delta": suffix})
            elif bone_signal:
                question = BONE_QUESTION_BY_ID[str(bone_signal["question_id"])]
                suffix = exact_bone_prompt(question, continuation=bool(bone_signal.get("continuation")))
                assistant_parts.append(suffix)
                send_ndjson(self, {"delta": suffix})

            assistant_text = "".join(assistant_parts).strip()
            assistant_message_id = None
            if assistant_text:
                assistant_message_id = save_message(conversation_id, patient_id, "assistant", assistant_text)
                saved_assistant = True
            if pro_signal and assistant_message_id:
                followup = create_followup(
                    patient_id=patient_id,
                    conversation_id=conversation_id,
                    question_id=pro_signal["question_id"],
                    source_message_id=source_message_id,
                    source_excerpt=source_text[:500],
                    ai_reason=pro_signal["reason"],
                    suggested_value=None,
                    confidence=pro_signal["confidence"],
                    assistant_message_id=assistant_message_id,
                    assistant_excerpt=assistant_text[:1500],
                )
                question = QUESTION_BY_ID[pro_signal["question_id"]]
                send_ndjson(
                    self,
                    {
                        "pro_options": {
                            "followup_id": followup["id"],
                            "question_id": question["id"],
                            "question": question["text"],
                            "options": question["options"],
                        }
                    },
                )
            elif bone_signal and assistant_message_id:
                question = BONE_QUESTION_BY_ID[str(bone_signal["question_id"])]
                followup = create_bone_followup(
                    patient_id=patient_id,
                    conversation_id=conversation_id,
                    question_id=question["id"],
                    source_message_id=source_message_id,
                    source_excerpt=source_text[:500],
                    ai_reason=bone_signal["reason"],
                    confidence=bone_signal["confidence"],
                    assistant_message_id=assistant_message_id,
                    assistant_excerpt=assistant_text[:1500],
                )
                send_ndjson(
                    self,
                    {
                        "bone_prompt": {
                            "followup_id": followup["id"],
                            "source": "BoneSight",
                            "question": public_bone_question(question),
                        }
                    },
                )
            send_ndjson(self, {"done": True, "model": model})
        except (BrokenPipeError, ConnectionResetError):
            if assistant_parts and not saved_assistant:
                save_message(conversation_id, patient_id, "assistant", "".join(assistant_parts).strip())

    @staticmethod
    def upstream_error(exc: urllib.error.HTTPError) -> str:
        try:
            raw = exc.read().decode("utf-8", errors="replace")
            payload = json.loads(raw)
            message = payload.get("error", {}).get("message")
            if message:
                return f"Qwen 请求失败：{message}"
        except (json.JSONDecodeError, AttributeError):
            pass
        return f"Qwen 请求失败（HTTP {exc.code}）"

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        if sys.stderr is not None:
            sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")


def main() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    try:
        port = int(os.getenv("PORT", "8000"))
    except ValueError:
        print("PORT 必须是数字", file=sys.stderr)
        raise SystemExit(2)

    server = ThreadingHTTPServer((host, port), ChatHandler)
    print(f"依伴儿 AI 已启动：http://{host}:{port}")
    print(f"医生端：http://{host}:{port}/doctor.html")
    if not os.getenv("DASHSCOPE_API_KEY", "").strip():
        print("提示：请先在 .env 中填写 DASHSCOPE_API_KEY，然后重启服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
