"""NCC-BC-A 38 项 PRO 量表题库与确定性计分辅助逻辑。

量表用于患者报告结局和趋势观察，不用于自动医学诊断。公开研究没有提供
可直接作为临床诊断或干预阈值的分界值，因此本模块只输出题目负担、维度
均值和前后变化，最终解释必须由医护人员确认。
"""

from __future__ import annotations

import re
from typing import Any


FIVE_LEVEL_OPTIONS = [
    {"value": 0, "label": "一点也不"},
    {"value": 1, "label": "有一点"},
    {"value": 2, "label": "有些"},
    {"value": 3, "label": "相当"},
    {"value": 4, "label": "非常"},
]

HEALTH_OPTIONS = [
    {"value": 0, "label": "很差"},
    {"value": 1, "label": "比较差"},
    {"value": 2, "label": "一般"},
    {"value": 3, "label": "比较好"},
    {"value": 4, "label": "很好"},
]

DOMAIN_LABELS = {
    "physiological": "生理状况",
    "psychological": "心理状况",
    "social": "社会与家庭",
    "treatment": "治疗相关",
    "other": "经济负担",
    "overall": "总体自评",
}


def _question(
    question_id: int,
    text: str,
    domain: str,
    direction: str = "burden",
    options: list[dict[str, Any]] | None = None,
    keywords: tuple[str, ...] = (),
) -> dict[str, Any]:
    return {
        "id": question_id,
        "text": text,
        "domain": domain,
        "domain_label": DOMAIN_LABELS[domain],
        "direction": direction,
        "options": options or FIVE_LEVEL_OPTIONS,
        "keywords": keywords,
    }


