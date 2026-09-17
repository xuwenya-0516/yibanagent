const welcome = document.querySelector("#welcome");
const messagesElement = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#sendButton");
const clearButton = document.querySelector("#clearButton");
const backToChatButton = document.querySelector("#backToChatButton");
const statusElement = document.querySelector("#status");
const attachButton = document.querySelector("#attachButton");
const fileInput = document.querySelector("#fileInput");
const toast = document.querySelector("#toast");
const dialogBackdrop = document.querySelector("#dialogBackdrop");
const dialogClose = document.querySelector("#dialogClose");
const followupDate = document.querySelector("#followupDate");
const saveFollowup = document.querySelector("#saveFollowup");
const appShell = document.querySelector(".app-shell");
const actionDock = document.querySelector(".action-dock");
const quickTools = document.querySelector("#quickTools");
const brandTitle = document.querySelector("#brandTitle");
const brandSubtitle = document.querySelector("#brandSubtitle");
const patientViews = [...document.querySelectorAll("[data-view]")];
const navButtons = [...document.querySelectorAll("[data-nav]")];
const featureDialogBackdrop = document.querySelector("#featureDialogBackdrop");
const featureDialogClose = document.querySelector("#featureDialogClose");
const featureDialogContent = document.querySelector("#featureDialogContent");
const helpSearch = document.querySelector("#helpSearch");
const taskCounter = document.querySelector("#taskCounter");
const taskFollowup = document.querySelector("#taskFollowup");
const recordFollowup = document.querySelector("#recordFollowup");
const registrationScreen = document.querySelector("#registrationScreen");
const registrationForm = document.querySelector("#registrationForm");
const registrationFiles = document.querySelector("#registrationFiles");
const registrationFileList = document.querySelector("#registrationFileList");
const registrationUpload = document.querySelector("#registrationUpload");
const registrationSubmit = document.querySelector("#registrationSubmit");
const registrationError = document.querySelector("#registrationError");
const patientProfileName = document.querySelector("#patientProfileName");
const patientProfileMeta = document.querySelector("#patientProfileMeta");
const patientProfileAge = document.querySelector("#patientProfileAge");
const patientProfileSex = document.querySelector("#patientProfileSex");
const patientProfileReports = document.querySelector("#patientProfileReports");
const patientProfileCondition = document.querySelector("#patientProfileCondition");
const conversationMedicationRecords = document.querySelector("#conversationMedicationRecords");

const DEMO_TOKEN_KEY = "yiban-demo-access-token-v1";
const inviteToken = new URLSearchParams(window.location.search).get("invite");
if (inviteToken) sessionStorage.setItem(DEMO_TOKEN_KEY, inviteToken);

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(DEMO_TOKEN_KEY);
  if (token) headers.set("X-Demo-Token", token);
  return window.fetch(url, { ...options, headers });
}

const SESSION_MESSAGES_KEY = "yiban-patient-messages-v3";
const FOLLOWUP_KEY = "yiban-followup-date";
const SESSION_CONVERSATION_KEY = "yiban-conversation-id-v2";
const TASKS_KEY = "yiban-health-tasks-v1";
const REPORTS_KEY = "yiban-demo-reports-v1";
const PATIENT_PROFILE_KEY = "yiban-patient-profile-v1";
let patientProfile = loadPatientProfile();
let patientId = patientProfile?.id || null;
let selectedRegistrationFiles = [];
let conversationId = loadConversationId();
let messages = loadMessages();
let controller = null;
let toastTimer = null;
let activeView = "chat";
let medicationRecords = new Map();

const viewMeta = {
  chat: ["乳腺健康助手", "微信健康伙伴"],
  records: ["病程记录本", "个人健康档案"],
  tasks: ["今日任务", "健康计划"],
  help: ["帮助中心", "健康知识与使用说明"],
};

const guides = {
  symptom: {
    user: "我身体不舒服",
    assistant: "我会陪您一起梳理。请先选择最接近的情况，也可以直接在下方详细描述：",
    options: ["发热或发冷", "咳嗽或喉咙痛", "头痛或头晕", "腹痛或恶心", "身体疼痛", "其他不适"],
  },
  medicine: {
    user: "我想查询用药",
    assistant: "请告诉我药品名称，以及您想了解的是用法用量、服用禁忌，还是可能的不良反应。请勿自行增减处方药剂量。",
    options: ["用法用量", "服用禁忌", "药物相互作用", "可能的不良反应"],
  },
  knowledge: {
    user: "我想咨询健康知识",
    assistant: "当然可以。选择一个常见主题，或者直接输入您想了解的健康问题：",
    options: ["血压管理", "血糖管理", "睡眠改善", "健康饮食", "科学运动"],
  },
};

