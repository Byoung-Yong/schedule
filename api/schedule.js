import { getCache } from "@vercel/functions";

const OWNER = "Byoung-Yong";
const REPO = "schedule";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || "maria1004";
const DATA_PATH = "data/schedule.json";
const CACHE_KEY = "church-roster:schedule:v1";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readCachedSchedule() {
  try {
    return await getCache().get(CACHE_KEY);
  } catch (error) {
    console.error("Runtime cache read failed:", error);
    return null;
  }
}

async function writeCachedSchedule(schedule) {
  await getCache().set(CACHE_KEY, schedule, {
    tags: ["church-roster", "schedule"]
  });
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
  await githubWrite(`contents/${DATA_PATH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update service roster ${schedule.updatedAt}`,
      content: Buffer.from(JSON.stringify(schedule, null, 2) + "\n", "utf8").toString("base64"),
      sha,
      branch: BRANCH
    })
  });

  return schedule;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const cached = await readCachedSchedule();
      if (cached) return send(res, 200, cached);

      const { schedule } = await readSchedule();
      try {
        await writeCachedSchedule(schedule);
      } catch (error) {
        console.error("Runtime cache seed failed:", error);
      }
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
    return send(res, 200, { ok: true });
  }

  if (action !== "save" || !validateSchedule(schedule)) {
    return send(res, 400, { error: "Invalid schedule data." });
  }

  try {
    const updated = {
      ...schedule,
      updatedAt: new Date().toISOString()
    };

    await writeCachedSchedule(updated);

    if (TOKEN) {
      try {
        const { sha } = await readSchedule();
        await writeSchedule(updated, sha);
      } catch (error) {
        console.error("GitHub backup failed:", error);
      }
    }

    return send(res, 200, updated);
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: "Unable to save schedule." });
  }
}
