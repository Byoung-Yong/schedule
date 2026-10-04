const SPREADSHEET_ID = "1ySCV4FFG10ghLi8nhYOwq9PpUSqWcm3fxByfaK4qxvQ";
const EDIT_PASSWORD = "maria1004";
const SCHEDULE_SHEET = "Schedule";
const ATTENDANCE_SHEET = "Attendance";

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const resource = String((e && e.parameter && e.parameter.resource) || "").toLowerCase();
    if (resource === "schedule") return json_(readSchedule_());
    if (resource === "attendance") return json_(readAttendance_());
    return json_({ error: "Unknown resource." });
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.password !== EDIT_PASSWORD) return json_({ error: "Invalid password.", status: 401 });

    if (body.action === "verify") return json_({ ok: true });

    if (body.resource === "schedule" && body.action === "save") {
      writeSchedule_(body.schedule);
      return json_(readSchedule_());
    }

    if (body.resource === "attendance" && body.action === "save") {
      writeAttendance_(body.attendance);
      return json_(readAttendance_());
    }

    return json_({ error: "Invalid request.", status: 400 });
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err), status: 500 });
  }
}

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function parseDateLabel_(label) {
  const m = String(label || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) throw new Error("Invalid date label: " + label);
  return "2026-" + String(Number(m[1])).padStart(2, "0") + "-" + String(Number(m[2])).padStart(2, "0");
}

function shortDate_(iso) {
  const p = String(iso).split("-");
  return Number(p[1]) + "/" + Number(p[2]);
}

function readSchedule_() {
  const sh = ss_().getSheetByName(SCHEDULE_SHEET);
  if (!sh) throw new Error("Schedule sheet not found.");

  const values = sh.getDataRange().getDisplayValues();
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const first = String(r[0] || "").trim();
    if (!first || /월$/.test(first)) continue;
    if (!/^\d{1,2}\/\d{1,2}$/.test(first)) continue;

    rows.push({
      date: parseDateLabel_(first),
      commentary: String(r[1] || "").trim() === "미정" ? "" : String(r[1] || "").trim(),
      reading1: String(r[2] || "").trim() === "미정" ? "" : String(r[2] || "").trim(),
      reading2: String(r[3] || "").trim() === "미정" ? "" : String(r[3] || "").trim(),
      accompaniment: String(r[4] || "").trim() === "미정" ? "" : String(r[4] || "").trim(),
      drums: String(r[5] || "").trim() === "미정" ? "" : String(r[5] || "").trim()
    });
  }

  return {
    year: 2026,
    rows,
    updatedAt: new Date().toISOString()
  };
}

function writeSchedule_(data) {
  if (!data || data.year !== 2026 || !Array.isArray(data.rows)) throw new Error("Invalid schedule data.");

  const sh = ss_().getSheetByName(SCHEDULE_SHEET);
  if (!sh) throw new Error("Schedule sheet not found.");

  const rowByDate = {};
  const values = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < values.length; i++) {
    const first = String(values[i][0] || "").trim();
    if (/^\d{1,2}\/\d{1,2}$/.test(first)) rowByDate[parseDateLabel_(first)] = i + 1;
  }

  data.rows.forEach(item => {
    const row = rowByDate[item.date];
    if (!row) return;
    sh.getRange(row, 2, 1, 5).setValues([[
      item.commentary || "미정",
      item.reading1 || "미정",
      item.reading2 || "미정",
      item.accompaniment || "미정",
      item.drums || "미정"
    ]]);
  });
}

function readAttendance_() {
  const sh = ss_().getSheetByName(ATTENDANCE_SHEET);
  if (!sh) throw new Error("Attendance sheet not found.");

  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) return { year: 2026, dates: [], rows: [], updatedAt: new Date().toISOString() };

  const dates = values[0].slice(3).filter(Boolean).map(parseDateLabel_);
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const name = String(r[1] || "").trim();
    if (!name) continue;

    rows.push({
      number: rows.length + 1,
      name,
      baptismal: String(r[2] || "").trim(),
      attendance: dates.map((_, j) => {
        const v = String(r[j + 3] || "").trim().toLowerCase();
        return v === "green" || v === "yellow" ? v : "";
      })
    });
  }

  return {
    year: 2026,
    dates,
    rows,
    updatedAt: new Date().toISOString()
  };
}

function writeAttendance_(data) {
  if (!data || data.year !== 2026 || !Array.isArray(data.dates) || !Array.isArray(data.rows)) {
    throw new Error("Invalid attendance data.");
  }

  const sh = ss_().getSheetByName(ATTENDANCE_SHEET);
  if (!sh) throw new Error("Attendance sheet not found.");

  const width = 3 + data.dates.length;
  const output = [[
    "번호",
    "이름",
    "세례명",
    ...data.dates.map(shortDate_)
  ]];

  data.rows.forEach((r, i) => {
    output.push([
      i + 1,
      r.name || "",
      r.baptismal || "",
      ...data.dates.map((_, j) => {
        const v = r.attendance && r.attendance[j];
        return v === "green" || v === "yellow" ? v : "";
      })
    ]);
  });

  sh.clearContents();
  sh.getRange(1, 1, output.length, width).setValues(output);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
}
