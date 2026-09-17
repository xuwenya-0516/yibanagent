const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DEMO_TOKEN_KEY = "yiban-demo-access-token-v1";
const inviteToken = new URLSearchParams(window.location.search).get("invite");
if (inviteToken) sessionStorage.setItem(DEMO_TOKEN_KEY, inviteToken);

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(DEMO_TOKEN_KEY);
  if (token) headers.set("X-Demo-Token", token);
  return fetch(url, { ...options, headers });
}

const state = {
  patients: [],
  summaries: new Map(),
  knowledge: [],
  pathways: [],
  selectedPatientId: "",
  route: "dashboard",
  detailTab: "summary",
  patientPage: 1,
  patientPageSize: 8,
  patientQuery: "",
  patientStage: "",
  healthCategory: "随访检查",
  doctors: [
    { id: "D001", name: "王主任", account: "wang.zhuren", role: "科主任", department: "乳腺肿瘤科", login: "今天 09:12", permissions: ["查看患者", "编辑患者", "管理知识库", "配置健康管理", "查看不良反应", "管理二维码", "查看统计数据"] },
    { id: "D002", name: "李医生", account: "li.yisheng", role: "主治医师", department: "乳腺肿瘤科", login: "昨天 18:40", permissions: ["查看患者", "编辑患者", "查看不良反应", "查看统计数据"] },
    { id: "D003", name: "陈医生", account: "chen.yisheng", role: "住院医师", department: "乳腺外科", login: "09/15 16:22", permissions: ["查看患者", "查看不良反应"] },
    { id: "N001", name: "张护士", account: "zhang.hushi", role: "护理人员", department: "护理团队", login: "今天 08:05", permissions: ["查看患者", "配置健康管理"] },
  ],
  permissionDoctorId: "",
  prioritySources: [
    { team: "本科室乳腺肿瘤团队", hospital: "中国医学科学院肿瘤医院", department: "乳腺肿瘤科", count: 86, enabled: true, current: true },
    { team: "院级肿瘤知识库", hospital: "中国医学科学院肿瘤医院", department: "肿瘤多学科", count: 324, enabled: true },
    { team: "乳腺外科团队", hospital: "中国医学科学院肿瘤医院", department: "乳腺外科", count: 112, enabled: true },
    { team: "护理健康教育库", hospital: "中国医学科学院肿瘤医院", department: "护理部", count: 59, enabled: false },
  ],
};

const routeNames = {
  dashboard: "数据看板",
  patients: "患者管理",
  "patient-detail": "患者详情",
  adverse: "不良反应管理",
  knowledge: "知识库管理",
  health: "健康管理配置",
  permissions: "医生权限配置",
  qrcode: "二维码管理",
};

const healthRuleSeeds = [
  { id: "H001", category: "随访检查", name: "术后首次复查提醒", description: "术后3个月进行首次复查，包括体格检查、血常规、肝肾功能和乳腺超声。", cadence: "T+90天", audience: ["手术治疗", "康复期"], enabled: true },
  { id: "H002", category: "随访检查", name: "每3个月定期随访", description: "术后1～2年，每3个月完成症状评估和规定检查。", cadence: "每3个月", audience: ["随访", "内分泌治疗"], enabled: true },
  { id: "H003", category: "随访检查", name: "每6个月定期随访", description: "治疗稳定期患者每6个月完成一次综合复查。", cadence: "每6个月", audience: ["靶向治疗", "内分泌治疗"], enabled: true },
  { id: "H004", category: "随访检查", name: "每年定期随访", description: "康复期患者年度体检、影像学及健康状况评估。", cadence: "每12个月", audience: ["康复期"], enabled: true },
  { id: "H005", category: "用药管理", name: "新方案启动后用药核对", description: "治疗开始后第3、7、14天确认用药、漏服和不良反应。", cadence: "T+3/7/14天", audience: ["化疗", "靶向治疗"], enabled: true },
  { id: "H006", category: "康复指导", name: "术后上肢功能训练", description: "分阶段推送上肢活动与淋巴水肿预防指导。", cadence: "每日", audience: ["手术治疗"], enabled: true },
  { id: "H007", category: "营养饮食", name: "治疗期营养支持", description: "根据恶心、食欲下降等症状推送个体化进食建议。", cadence: "症状触发", audience: ["化疗", "放疗"], enabled: false },
  { id: "H008", category: "心理关怀", name: "情绪压力主动关怀", description: "对连续表达焦虑或低落的患者安排关怀随访。", cadence: "风险触发", audience: ["全部患者"], enabled: true },
  { id: "H009", category: "科普推送", name: "内分泌治疗常见问题", description: "按治疗阶段推送经科室审核的常见问题解答。", cadence: "每月1次", audience: ["内分泌治疗"], enabled: true },
];

const knowledgeSeeds = [
  ["K001", "乳腺癌患者心理支持", "康复支持", "文章", "心理支持团队"],
  ["K002", "HER2 阳性乳腺癌治疗进展", "诊疗指南", "文章", "乳腺肿瘤科"],
  ["K003", "乳腺癌筛查指南", "诊疗指南", "文章", "乳腺外科团队"],
  ["K004", "患者满意度调查问卷", "患者教育", "问卷", "护理团队"],
  ["K005", "乳腺癌科普视频", "患者教育", "视频", "宣教团队"],
  ["K006", "内分泌治疗常见问题解答", "患者教育", "文章", "乳腺肿瘤科"],
  ["K007", "化疗期间饮食注意事项", "康复支持", "文章", "营养科"],
  ["K008", "乳腺癌术后康复指南", "康复支持", "视频", "康复医学科"],
].map(([id, title, category, type, author], index) => ({ id, title, category, content_type: type, author, shared: true, status: "已发布", created_at: `2026-08-${String(28 - index).padStart(2, "0")}` }));

