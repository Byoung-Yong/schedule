const state = {
  schedule: null,
  original: null,
  editing: false,
  password: "",
  serverAvailable: false,
  localMode: false
};

const body = document.getElementById("scheduleBody");
const editButton = document.getElementById("editButton");
const saveButton = document.getElementById("saveButton");
const cancelButton = document.getElementById("cancelButton");
const statusMessage = document.getElementById("statusMessage");
const updatedText = document.getElementById("updatedText");
const nextScheduleDate = document.getElementById("nextScheduleDate");
const nextScheduleStatus = document.getElementById("nextScheduleStatus");
const nextScheduleAssigned = document.getElementById("nextScheduleAssigned");
const passwordDialog = document.getElementById("passwordDialog");
const passwordForm = document.getElementById("passwordForm");
const passwordInput = document.getElementById("passwordInput");
const passwordError = document.getElementById("passwordError");
const dialogClose = document.getElementById("dialogClose");

const fields = ["commentary", "reading1", "reading2", "accompaniment", "drums"];
const fieldLabels = {
  commentary: "해설",
  reading1: "1독서",
  reading2: "2독서",
  accompaniment: "반주",
  drums: "드럼"
};

function kstTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function rowStatus(date) {
  const today = kstTodayISO();
  if (date < today) return "past";
  if (date === today) return "today";
  return "future";
}

function formatDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatLongDate(date) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(new Date(`${date}T12:00:00+09:00`));
  } catch {
    return formatDate(date);
  }
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[ch]);
}

function assignedCount(row) {
  return fields.reduce((count, field) => count + ((row[field] || "").trim() ? 1 : 0), 0);
}

function findNextRow(rows) {
  const today = kstTodayISO();
  return rows.find(row => row.date >= today) || null;
}

function updateNextSchedulePanel() {
  if (!state.schedule?.rows?.length) {
    nextScheduleDate.textContent = "일정 없음";
    nextScheduleStatus.textContent = "-";
    nextScheduleAssigned.textContent = "-";
    return;
  }

  const nextRow = findNextRow(state.schedule.rows);
  if (!nextRow) {
    nextScheduleDate.textContent = "향후 일정 없음";
    nextScheduleStatus.textContent = "완료";
    nextScheduleAssigned.textContent = `0 / ${fields.length}`;
    return;
  }

  const status = rowStatus(nextRow.date);
  const assigned = assignedCount(nextRow);

  nextScheduleDate.textContent = formatLongDate(nextRow.date);
  nextScheduleStatus.textContent = status === "today" ? "오늘" : "예정";
  nextScheduleAssigned.textContent = `${assigned} / ${fields.length}`;
}

function render() {
  if (!state.schedule) return;

  body.innerHTML = state.schedule.rows.map((row, rowIndex) => {
    const status = rowStatus(row.date);
    const valueCells = fields.map(field => {
      const value = row[field] || "";
      if (state.editing) {
        return `<td><input class="cell-input" data-row="${rowIndex}" data-field="${field}" value="${escapeText(value)}" aria-label="${formatDate(row.date)} ${fieldLabels[field]}" maxlength="20" /></td>`;
      }
      return value
        ? `<td>${escapeText(value)}</td>`
        : `<td class="empty-cell">미정</td>`;
    }).join("");

    return `
      <tr class="${status}">
        <td class="date-cell"><span class="date-line"><i class="row-dot" aria-hidden="true"></i>${formatDate(row.date)}</span></td>
        ${valueCells}
      </tr>`;
  }).join("");

  editButton.classList.toggle("hidden", state.editing);
  saveButton.classList.toggle("hidden", !state.editing);
  cancelButton.classList.toggle("hidden", !state.editing);

  if (state.schedule.updatedAt) {
    const dt = new Date(state.schedule.updatedAt);
    const formatted = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(dt);
    updatedText.textContent = state.localMode
      ? `GitHub Pages · 기준 데이터 ${formatted}`
      : `마지막 수정 ${formatted}`;
  } else {
    updatedText.textContent = state.localMode ? "GitHub Pages · 읽기 전용" : "초기 일정";
  }

  updateNextSchedulePanel();
}

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message${type ? ` ${type}` : ""}`;
}

async function loadSchedule() {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) throw new Error("server_unavailable");
    state.schedule = await response.json();
    state.serverAvailable = true;
    state.localMode = false;
    state.original = structuredClone(state.schedule);
    render();
    setStatus("");
    return;
  } catch (_) {
    state.serverAvailable = false;
    state.localMode = true;
  }

  try {
    const response = await fetch("../data/schedule.json", { cache: "no-store" });
    if (!response.ok) throw new Error("fallback_load_failed");
    state.schedule = await response.json();
    state.original = structuredClone(state.schedule);
    render();
    setStatus("");
  } catch {
    setStatus("일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    updatedText.textContent = "불러오기 실패";
    nextScheduleDate.textContent = "불러오기 실패";
    nextScheduleStatus.textContent = "-";
    nextScheduleAssigned.textContent = "-";
  }
}

editButton.addEventListener("click", () => {
  passwordError.textContent = "";
  passwordInput.value = "";
  passwordDialog.showModal();
  requestAnimationFrame(() => passwordInput.focus());
});

dialogClose.addEventListener("click", () => passwordDialog.close());

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  passwordError.textContent = "";

  if (!state.serverAvailable) {
    passwordError.textContent = "현재 GitHub Pages는 읽기 전용입니다. 서버 배포 주소에서 수정할 수 있습니다.";
    return;
  }

  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", password })
    });
    if (response.status === 401) {
      passwordError.textContent = "비밀번호가 맞지 않습니다.";
      return;
    }
    if (!response.ok) throw new Error("verify_failed");

    state.password = password;
    state.editing = true;
    state.original = structuredClone(state.schedule);
    passwordDialog.close();
    render();
    setStatus("수정 모드입니다. 변경 후 저장을 눌러 주세요.");
  } catch {
    passwordError.textContent = "인증 중 오류가 발생했습니다.";
  }
});

body.addEventListener("input", (event) => {
  const input = event.target.closest(".cell-input");
  if (!input || !state.editing) return;
  const rowIndex = Number(input.dataset.row);
  const field = input.dataset.field;
  state.schedule.rows[rowIndex][field] = input.value.trimStart();
  updateNextSchedulePanel();
});

cancelButton.addEventListener("click", () => {
  state.schedule = structuredClone(state.original);
  state.editing = false;
  state.password = "";
  render();
  setStatus("변경 내용을 취소했습니다.");
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  cancelButton.disabled = true;
  setStatus("저장 중입니다.");

  const cleanedRows = state.schedule.rows.map(row => {
    const next = { ...row };
    for (const field of fields) next[field] = String(next[field] || "").trim();
    return next;
  });

  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        password: state.password,
        schedule: { ...state.schedule, rows: cleanedRows }
      })
    });

    if (response.status === 401) {
      state.editing = false;
      state.password = "";
      render();
      setStatus("인증이 만료되었습니다. 다시 일정 수정 버튼을 눌러 주세요.", "error");
      return;
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || "save_failed");
    }

    state.schedule = await response.json();
    state.original = structuredClone(state.schedule);
    state.editing = false;
    state.password = "";
    render();
    setStatus("일정을 저장했습니다.", "success");
  } catch {
    setStatus("저장하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.", "error");
  } finally {
    saveButton.disabled = false;
    cancelButton.disabled = false;
  }
});

loadSchedule();