function loadConversationId() {
  const existing = sessionStorage.getItem(SESSION_CONVERSATION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll("-", "");
  sessionStorage.setItem(SESSION_CONVERSATION_KEY, created);
  return created;
}

function loadMessages() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_MESSAGES_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((item) => ["user", "assistant"].includes(item?.role) && typeof item?.content === "string")
      : [];
  } catch {
    return [];
  }
}

function saveMessages() {
  sessionStorage.setItem(SESSION_MESSAGES_KEY, JSON.stringify(messages.slice(-40)));
}

function loadPatientProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PATIENT_PROFILE_KEY) || "null");
    return profile && typeof profile.id === "string" && typeof profile.display_name === "string" ? profile : null;
  } catch { return null; }
}

function createPatientId() {
  return `P${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`.toUpperCase();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizedProfileReports() {
  return Array.isArray(patientProfile?.reports) ? patientProfile.reports : [];
}

function renderPatientProfile() {
  if (!patientProfile) return;
  const reports = normalizedProfileReports();
  patientProfileName.textContent = patientProfile.display_name;
  patientProfileMeta.textContent = `${patientProfile.age} 岁 · ${patientProfile.sex} · 首次登记资料`;
  patientProfileAge.textContent = `${patientProfile.age} 岁`;
  patientProfileSex.textContent = patientProfile.sex;
  patientProfileReports.textContent = `${reports.length} 份`;
  patientProfileCondition.textContent = patientProfile.condition_summary || "尚未填写";
}

function formatRecordTime(value) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderMedicationRecords(records) {
  medicationRecords = new Map((records || []).map((item) => [item.id, item]));
  conversationMedicationRecords.replaceChildren();
  if (!records?.length) {
    const empty = document.createElement("p");
    empty.className = "record-empty";
    empty.textContent = "在聊天中告诉 AI“我最近在用…药”，确认后会整理到这里。";
    conversationMedicationRecords.append(empty);
    return;
  }
  records.forEach((record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-medication-item";
    button.dataset.medicationRecordId = record.id;
    const icon = document.createElement("span");
    icon.className = "medication-record-icon";
    icon.innerHTML = '<i class="ti ti-pill" aria-hidden="true"></i>';
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = record.medication_name;
    const detail = document.createElement("small");
    detail.textContent = `${record.start_time_text}开始使用 · ${formatRecordTime(record.created_at)}`;
    copy.append(title, detail);
    const source = document.createElement("em");
    source.textContent = record.source_label || "患者描述";
    const arrow = document.createElement("i");
    arrow.className = "ti ti-chevron-right";
    button.append(icon, copy, source, arrow);
    conversationMedicationRecords.append(button);
  });
}

async function loadMedicationRecords() {
  if (!patientId || !conversationMedicationRecords) return;
  try {
    const response = await apiFetch(`/api/patient/medication-records?patient_id=${encodeURIComponent(patientId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "用药记录加载失败");
    renderMedicationRecords(payload.records || []);
  } catch (error) {
    conversationMedicationRecords.innerHTML = `<p class="record-empty">${escapeHtml(error.message)}</p>`;
  }
}

function openMedicationTrace(recordId) {
  const record = medicationRecords.get(recordId);
  if (!record) return;
  const trace = (record.source_messages || []).map((message) => `
    <article class="trace-message ${escapeHtml(message.role)}">
      <strong>${message.role === "user" ? "您" : "依伴儿健康助手"}</strong>
      <p>${escapeHtml(message.content)}</p>
      <time>${escapeHtml(formatRecordTime(message.created_at))}</time>
    </article>`).join("");
  openFeatureDialog(`
    <h2 id="featureDialogTitle">用药记录来源</h2>
    <div class="trace-summary"><span>${escapeHtml(record.source_label || "患者描述")}</span><strong>${escapeHtml(record.medication_name)}</strong><p>${escapeHtml(record.start_time_text)}开始使用</p></div>
    <p>以下为该条病历的来源对话，便于您和医生核对：</p>
    <div class="trace-conversation">${trace}</div>
    <button class="report-submit" type="button" data-return-chat-record="${escapeHtml(record.id)}">回到聊天查看</button>`);
}

function showRegistration() {
  registrationScreen.hidden = false;
  appShell.inert = true;
  appShell.setAttribute("aria-hidden", "true");
  document.body.classList.add("registration-open");
  window.setTimeout(() => document.querySelector("#registerName")?.focus(), 50);
}

function hideRegistration() {
  registrationScreen.hidden = true;
  appShell.inert = false;
  appShell.removeAttribute("aria-hidden");
  document.body.classList.remove("registration-open");
}

function openWechatServices() {
  openFeatureDialog(`
    <div class="wechat-services">
      <div class="wechat-services-head">
        <span>微信健康服务</span>
        <strong>您只需要聊天，其他交给我</strong>
        <small>完整功能体验已开启；对话中的重要信息会整理给医生复核。</small>
      </div>
      <div class="wechat-service-grid">
        <button type="button" data-nav="records"><i class="ti ti-file-description"></i><span>病程档案</span></button>
        <button type="button" data-nav="tasks"><i class="ti ti-calendar-heart"></i><span>健康计划</span></button>
        <button type="button" data-nav="help"><i class="ti ti-books"></i><span>科普知识</span></button>
        <button type="button" data-prompt="请通过自然对话帮我完成本次PRO生活质量评估"><i class="ti ti-heart-rate-monitor"></i><span>PRO 评估</span></button>
        <button type="button" data-prompt="我想开始补充乳腺癌骨转移风险预测所需资料"><i class="ti ti-bone"></i><span>骨转移资料</span></button>
        <button type="button" data-prompt="我想了解家属如何协助上传资料和关怀我"><i class="ti ti-users"></i><span>家属协同</span></button>
      </div>
      <p class="wechat-services-note">紧急情况请立即联系医生或拨打 120。AI 不替代医生诊疗。</p>
    </div>`);
}

function renderRegistrationFiles() {
  registrationFileList.replaceChildren();
  selectedRegistrationFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "registration-file-item";
    const icon = document.createElement("i");
    icon.className = `ti ${file.type === "application/pdf" ? "ti-file-type-pdf" : "ti-file-description"}`;
    icon.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = file.name;
    const size = document.createElement("small");
    size.textContent = formatFileSize(file.size);
    copy.append(name, size);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeRegistrationFile = String(index);
    remove.setAttribute("aria-label", `移除 ${file.name}`);
    remove.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    item.append(icon, copy, remove);
    registrationFileList.append(item);
  });
}

function addRegistrationFiles(fileList) {
  const incoming = [...(fileList || [])];
  registrationError.hidden = true;
  for (const file of incoming) {
    if (selectedRegistrationFiles.length >= 10) {
      registrationError.textContent = "最多只能选择 10 份既往报告。";
      registrationError.hidden = false;
      break;
    }
    if (file.size > 20 * 1024 * 1024) {
      registrationError.textContent = `${file.name} 超过 20MB，未添加。`;
      registrationError.hidden = false;
      continue;
    }
    const duplicate = selectedRegistrationFiles.some((item) => item.name === file.name && item.size === file.size);
    if (!duplicate) selectedRegistrationFiles.push(file);
  }
  renderRegistrationFiles();
  registrationFiles.value = "";
}

async function submitRegistration() {
  const formData = new FormData(registrationForm);
  const profileId = patientId || createPatientId();
  const diagnosisDate = String(formData.get("diagnosis_date") || "").trim();
  const currentTreatment = String(formData.get("current_treatment") || "").trim();
  const conditionDetail = String(formData.get("condition_summary") || "").trim();
  const payload = {
    patient_id: profileId,
    display_name: String(formData.get("display_name") || "").trim(),
    age: Number(formData.get("age")),
    sex: String(formData.get("sex") || ""),
    condition_summary: [
      diagnosisDate ? `确诊时间：${diagnosisDate}` : "",
      currentTreatment ? `当前治疗：${currentTreatment}` : "",
      conditionDetail,
    ].filter(Boolean).join("\n"),
    medical_history: String(formData.get("medical_history") || "").trim(),
    reports: selectedRegistrationFiles.map((file) => ({ name: file.name, type: file.type, size: file.size })),
  };

  registrationSubmit.disabled = true;
  registrationError.hidden = true;
  registrationSubmit.querySelector("span").textContent = "正在建立档案…";
  try {
    const response = await apiFetch("/api/patient/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "患者资料保存失败，请稍后再试。");
    patientProfile = result.patient;
    patientId = patientProfile.id;
    localStorage.setItem(PATIENT_PROFILE_KEY, JSON.stringify(patientProfile));
    messages = [];
    sessionStorage.removeItem(SESSION_MESSAGES_KEY);
    sessionStorage.removeItem(SESSION_CONVERSATION_KEY);
    conversationId = loadConversationId();
    renderHistory();
    renderPatientProfile();
    hideRegistration();
    showToast(`欢迎您，${patientProfile.display_name}`);
    promptInput.focus();
  } catch (error) {
    registrationError.textContent = error.message;
    registrationError.hidden = false;
  } finally {
    registrationSubmit.disabled = false;
    registrationSubmit.querySelector("span").textContent = "确认并开始聊天";
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function switchView(nextView, options = {}) {
  if (!viewMeta[nextView]) return;
  activeView = nextView;
  document.body.dataset.activeView = nextView;
  appShell.classList.toggle("section-mode", nextView !== "chat");
  backToChatButton.hidden = nextView === "chat";
  actionDock.hidden = nextView !== "chat";
  patientViews.forEach((view) => { view.hidden = view.dataset.view !== nextView; });
  navButtons.forEach((button) => {
    const selected = button.dataset.nav === nextView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  [brandTitle.textContent, brandSubtitle.textContent] = viewMeta[nextView];
  document.title = `${viewMeta[nextView][0]} · 依伴儿患者端`;
  if (nextView === "tasks") syncTasks();
  if (nextView === "records") {
    syncFollowupLabels();
    loadMedicationRecords();
  }
  if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: "instant" });
  if (options.announce) showToast(`已切换到${viewMeta[nextView][0]}`);
}

function readTaskState() {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || "{}"); }
  catch { return {}; }
}

function syncTasks() {
  const saved = readTaskState();
  const taskInputs = [...document.querySelectorAll("[data-task-id]")];
  taskInputs.forEach((input) => { input.checked = Boolean(saved[input.dataset.taskId]); });
  const done = taskInputs.filter((input) => input.checked).length;
  taskCounter.textContent = `${done}/${taskInputs.length}`;
  syncFollowupLabels();
}

function syncFollowupLabels() {
  const saved = localStorage.getItem(FOLLOWUP_KEY);
  const label = saved || "尚未设置";
  taskFollowup.textContent = label;
  recordFollowup.textContent = saved ? `${saved} · 按医嘱复诊` : "待设置";
}

function openFeatureDialog(content) {
  featureDialogContent.innerHTML = content;
  featureDialogBackdrop.hidden = false;
  featureDialogClose.focus();
}

function closeFeatureDialog() {
  featureDialogBackdrop.hidden = true;
  featureDialogContent.replaceChildren();
}

function getStoredReports() {
  try {
    const stored = JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

function openAdverseHistory() {
  openFeatureDialog(`
    <h2 id="featureDialogTitle">历史不良反应</h2>
    <p>按时间查看曾记录的不适及恢复情况。出现新症状或明显加重时，请及时联系医护人员。</p>
    <div class="modal-list">
      <article><strong>口腔黏膜不适 · Ⅱ级</strong><small>口腔内多发破损，已联系医生处理</small><span>2026-07-01</span></article>
      <article><strong>皮疹 · Ⅰ级</strong><small>面部及躯干轻度红疹，现已缓解</small><span>2026-06-01</span></article>
      <article><strong>乏力 · Ⅰ级</strong><small>轻度乏力，活动后加重，持续观察</small><span>2026-05-10</span></article>
      <article><strong>中性粒细胞减少 · Ⅱ级</strong><small>复查血常规后恢复</small><span>2025-11-01</span></article>
    </div>`);
}

function openReportsList() {
  const registeredReports = normalizedProfileReports().map((report) => ({
    title: report.file_name || report.name || "既往报告",
    summary: report.note || "首次登记时上传的报告文件",
    date: String(report.created_at || "").slice(0, 10),
  }));
  const userReports = [...registeredReports, ...getStoredReports()];
  const defaults = [
    { title: "肝转移灶复查报告", summary: "病灶较前缩小，建议结合临床随访", date: "2026-07-08" },
    { title: "肝穿刺活检报告", summary: "示例病理结果摘要", date: "2026-04-22" },
    { title: "腹部 CT 报告", summary: "新发病灶待进一步评估", date: "2026-04-10" },
    { title: "全身骨显像报告", summary: "骨转移灶稳定", date: "2026-03-05" },
  ];
  const rows = [...userReports, ...defaults].map((report) => `<article><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.summary || "暂无摘要")}</small><span>${escapeHtml(report.date || "未填写日期")}</span></article>`).join("");
  openFeatureDialog(`<h2 id="featureDialogTitle">检查报告列表</h2><p>报告内容仅保存在当前浏览器的演示记录中。</p><div class="modal-list">${rows}</div>`);
}

function openReportUpload() {
  openFeatureDialog(`
    <h2 id="featureDialogTitle">上传检查报告</h2>
    <p>当前演示版保存标题、日期和摘要，不会读取或上传文件内容。</p>
    <form class="report-form" id="reportForm">
      <label class="report-drop"><input id="reportFile" type="file" accept="image/*,.pdf"><span><i class="ti ti-camera-plus" aria-hidden="true"></i>选择报告图片或 PDF<br><small>文件内容不会上传</small></span></label>
      <label>报告标题<input id="reportTitle" required placeholder="如：胸部 CT 报告"></label>
      <label>报告日期<input id="reportDate" type="date" required></label>
      <label>报告摘要<textarea id="reportSummary" placeholder="简要描述报告结论…"></textarea></label>
      <button class="report-submit" type="submit">保存到演示档案</button>
    </form>`);
}

function openTimeline() {
  openFeatureDialog(`
    <h2 id="featureDialogTitle">治疗时间轴</h2>
    <p>按时间整理关键治疗、检查和症状记录，便于复诊时回顾。</p>
    <div class="timeline-list">
      <article><small>2026-07-08</small><strong>疗效评估</strong><p>复查指标趋于稳定，继续按计划随访。</p></article>
      <article><small>2026-06-10</small><strong>不良反应记录</strong><p>血脂异常加重，医护团队调整管理方案。</p></article>
      <article><small>2026-05-25</small><strong>治疗调整</strong><p>根据评估结果调整用药方案。</p></article>
      <article><small>2026-05-16</small><strong>口腔不适</strong><p>记录症状程度并接受对症处理。</p></article>
      <article><small>2026-04-22</small><strong>病理检查</strong><p>完成组织活检，结果纳入后续治疗评估。</p></article>
    </div>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function setStatus(state, label) {
  statusElement.className = `status ${state}`;
  statusElement.querySelector("span").textContent = label;
}

async function checkHealth() {
  try {
    const response = await apiFetch("/api/health");
    const data = await response.json();
    setStatus(data.configured ? "ready" : "error", data.configured ? "健康助手在线" : "等待配置 API Key");
  } catch {
    setStatus("error", "服务未连接");
  }
}

function createMessage(role, content = "", options = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "AI" : "我";

  const body = document.createElement("div");
  body.className = "message-body";
  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = role === "assistant" ? "依伴儿健康助手" : "您";
  const text = document.createElement("div");
  text.className = "message-content";
  text.textContent = content;
  body.append(name, text);

  if (options.length) {
    const optionGroup = document.createElement("div");
    optionGroup.className = "guide-options";
    optionGroup.setAttribute("aria-label", "请选择");
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => {
        optionGroup.querySelectorAll("button").forEach((item) => { item.disabled = true; });
        sendMessage(option);
      });
      optionGroup.append(button);
    });
    body.append(optionGroup);
  }

  article.append(avatar, body);
  messagesElement.append(article);
  return text;
}