QUESTIONS = [
    _question(1, "您平时日常外出活动需要别人协助吗？", "physiological", keywords=("外出", "走路", "出门", "活动需要", "需要人扶", "需要协助")),
    _question(2, "您有过疼痛吗？", "physiological", keywords=("疼", "疼痛", "痛得", "痛感")),
    _question(3, "您身体的某些部位有明显疼痛感吗？", "physiological", keywords=("部位疼", "局部疼", "哪里痛", "伤口痛", "乳房痛", "腋下痛", "骨痛")),
    _question(4, "您曾感受到恶心想吐吗？", "physiological", keywords=("恶心", "想吐", "呕吐", "反胃")),
    _question(5, "您的食量有减少吗？", "physiological", keywords=("食欲", "食量", "吃不下", "不想吃", "胃口")),
    _question(6, "您会感觉入睡困难吗？", "physiological", keywords=("失眠", "睡不着", "入睡", "睡眠", "夜里醒")),
    _question(7, "您曾感觉到疲乏吗？", "physiological", keywords=("疲乏", "疲惫", "乏力", "没力气", "很累", "累得")),
    _question(8, "您有记忆力减退现象吗？", "physiological", keywords=("记忆力", "健忘", "记不住", "忘事")),
    _question(9, "您在记起把东西放在哪里方面有困难吗？例如，记不起钥匙或钱包放在哪里。", "physiological", keywords=("钥匙", "钱包", "东西放哪", "找不到东西")),
    _question(10, "您有性生活吗？", "physiological", direction="unscored", options=[{"value": 1, "label": "有"}, {"value": 0, "label": "无"}], keywords=("性生活", "性方面", "夫妻生活")),
    _question(11, "您与伴侣的性生活和谐吗？", "physiological", direction="wellbeing", keywords=("性生活不和谐", "夫妻生活不和谐", "性生活质量")),
    _question(12, "您在与疾病的抗争中，越来越有信心吗？", "psychological", direction="wellbeing", keywords=("没有信心", "信心", "能不能好", "会不会好转")),
    _question(13, "您能面对自己的疾病了吗？", "psychological", direction="wellbeing", keywords=("无法面对", "面对疾病", "接受不了", "不能接受")),
    _question(14, "您因疾病感到烦躁不安、情绪低落或失去希望吗？", "psychological", keywords=("烦躁", "不安", "情绪低落", "抑郁", "绝望", "失去希望", "心情差", "焦虑")),
    _question(15, "您的工作（包括家务）令您有成就感吗？", "social", direction="wellbeing", keywords=("没有成就感", "成就感", "工作没意义", "家务没意义")),
    _question(16, "生病是否影响了您承担家庭责任？（如家务、家庭收入等）", "social", keywords=("家庭责任", "做不了家务", "家务", "家庭收入", "养家")),
    _question(17, "您在治疗过程中，得到了家人的支持吗？", "social", direction="wellbeing", keywords=("家人不支持", "家人支持", "家里不理解", "家人不理解")),
    _question(18, "您与配偶（或主要支持您的人）关系密切吗？", "social", direction="wellbeing", keywords=("配偶关系", "伴侣关系", "关系疏远", "主要支持")),
    _question(19, "您患病后，依然能与家人很好地相处吗？", "social", direction="wellbeing", keywords=("家人相处", "家庭关系", "和家人吵", "家人矛盾")),
    _question(20, "您得到过朋友的语言鼓励吗？", "social", direction="wellbeing", keywords=("朋友鼓励", "朋友不理解", "没人鼓励", "朋友支持")),
    _question(21, "您进行休闲活动时经常感到疲惫吗？", "treatment", keywords=("活动就累", "休闲活动", "散步就累", "运动就累")),
    _question(22, "您对自己的身体满意吗？", "treatment", direction="wellbeing", keywords=("身体不满意", "身材不满意", "外形不满意", "身体形象")),
    _question(23, "疾病的治疗增加了您的不适感吗？", "treatment", keywords=("治疗后不适", "治疗副作用", "治疗更难受", "用药后不舒服", "化疗难受")),
    _question(24, "您曾感觉到免疫力下降吗？", "treatment", keywords=("免疫力", "容易感染", "经常感冒", "抵抗力")),
    _question(25, "您曾感觉到淋巴水肿吗？", "treatment", keywords=("淋巴水肿", "胳膊肿", "手臂肿", "上肢水肿")),
    _question(26, "您曾感觉到头晕吗？", "treatment", keywords=("头晕", "眩晕", "晕乎", "眼前发黑")),
    _question(27, "您曾感觉到心慌、心悸、心跳加速吗？", "treatment", keywords=("心慌", "心悸", "心跳加速", "心跳很快")),
    _question(28, "您曾感觉到手脚麻木吗？", "treatment", keywords=("手脚麻", "手麻", "脚麻", "麻木")),
    _question(29, "您曾感觉到手脚反应迟钝吗？", "treatment", keywords=("反应迟钝", "手脚不灵", "手脚迟钝")),
    _question(30, "您曾感觉到手脚对冷热不敏感吗？", "treatment", keywords=("冷热不敏感", "感觉不到冷热", "温度不敏感")),
    _question(31, "您曾有因为治疗引起脱发吗？", "treatment", keywords=("脱发", "掉头发", "头发掉")),
    _question(32, "您的手脚出现过红肿、脱皮吗？", "treatment", keywords=("手脚红肿", "手足红肿", "脱皮", "手足综合征", "手脚起皮")),
    _question(33, "您曾有便秘吗？", "treatment", keywords=("便秘", "排便困难", "大便干", "拉不出来")),
    _question(34, "您的身体状况或治疗过程，造成了您的经济困难吗？", "other", keywords=("经济困难", "治疗费", "没钱治疗", "经济压力", "费用压力")),
    _question(35, "您对现在的治疗状况满意吗？", "overall", direction="wellbeing", keywords=("治疗不满意", "治疗满意", "疗效不满意")),
    _question(36, "您认为自己今天的健康状况好坏程度如何？", "overall", direction="wellbeing", options=HEALTH_OPTIONS, keywords=("今天状态", "今天身体", "今天健康", "今天情况")),
    _question(37, "您如何评定过去一周中的整体健康状况？", "overall", direction="wellbeing", options=HEALTH_OPTIONS, keywords=("这周状态", "一周健康", "最近一周", "整体健康")),
    _question(38, "与一年前相比，您现在的健康状况如何？", "overall", direction="wellbeing", options=HEALTH_OPTIONS, keywords=("一年前", "比以前", "相比去年", "越来越差", "越来越好", "变差", "好转")),
]

