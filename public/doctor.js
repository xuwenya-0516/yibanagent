const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const DEMO_TOKEN_KEY = "yiban-demo-access-token-v1";
const inviteToken = new URLSearchParams(window.location.search).get("invite");
if (inviteToken) sessionStorage.setItem(DEMO_TOKEN_KEY, inviteToken);

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(DEMO_TOKEN_KEY);
  if (token) headers.set("X-Demo-Token", token);
  return window.fetch(url, { ...options, headers });
}

const elements = {
  patientSelect: $("#patientSelect"),
  refreshButton: $("#refreshButton"),
  loading: $("#loading"),
  dashboard: $("#dashboard"),
  emptyState: $("#emptyState"),
  dataTime: $("#dataTime"),
  patientTableBody: $("#patientTableBody"),
  proDomainChart: $("#proDomainChart"),
  boneCompletionChart: $("#boneCompletionChart"),
  proTrendChart: $("#proTrendChart"),
};

const state = {
  patients: [],
  summaries: new Map(),
  selectedId: "",
  activeTab: "summary",
  knowledgeItems: [],
  pathways: [],
};

const reportDetailDialog = $("#reportDetailDialog");
const reportDetailClose = $("#reportDetailClose");

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value ?? "—";
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(level) {
  return ["high", "medium", "low", "ready", "collecting"].includes(level) ? level : "";
}

function prepareCanvas(canvas, cssHeight) {
  const width = Math.max(240, canvas.getBoundingClientRect().width || canvas.parentElement?.clientWidth || 320);
  const ratio = window.devicePixelRatio || 1;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, cssHeight);
  return { context, width, height: cssHeight };
}

function drawEmptyChart(context, width, height, text) {
  context.fillStyle = "#91a0aa";
  context.font = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
}

function drawDomainChart(domains) {
  const { context, width, height } = prepareCanvas(elements.proDomainChart, 210);
  if (!domains?.length) {
    drawEmptyChart(context, width, height, "患者尚未形成可计算的 PRO 维度数据");
    return;
  }

  const rows = domains.slice(0, 6);
  const labelWidth = Math.min(78, width * 0.26);
  const trackX = labelWidth + 10;
  const trackWidth = width - trackX - 30;
  const rowHeight = height / rows.length;

  rows.forEach((domain, index) => {
    const y = rowHeight * index + rowHeight / 2;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = '10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillStyle = "#536b79";
    context.fillText(domain.label, 0, y);

    context.fillStyle = "#e8eff3";
    context.fillRect(trackX, y - 4, trackWidth, 8);
    context.fillStyle = domain.score >= 60 ? "#e45a62" : domain.score >= 35 ? "#e6a12b" : "#1597e5";
    context.fillRect(trackX, y - 4, trackWidth * Math.min(100, domain.score) / 100, 8);

    context.textAlign = "right";
    context.fillStyle = "#71838f";
    context.fillText(String(domain.score), width - 2, y);
  });
}

function drawBoneDonut(percent) {
  const canvas = elements.boneCompletionChart;
  const ratio = window.devicePixelRatio || 1;
  const size = 170;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);
  const center = size / 2;
  const radius = 62;

  context.lineWidth = 14;
  context.lineCap = "round";
  context.strokeStyle = "#e7eef2";
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();

  if (percent > 0) {
    context.strokeStyle = percent >= 100 ? "#22a875" : "#8b68d4";
    context.beginPath();
    context.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(100, percent) / 100);
    context.stroke();
  }
}

