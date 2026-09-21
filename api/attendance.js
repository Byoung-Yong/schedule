const OWNER = "Byoung-Yong";
const REPO = "schedule";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || "maria1004";
const DATA_PATH = "data/attendance.json";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function validateAttendance(data) {
  if (!data || data.year !== 2026 || !Array.isArray(data.dates) || !Array.isArray(data.rows)) return false;
  if (data.dates.length > 40 || data.rows.length > 80) return false;
  if (!data.dates.every(d => /^2026-\d{2}-\d{2}$/.test(d))) return false;

  return data.rows.every((row, i) => {
    if (!row || typeof row !== "object") return false;
    if (row.number !== i + 1) return false;
    if (typeof row.name !== "string" || row.name.length > 20) return false;
    if (typeof row.baptismal !== "string" || row.baptismal.length > 20) return false;
    if (!Array.isArray(row.attendance) || row.attendance.length !== data.dates.length) return false;
    return row.attendance.every(v =>
      typeof v === "string" && (v === "" || v === "green" || v === "yellow")
    );
  });
}

async function githubRead(path) {
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "church-attendance"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub read ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.json();
}

async function githubWrite(path, options = {}) {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not configured.");

  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "church-attendance",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub write ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.json();
}

async function readAttendance() {
  const file = await githubRead(`contents/${DATA_PATH}?ref=${encodeURIComponent(BRANCH)}`);
  const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { data: JSON.parse(content), sha: file.sha };
}

async function writeAttendance(data, sha) {
  const updated = { ...data, updatedAt: new Date().toISOString() };

  await githubWrite(`contents/${DATA_PATH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update attendance ${updated.updatedAt}`,
      content: Buffer.from(JSON.stringify(updated, null, 2) + "\n", "utf8").toString("base64"),
      sha,
      branch: BRANCH
    })
  });

  return updated;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { data } = await readAttendance();
      return send(res, 200, data);
    } catch (error) {
      console.error(error);
      return send(res, 502, { error: "Unable to read attendance." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const { action, password, attendance } = req.body || {};
  if (typeof password !== "string" || password !== EDIT_PASSWORD) {
    return send(res, 401, { error: "Invalid password." });
  }

  if (action === "verify") {
    if (!TOKEN) return send(res, 503, { error: "GITHUB_TOKEN is not configured." });
    return send(res, 200, { ok: true });
  }

  if (action !== "save" || !validateAttendance(attendance)) {
    return send(res, 400, { error: "Invalid attendance data." });
  }

  if (!TOKEN) {
    return send(res, 503, { error: "GITHUB_TOKEN is not configured." });
  }

  try {
    const { sha } = await readAttendance();
    const updated = await writeAttendance(attendance, sha);
    return send(res, 200, updated);
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: "Unable to save attendance." });
  }
}
