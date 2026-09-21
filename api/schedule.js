const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const EDIT_PASSWORD = process.env.EDIT_PASSWORD;
const DATA_PATH = "data/schedule.json";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function validateConfig() {
  return OWNER && REPO && TOKEN && EDIT_PASSWORD;
}

function validateSchedule(schedule) {
  if (!schedule || schedule.year !== 2026 || !Array.isArray(schedule.rows)) return false;
  if (schedule.rows.length > 80) return false;

  const allowed = ["date", "commentary", "reading1", "reading2", "accompaniment", "drums"];
  return schedule.rows.every(row => {
    if (!row || typeof row !== "object") return false;
    if (!/^2026-\d{2}-\d{2}$/.test(row.date || "")) return false;
    if (Object.keys(row).some(key => !allowed.includes(key))) return false;
    return allowed.slice(1).every(key => typeof row[key] === "string" && row[key].length <= 20);
  });
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "church-roster",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.json();
}

async function readSchedule() {
  const file = await github(`contents/${DATA_PATH}?ref=${encodeURIComponent(BRANCH)}`);
  const content = Buffer.from(file.content, "base64").toString("utf8");
  return { schedule: JSON.parse(content), sha: file.sha };
}

async function writeSchedule(schedule, sha) {
  const updated = {
    ...schedule,
    updatedAt: new Date().toISOString()
  };

  await github(`contents/${DATA_PATH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update service roster ${updated.updatedAt}`,
      content: Buffer.from(JSON.stringify(updated, null, 2) + "\n", "utf8").toString("base64"),
      sha,
      branch: BRANCH
    })
  });

  return updated;
}

export default async function handler(req, res) {
  if (!validateConfig()) {
    return send(res, 500, { error: "Server configuration is incomplete." });
  }

  if (req.method === "GET") {
    try {
      const { schedule } = await readSchedule();
      return send(res, 200, schedule);
    } catch (error) {
      return send(res, 502, { error: "Unable to read schedule." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  const { action, password, schedule } = req.body || {};
  if (typeof password !== "string" || password !== EDIT_PASSWORD) {
    return send(res, 401, { error: "Invalid password." });
  }

  if (action === "verify") {
    return send(res, 200, { ok: true });
  }

  if (action !== "save" || !validateSchedule(schedule)) {
    return send(res, 400, { error: "Invalid schedule data." });
  }

  try {
    const { sha } = await readSchedule();
    const updated = await writeSchedule(schedule, sha);
    return send(res, 200, updated);
  } catch (error) {
    return send(res, 502, { error: "Unable to save schedule." });
  }
}