function renderInlineProOptions(messageText, followup) {
  if (!messageText || !followup?.options?.length) return;
  const messageBody = messageText.closest(".message-body");
  if (!messageBody || messageBody.querySelector(".inline-pro-options")) return;

  const group = document.createElement("fieldset");
  group.className = "inline-pro-options";
  group.setAttribute("aria-label", followup.question || "请选择最接近的程度");
  const radioName = `pro-${followup.followup_id || crypto.randomUUID()}`;

  followup.options.forEach((option) => {
    const row = document.createElement("label");
    row.className = "inline-pro-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = radioName;
    radio.value = option.value;
    const label = document.createElement("span");
    label.textContent = option.label;
    row.append(radio, label);

    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      group.querySelectorAll("input, button").forEach((item) => { item.disabled = true; });
      row.classList.add("selected");
      const sendWhenReady = () => {
        if (controller) window.setTimeout(sendWhenReady, 50);
        else sendMessage(option.label);
      };
      sendWhenReady();
    });
    group.append(row);
  });

  const skipButton = document.createElement("button");
  skipButton.type = "button";
  skipButton.className = "inline-pro-skip";
  skipButton.textContent = "先不回答，继续聊";
  skipButton.addEventListener("click", () => {
    group.querySelectorAll("input, button").forEach((item) => { item.disabled = true; });
    const sendWhenReady = () => {
      if (controller) window.setTimeout(sendWhenReady, 50);
      else sendMessage("这个问题我想先不回答");
    };
    sendWhenReady();
  });
  group.append(skipButton);

  messageBody.append(group);
  scrollToBottom();
}