QUESTION_BY_ID = {item["id"]: item for item in QUESTIONS}


# 只在语义上高度相关的条目间继续追问。每轮仍只展示一题，
# 避免把普通对话变成连续弹出的长问卷。
RELATED_FOLLOWUPS = {
    2: 3,    # 是否疼痛 -> 是否有明显部位疼痛
    6: 7,    # 入睡困难 -> 疲乏
    7: 21,   # 疲乏 -> 休闲活动时疲惫
    8: 9,    # 记忆力减退 -> 记起物品位置困难
    10: 11,  # 有性生活 -> 性生活是否和谐
    12: 13,  # 抗病信心 -> 面对疾病
    13: 14,  # 面对疾病 -> 负面情绪
    15: 16,  # 工作成就感 -> 家庭责任
    17: 18,  # 家人支持 -> 主要支持者关系
    18: 19,  # 主要支持者关系 -> 家人相处
    28: 29,  # 手脚麻木 -> 手脚反应迟钝
    29: 30,  # 手脚反应迟钝 -> 冷热感觉
    35: 36,  # 治疗满意度 -> 今日健康自评
    36: 37,  # 今日健康自评 -> 过去一周整体健康
}


def public_question(question: dict[str, Any]) -> dict[str, Any]:
    """返回可发送到浏览器的安全题目信息。"""
    return {
        "id": question["id"],
        "text": question["text"],
        "domain": question["domain"],
        "domain_label": question["domain_label"],
        "options": question["options"],
    }


def find_candidate_questions(text: str, excluded_ids: set[int] | None = None) -> list[dict[str, Any]]:
    """用高召回关键词筛出候选题，再交给模型做语义确认。"""
    compact = re.sub(r"\s+", "", text.lower())
    excluded = excluded_ids or set()
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for question in QUESTIONS:
        if question["id"] in excluded:
            continue
        matches = [keyword for keyword in question["keywords"] if keyword.lower() in compact]
        if matches:
            specificity = max(len(keyword) for keyword in matches)
            ranked.append((specificity, len(matches), question))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in ranked[:8]]


def next_related_question(
    answered_question_id: int,
    value: int,
    excluded_ids: set[int] | None = None,
) -> dict[str, Any] | None:
    """根据刚回答的原题，选择一个语义紧密的下一题。

    负担类条目回答“一点也不”时不再展开；正向条目在患者已给出
    最佳回答时也不再追问。
    """
    current = QUESTION_BY_ID.get(int(answered_question_id))
    next_id = RELATED_FOLLOWUPS.get(int(answered_question_id))
    if not current or not next_id or next_id in (excluded_ids or set()):
        return None
    if current["direction"] == "burden" and int(value) <= 0:
        return None
    if current["direction"] == "wellbeing" and int(value) >= 4:
        return None
    if current["direction"] == "unscored" and int(value) != 1:
        return None
    return QUESTION_BY_ID.get(next_id)


def concern_score(question_id: int, value: int) -> float | None:
    question = QUESTION_BY_ID.get(question_id)
    if not question or question["direction"] == "unscored":
        return None
    if question["direction"] == "wellbeing":
        return float(4 - value)
    return float(value)


def option_label(question_id: int, value: int) -> str | None:
    question = QUESTION_BY_ID.get(question_id)
    if not question:
        return None
    for option in question["options"]:
        if option["value"] == value:
            return str(option["label"])
    return None