function drawTrendChart(timeline) {
  const { context, width, height } = prepareCanvas(elements.proTrendChart, 180);
  const points = (timeline || []).filter((item) => Number.isFinite(item.score));
  if (!points.length) {
    drawEmptyChart(context, width, height, "暂无趋势数据");
    return;
  }

  const left = 34;
  const right = width - 18;
  const top = 14;
  const bottom = height - 30;
  context.strokeStyle = "#e4ecef";
  context.lineWidth = 1;
  context.font = '8px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.fillStyle = "#8b9aa4";
  context.textAlign = "right";
  context.textBaseline = "middle";

  [0, 25, 50, 75, 100].forEach((value) => {
    const y = bottom - (bottom - top) * value / 100;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillText(String(value), left - 7, y);
  });

  const xAt = (index) => points.length === 1 ? (left + right) / 2 : left + (right - left) * index / (points.length - 1);
  const yAt = (score) => bottom - (bottom - top) * score / 100;
  context.strokeStyle = "#1597e5";
  context.lineWidth = 2;
  context.beginPath();
  points.forEach((point, index) => {
    const x = xAt(index);
    const y = yAt(point.score);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  points.forEach((point, index) => {
    const x = xAt(index);
    const y = yAt(point.score);
    context.fillStyle = "#fff";
    context.strokeStyle = "#1597e5";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#7b8b95";
    context.font = '8px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(point.date.slice(5), x, bottom + 8);
  });
}

function summaryFor(patientId) {
  return state.summaries.get(patientId) || null;
}

function queuePriority(summary) {
  if (!summary) return 9;
  if (summary.assessment?.level === "high") return 0;
  if (summary.bone_risk?.status === "ready") return 1;
  if (summary.assessment?.level === "medium") return 2;
  if (summary.bone_risk?.status === "collecting") return 3;
  if (summary.assessment?.answered) return 4;
  return 5;
}

function suggestedAction(summary) {
  if (summary?.assessment?.level === "high") return "尽快人工复核 PRO 高负担项目";
  if (summary?.bone_risk?.status === "ready") return "进入官方工具完成风险计算";
  if (summary?.bone_risk?.status === "collecting") return "继续通过对话补充缺失资料";
  if (summary?.assessment?.answered) return "持续随访并观察变化趋势";
  return "启动患者自报随访";
}

function riskStratification(summary) {
  if (!summary) return { label: "待评估", level: "" };
  if (summary.assessment?.level === "high") return { label: "红色 · 优先人工复核", level: "high" };
  if (summary.assessment?.level === "medium" || summary.bone_risk?.status === "ready") {
    return { label: "黄色 · 重点随访", level: "medium" };
  }
  if (summary.assessment?.answered || summary.bone_risk?.status === "collecting") {
    return { label: "绿色 · 常规随访", level: "low" };
  }
  return { label: "待评估", level: "" };
}

function renderKpis() {
  const summaries = [...state.summaries.values()];
  setText("#totalPatients", state.patients.length);
  setText("#priorityPatients", summaries.filter((item) => item.assessment?.level === "high").length);
  setText("#proPatients", summaries.filter((item) => item.assessment?.answered > 0).length);
  setText("#boneCollectingPatients", summaries.filter((item) => item.bone_risk?.status === "collecting").length);
  setText("#boneReadyPatients", summaries.filter((item) => item.bone_risk?.status === "ready").length);
}

function renderPatientTable() {
  elements.patientTableBody.replaceChildren();
  const patients = [...state.patients].sort((a, b) => {
    const priority = queuePriority(summaryFor(a.id)) - queuePriority(summaryFor(b.id));
    if (priority) return priority;
    return String(b.last_active_at || b.created_at).localeCompare(String(a.last_active_at || a.created_at));
  });

  patients.forEach((patient) => {
    const summary = summaryFor(patient.id);
    const assessment = summary?.assessment;
    const bone = summary?.bone_risk;
    const row = document.createElement("tr");
    if (patient.id === state.selectedId) row.classList.add("selected");
    row.dataset.patientId = patient.id;

    const patientCell = document.createElement("td");
    const patientInfo = node("div", "table-patient");
    patientInfo.append(node("span", "table-avatar", patient.display_name?.slice(0, 1) || "患"));
    const copy = document.createElement("div");
    const demographics = [patient.id, patient.age !== null && patient.age !== undefined ? `${patient.age}岁` : "", patient.sex || ""].filter(Boolean).join(" · ");
    copy.append(node("strong", "", patient.display_name), node("small", "", demographics));
    patientInfo.append(copy);
    patientCell.append(patientInfo);

    const proCell = document.createElement("td");
    const proBadge = node("span", `table-badge ${statusClass(assessment?.level)}`, assessment?.answered ? assessment.label : "待采集");
    proCell.append(proBadge);

    const risk = riskStratification(summary);
    const riskCell = document.createElement("td");
    riskCell.append(node("span", `table-badge ${statusClass(risk.level)}`, risk.label));

    const boneCell = document.createElement("td");
    const boneLabel = bone?.status === "ready" ? "资料齐全" : bone?.status === "collecting" ? `${bone.completion_percent}% 已采集` : "待采集";
    boneCell.append(node("span", `table-badge ${statusClass(bone?.status)}`, boneLabel));

    const activeCell = node("td", "", formatTime(patient.last_active_at || patient.created_at));
    const actionCell = node("td", "action-copy", suggestedAction(summary));
    const buttonCell = document.createElement("td");
    const button = node("button", "table-action", "查看");
    button.type = "button";
    button.dataset.patientId = patient.id;
    buttonCell.append(button);
    row.append(patientCell, riskCell, proCell, boneCell, activeCell, actionCell, buttonCell);
    elements.patientTableBody.append(row);
  });
}

function renderFactChips(bone) {
  const container = $("#boneFactChips");
  container.replaceChildren();
  const facts = (bone?.evidence || []).slice(0, 4);
  if (!facts.length) {
    container.append(node("span", "fact-chip", "等待患者确认问卷字段"));
    return;
  }
  facts.forEach((item) => container.append(node("span", "fact-chip", `${item.question.replace(/？|。/g, "")}：${item.answer}`)));
}

function renderOverview(summary) {
  const assessment = summary.assessment;
  const bone = summary.bone_risk;
  const pill = $("#proStatusPill");
  pill.textContent = assessment?.answered ? assessment.label : "待采集";
  pill.className = `status-pill ${statusClass(assessment?.level)}`;
  setText("#overviewBurden", assessment?.burden_score ?? "—");
  setText("#overviewTrend", assessment?.trend?.label || "暂无可比较趋势");
  setText("#overviewCoverage", `已确认 ${assessment?.answered || 0}/38 项 · 覆盖率 ${assessment?.coverage_percent || 0}%`);
  drawDomainChart(assessment?.domain_scores || []);

  const bonePercent = Number(bone?.completion_percent || 0);
  drawBoneDonut(bonePercent);
  setText("#boneCompletionValue", `${bonePercent}%`);
  const stateLabel = $("#boneOverviewState");
  stateLabel.className = `bone-state ${statusClass(bone?.status)}`;
  stateLabel.textContent = bone?.status === "ready" ? "资料齐全 · 待官方复核" : bone?.status === "collecting" ? "资料采集中" : "尚未开始";
  setText("#boneOverviewTitle", bone?.label || "等待患者对话资料");
  setText("#boneOverviewText", bone?.status === "ready"
    ? "所需资料已齐全，请由医护人员进入官方 BoneSight 工具完成风险计算并复核。"
    : bone?.status === "collecting"
      ? `当前仍缺少 ${bone.missing?.length || 0} 个适用字段，AI 将在后续对话中逐项补充。`
      : "患者在聊天中补充信息后，这里会形成结构化总结。"
  );
  setText("#boneOverviewCoverage", `官方问卷 ${bone?.answered_official_questions || 0}/26 题已有记录`);
  renderFactChips(bone);
}

function renderAssessment(summary) {
  const assessment = summary.assessment;
  setText("#assessmentTitle", assessment?.title || "信息不足，继续随访");
  setText("#assessmentDate", assessment?.date ? `记录日期 ${assessment.date} · ${assessment.label}` : "尚未形成有效记录");
  const reasonList = $("#reasonList");
  reasonList.replaceChildren();
  const reasons = assessment?.reasons?.length ? assessment.reasons : ["当前没有足够的患者自报条目，建议继续在自然对话中完成随访。"];
  reasons.slice(0, 3).forEach((reason) => reasonList.append(node("li", "", reason)));

  setText("#burdenScore", assessment?.burden_score ?? "—");
  setText("#coverageText", `已确认 ${assessment?.answered || 0}/38 项 · 覆盖率 ${assessment?.coverage_percent || 0}%`);
  $("#burdenBar").style.width = `${assessment?.burden_score || 0}%`;

  const trend = assessment?.trend || { status: "insufficient", label: "暂无趋势", delta: null };
  const trendValue = $("#trendValue");
  const icon = { worse: "ti-trending-up", better: "ti-trending-down", stable: "ti-minus", insufficient: "ti-minus" }[trend.status] || "ti-minus";
  trendValue.className = `trend-value ${trend.status}`;
  trendValue.replaceChildren(node("i", `ti ${icon}`), node("strong", "", trend.label));
  setText("#trendDetail", trend.delta === null || trend.delta === undefined
    ? "需要至少两个日期的可比回答"
    : `${trend.comparable_items} 个相同条目，负担变化 ${trend.delta > 0 ? "+" : ""}${trend.delta} 分`
  );
  drawTrendChart(summary.timeline || []);
  renderDomains(assessment?.domain_scores || []);
  renderProEvidence(assessment?.evidence || []);
}

function renderDomains(domains) {
  const container = $("#domainGrid");
  container.replaceChildren();
  if (!domains.length) {
    container.append(node("p", "empty-inline", "暂无可计算的 PRO 维度数据"));
    return;
  }
  domains.forEach((domain) => {
    const item = node("article", "domain-item");
    const head = node("div", "domain-head");
    head.append(node("strong", "", domain.label), node("span", "", `${domain.score} · ${domain.answered}项`));
    const bar = node("div", "domain-bar");
    const fill = node("span");
    fill.style.width = `${domain.score}%`;
    bar.append(fill);
    item.append(head, bar);
    container.append(item);
  });
}

function evidenceCard(item, type) {
  const wrapper = node("article", "evidence-item");
  const questionSide = node("div", "evidence-question");
  const number = node("span", "question-number", `Q${String(item.question_id).toUpperCase()}`);
  const questionCopy = document.createElement("div");
  const answerText = type === "pro" ? `${item.answer} · 负担 ${item.concern_score}/4` : item.answer;
  questionCopy.append(node("h3", "", item.question), node("span", `answer-chip ${type === "bone" ? "bone-answer-chip" : ""}`, answerText));
  questionSide.append(number, questionCopy);

  const source = node("div", "evidence-source");
  source.append(node("span", "evidence-label", "触发原话"), node("blockquote", "", `“${item.source_excerpt}”`));
  if (item.assistant_excerpt) source.append(node("span", "evidence-label", "AI 对话追问"), node("blockquote", "assistant-quote", `“${item.assistant_excerpt}”`));
  source.append(node("span", "evidence-label", "患者确认原话"), node("blockquote", "answer-quote", `“${item.answer_excerpt}”`));
  const reasons = [item.ai_reason, item.answer_reason].filter(Boolean).join("；");
  source.append(node("p", "", `提取依据：${reasons || "患者明确确认该字段"} · ${formatTime(item.recorded_at)}`));
  wrapper.append(questionSide, source);
  return wrapper;
}

function renderProEvidence(evidence) {
  const container = $("#evidenceList");
  container.replaceChildren();
  if (!evidence.length) {
    container.append(node("p", "empty-inline", "暂无已确认的 PRO 证据"));
    return;
  }
  evidence.forEach((item) => container.append(evidenceCard(item, "pro")));
}

function renderBone(summary) {
  const bone = summary.bone_risk;
  const percent = Number(bone?.completion_percent || 0);
  setText("#boneStatus", bone?.label || "尚未开始资料采集");
  const statusLabel = $("#boneStatusLabel");
  statusLabel.className = `bone-status-label ${statusClass(bone?.status)}`;
  statusLabel.textContent = bone?.status === "ready" ? "待官方复核" : bone?.status === "collecting" ? "采集中" : "待采集";
  setText("#boneRiskNote", bone?.risk_note || "BoneSight 算法未在本系统中复刻，不根据不完整资料推测风险。");
  setText("#boneCompletion", percent);
  $("#boneCompletionBar").style.width = `${percent}%`;
  setText("#boneCoverage", `已采集 ${bone?.answered_fields || 0}/${bone?.required_fields || 0} 个当前适用字段 · 官方问卷 ${bone?.answered_official_questions || 0}/26 题已有记录`);
  setText("#bonePrivacyNote", bone?.privacy_note || "患者资料不会自动发送至第三方网站。");

  setText("#boneDecisionTitle", bone?.label || "尚未开始资料采集");
  setText("#boneDecisionReason", bone?.status === "ready"
    ? "资料已齐全，下一步由医护人员进入官方 BoneSight 工具计算并复核风险。"
    : bone?.status === "collecting"
      ? `目前资料完整度 ${percent}%，仍需继续补充 ${bone.missing?.length || 0} 个适用字段。`
      : "尚无相关患者自报资料，不会根据空缺信息推测风险结果。"
  );
  $("#boneDecisionBar").style.width = `${percent}%`;

  const missingList = $("#boneMissingList");
  missingList.replaceChildren();
  const missing = bone?.missing || [];
  if (!missing.length) {
    missingList.append(node("p", "empty-inline", bone?.status === "ready" ? "当前适用字段已全部采集，请进行官方复核。" : "暂无待补字段。"));
  } else {
    missing.slice(0, 6).forEach((item) => {
      const row = node("article", "missing-item");
      row.append(node("span", "", `Q${String(item.question_id).toUpperCase()}`), node("p", "", item.question));
      missingList.append(row);
    });
  }

  const sections = $("#boneSections");
  sections.replaceChildren();
  (bone?.sections || []).forEach((section) => {
    const item = node("article", "bone-section-item");
    const head = node("div", "domain-head");
    head.append(node("strong", "", section.section), node("span", "", `${section.answered}/${section.total}`));
    const bar = node("div", "domain-bar");
    const fill = node("span");
    fill.style.width = `${section.total ? section.answered / section.total * 100 : 0}%`;
    bar.append(fill);
    item.append(head, bar);
    sections.append(item);
  });

  const evidence = $("#boneEvidenceList");
  evidence.replaceChildren();
  if (!bone?.evidence?.length) {
    evidence.append(node("p", "empty-inline", "暂无已确认的骨转移风险资料证据"));
  } else {
    bone.evidence.forEach((item) => evidence.append(evidenceCard(item, "bone")));
  }
}

function renderConversation(messages) {
  const container = $("#conversationList");
  container.replaceChildren();
  if (!messages?.length) {
    container.append(node("p", "empty-inline", "暂无数据库对话记录"));
    return;
  }
  messages.forEach((message) => {
    const item = node("article", `conversation-item ${message.role}`);
    item.append(
      node("span", "role", message.role === "user" ? "患者" : "AI 助手"),
      node("span", "content", message.content),
      node("time", "", formatTime(message.created_at)),
    );
    container.append(item);
  });
}

function renderDoctorMedicationRecords(records) {
  const container = $("#doctorMedicationList");
  container.replaceChildren();
  if (!records?.length) {
    container.append(node("p", "empty-inline", "暂无由患者对话整理的用药记录"));
    return;
  }
  records.forEach((record) => {
    const item = node("article", "doctor-medication-item");
    const icon = node("span", "doctor-medication-icon");
    icon.append(node("i", "ti ti-pill"));
    const copy = document.createElement("div");
    copy.append(
      node("strong", "", record.medication_name),
      node("p", "", `${record.start_time_text}开始使用`),
      node("small", "", `录入于 ${formatTime(record.created_at)}`),
    );
    const source = node("span", "patient-source-badge", record.source_label || "患者描述");
    item.append(icon, copy, source);
    const trace = node("details", "doctor-medication-trace");
    const summary = document.createElement("summary");
    summary.textContent = "查看来源对话";
    trace.append(summary);
    (record.source_messages || []).forEach((message) => {
      trace.append(node("blockquote", message.role, `${message.role === "user" ? "患者" : "AI"}：${message.content}`));
    });
    item.append(trace);
    container.append(item);
  });
}

function renderClinicalCase(clinicalCase) {
  const overview = $("#clinicalOverviewGrid");
  const measurements = $("#clinicalMeasurements");
  const adverseList = $("#clinicalAdverseList");
  const timeline = $("#clinicalTimeline");
  overview.replaceChildren();
  measurements.replaceChildren();
  adverseList.replaceChildren();
  timeline.replaceChildren();
  if (!clinicalCase?.profile) {
    setText("#clinicalDataSource", "暂无结构化病程");
    [overview, measurements, adverseList, timeline].forEach((container) => {
      container.append(node("p", "empty-inline", "该患者尚未导入结构化病程数据"));
    });
    return;
  }
  const profile = clinicalCase.profile;
  setText("#clinicalDataSource", `数据来源：${profile.data_source}`);
  [
    ["首次确诊", profile.first_diagnosis_date],
    ["首诊诊断", profile.primary_diagnosis],
    ["当前诊断", profile.current_diagnosis],
    ["分子分型", profile.molecular_subtype],
    ["当前医院", profile.current_hospital],
    ["当前方案", profile.current_regimen],
    ["下次复诊", profile.next_followup_date],
    ["家族史", profile.family_history],
    ["月经史", profile.menstrual_history],
  ].forEach(([label, value], index) => {
    const item = node("article", `clinical-overview-item ${index === 2 || index === 5 ? "wide" : ""}`);
    item.append(node("small", "", label), node(index === 2 || index === 5 ? "p" : "strong", "", value || "未记录"));
    overview.append(item);
  });

  (clinicalCase.measurements || []).forEach((measurement) => {
    const item = node("article", "clinical-measurement-item");
    const head = node("div");
    head.append(node("strong", "", measurement.name), node("time", "", measurement.measured_at));
    const value = node("p", "");
    value.append(node("b", "", measurement.value), document.createTextNode(measurement.unit ? ` ${measurement.unit}` : ""));
    if (measurement.flag) value.append(node("span", measurement.flag.includes("升高") || measurement.flag.includes("疏松") ? "alert" : "", measurement.flag));
    item.append(head, value, node("small", "", measurement.source || ""));
    measurements.append(item);
  });

  (clinicalCase.adverse_events || []).forEach((adverse) => {
    const item = node("details", "clinical-adverse-item");
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.append(node("strong", "", adverse.name), node("small", "", `${adverse.onset_date} · ${adverse.related_treatment || "相关治疗未记录"}`));
    summary.append(title, node("em", "", adverse.grade || "未分级"), node("i", "ti ti-chevron-down"));
    const body = node("div", "clinical-adverse-detail");
    body.append(node("p", "", adverse.details || "暂无详情"), node("p", "", `处理：${adverse.management || "未记录"}`), node("p", "", `转归：${adverse.outcome || "未记录"}`));
    item.append(summary, body);
    adverseList.append(item);
  });

  (clinicalCase.events || []).forEach((event) => {
    const item = node("article", `clinical-timeline-item ${event.status === "进行中" ? "active" : ""}`);
    const marker = node("span", "clinical-timeline-marker");
    marker.append(node("i", `ti ${event.category.includes("手术") ? "ti-cut" : event.category.includes("诊断") || event.category.includes("复发") || event.category.includes("进展") ? "ti-stethoscope" : "ti-medicine-syrup"}`));
    const copy = document.createElement("div");
    const range = event.end_date ? `${event.event_date} — ${event.end_date}` : event.event_date;
    copy.append(node("time", "", range), node("h3", "", event.title), node("span", "", `${event.category} · ${event.hospital || "医院未记录"}`));
    if (event.treatment) copy.append(node("p", "", `方案：${event.treatment}`));
    if (event.details) copy.append(node("p", "", event.details));
    if (event.outcome) copy.append(node("strong", "clinical-outcome", `结果：${event.outcome}`));
    item.append(marker, copy, node("em", "", event.status || "已记录"));
    timeline.append(item);
  });
}

function renderKnowledgeItems() {
  const container = $("#knowledgeList");
  container.replaceChildren();
  setText("#knowledgeCount", `${state.knowledgeItems.length} 条内容`);
  state.knowledgeItems.forEach((entry) => {
    const item = node("article", "management-item");
    const icon = node("span", `management-item-icon ${entry.content_type === "视频" ? "video" : ""}`);
    icon.append(node("i", `ti ${entry.content_type === "视频" ? "ti-video" : "ti-article"}`));
    const copy = document.createElement("div");
    copy.append(node("strong", "", entry.title), node("p", "", entry.summary || "暂无摘要"));
    const meta = node("div", "management-item-meta");
    meta.append(node("span", "", entry.department), node("span", "", entry.content_type), node("em", "", "已发布"));
    copy.append(meta);
    item.append(icon, copy);
    container.append(item);
  });
}

function renderPathways() {
  const container = $("#pathwayList");
  container.replaceChildren();
  setText("#pathwayCount", `${state.pathways.length} 条路径`);
  state.pathways.forEach((pathway) => {
    const item = node("article", "pathway-item");
    const head = node("div", "pathway-head");
    const title = document.createElement("div");
    title.append(node("strong", "", pathway.name), node("small", "", pathway.department));
    head.append(title, node("span", "pathway-status", pathway.status === "enabled" ? "已启用" : "已停用"));
    const logic = node("div", "pathway-logic");
    [
      ["ti-bolt", "触发", pathway.trigger_rule],
      ["ti-calendar-time", "节奏", pathway.cadence],
      ["ti-send", "推送", `${pathway.push_content} · ${pathway.channel}`],
      ["ti-alert-triangle", "升级", pathway.escalation_rule || "未设置"],
    ].forEach(([icon, label, value]) => {
      const row = node("p");
      row.append(node("i", `ti ${icon}`), node("b", "", label), document.createTextNode(value));
      logic.append(row);
    });
    item.append(head, logic);
    container.append(item);
  });
}

async function loadManagementModules() {
  const [knowledgeResponse, pathwayResponse] = await Promise.all([
    apiFetch("/api/doctor/knowledge"),
    apiFetch("/api/doctor/followup-pathways"),
  ]);
  const knowledge = await knowledgeResponse.json();
  const pathways = await pathwayResponse.json();
  if (!knowledgeResponse.ok) throw new Error(knowledge.error || "知识库加载失败");
  if (!pathwayResponse.ok) throw new Error(pathways.error || "随访路径加载失败");
  state.knowledgeItems = knowledge.items || [];
  state.pathways = pathways.pathways || [];
  renderKnowledgeItems();
  renderPathways();
}

function renderReviewNotes(summary) {
  const container = $("#reviewNotes");
  container.replaceChildren();
  const assessment = summary.assessment;
  const bone = summary.bone_risk;
  const notes = [
    {
      icon: assessment?.level === "high" ? "ti-alert-triangle" : "ti-chart-line",
      title: "PRO 复核",
      copy: assessment?.answered ? `${assessment.label}；已确认 ${assessment.answered}/38 项。` : "尚无 PRO 自报记录，建议继续自然随访。",
    },
    {
      icon: "ti-bone",
      title: "骨转移资料",
      copy: bone?.status === "ready" ? "资料已齐，需进入官方 BoneSight 工具完成计算。" : bone?.status === "collecting" ? `资料完整度 ${bone.completion_percent}%，优先补充：${bone.missing?.[0]?.question || "剩余字段"}` : "尚未启动相关资料采集。",
    },
    {
      icon: "ti-shield-check",
      title: "证据与安全边界",
      copy: "所有结构化结果均保留触发原话、AI追问与患者确认；本页不替代临床诊断。",
    },
  ];
  notes.forEach((note) => {
    const item = node("article", "review-note");
    const icon = node("i", `ti ${note.icon}`);
    const copy = document.createElement("div");
    copy.append(node("strong", "", note.title), node("p", "", note.copy));
    item.append(icon, copy);
    container.append(item);
  });
}

function renderSelectedPatient() {
  const summary = summaryFor(state.selectedId);
  const patient = state.patients.find((item) => item.id === state.selectedId);
  if (!summary || !patient) return;
  const assessment = summary.assessment;
  const bone = summary.bone_risk;

  setText("#selectedPatientName", patient.display_name);
  const patientMeta = [
    patient.id,
    patient.age !== null && patient.age !== undefined ? `${patient.age} 岁` : "",
    patient.sex || "",
    `最近活跃 ${formatTime(patient.last_active_at || patient.created_at)}`,
  ].filter(Boolean).join(" · ");
  setText("#selectedPatientMeta", patientMeta);
  setText("#patientAvatar", patient.display_name?.slice(0, 1) || "患");
  setText("#selectedProBadge", assessment?.answered ? `PRO · ${assessment.label}` : "PRO 待采集");
  setText("#selectedBoneBadge", bone?.status === "ready" ? "骨转移资料齐全 · 待官方复核" : bone?.status === "collecting" ? `骨转移资料 ${bone.completion_percent}%` : "骨转移资料待采集");

  const clinicalCase = summary.clinical_case;
  setText("#clinicalTabCount", (clinicalCase?.events?.length || 0) + (clinicalCase?.adverse_events?.length || 0) + (clinicalCase?.measurements?.length || 0));
  setText("#proTabCount", assessment?.answered || 0);
  setText("#boneTabCount", bone?.answered_fields || 0);
  setText("#conversationTabCount", summary.messages?.length || 0);

  const registered = summary.patient || patient;
  const reports = Array.isArray(registered.reports) ? registered.reports : [];
  setText("#registeredPatientName", registered.display_name || "—");
  setText("#registeredPatientAge", registered.age !== null && registered.age !== undefined ? `${registered.age} 岁` : "未填写");
  setText("#registeredPatientSex", registered.sex || "未填写");
  setText("#registeredReportCount", `${reports.length} 份`);
  setText("#registeredCondition", registered.condition_summary || "尚未登记");
  setText("#registeredHistory", registered.medical_history || "尚未填写");
  const reportList = $("#registeredReportList");
  reportList.replaceChildren();
  if (!reports.length) {
    reportList.append(node("span", "registered-report-empty", "未上传既往报告"));
  } else {
    reports.forEach((report) => {
      const item = node("button", "registered-report-item");
      item.type = "button";
      item.dataset.reportId = report.id;
      item.title = "查看报告摘要";
      item.append(node("i", "ti ti-file-description"), document.createTextNode(report.file_name || "既往报告"), node("i", "ti ti-chevron-right"));
      reportList.append(item);
    });
  }

  renderOverview(summary);
  renderAssessment(summary);
  renderBone(summary);
  renderConversation(summary.messages || []);
  renderDoctorMedicationRecords(summary.medication_records || []);
  renderClinicalCase(clinicalCase);
  renderReviewNotes(summary);
  renderPatientTable();
}

function openReportDetail(reportId) {
  const reports = summaryFor(state.selectedId)?.patient?.reports || [];
  const report = reports.find((item) => item.id === reportId);
  if (!report || !reportDetailDialog) return;
  setText("#reportDetailTitle", report.file_name || "检查报告详情");
  const meta = $("#reportDetailMeta");
  meta.replaceChildren();
  [
    report.created_at ? `报告日期 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(report.created_at))}` : "",
    report.file_type ? `资料类型 ${report.file_type}` : "",
  ].filter(Boolean).forEach((value) => meta.append(node("span", "", value)));
  setText("#reportDetailNote", report.note || "该报告暂无文字摘要，请结合原始文件复核。");
  reportDetailDialog.showModal();
}

function openTab(tabName, scrollIntoView = false) {
  state.activeTab = tabName;
  $$("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === tabName;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  $$("[data-tab-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === tabName));
  if (tabName === "pro") drawTrendChart(summaryFor(state.selectedId)?.timeline || []);
  if (scrollIntoView) $("#patientDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectPatient(patientId, scrollIntoView = false) {
  if (!state.summaries.has(patientId)) return;
  state.selectedId = patientId;
  elements.patientSelect.value = patientId;
  renderSelectedPatient();
  if (scrollIntoView) $("#patientDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function populatePatientSelect() {
  elements.patientSelect.replaceChildren();
  state.patients.forEach((patient) => {
    const option = document.createElement("option");
    option.value = patient.id;
    option.textContent = `${patient.id} · ${patient.display_name}`;
    elements.patientSelect.append(option);
  });
  elements.patientSelect.value = state.selectedId;
}

async function loadData() {
  elements.loading.hidden = false;
  elements.dashboard.hidden = true;
  elements.emptyState.hidden = true;
  elements.refreshButton.disabled = true;
  try {
    const patientResponse = await apiFetch("/api/doctor/patients");
    const patientData = await patientResponse.json();
    if (!patientResponse.ok) throw new Error(patientData.error || "患者列表加载失败");
    state.patients = patientData.patients || [];
    if (!state.patients.length) {
      elements.emptyState.hidden = false;
      return;
    }

    const summaryEntries = await Promise.all(state.patients.map(async (patient) => {
      const response = await apiFetch(`/api/doctor/summary?patient_id=${encodeURIComponent(patient.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${patient.id} 数据加载失败`);
      return [patient.id, data];
    }));
    state.summaries = new Map(summaryEntries);

    const requested = new URLSearchParams(window.location.search).get("patient_id");
    if (requested && state.summaries.has(requested)) state.selectedId = requested;
    else if (!state.summaries.has(state.selectedId)) state.selectedId = state.summaries.has("P20210705") ? "P20210705" : state.summaries.has("P001") ? "P001" : state.patients[0].id;

    populatePatientSelect();
    renderKpis();
    renderSelectedPatient();
    await loadManagementModules();
    openTab(state.activeTab);
    elements.dataTime.replaceChildren(node("i", "ti ti-clock"), document.createTextNode(`更新于 ${formatTime(new Date().toISOString())}`));
    elements.dashboard.hidden = false;
  } catch (error) {
    elements.emptyState.hidden = false;
    elements.emptyState.querySelector("h2").textContent = "暂时无法加载医生端数据";
    elements.emptyState.querySelector("p").textContent = error.message;
  } finally {
    elements.loading.hidden = true;
    elements.refreshButton.disabled = false;
  }
}

elements.refreshButton.addEventListener("click", loadData);
elements.patientSelect.addEventListener("change", () => selectPatient(elements.patientSelect.value));

document.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-patient-id]");
  const patientButton = event.target.closest("[data-patient-id]");
  if (patientButton || row) selectPatient((patientButton || row).dataset.patientId, true);

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) openTab(tabButton.dataset.tab);

  const openButton = event.target.closest("[data-open-tab]");
  if (openButton) openTab(openButton.dataset.openTab, true);

  const reportButton = event.target.closest("[data-report-id]");
  if (reportButton) openReportDetail(reportButton.dataset.reportId);

  const nav = event.target.closest("[data-nav-target]");
  if (nav) {
    event.preventDefault();
    $$("[data-nav-target]").forEach((item) => item.classList.toggle("active", item === nav));
    const target = nav.dataset.navTarget;
    if (["proPanel", "bonePanel", "conversationPanel"].includes(target)) {
      const tabMap = { proPanel: "pro", bonePanel: "bone", conversationPanel: "conversation" };
      openTab(tabMap[target], true);
    } else {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
});

reportDetailClose?.addEventListener("click", () => reportDetailDialog.close());
reportDetailDialog?.addEventListener("click", (event) => {
  if (event.target === reportDetailDialog) reportDetailDialog.close();
});

$("#knowledgeForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await apiFetch("/api/doctor/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "发布失败");
    form.reset();
    form.elements.department.value = "乳腺肿瘤科";
    await loadManagementModules();
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#pathwayForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await apiFetch("/api/doctor/followup-pathways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存失败");
    form.reset();
    form.elements.department.value = "乳腺肿瘤科";
    await loadManagementModules();
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const summary = summaryFor(state.selectedId);
    if (!summary) return;
    drawDomainChart(summary.assessment?.domain_scores || []);
    drawBoneDonut(summary.bone_risk?.completion_percent || 0);
    if (state.activeTab === "pro") drawTrendChart(summary.timeline || []);
  }, 120);
});

loadData();