function renderMedicationConfirmation(messageText, prompt) {
  if (!messageText || !prompt?.options?.length) return;
  const messageBody = messageText.closest(".message-body");
  if (!messageBody || messageBody.querySelector(".medication-confirm-actions")) return;
  const group = document.createElement("div");
  group.className = "medication-confirm-actions";
  prompt.options.forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === 0 ? "primary" : "secondary";
    button.textContent = label;
    button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach((item) => { item.disabled = true; });
      const sendWhenReady = () => {
        if (controller) window.setTimeout(sendWhenReady, 50);
        else sendMessage(label);
      };
      sendWhenReady();
    });
    group.append(button);
  });
  messageBody.append(group);
  scrollToBottom();
}

function renderInlineBonePrompt(messageText, prompt) {
  const question = prompt?.question;
  if (!messageText || !question) return;
  const messageBody = messageText.closest(".message-body");
  if (!messageBody || messageBody.querySelector(".inline-bone-prompt")) return;

  const group = document.createElement("fieldset");
  group.className = "inline-bone-prompt";
  group.setAttribute("aria-label", question.text || "请补充信息");
  const submitAnswer = (answer) => {
    if (!answer || group.dataset.submitted) return;
    group.dataset.submitted = "true";
    group.querySelectorAll("input, select, button").forEach((item) => { item.disabled = true; });
    const sendWhenReady = () => {
      if (controller) window.setTimeout(sendWhenReady, 50);
      else sendMessage(answer);
    };
    sendWhenReady();
  };

  if (question.input_type === "select" && question.options?.length <= 8) {
    group.classList.add("inline-pro-options");
    const radioName = `bone-${prompt.followup_id || crypto.randomUUID()}`;
    question.options.forEach((option) => {
      const row = document.createElement("label");
      row.className = "inline-pro-option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = radioName;
      radio.value = option.value;
      const label = document.createElement("span");
      label.textContent = option.label;
      row.append(radio, label);
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        row.classList.add("selected");
        submitAnswer(option.label);
      });
      group.append(row);
    });
  } else {
    group.classList.add("inline-structured-input");
    if (question.input_type === "number") {
      const input = document.createElement("input");
      input.type = "number";
      input.min = question.min;
      input.max = question.max;
      input.step = question.step || 1;
      input.placeholder = question.placeholder || "请输入数值";
      const unit = document.createElement("span");
      unit.className = "structured-unit";
      unit.textContent = question.unit || "";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "确认";
      button.addEventListener("click", () => {
        if (!input.value) return;
        submitAnswer(`${input.value}${question.unit || ""}`);
      });
      group.append(input, unit, button);
    } else if (question.input_type === "multi_select") {
      const choices = document.createElement("div");
      choices.className = "structured-checks";
      question.options.forEach((option) => {
        const row = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = option.label;
        row.append(checkbox, document.createTextNode(option.label));
        choices.append(row);
      });
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "确认";
      button.addEventListener("click", () => {
        const selected = [...choices.querySelectorAll("input:checked")].map((item) => item.value);
        if (selected.length) submitAnswer(selected.join("、"));
      });
      group.append(choices, button);
    } else {
      const select = document.createElement("select");
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "请选择";
      select.append(placeholder);
      (question.options || []).forEach((option) => {
        const item = document.createElement("option");
        item.value = option.label;
        item.textContent = option.label;
        select.append(item);
      });
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "确认";
      button.addEventListener("click", () => submitAnswer(select.value));
      group.append(select, button);
    }
  }

  messageBody.append(group);
  scrollToBottom();
}

