const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz-TupHS6DtNujTKqegisnEtaf_y1Aeck9XMHMKXfzVuLwUIoKzs0ax7OqL15Ow0K36/exec";

function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Google Apps Script returned invalid JSON.");
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const response = await fetch(`${WEB_APP_URL}?resource=schedule&_=${Date.now()}`, {
        redirect: "follow",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Google Apps Script GET failed: ${response.status}`);
      const data = await readJson(response);
      if (data && data.error) throw new Error(data.error);
      return send(res, 200, data);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const response = await fetch(WEB_APP_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...body, resource: "schedule" })
      });
      if (!response.ok) throw new Error(`Google Apps Script POST failed: ${response.status}`);
      const data = await readJson(response);
      if (data && data.error) {
        const status = Number(data.status) || 500;
        return send(res, status, { error: data.error });
      }
      return send(res, 200, data);
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: "Google Sheet connection failed." });
  }
}
