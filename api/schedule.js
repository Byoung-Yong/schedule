const OWNER = "Byoung-Yong";
const REPO = "schedule";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || "maria1004";
const DATA_PATH = "data/schedule.json";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
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

async function githubRead(path) {
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "church-roster"
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
      "User-Agent": "church-roster",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub write ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.json();
}

async function readSchedule() {
  const file = await githubRead(`contents/${DATA_PATH}?ref=${encodeURIComponent(BRANCH)}`);
  const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { schedule: JSON.parse(content), sha: file.sha };
}

async function writeSchedule(schedule, sha) {
  const updated = {
    ...schedule,
    updatedAt: new Date().toISOString()
  };

  await githubWrite(`contents/${DATA_PATH}`, {
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
  if (req.method === "GET") {
    try {
      const { schedule } = await readSchedule();
      return send(res, 200, schedule);
    } catch (error) {
      console.error(error);
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
    if (!TOKEN) return send(res, 503, { error: "GITHUB_TOKEN is not configured." });
    return send(res, 200, { ok: true });
  }

  if (action !== "save" || !validateSchedule(schedule)) {
    return send(res, 400, { error: "Invalid schedule data." });
  }

  if (!TOKEN) {
    return send(res, 503, { error: "GITHUB_TOKEN is not configured." });
  }

  try {
    const { sha } = await readSchedule();
    const updated = await writeSchedule(schedule, sha);
    return send(res, 200, updated);
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: "Unable to save schedule." });
  }
}
