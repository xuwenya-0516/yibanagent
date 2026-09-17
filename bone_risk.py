"""BoneSight 乳腺癌术后骨转移风险工具的对话采集字段。

字段来自 BoneSight 官网及《乳腺癌骨转移风险预测小工具使用说明》；
本模块只负责信息采集与结构化，不复制或臆造未公开的预测算法。
"""

from __future__ import annotations

import re
from typing import Any


PROVINCES = [
    "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省", "黑龙江省",
    "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
    "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
    "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
    "香港特别行政区", "台湾省", "澳门特别行政区",
]


def _options(labels: list[str], values: list[Any] | None = None) -> list[dict[str, Any]]:
    values = values or labels
    return [{"label": label, "value": value} for label, value in zip(labels, values)]


YES_NO = _options(["是", "否"], [1, 2])
POS_NEG = _options(["阳性", "阴性"], [1, 2])


QUESTIONS: list[dict[str, Any]] = [
    {"id": "1", "official_id": 1, "key": "province", "section": "基本信息", "text": "您目前所在的省份是哪里？", "input_type": "select", "options": _options(PROVINCES), "triggers": ["省", "市", "自治区", "现居", "所在地区"]},
    {"id": "2", "official_id": 2, "key": "diagnosis_age", "section": "基本信息", "text": "您确诊乳腺癌时是多少岁？", "input_type": "number", "unit": "岁", "min": 0, "max": 150, "step": 1, "placeholder": "请输入确诊年龄", "triggers": ["确诊年龄", "确诊时", "岁确诊"]},
    {"id": "3", "official_id": 3, "key": "height", "section": "基本信息", "text": "您目前的身高是多少？", "input_type": "number", "unit": "米", "min": 0.5, "max": 2.5, "step": 0.01, "placeholder": "例如 1.60 米", "triggers": ["身高", "厘米", "cm"]},
    {"id": "4", "official_id": 4, "key": "weight", "section": "基本信息", "text": "您目前的体重是多少？", "input_type": "number", "unit": "公斤", "min": 20, "max": 500, "step": 0.1, "placeholder": "请输入体重", "triggers": ["体重", "公斤", "kg"]},
    {"id": "5", "official_id": 5, "key": "menopause", "section": "基本信息", "text": "您确诊时处于绝经前还是绝经后？", "input_type": "select", "options": _options(["绝经前", "绝经后"], [1, 2]), "triggers": ["绝经", "月经"]},
    {"id": "6", "official_id": 6, "key": "osteoporosis", "section": "基本信息", "text": "您是否被诊断过骨质疏松？", "input_type": "select", "options": YES_NO, "triggers": ["骨质疏松", "骨密度"]},
    {"id": "7", "official_id": 7, "key": "chronic_disease", "section": "基本信息", "text": "您是否有肾功能障碍、高血压、高血脂或糖尿病等慢性病？", "input_type": "select", "options": YES_NO, "triggers": ["肾功能", "高血压", "高血脂", "糖尿病", "慢性病"]},
    {"id": "8", "official_id": 8, "key": "t_stage", "section": "疾病分期分型", "text": "病理报告中的 T 分期是多少？", "input_type": "select", "options": _options(["T0", "T1", "T2", "T3", "T4"], [1, 2, 3, 4, 5]), "triggers": ["T分期", "T0", "T1", "T2", "T3", "T4"]},
    {"id": "9", "official_id": 9, "key": "n_stage", "section": "疾病分期分型", "text": "病理报告中的 N 分期是多少？", "input_type": "select", "options": _options(["N0", "N1", "N2", "N3"], [1, 2, 3, 4]), "triggers": ["N分期", "N0", "N1", "N2", "N3", "淋巴结分期"]},
    {"id": "10", "official_id": 10, "key": "er", "section": "疾病分期分型", "text": "ER（雌激素受体）是阳性还是阴性？", "input_type": "select", "options": POS_NEG, "triggers": ["ER", "雌激素受体"]},
    {"id": "11", "official_id": 11, "key": "pr", "section": "疾病分期分型", "text": "PR（孕激素受体）是阳性还是阴性？", "input_type": "select", "options": POS_NEG, "triggers": ["PR", "孕激素受体"]},
    {"id": "12", "official_id": 12, "key": "her2", "section": "疾病分期分型", "text": "HER2 受体是阳性还是阴性？", "input_type": "select", "options": POS_NEG, "triggers": ["HER2", "HER-2"]},
    {"id": "13", "official_id": 13, "key": "ki67", "section": "疾病分期分型", "text": "病理报告中的 Ki-67 是百分之多少？", "input_type": "number", "unit": "%", "min": 0, "max": 100, "step": 1, "placeholder": "请输入 Ki-67 百分比", "triggers": ["Ki-67", "Ki67"]},
    {"id": "14", "official_id": 14, "key": "grade", "section": "疾病分期分型", "text": "病理报告中的组织学分级是几级？", "input_type": "select", "options": _options(["1级", "2级", "3级"], [1, 2, 3]), "triggers": ["组织学分级", "病理分级"]},
    {"id": "15", "official_id": 15, "key": "vascular_invasion", "section": "疾病分期分型", "text": "病理报告是否提示脉管癌栓？", "input_type": "select", "options": YES_NO, "triggers": ["脉管癌栓", "脉管侵犯"]},
    {"id": "16", "official_id": 16, "key": "nerve_invasion", "section": "疾病分期分型", "text": "病理报告是否提示神经侵犯？", "input_type": "select", "options": YES_NO, "triggers": ["神经侵犯", "神经浸润"]},
    {"id": "17", "official_id": 17, "key": "neoadjuvant", "section": "围术期治疗", "text": "手术前是否接受过新辅助治疗？", "input_type": "select", "options": YES_NO, "triggers": ["新辅助", "术前治疗", "术前化疗"]},
    {"id": "18", "official_id": 18, "key": "pcr", "section": "围术期治疗", "text": "新辅助治疗后是否达到 pCR（病理完全缓解）？", "input_type": "select", "options": YES_NO, "depends_on": ["17", 1], "triggers": ["pCR", "病理完全缓解"]},
    {"id": "19", "official_id": 19, "key": "surgery_type", "section": "围术期治疗", "text": "您接受的乳腺手术类型是哪一种？", "input_type": "select", "options": _options(["保乳术", "全乳切除", "改良根治术", "根治术", "其他"], [1, 2, 3, 4, 5]), "triggers": ["保乳", "全乳切除", "改良根治", "根治术", "手术类型"]},
    {"id": "20", "official_id": 20, "key": "adjuvant", "section": "围术期治疗", "text": "手术后是否接受过辅助治疗？", "input_type": "select", "options": YES_NO, "triggers": ["术后辅助", "辅助治疗"]},
    {"id": "21", "official_id": 21, "key": "adjuvant_chemo", "section": "围术期治疗", "text": "术后是否接受过辅助化疗？", "input_type": "select", "options": YES_NO, "depends_on": ["20", 1], "triggers": ["辅助化疗", "术后化疗"]},
    {"id": "22", "official_id": 22, "key": "endocrine_therapy", "section": "围术期治疗", "text": "术后是否接受过辅助内分泌治疗？", "input_type": "select", "options": YES_NO, "depends_on": ["20", 1], "triggers": ["内分泌治疗", "来曲唑", "阿那曲唑", "依西美坦", "他莫昔芬"]},
    {"id": "23", "official_id": 23, "key": "radiotherapy", "section": "围术期治疗", "text": "手术后是否接受过放疗？", "input_type": "select", "options": YES_NO, "triggers": ["术后放疗", "放疗"]},
    {"id": "24", "official_id": 24, "key": "bone_target_drug", "section": "围术期治疗", "text": "辅助治疗阶段是否使用过骨靶向药物，例如地舒单抗或双膦酸盐？", "input_type": "select", "options": YES_NO, "triggers": ["骨靶向", "地舒单抗", "双膦酸盐", "唑来膦酸"]},
    {"id": "25a", "official_id": 25, "key": "alp_tested", "section": "生化指标及转移情况", "text": "近期是否检测过碱性磷酸酶（ALP）？", "input_type": "select", "options": YES_NO, "triggers": ["ALP", "碱性磷酸酶"]},
    {"id": "25b", "official_id": 25, "key": "alp_result", "section": "生化指标及转移情况", "text": "最近一次碱性磷酸酶（ALP）结果是多少？", "input_type": "number", "unit": "U/L", "min": 0, "max": 5000, "step": 1, "placeholder": "请输入 ALP 结果", "depends_on": ["25a", 1], "triggers": ["ALP", "碱性磷酸酶"]},
    {"id": "26a", "official_id": 26, "key": "relapse", "section": "生化指标及转移情况", "text": "乳腺癌目前是否出现过复发？", "input_type": "select", "options": YES_NO, "triggers": ["复发", "再次出现"]},
    {"id": "26b", "official_id": 26, "key": "metastasis_sites", "section": "生化指标及转移情况", "text": "最近发现过哪些部位的转移？可多选。", "input_type": "multi_select", "options": _options(["淋巴结转移", "肺转移", "肝转移", "脑转移", "其他转移"], ["1", "2", "3", "4", "5"]), "depends_on": ["26a", 1], "triggers": ["淋巴结转移", "肺转移", "肝转移", "脑转移", "其他转移"]},
]