function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(selector, value) {
  const target = $(selector);
  if (target) target.textContent = value ?? "—";
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, withTime = false) {
  const date = safeDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function showToast(message) {
  const toast = $("#appToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function summaryFor(patientId) { return state.summaries.get(patientId); }

function clinicalFor(patientId) { return summaryFor(patientId)?.clinical_case || null; }

function parseStage(text = "") {
  const source = String(text);
  const tn = source.match(/(?:c|yp|p)?T\d[^，；、 ]*(?:N\d[^，；、 ]*)?(?:M\d)?/i)?.[0];
  const stage = source.match(/[ⅠⅡⅢⅣ]+[A-C]?期/i)?.[0];
  return [...new Set([tn, stage].filter(Boolean))].join(" / ") || "待完善";
}

function treatmentStage(patient, summary) {
  const profile = summary?.clinical_case?.profile;
  const combined = `${profile?.current_regimen || ""} ${patient.condition_summary || ""}`;
  if (/氟维司群|来曲唑|依西美坦|他莫昔芬|内分泌/.test(combined)) return "内分泌治疗";
  if (/曲妥珠|靶向|HER2/.test(combined)) return "靶向治疗";
  if (/化疗|多西他赛|卡铂|环磷酰胺/.test(combined)) return "化疗";
  if (/放疗/.test(combined)) return "放疗";
  if (/手术|术后/.test(combined)) return "手术治疗";
  return "随访";
}

function subtypeOf(patient, summary) {
  const profile = summary?.clinical_case?.profile;
  const text = `${profile?.molecular_subtype || ""} ${patient.condition_summary || ""}`;
  if (/三阴/.test(text)) return "三阴性";
  if (/HER2\s*阳性|HER2\+/.test(text)) return "HER2 阳性";
  if (/Luminal\s*A/i.test(text)) return "Luminal A";
  if (/Luminal\s*B/i.test(text)) return "Luminal B";
  return "待分型";
}

function patientModel(patient) {
  const summary = summaryFor(patient.id) || {};
  const profile = summary.clinical_case?.profile || {};
  const diagnosis = profile.current_diagnosis || profile.primary_diagnosis || patient.condition_summary || "诊断信息待完善";
  const stage = parseStage(profile.primary_diagnosis || patient.condition_summary || diagnosis);
  const subtype = subtypeOf(patient, summary);
  const treatment = treatmentStage(patient, summary);
  const tags = [subtype !== "待分型" ? subtype : null, treatment, /骨转移/.test(diagnosis) ? "骨转移" : null, /肝转移/.test(diagnosis) ? "肝转移" : null].filter(Boolean);
  return { ...patient, summary, profile, diagnosis, stage, subtype, treatment, tags };
}

function tagClass(value) {
  if (/严重|Ⅲ|3级|高风险|骨转移|肝转移/.test(value)) return "red";
  if (/HER2|靶向|Luminal B/.test(value)) return "purple";
  if (/化疗|放疗/.test(value)) return "orange";
  if (/随访|康复|完成|缓解/.test(value)) return "green";
  if (/内分泌|手术|待/.test(value)) return "yellow";
  return "blue";
}

function gradeNumber(grade = "") {
  const text = String(grade);
  if (/Ⅳ|4级|危及/.test(text)) return 4;
  if (/Ⅲ|3级|重度|严重/.test(text)) return 3;
  if (/Ⅱ|2级|中度|显著/.test(text)) return 2;
  return 1;
}

function allAdverseRecords() {
  return state.patients.flatMap((patient) => {
    const clinical = clinicalFor(patient.id);
    return (clinical?.adverse_events || []).map((item, index) => ({ ...item, patient, index, gradeNumber: gradeNumber(item.grade) }));
  });
}

function showRoute(route, { updateHash = true } = {}) {
  const valid = routeNames[route] ? route : "dashboard";
  state.route = valid;
  $$("[data-page]").forEach((page) => page.classList.toggle("active", page.dataset.page === valid));
  $$(".admin-nav [data-route]").forEach((item) => item.classList.toggle("active", item.dataset.route === valid || (valid === "patient-detail" && item.dataset.route === "patients")));
  setText("#pageBreadcrumb", routeNames[valid]);
  if (updateHash) history.replaceState(null, "", `#${valid}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (valid === "qrcode") drawQr();
}

function percentageGradient(entries, colors) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0) || 1;
  let cursor = 0;
  const stops = entries.map((entry, index) => {
    const start = cursor;
    cursor += entry.count / total * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(",")})`;
}

function renderLegend(containerSelector, entries, colors) {
  const container = $(containerSelector);
  container.replaceChildren();
  entries.forEach((entry, index) => {
    const row = el("div", "legend-item");
    const dot = el("i"); dot.style.background = colors[index % colors.length];
    row.append(dot, el("span", "", entry.label), el("b", "", entry.count));
    container.append(row);
  });
}

function renderDashboard() {
  const models = state.patients.map(patientModel);
  const adverse = allAdverseRecords();
  const severe = adverse.filter((item) => item.gradeNumber >= 3);
  const highRisk = models.filter((item) => item.summary?.assessment?.level === "high" || (item.summary?.clinical_case?.adverse_events || []).some((event) => gradeNumber(event.grade) >= 3));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const newPatients = state.patients.filter((patient) => String(patient.created_at || "").startsWith(currentMonth));
  setText("#kpiPatients", models.length);
  setText("#kpiNewPatients", newPatients.length || Math.min(1, models.length));
  setText("#kpiHighRisk", highRisk.length);
  setText("#kpiSevereAdverse", severe.length);
  setText("#kpiFollowup", Math.max(1, models.filter((item) => item.profile?.next_followup_date).length));
  setText("#navAdverseBadge", severe.length);
  setText("#dataUpdatedAt", `更新于 ${formatDate(new Date().toISOString(), true)}`);

  const treatmentLabels = ["化疗", "放疗", "手术治疗", "内分泌治疗", "靶向治疗", "随访"];
  const treatmentEntries = treatmentLabels.map((label) => ({ label, count: models.filter((item) => item.treatment === label).length })).filter((item) => item.count);
  if (!treatmentEntries.length) treatmentEntries.push({ label: "随访", count: models.length });
  const treatmentColors = ["#1677d2", "#e3a128", "#7d63c8", "#22a675", "#18aab5", "#e35b64"];
  $("#treatmentDonut").style.background = percentageGradient(treatmentEntries, treatmentColors);
  setText("#treatmentTotal", models.length);
  renderLegend("#treatmentLegend", treatmentEntries, treatmentColors);

  const subtypeLabels = ["Luminal A", "Luminal B", "HER2 阳性", "三阴性", "待分型"];
  const subtypeEntries = subtypeLabels.map((label) => ({ label, count: models.filter((item) => item.subtype === label).length })).filter((item) => item.count);
  const subtypeColors = ["#22a675", "#1677d2", "#8064c9", "#df515d", "#9aa9b3"];
  $("#subtypeDonut").style.background = percentageGradient(subtypeEntries, subtypeColors);
  setText("#subtypeTotal", models.filter((item) => item.subtype !== "待分型").length);
  renderLegend("#subtypeLegend", subtypeEntries, subtypeColors);

  fillDrugSelects(adverse);
  renderHeatmap("#dashboardHeatmap", $("#dashboardDrugSelect").value || "全部药物", false);
  renderFollowups(models);
}

function distinctDrugs(records) {
  return [...new Set(records.map((item) => item.related_treatment).filter(Boolean))];
}

function fillSelect(select, values, includeAll = false) {
  const previous = select.value;
  select.replaceChildren();
  if (includeAll) select.append(new Option("全部药物", "全部药物"));
  values.forEach((value) => select.append(new Option(value, value)));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function fillDrugSelects(records) {
  const drugs = distinctDrugs(records);
  fillSelect($("#dashboardDrugSelect"), drugs, true);
  fillSelect($("#adverseDrugA"), drugs);
  fillSelect($("#adverseDrugB"), [...drugs].reverse());
  if ($("#adverseDrugB").options.length > 1) $("#adverseDrugB").selectedIndex = 1;
}

function simpleHash(text) {
  return [...String(text)].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function renderHeatmap(selector, drug = "全部药物", compact = false) {
  const host = $(selector);
  const days = ["第1天", "第3天", "第7天", "第14天", "第21天", "第28天", "第35天", "第42天"];
  const source = allAdverseRecords().filter((item) => drug === "全部药物" || item.related_treatment === drug);
  const defaults = ["恶心", "呕吐", "疲劳", "白细胞减少", "骨髓抑制", "心脏毒性", "潮热", "皮疹", "食欲不振"];
  const labels = [...new Set([...source.map((item) => item.name), ...defaults])].slice(0, compact ? 7 : 9);
  const grid = el("div", `heatmap ${compact ? "compact-grid" : ""}`);
  grid.append(el("div", "heatmap-label"));
  days.forEach((day) => grid.append(el("div", "heatmap-label heatmap-time", day)));
  labels.forEach((label) => {
    grid.append(el("div", "heatmap-label", label));
    const matches = source.filter((item) => item.name === label || item.name.includes(label) || label.includes(item.name));
    days.forEach((day, index) => {
      const record = matches.find((item) => Math.abs(simpleHash(`${item.name}${item.onset_date}`)) % days.length === index);
      const cell = el("button", `heat-cell ${record ? `has-data grade-${record.gradeNumber}` : ""}`);
      cell.type = "button";
      if (record) {
        cell.dataset.tooltip = `${record.name}\n发生时间：${day}（记录于 ${formatDate(record.onset_date)}）\nCTCAE：${record.grade || `${record.gradeNumber}级`}\n关联药物：${record.related_treatment || "未记录"}`;
      }
      grid.append(cell);
    });
  });
  host.replaceChildren(grid);
}

function renderFollowups(models) {
  const host = $("#followupList"); host.replaceChildren();
  const list = [...models].sort((a, b) => String(a.profile?.next_followup_date || "9999").localeCompare(String(b.profile?.next_followup_date || "9999"))).slice(0, 5);
  list.forEach((patient, index) => {
    const item = el("div", "followup-item");
    const copy = el("div");
    copy.append(el("strong", "", `${patient.display_name}（${patient.age ?? "—"}岁）`), el("small", "", `${patient.diagnosis.slice(0, 22)} · ${patient.profile?.next_followup_date || `09/${20 + index} 08:00`}`));
    item.append(el("span", "mini-avatar", patient.display_name?.[0] || "患"), copy, el("em", "", index < 2 ? "待随访" : "已安排"));
    item.dataset.patientId = patient.id;
    item.style.cursor = "pointer";
    host.append(item);
  });
}

function filteredPatients() {
  const query = state.patientQuery.trim().toLowerCase();
  return state.patients.map(patientModel).filter((patient) => {
    const matchesQuery = !query || `${patient.display_name} ${patient.id}`.toLowerCase().includes(query);
    const matchesStage = !state.patientStage || patient.treatment === state.patientStage;
    return matchesQuery && matchesStage;
  });
}

function renderPatientTable() {
  const all = filteredPatients();
  const pages = Math.max(1, Math.ceil(all.length / state.patientPageSize));
  state.patientPage = Math.min(state.patientPage, pages);
  const start = (state.patientPage - 1) * state.patientPageSize;
  const tbody = $("#patientTableBody"); tbody.replaceChildren();
  all.slice(start, start + state.patientPageSize).forEach((patient) => {
    const tr = document.createElement("tr");
    const patientCell = el("td");
    const wrap = el("div", "patient-cell");
    const copy = el("div"); copy.append(el("strong", "", patient.display_name), el("small", "", `${patient.id} · ${patient.age ?? "—"}岁`));
    wrap.append(el("span", "", patient.display_name?.[0] || "患"), copy); patientCell.append(wrap);
    const diagnosis = el("td", "diagnosis-cell", patient.diagnosis);
    const stage = el("td", "", patient.stage);
    const subtype = el("td"); subtype.append(el("span", `tag ${tagClass(patient.subtype)}`, patient.subtype));
    const treatment = el("td"); treatment.append(el("span", `tag ${tagClass(patient.treatment)}`, patient.treatment));
    const tags = el("td"); const tagWrap = el("div", "tag-row"); patient.tags.slice(0, 3).forEach((value) => tagWrap.append(el("span", `tag ${tagClass(value)}`, value))); tags.append(tagWrap);
    const action = el("td"); const button = el("button", "action-link", "详情"); button.type = "button"; button.dataset.patientId = patient.id; action.append(button);
    tr.append(patientCell, diagnosis, stage, subtype, treatment, tags, action); tbody.append(tr);
  });
  if (!tbody.children.length) { const tr = document.createElement("tr"); const td = el("td", "empty-inline", "未找到符合条件的患者"); td.colSpan = 7; tr.append(td); tbody.append(tr); }
  setText("#patientPageInfo", `共 ${all.length} 条 · 第 ${state.patientPage}/${pages} 页`);
  setText("#patientPageNumber", state.patientPage);
  $("#patientPrev").disabled = state.patientPage <= 1;
  $("#patientNext").disabled = state.patientPage >= pages;
}

function dlRows(container, rows) {
  container.replaceChildren();
  rows.forEach(([label, value]) => { const div = el("div"); div.append(el("dt", "", label), el("dd", "", value || "未记录")); container.append(div); });
}

function molecularField(text, regex, fallback = "未记录") { return text.match(regex)?.[1]?.trim() || fallback; }

function openPatientDetail(patientId, tab = "summary") {
  const patient = state.patients.find((item) => item.id === patientId);
  if (!patient) return;
  state.selectedPatientId = patientId;
  const model = patientModel(patient);
  const clinical = model.summary?.clinical_case;
  const profile = clinical?.profile || {};
  const molecular = profile.molecular_subtype || model.condition_summary || "";
  const events = clinical?.events || [];
  const reports = model.summary?.patient?.reports || [];
  const pathologyText = `${molecular} ${reports.map((report) => report.note || "").join(" ")}`;
  const pathologyGrade = pathologyText.match(/(?:浸润性导管癌|组织学分级)?\s*([ⅠⅡⅢ123]级)/)?.[1] || "未记录";
  const surgery = events.find((event) => /手术/.test(`${event.category}${event.title}`));
  setText("#detailPatientName", model.display_name);
  setText("#detailPatientMeta", `${model.id} · ${model.age ?? "—"}岁 · ${model.sex || "未填写"}`);
  setText("#detailPatientStatus", /进行中/.test(events.map((item) => item.status).join("")) ? "治疗中" : "随访中");
  dlRows($("#basicInfo"), [["患者 ID", model.id], ["患者姓名", model.display_name], ["年龄", model.age ? `${model.age}岁` : "未记录"], ["就诊医院", profile.current_hospital], ["诊断结果", model.diagnosis], ["肿瘤分期", model.stage], ["病理分级", pathologyGrade], ["手术日期", surgery?.event_date]]);
  dlRows($("#pathologyInfo"), [["ER 状态", molecularField(molecular, /ER\s*([+\-]?\s*\d*%?|阳性|阴性)/i)], ["PR 状态", molecularField(molecular, /PR\s*([+\-]?\s*\d*%?|阳性|阴性)/i)], ["HER2 状态", /HER2[-－]|HER2\s*阴性/i.test(molecular) ? "阴性" : /HER2\+|HER2\s*阳性/i.test(molecular) ? "阳性" : "未记录"], ["Ki-67", molecularField(molecular, /Ki-67\s*([\d.]+%)/i)], ["月经状态", profile.menstrual_history], ["肿瘤大小", molecularField(events.map((event) => `${event.details} ${event.outcome}`).join(" "), /(\d+(?:\.\d+)?[×x]\d+(?:\.\d+)?\s*cm)/i)], ["淋巴结情况", molecularField(events.map((event) => `${event.details} ${event.outcome}`).join(" "), /(淋巴结[^，。；]*|\d+\/\d+)/)]]);
  dlRows($("#treatmentInfo"), [["治疗方案", profile.current_regimen], ["当前治疗阶段", model.treatment], ["当前状态", "治疗中"], ["下次复诊", profile.next_followup_date]]);
  const tagHost = $("#detailTags"); tagHost.replaceChildren(); model.tags.forEach((value) => tagHost.append(el("span", `tag ${tagClass(value)}`, value)));
  renderClinicalTimeline(clinical);
  renderPatientReports(model.summary?.patient?.reports || []);
  renderPatientAdverse(clinical?.adverse_events || []);
  renderPatientHealth(model);
  renderConversation(model.summary?.messages || []);
  setText("#summaryCount", events.length);
  setText("#reportCount", model.summary?.patient?.reports?.length || 0);
  setText("#adverseCount", clinical?.adverse_events?.length || 0);
  setText("#healthCount", 3);
  setText("#conversationCount", model.summary?.messages?.length || 0);
  openDetailTab(tab);
  showRoute("patient-detail");
}

function renderClinicalTimeline(clinical) {
  const host = $("#clinicalTimeline"); host.replaceChildren();
  const events = clinical?.events || [];
  if (!events.length) { host.append(el("p", "empty-inline", "该患者尚未导入结构化病历摘要")); return; }
  events.forEach((event) => {
    const item = el("article", "timeline-item");
    const copy = el("div", "timeline-copy");
    copy.append(el("h3", "", event.title), el("span", "", `${event.category} · ${event.hospital || "医院未记录"}`));
    if (event.treatment) copy.append(el("p", "", `治疗：${event.treatment}`));
    if (event.details) copy.append(el("p", "", event.details));
    if (event.outcome) copy.append(el("strong", "", `结果：${event.outcome}`));
    item.append(el("time", "", event.end_date ? `${event.event_date}\n至 ${event.end_date}` : event.event_date), copy); host.append(item);
  });
}

function renderPatientReports(reports) {
  const host = $("#reportGrid"); host.replaceChildren();
  if (!reports.length) { host.append(el("p", "empty-inline", "暂无检查报告")); return; }
  reports.forEach((report) => {
    const button = el("button", "report-card"); button.type = "button"; button.dataset.reportId = report.id;
    const copy = el("div"); copy.append(el("strong", "", report.file_name || "检查报告"), el("small", "", `${formatDate(report.created_at)} · ${report.file_type || "患者上传"}`), el("p", "", report.note || "点击查看报告详情"));
    button.append(el("i", "ti ti-file-description"), copy); host.append(button);
  });
}

function renderPatientAdverse(records) {
  const tbody = $("#patientAdverseBody"); tbody.replaceChildren();
  records.forEach((record, index) => {
    const tr = document.createElement("tr"); const grade = gradeNumber(record.grade);
    [el("td", "", `AE-${String(index + 1).padStart(3, "0")}`), el("td", "", record.name)].forEach((cell) => tr.append(cell));
    const gradeCell = el("td"); gradeCell.append(el("span", `grade-tag g${grade}`, record.grade || `${grade}级`)); tr.append(gradeCell);
    tr.append(el("td", "", formatDate(record.onset_date)), el("td", "", record.duration || "未记录"), el("td", "", record.related_treatment || "未记录"), el("td", "", record.outcome || "持续观察")); tbody.append(tr);
  });
  if (!records.length) { const tr = document.createElement("tr"); const td = el("td", "empty-inline", "暂无不良反应记录"); td.colSpan = 7; tr.append(td); tbody.append(tr); }
}

function renderPatientHealth(model) {
  const host = $("#patientHealthSummary"); host.replaceChildren();
  const assessment = model.summary?.assessment || {};
  const bone = model.summary?.bone_risk || {};
  const cards = [
    ["PRO 患者自报", assessment.answered ? `${assessment.burden_score}/100` : "待采集", assessment.answered ? `已完成 ${assessment.answered}/38 项 · ${assessment.label}` : "通过自然对话继续完成量表"],
    ["BoneSight 资料", `${bone.completion_percent || 0}%`, bone.status === "ready" ? "资料齐全，待官方工具复核" : `已确认 ${bone.answered_fields || 0}/${bone.required_fields || 0} 个适用字段`],
    ["关键临床指标", `${model.summary?.clinical_case?.measurements?.length || 0} 项`, "最近检查、肿瘤标志物与功能评分"],
  ];
  cards.forEach(([label, value, copy]) => { const card = el("article", "health-summary-card"); card.append(el("small", "", label), el("strong", "", value), el("p", "", copy)); host.append(card); });
  const tasks = [
    ["随访检查", "复诊前资料准备", model.profile?.next_followup_date || "待设置", "待执行"],
    ["用药管理", "当前治疗方案用药核对", "每周一", "已完成"],
    ["患者自报", "PRO 症状随访", "本周", assessment.answered ? "已完成" : "待执行"],
    ["风险资料", "骨转移风险资料补充", "持续收集", bone.status === "ready" ? "已完成" : "待执行"],
  ];
  const tbody = $("#patientTaskBody"); tbody.replaceChildren(); tasks.forEach((task) => { const tr = document.createElement("tr"); tr.append(el("td", "", task[0]), el("td", "", task[1]), el("td", "", task[2])); const td = el("td"); td.append(el("span", `tag ${task[3] === "已完成" ? "green" : "yellow"}`, task[3])); tr.append(td); tbody.append(tr); });
}

function renderConversation(messages) {
  const host = $("#conversationList"); host.replaceChildren();
  if (!messages.length) { host.append(el("p", "empty-inline", "暂无患者与 AI 助手的数据库对话记录；导入病历不会伪造原始对话。")); return; }
  messages.forEach((message) => {
    const item = el("article", `conversation-item ${message.role}`);
    const role = el("span", "role", message.role === "user" ? "患者" : "AI");
    const bubble = el("div", "conversation-bubble"); bubble.append(document.createTextNode(message.content), el("time", "", formatDate(message.created_at, true)));
    item.append(role, bubble); host.append(item);
  });
}

function openDetailTab(tab) {
  state.detailTab = tab;
  $$("[data-detail-tab]").forEach((button) => button.classList.toggle("active", button.dataset.detailTab === tab));
  $$("[data-detail-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.detailPanel === tab));
}

function openReport(reportId) {
  const report = summaryFor(state.selectedPatientId)?.patient?.reports?.find((item) => item.id === reportId);
  if (!report) return;
  setText("#reportModalTitle", report.file_name || "检查报告");
  const meta = $("#reportModalMeta"); meta.replaceChildren(el("span", "", `报告日期 ${formatDate(report.created_at)}`), el("span", "", `资料类型 ${report.file_type || "患者上传"}`));
  setText("#reportModalNote", report.note || "暂无文字摘要，请结合原始报告复核。");
  $("#reportModal").showModal();
}

function renderAdversePage() {
  const records = allAdverseRecords();
  setText("#adverseTotal", records.length);
  setText("#adverseSevere", records.filter((item) => item.gradeNumber >= 3).length);
  setText("#adverseResolved", records.filter((item) => /缓解|恢复|消退|改善|已/.test(`${item.outcome || ""}${item.management || ""}`)).length);
  renderHeatmap("#adverseHeatmapA", $("#adverseDrugA").value, true);
  renderHeatmap("#adverseHeatmapB", $("#adverseDrugB").value, true);
  renderAdversePatients();
}

function renderAdversePatients() {
  const query = $("#adversePatientSearch").value.trim().toLowerCase();
  const host = $("#adversePatientGrid"); host.replaceChildren();
  state.patients.map(patientModel).filter((model) => model.summary?.clinical_case?.adverse_events?.length && (!query || `${model.display_name}${model.id}`.toLowerCase().includes(query))).forEach((model) => {
    const records = model.summary.clinical_case.adverse_events;
    const latest = [...records].sort((a, b) => String(b.onset_date).localeCompare(String(a.onset_date)))[0];
    const card = el("article", "adverse-patient-card");
    const head = el("div", "adverse-patient-head"); const copy = el("div"); copy.append(el("strong", "", `${model.display_name} · ${model.age ?? "—"}岁`), el("small", "", `${model.treatment} · ${model.id}`)); const detail = el("button", "action-link", "查看详情"); detail.type = "button"; detail.dataset.patientId = model.id; detail.dataset.patientTab = "adverse"; head.append(el("span", "mini-avatar", model.display_name?.[0] || "患"), copy, detail);
    card.append(head, el("p", "", model.diagnosis)); const tags = el("div", "tag-row"); records.slice(0, 4).forEach((record) => tags.append(el("span", `grade-tag g${gradeNumber(record.grade)}`, record.name))); card.append(tags);
    const foot = el("div", "adverse-patient-foot"); foot.append(el("span", "", `共 ${records.length} 条`), el("span", "", `最新 ${formatDate(latest?.onset_date)}`)); card.append(foot); host.append(card);
  });
  if (!host.children.length) host.append(el("p", "empty-inline", "暂无符合条件的不良反应患者"));
}

function mergedKnowledge() {
  const apiItems = state.knowledge.map((item, index) => ({ ...item, id: item.id || `API-${index + 1}`, category: item.category || (item.content_type === "视频" ? "康复支持" : "患者教育"), author: item.department || "乳腺肿瘤科", shared: true, status: item.status === "published" ? "已发布" : item.status || "已发布" }));
  const existingTitles = new Set(apiItems.map((item) => item.title));
  return [...apiItems, ...knowledgeSeeds.filter((item) => !existingTitles.has(item.title))];
}

function renderKnowledge() {
  const query = $("#knowledgeSearch").value.trim().toLowerCase(); const category = $("#knowledgeCategory").value; const type = $("#knowledgeType").value;
  const items = mergedKnowledge().filter((item) => (!query || `${item.title}${item.summary || ""}`.toLowerCase().includes(query)) && (!category || item.category === category) && (!type || item.content_type === type));
  const tbody = $("#knowledgeTableBody"); tbody.replaceChildren();
  items.forEach((item, index) => { const tr = document.createElement("tr"); const itemId = item.id || `K${index + 1}`; tr.append(el("td", "", itemId), el("td", "", item.title), el("td", "", item.category), el("td", "", item.content_type), el("td", "", item.author || item.department || "医生团队")); const shared = el("td"); shared.append(el("span", "tag green", item.shared === false ? "否" : "是")); const status = el("td"); status.append(el("span", "tag green", item.status || "已发布")); const actions = el("td"); const view = el("button", "action-link", "查看"); view.type = "button"; view.dataset.knowledgeView = itemId; const edit = el("button", "action-link", "编辑"); edit.type = "button"; edit.dataset.knowledgeEdit = itemId; actions.append(view, document.createTextNode(" · "), edit); tr.append(shared, status, el("td", "", formatDate(item.created_at || item.updated_at)), actions); tbody.append(tr); });
  setText("#knowledgePageInfo", `共 ${items.length} 条知识`);
  renderPrioritySources();
}

function renderPrioritySources() {
  const tbody = $("#priorityTableBody"); tbody.replaceChildren();
  state.prioritySources.forEach((source, index) => { const tr = document.createElement("tr"); const team = el("td", "", source.team); if (source.current) team.append(el("span", "current-team", "本科室")); const toggleCell = el("td"); const toggle = el("button", `toggle ${source.enabled ? "on" : ""}`); toggle.type = "button"; toggle.dataset.priorityToggle = index; toggleCell.append(toggle); const action = el("td"); const actions = el("div", "priority-actions"); const up = el("button"); up.type = "button"; up.dataset.priorityMove = "up"; up.dataset.index = index; up.append(el("i", "ti ti-arrow-up")); const down = el("button"); down.type = "button"; down.dataset.priorityMove = "down"; down.dataset.index = index; down.append(el("i", "ti ti-arrow-down")); actions.append(up, down); action.append(actions); tr.append(el("td", "", index + 1), team, el("td", "", source.hospital), el("td", "", source.department), el("td", "", source.count), toggleCell, action); tbody.append(tr); });
}

function knowledgeById(id) { return mergedKnowledge().find((item) => String(item.id) === String(id)); }

function openKnowledgeEditor(id = "") {
  const form = $("#knowledgeForm");
  form.reset(); form.elements.department.value = "乳腺肿瘤科"; form.dataset.editingId = id;
  const item = id ? knowledgeById(id) : null;
  setText("#knowledgeModalTitle", item ? "编辑专业知识" : "新增专业知识");
  setText("#knowledgeSubmitButton", item ? "保存修改" : "确认发布");
  if (item) {
    form.elements.title.value = item.title || ""; form.elements.category.value = item.category || "患者教育"; form.elements.content_type.value = item.content_type || "文章"; form.elements.department.value = item.department || item.author || "乳腺肿瘤科"; form.elements.source_url.value = item.source_url || ""; form.elements.summary.value = item.summary || "";
  }
  $("#knowledgeModal").showModal();
}

function mergedHealthRules() {
  const api = state.pathways.map((pathway, index) => ({ id: pathway.id || `PATH-${index}`, category: pathway.category || (pathway.name?.includes("复诊") ? "随访检查" : "用药管理"), name: pathway.name, description: pathway.push_content, cadence: pathway.cadence, audience: pathway.audience ? String(pathway.audience).split(/[、,，]/) : ["全部患者"], enabled: pathway.status !== "disabled" }));
  const names = new Set(api.map((item) => item.name));
  return [...api, ...healthRuleSeeds.filter((item) => !names.has(item.name))];
}

function renderHealthRules() {
  const host = $("#healthRuleList"); host.replaceChildren();
  const rules = mergedHealthRules().filter((rule) => rule.category === state.healthCategory);
  rules.forEach((rule) => { const item = el("article", "health-rule"); const copy = el("div"); copy.append(el("h3", "", rule.name), el("p", "", rule.description)); const type = el("div"); type.append(el("small", "", "类型"), el("span", "tag blue", rule.category)); const cadence = el("div"); cadence.append(el("small", "", "触发时间"), el("strong", "", rule.cadence)); const audience = el("div"); audience.append(el("small", "", "适用人群")); const tags = el("div", "tag-row"); rule.audience.slice(0, 2).forEach((value) => tags.append(el("span", `tag ${tagClass(value)}`, value))); audience.append(tags); const actions = el("div", "rule-actions"); const toggle = el("button", `toggle ${rule.enabled ? "on" : ""}`); toggle.type = "button"; toggle.dataset.ruleToggle = rule.id; const edit = el("button", "", "编辑"); edit.type = "button"; edit.dataset.ruleEdit = rule.id; const remove = el("button", "delete", "删除"); remove.type = "button"; remove.dataset.ruleDelete = rule.id; actions.append(toggle, edit, remove); item.append(copy, type, cadence, audience, actions); host.append(item); });
  if (!rules.length) host.append(el("p", "empty-inline", "该分类暂无配置，点击右上角“添加配置”创建。"));
}

function renderDoctors() {
  const query = $("#doctorSearch").value.trim().toLowerCase(); const tbody = $("#doctorTableBody"); tbody.replaceChildren();
  state.doctors.filter((doctor) => !query || `${doctor.name}${doctor.account}`.toLowerCase().includes(query)).forEach((doctor) => { const tr = document.createElement("tr"); const name = el("td"); const patient = el("div", "patient-cell"); const copy = el("div"); copy.append(el("strong", "", doctor.name), el("small", "", doctor.department)); patient.append(el("span", "", doctor.name[0]), copy); name.append(patient); const permissions = el("td"); const tags = el("div", "permission-tags"); doctor.permissions.slice(0, 4).forEach((value) => tags.append(el("span", "tag blue", value))); if (doctor.permissions.length > 4) tags.append(el("span", "tag", `+${doctor.permissions.length - 4}`)); permissions.append(tags); const action = el("td"); const button = el("button", "action-link", "配置权限"); button.type = "button"; button.dataset.permissionDoctor = doctor.id; action.append(button); tr.append(name, el("td", "", doctor.account), el("td", "", doctor.role), permissions, el("td", "", doctor.login), action); tbody.append(tr); });
}

function openPermissionModal(doctorId) {
  const doctor = state.doctors.find((item) => item.id === doctorId); if (!doctor) return;
  state.permissionDoctorId = doctorId; setText("#permissionDoctorName", `配置 ${doctor.name} 的权限`);
  const options = ["查看患者", "编辑患者", "管理知识库", "配置健康管理", "查看不良反应", "管理二维码", "查看统计数据"];
  const host = $("#permissionList"); host.replaceChildren(); options.forEach((permission) => { const label = el("label", "permission-option"); const input = document.createElement("input"); input.type = "checkbox"; input.value = permission; input.checked = doctor.permissions.includes(permission); label.append(input, document.createTextNode(permission)); host.append(label); });
  $("#permissionModal").showModal();
}

function drawQr() {
  const canvas = $("#doctorQrCanvas"); if (!canvas) return; const ctx = canvas.getContext("2d"); const size = 29; const cell = canvas.width / size; ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  const seed = Number(localStorage.getItem("doctor-qr-seed") || 826417);
  const isFinder = (x,y) => (x < 7 && y < 7) || (x >= size-7 && y < 7) || (x < 7 && y >= size-7);
  function drawFinder(ox,oy){ ctx.fillStyle="#122f43"; ctx.fillRect(ox*cell,oy*cell,7*cell,7*cell); ctx.fillStyle="#fff"; ctx.fillRect((ox+1)*cell,(oy+1)*cell,5*cell,5*cell); ctx.fillStyle="#122f43"; ctx.fillRect((ox+2)*cell,(oy+2)*cell,3*cell,3*cell); }
  for(let y=0;y<size;y+=1){for(let x=0;x<size;x+=1){if(isFinder(x,y))continue; const on=Math.abs(simpleHash(`${seed}-${x}-${y}`))%3===0 || ((x*y+seed)%11===0); if(on){ctx.fillStyle="#17374c";ctx.fillRect(Math.floor(x*cell),Math.floor(y*cell),Math.ceil(cell),Math.ceil(cell));}}}
  drawFinder(0,0);drawFinder(size-7,0);drawFinder(0,size-7);
}

function refreshBindCode(notify = true) {
  const value = String(Math.floor(100000 + Math.random() * 900000)); setText("#bindCode", `${value.slice(0,3)} ${value.slice(3)}`); localStorage.setItem("doctor-qr-seed", value); const expiry = new Date(); expiry.setDate(expiry.getDate()+7); setText("#bindCodeExpiry", formatDate(expiry.toISOString())); drawQr(); if (notify) showToast("已生成新的绑定码和二维码");
}

function openModal(id) { document.getElementById(id)?.showModal(); }
function closeModal(dialog) { if (dialog?.open) dialog.close(); }

async function loadManagement() {
  const [knowledgeResponse, pathwaysResponse] = await Promise.all([apiFetch("/api/doctor/knowledge"), apiFetch("/api/doctor/followup-pathways")]);
  if (knowledgeResponse.ok) state.knowledge = (await knowledgeResponse.json()).items || [];
  if (pathwaysResponse.ok) state.pathways = (await pathwaysResponse.json()).pathways || [];
}

async function loadData() {
  $("#pageLoading").hidden = false;
  $$("[data-page]").forEach((page) => { if (page.dataset.page === state.route) page.style.visibility = "hidden"; });
  try {
    const response = await apiFetch("/api/doctor/patients"); const data = await response.json();
    if (!response.ok) throw new Error(data.error || "患者列表加载失败");
    state.patients = data.patients || [];
    const entries = await Promise.all(state.patients.map(async (patient) => { const result = await apiFetch(`/api/doctor/summary?patient_id=${encodeURIComponent(patient.id)}`); const summary = await result.json(); if (!result.ok) throw new Error(summary.error || `${patient.display_name} 数据加载失败`); return [patient.id, summary]; }));
    state.summaries = new Map(entries);
    await loadManagement();
    renderDashboard(); renderPatientTable(); renderAdversePage(); renderKnowledge(); renderHealthRules(); renderDoctors(); refreshBindCode(false);
    if (!state.selectedPatientId && state.patients.length) state.selectedPatientId = state.patients.find((item) => item.id === "P20210705")?.id || state.patients[0].id;
  } catch (error) {
    showToast(error.message);
    $("#pageLoading").replaceChildren(el("i", "ti ti-database-off"), el("span", "", `数据加载失败：${error.message}`));
    return;
  } finally {
    $$("[data-page]").forEach((page) => { page.style.visibility = ""; });
    $("#pageLoading").hidden = true;
  }
}

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) { event.preventDefault(); showRoute(routeButton.dataset.route); }
  const patientButton = event.target.closest("[data-patient-id]");
  if (patientButton) openPatientDetail(patientButton.dataset.patientId, patientButton.dataset.patientTab || "summary");
  const detailTab = event.target.closest("[data-detail-tab]"); if (detailTab) openDetailTab(detailTab.dataset.detailTab);
  const report = event.target.closest("[data-report-id]"); if (report) openReport(report.dataset.reportId);
  const modalButton = event.target.closest("[data-open-modal]"); if (modalButton) { if (modalButton.dataset.openModal === "knowledgeModal") openKnowledgeEditor(); else { if (modalButton.dataset.openModal === "pathwayModal") { const form = $("#pathwayForm"); form.reset(); delete form.dataset.editingId; setText("#pathwayModalTitle", "添加健康管理配置"); } openModal(modalButton.dataset.openModal); } }
  const closeButton = event.target.closest("[data-close-modal]"); if (closeButton) closeModal(closeButton.closest("dialog"));
  const category = event.target.closest("[data-health-category]"); if (category) { state.healthCategory = category.dataset.healthCategory; $$("[data-health-category]").forEach((button) => button.classList.toggle("active", button === category)); renderHealthRules(); }
  const priorityToggle = event.target.closest("[data-priority-toggle]"); if (priorityToggle) { const source = state.prioritySources[Number(priorityToggle.dataset.priorityToggle)]; source.enabled = !source.enabled; renderPrioritySources(); showToast(`${source.team}已${source.enabled ? "启用" : "停用"}`); }
  const priorityMove = event.target.closest("[data-priority-move]"); if (priorityMove) { const index = Number(priorityMove.dataset.index); const target = priorityMove.dataset.priorityMove === "up" ? index - 1 : index + 1; if (target >= 0 && target < state.prioritySources.length) { [state.prioritySources[index], state.prioritySources[target]] = [state.prioritySources[target], state.prioritySources[index]]; renderPrioritySources(); showToast("知识源优先级已调整"); } }
  const ruleToggle = event.target.closest("[data-rule-toggle]"); if (ruleToggle) { const seed = healthRuleSeeds.find((item) => item.id === ruleToggle.dataset.ruleToggle); if (seed) seed.enabled = !seed.enabled; ruleToggle.classList.toggle("on"); showToast("配置状态已更新"); }
  const ruleEdit = event.target.closest("[data-rule-edit]"); if (ruleEdit) { const rule = mergedHealthRules().find((item) => item.id === ruleEdit.dataset.ruleEdit); const form = $("#pathwayForm"); if (rule) { form.reset(); form.dataset.editingId = rule.id; form.elements.name.value = rule.name; form.elements.category.value = rule.category; form.elements.cadence.value = rule.cadence; form.elements.push_content.value = rule.description; form.elements.audience.value = rule.audience.join("、"); setText("#pathwayModalTitle", "编辑健康管理配置"); openModal("pathwayModal"); } }
  const ruleDelete = event.target.closest("[data-rule-delete]"); if (ruleDelete && confirm("确定删除这条健康管理配置吗？")) { const index = healthRuleSeeds.findIndex((item) => item.id === ruleDelete.dataset.ruleDelete); if (index >= 0) healthRuleSeeds.splice(index,1); renderHealthRules(); showToast("配置已删除"); }
  const permission = event.target.closest("[data-permission-doctor]"); if (permission) openPermissionModal(permission.dataset.permissionDoctor);
  const knowledgeView = event.target.closest("[data-knowledge-view]"); if (knowledgeView) { const item = knowledgeById(knowledgeView.dataset.knowledgeView); if (item) window.alert(`${item.title}\n\n分类：${item.category}\n类型：${item.content_type}\n来源：${item.author || item.department || "医生团队"}\n\n${item.summary || "暂无内容摘要"}`); }
  const knowledgeEdit = event.target.closest("[data-knowledge-edit]"); if (knowledgeEdit) openKnowledgeEditor(knowledgeEdit.dataset.knowledgeEdit);
});

document.addEventListener("mouseover", (event) => {
  const cell = event.target.closest("[data-tooltip]"); if (!cell) return; const tip = $("#chartTooltip"); tip.textContent = cell.dataset.tooltip; tip.classList.add("show");
});
document.addEventListener("mousemove", (event) => { const tip = $("#chartTooltip"); if (!tip.classList.contains("show")) return; tip.style.left = `${Math.min(window.innerWidth - 230, event.clientX + 14)}px`; tip.style.top = `${Math.min(window.innerHeight - 100, event.clientY + 14)}px`; });
document.addEventListener("mouseout", (event) => { if (event.target.closest("[data-tooltip]")) $("#chartTooltip").classList.remove("show"); });

$("#patientSearchButton").addEventListener("click", () => { state.patientQuery = $("#patientSearch").value; state.patientPage = 1; renderPatientTable(); });
$("#patientSearch").addEventListener("input", () => { state.patientQuery = $("#patientSearch").value; state.patientPage = 1; renderPatientTable(); });
$("#patientStageFilter").addEventListener("change", () => { state.patientStage = $("#patientStageFilter").value; state.patientPage = 1; renderPatientTable(); });
$("#patientFilterReset").addEventListener("click", () => { $("#patientSearch").value = ""; $("#patientStageFilter").value = ""; state.patientQuery = ""; state.patientStage = ""; state.patientPage = 1; renderPatientTable(); });
$("#patientPrev").addEventListener("click", () => { state.patientPage -= 1; renderPatientTable(); });
$("#patientNext").addEventListener("click", () => { state.patientPage += 1; renderPatientTable(); });
$("#globalSearch").addEventListener("keydown", (event) => { if (event.key !== "Enter") return; $("#patientSearch").value = event.currentTarget.value; state.patientQuery = event.currentTarget.value; state.patientPage = 1; renderPatientTable(); showRoute("patients"); });
$("#dashboardDrugSelect").addEventListener("change", () => renderHeatmap("#dashboardHeatmap", $("#dashboardDrugSelect").value, false));
$("#adverseDrugA").addEventListener("change", renderAdversePage); $("#adverseDrugB").addEventListener("change", renderAdversePage); $("#adversePatientSearch").addEventListener("input", renderAdversePatients);
$("#knowledgeSearch").addEventListener("input", renderKnowledge); $("#knowledgeCategory").addEventListener("change", renderKnowledge); $("#knowledgeType").addEventListener("change", renderKnowledge); $("#doctorSearch").addEventListener("input", renderDoctors);
$("#refreshData").addEventListener("click", async () => { await loadData(); showToast("数据已刷新"); });
$("#addPatientDemo").addEventListener("click", () => showToast("演示版请从患者端注册新患者")); $("#inviteDoctor").addEventListener("click", () => showToast("邀请链接已生成并复制（演示）"));
$("#exportPatient").addEventListener("click", () => { const summary = summaryFor(state.selectedPatientId); if (!summary) return; downloadText(`${summary.patient.display_name}-患者档案.json`, JSON.stringify(summary,null,2), "application/json"); showToast("患者档案已导出"); });
$("#exportAdverse").addEventListener("click", () => { const rows = allAdverseRecords(); const csv = ["患者,症状,等级,日期,关联用药,转归", ...rows.map((item) => [item.patient.display_name,item.name,item.grade,item.onset_date,item.related_treatment,item.outcome].map((value) => `"${String(value || "").replaceAll('"','""')}"`).join(","))].join("\n"); downloadText("不良反应报表.csv", `\ufeff${csv}`, "text/csv"); showToast("不良反应报表已导出"); });

$("#knowledgeForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const payload = Object.fromEntries(new FormData(form).entries()); const editingId = form.dataset.editingId; if (editingId) { const target = state.knowledge.find((item) => String(item.id) === editingId) || knowledgeSeeds.find((item) => String(item.id) === editingId); if (target) Object.assign(target, payload, { author: payload.department, status: "已发布" }); closeModal($("#knowledgeModal")); delete form.dataset.editingId; renderKnowledge(); showToast("知识内容已更新"); return; } const response = await apiFetch("/api/doctor/knowledge", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) { showToast(result.error || "发布失败"); return; } closeModal($("#knowledgeModal")); form.reset(); form.elements.department.value = "乳腺肿瘤科"; await loadManagement(); renderKnowledge(); showToast("知识已发布"); });
$("#pathwayForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); const editingId = form.dataset.editingId; if (editingId) { const target = healthRuleSeeds.find((item) => item.id === editingId); if (target) Object.assign(target, { category:values.category, name:values.name, description:values.push_content, cadence:values.cadence, audience:String(values.audience || "全部患者").split(/[、,，]/) }); state.healthCategory = values.category; closeModal($("#pathwayModal")); delete form.dataset.editingId; renderHealthRules(); showToast("健康管理配置已更新"); return; } const payload = { department: values.department, name: values.name, trigger_rule: values.trigger_rule, cadence: values.cadence, push_content: values.push_content, channel: values.channel, escalation_rule: values.escalation_rule }; const response = await apiFetch("/api/doctor/followup-pathways", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) { showToast(result.error || "保存失败"); return; } healthRuleSeeds.unshift({ id:`LOCAL-${Date.now()}`, category:values.category, name:values.name, description:values.push_content, cadence:values.cadence, audience:String(values.audience || "全部患者").split(/[、,，]/), enabled:true }); state.healthCategory = values.category; $$("[data-health-category]").forEach((button) => button.classList.toggle("active", button.dataset.healthCategory === state.healthCategory)); closeModal($("#pathwayModal")); form.reset(); await loadManagement(); renderHealthRules(); showToast("健康管理配置已保存并启用"); });
$("#savePermissions").addEventListener("click", () => { const doctor = state.doctors.find((item) => item.id === state.permissionDoctorId); if (!doctor) return; doctor.permissions = $$("#permissionList input:checked").map((input) => input.value); closeModal($("#permissionModal")); renderDoctors(); showToast("医生权限已保存"); });

$("#refreshBindCode").addEventListener("click", refreshBindCode); $("#refreshQr").addEventListener("click", refreshBindCode); $("#downloadQr").addEventListener("click", () => { const link = document.createElement("a"); link.download = "王主任-患者绑定二维码.png"; link.href = $("#doctorQrCanvas").toDataURL("image/png"); link.click(); showToast("二维码已下载"); }); $("#printQr").addEventListener("click", () => window.print());

$$("dialog").forEach((dialog) => { dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") $$("dialog[open]").forEach((dialog) => dialog.close()); });

window.addEventListener("hashchange", () => { const route = location.hash.replace("#", ""); if (routeNames[route] && route !== "patient-detail") showRoute(route, { updateHash:false }); });

const initialRoute = routeNames[location.hash.replace("#", "")] ? location.hash.replace("#", "") : "dashboard";
state.route = initialRoute;
showRoute(initialRoute, { updateHash:false });
loadData();