function renderHistory() {
  messagesElement.replaceChildren();
  welcome.classList.toggle("hidden", messages.length > 0);
  messages.forEach((message) => {
    const restoredOptions = message.options || Object.values(guides).find((guide) => guide.assistant === message.content)?.options || [];
    createMessage(message.role, message.content, restoredOptions);
  });
  requestAnimationFrame(scrollToBottom);
}

function scrollToBottom() {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
}

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 84)}px`;
}

function setGenerating(generating) {
  promptInput.disabled = generating;
  clearButton.disabled = generating;
  sendButton.classList.toggle("stop", generating);
  sendButton.setAttribute("aria-label", generating ? "停止生成" : "发送消息");
  sendButton.innerHTML = generating
    ? '<i class="ti ti-player-stop-filled" aria-hidden="true"></i>'
    : '<i class="ti ti-send-2" aria-hidden="true"></i>';
}

function startGuide(type) {
  if (type === "report") {
    fileInput.click();
    return;
  }
  const guide = guides[type];
  if (!guide || controller) return;
  welcome.classList.add("hidden");
  messages.push({ role: "user", content: guide.user });
  messages.push({ role: "assistant", content: guide.assistant, options: guide.options });
  createMessage("user", guide.user);
  createMessage("assistant", guide.assistant, guide.options);
  saveMessages();
  scrollToBottom();
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content || controller) return;

  welcome.classList.add("hidden");
  messages.push({ role: "user", content });
  createMessage("user", content);
  promptInput.value = "";
  resizeInput();
  const assistantText = createMessage("assistant");
  scrollToBottom();

  controller = new AbortController();
  setGenerating(true);
  let answer = "";

  try {
    const response = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, patient_id: patientId, conversation_id: conversationId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `请求失败（HTTP ${response.status}）`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.delta) {
          answer += event.delta;
          assistantText.textContent = answer;
          scrollToBottom();
        }
        if (event.pro_options) {
          renderInlineProOptions(assistantText, event.pro_options);
        }
        if (event.bone_prompt) {
          renderInlineBonePrompt(assistantText, event.bone_prompt);
        }
        if (event.medication_confirmation) {
          renderMedicationConfirmation(assistantText, event.medication_confirmation);
        }
        if (event.medication_record_saved) {
          loadMedicationRecords();
          showToast("已整理到病历本 · 患者描述");
        }
      }
      if (done) break;
    }

    if (!answer) throw new Error("暂时没有收到回复，请稍后再试。");
    messages.push({ role: "assistant", content: answer });
    saveMessages();
  } catch (error) {
    if (error.name === "AbortError") {
      if (answer) {
        messages.push({ role: "assistant", content: answer });
        saveMessages();
      } else {
        assistantText.closest(".message").remove();
      }
    } else {
      assistantText.classList.add("error");
      assistantText.textContent = error.message;
    }
  } finally {
    controller = null;
    setGenerating(false);
    promptInput.disabled = false;
    promptInput.focus();
    scrollToBottom();
  }
}

function handleFile(file) {
  if (!file) return;
  if (file.size / 1024 / 1024 > 10) {
    showToast("文件不能超过 10MB");
    return;
  }
  welcome.classList.add("hidden");
  const userText = `我选择了报告：${file.name}`;
  const assistantText = "报告已选择。当前版本暂不读取附件内容，请把报告中的关键指标或结论粘贴到输入框，我会帮您逐项解释。";
  messages.push({ role: "user", content: userText }, { role: "assistant", content: assistantText });
  createMessage("user", userText);
  createMessage("assistant", assistantText);
  saveMessages();
  showToast("报告已添加");
  promptInput.placeholder = "粘贴报告中的关键指标或结论…";
  promptInput.focus();
  scrollToBottom();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  if (controller) controller.abort();
  else sendMessage(promptInput.value);
});

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  submitRegistration();
});
registrationFiles.addEventListener("change", () => addRegistrationFiles(registrationFiles.files));
registrationFileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-registration-file]");
  if (!button) return;
  selectedRegistrationFiles.splice(Number(button.dataset.removeRegistrationFile), 1);
  renderRegistrationFiles();
});
registrationUpload.addEventListener("dragover", (event) => {
  event.preventDefault();
  registrationUpload.classList.add("dragging");
});
registrationUpload.addEventListener("dragleave", () => registrationUpload.classList.remove("dragging"));
registrationUpload.addEventListener("drop", (event) => {
  event.preventDefault();
  registrationUpload.classList.remove("dragging");
  addRegistrationFiles(event.dataTransfer.files);
});

promptInput.addEventListener("input", resizeInput);

// 让底部快捷入口在触屏和桌面端都能自然地横向浏览。
let quickToolsDrag = null;
let suppressQuickToolClick = false;
quickTools?.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  quickToolsDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    scrollLeft: quickTools.scrollLeft,
    moved: false,
  };
  quickTools.setPointerCapture(event.pointerId);
  quickTools.classList.add("is-dragging");
});
quickTools?.addEventListener("pointermove", (event) => {
  if (!quickToolsDrag || event.pointerId !== quickToolsDrag.pointerId) return;
  const delta = event.clientX - quickToolsDrag.startX;
  if (Math.abs(delta) > 4) quickToolsDrag.moved = true;
  if (quickToolsDrag.moved) quickTools.scrollLeft = quickToolsDrag.scrollLeft - delta;
});
function finishQuickToolsDrag(event) {
  if (!quickToolsDrag || event.pointerId !== quickToolsDrag.pointerId) return;
  suppressQuickToolClick = quickToolsDrag.moved;
  if (suppressQuickToolClick) window.setTimeout(() => { suppressQuickToolClick = false; }, 0);
  quickToolsDrag = null;
  quickTools.classList.remove("is-dragging");
}
quickTools?.addEventListener("pointerup", finishQuickToolsDrag);
quickTools?.addEventListener("pointercancel", finishQuickToolsDrag);
quickTools?.addEventListener("click", (event) => {
  if (!suppressQuickToolClick) return;
  event.preventDefault();
  event.stopPropagation();
  suppressQuickToolClick = false;
}, true);
quickTools?.addEventListener("wheel", (event) => {
  if (quickTools.scrollWidth <= quickTools.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  quickTools.scrollLeft += delta;
  event.preventDefault();
}, { passive: false });

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

clearButton.addEventListener("click", () => {
  messages = [];
  sessionStorage.removeItem(SESSION_MESSAGES_KEY);
  sessionStorage.removeItem(SESSION_CONVERSATION_KEY);
  conversationId = loadConversationId();
  renderHistory();
  promptInput.placeholder = "输入您的问题…";
  promptInput.focus();
  showToast("对话已清空");
});

document.addEventListener("click", (event) => {
  const guideButton = event.target.closest("[data-guide]");
  const promptButton = event.target.closest("[data-prompt]");
  const actionButton = event.target.closest("[data-action]");
  const navButton = event.target.closest("[data-nav]");
  const recordButton = event.target.closest("[data-record-action]");
  const helpPromptButton = event.target.closest("[data-help-prompt]");
  const medicationRecordButton = event.target.closest("[data-medication-record-id]");
  const returnChatButton = event.target.closest("[data-return-chat-record]");
  if (guideButton) startGuide(guideButton.dataset.guide);
  if (promptButton) {
    if (promptButton.closest("#featureDialogBackdrop")) closeFeatureDialog();
    sendMessage(promptButton.dataset.prompt);
  }
  if (actionButton?.dataset.action === "services") openWechatServices();
  if (actionButton?.dataset.action === "voice") showToast("微信语音输入模拟：请直接输入您想说的内容");
  if (actionButton?.dataset.action === "followup") {
    const saved = localStorage.getItem(FOLLOWUP_KEY);
    if (saved) followupDate.value = saved;
    dialogBackdrop.hidden = false;
    followupDate.focus();
  }
  if (actionButton?.dataset.action === "records") switchView("records", { announce: true });
  if (navButton) {
    switchView(navButton.dataset.nav);
    if (navButton.closest("#featureDialogBackdrop")) closeFeatureDialog();
  }
  if (recordButton?.dataset.recordAction === "adverse") openAdverseHistory();
  if (recordButton?.dataset.recordAction === "reports") openReportsList();
  if (recordButton?.dataset.recordAction === "upload") openReportUpload();
  if (recordButton?.dataset.recordAction === "timeline") openTimeline();
  if (helpPromptButton) {
    switchView("chat");
    sendMessage(helpPromptButton.dataset.helpPrompt);
  }
  if (medicationRecordButton) openMedicationTrace(medicationRecordButton.dataset.medicationRecordId);
  if (returnChatButton) {
    const record = medicationRecords.get(returnChatButton.dataset.returnChatRecord);
    closeFeatureDialog();
    switchView("chat");
    const sourceText = record?.source_messages?.find((item) => item.role === "user")?.content;
    const target = [...document.querySelectorAll(".message.user .message-content")]
      .find((item) => item.textContent === sourceText);
    if (target) {
      target.closest(".message").classList.add("source-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.closest(".message")?.classList.remove("source-highlight"), 2600);
    } else {
      showToast("该记录来自之前的对话，已在来源窗口完整展示");
    }
  }
});

backToChatButton.addEventListener("click", () => switchView("chat"));

document.addEventListener("change", (event) => {
  const taskInput = event.target.closest("[data-task-id]");
  if (!taskInput) return;
  const state = readTaskState();
  state[taskInput.dataset.taskId] = taskInput.checked;
  localStorage.setItem(TASKS_KEY, JSON.stringify(state));
  syncTasks();
  showToast(taskInput.checked ? "任务已完成" : "任务已恢复");
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "reportForm") return;
  event.preventDefault();
  const title = document.querySelector("#reportTitle").value.trim();
  const date = document.querySelector("#reportDate").value;
  const summary = document.querySelector("#reportSummary").value.trim();
  if (!title || !date) return;
  const reports = getStoredReports();
  reports.unshift({ title, date, summary });
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, 10)));
  closeFeatureDialog();
  showToast("报告信息已保存到演示档案");
});

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  handleFile(fileInput.files?.[0]);
  fileInput.value = "";
});

function closeDialog() { dialogBackdrop.hidden = true; }
dialogClose.addEventListener("click", closeDialog);
dialogBackdrop.addEventListener("click", (event) => { if (event.target === dialogBackdrop) closeDialog(); });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeDialog();
  closeFeatureDialog();
});
saveFollowup.addEventListener("click", () => {
  if (!followupDate.value) {
    showToast("请先选择复诊日期");
    return;
  }
  localStorage.setItem(FOLLOWUP_KEY, followupDate.value);
  closeDialog();
  syncFollowupLabels();
  showToast(`已设置 ${followupDate.value} 的复诊提醒`);
});

featureDialogClose.addEventListener("click", closeFeatureDialog);
featureDialogBackdrop.addEventListener("click", (event) => { if (event.target === featureDialogBackdrop) closeFeatureDialog(); });

helpSearch.addEventListener("input", () => {
  const query = helpSearch.value.trim().toLowerCase();
  document.querySelectorAll(".faq-item, .knowledge-card > button").forEach((item) => {
    item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query);
  });
});

navButtons.forEach((button, index) => {
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = navButtons[(index + direction + navButtons.length) % navButtons.length];
    next.focus();
    switchView(next.dataset.nav);
  });
});

renderHistory();
resizeInput();
checkHealth();
switchView("chat", { preserveScroll: true });
if (patientProfile) {
  renderPatientProfile();
  loadMedicationRecords();
  hideRegistration();
} else {
  showRegistration();
}