QUESTION_BY_ID = {item["id"]: item for item in QUESTIONS}
EXPLICIT_TRIGGERS = ["骨转移风险", "BoneSight", "骨转移预测", "骨转移评估", "会不会骨转移"]


def public_question(question: dict[str, Any]) -> dict[str, Any]:
    return {
        key: question[key]
        for key in ("id", "official_id", "key", "section", "text", "input_type", "options", "unit", "min", "max", "step", "placeholder")
        if key in question
    }


def applicable(question: dict[str, Any], answers: dict[str, Any]) -> bool:
    dependency = question.get("depends_on")
    if not dependency:
        return True
    parent_id, expected = dependency
    return answers.get(str(parent_id)) == expected


def next_unanswered(answers: dict[str, Any], excluded: set[str] | None = None) -> dict[str, Any] | None:
    excluded = excluded or set()
    for question in QUESTIONS:
        qid = question["id"]
        if qid not in answers and qid not in excluded and applicable(question, answers):
            return question
    return None


def find_candidate_questions(text: str, excluded: set[str]) -> list[dict[str, Any]]:
    compact = re.sub(r"\s+", "", text)
    if any(trigger.lower() in compact.lower() for trigger in EXPLICIT_TRIGGERS):
        first = next_unanswered({}, excluded)
        return [first] if first else []
    candidates: list[dict[str, Any]] = []
    for question in QUESTIONS:
        if question["id"] in excluded:
            continue
        if any(trigger.lower() in compact.lower() for trigger in question.get("triggers", [])):
            candidates.append(question)
    return candidates[:4]


def option_label(question_id: str, value: Any) -> str | None:
    question = QUESTION_BY_ID.get(str(question_id))
    if not question:
        return None
    if question["input_type"] == "number":
        unit = question.get("unit", "")
        return f"{value:g}{unit}" if isinstance(value, float) else f"{value}{unit}"
    if question["input_type"] == "multi_select":
        values = {str(item) for item in value} if isinstance(value, list) else set()
        labels = [option["label"] for option in question["options"] if str(option["value"]) in values]
        return "、".join(labels) if labels else None
    for option in question.get("options", []):
        if option["value"] == value or str(option["value"]) == str(value):
            return option["label"]
    return None


def normalize_answer(question_id: str, text: str) -> dict[str, Any] | None:
    """先做确定性解析；复杂自然语言再交给 Qwen 兜底。"""
    question = QUESTION_BY_ID.get(str(question_id))
    if not question:
        return None
    compact = re.sub(r"[\s，。！？、,.!?；;：:]", "", text)
    input_type = question["input_type"]

    if input_type == "number":
        matches = re.findall(r"-?\d+(?:\.\d+)?", text)
        if not matches:
            return None
        value = float(matches[-1])
        if question_id == "3" and ("厘米" in text or "cm" in text.lower() or value > 3):
            value /= 100
        if float(question.get("min", value)) <= value <= float(question.get("max", value)):
            if float(question.get("step", 1)) >= 1 and value.is_integer():
                value = int(value)
            return {"value": value, "label": option_label(question_id, value), "confidence": 0.98, "reason": "患者回答中包含符合字段范围的明确数值。", "analysis_method": "deterministic-number"}
        return None

    if input_type == "multi_select":
        selected = [option["value"] for option in question["options"] if option["label"] in compact]
        if selected:
            return {"value": selected, "label": option_label(question_id, selected), "confidence": 0.99, "reason": "患者回答中直接包含一个或多个标准转移部位。", "analysis_method": "deterministic-multi-select"}
        return None

    for option in question.get("options", []):
        label = str(option["label"])
        aliases = {label}
        if label == "是": aliases |= {"有", "接受过", "做过", "用过", "检测过"}
        if label == "否": aliases |= {"没有", "未", "没做过", "没用过", "未检测"}
        if label == "阳性": aliases |= {"+", "阳"}
        if label == "阴性": aliases |= {"-", "阴"}
        if any(alias and (compact == alias or alias in compact) for alias in aliases):
            return {"value": option["value"], "label": label, "confidence": 0.99, "reason": f"患者回答中直接表达了标准选项“{label}”。", "analysis_method": "deterministic-option"}
    return None

