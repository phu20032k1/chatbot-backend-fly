const { GoogleAuth } = require("google-auth-library");

// Minimal, production-safe Google Cloud TTS client (REST)
// - Uses Service Account JSON from env (preferred) OR Application Default Credentials
// - Returns MP3 audio bytes

let _auth = null;

function getApiKey() {
  const direct = String(process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY || "").trim();
  if (direct) return direct;

  // Backward-compat: many people mistakenly paste an API key into GOOGLE_TTS_SERVICE_ACCOUNT_JSON.
  const raw = String(process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON || "").trim();
  if (/^AIza[0-9A-Za-z\-_]{20,}$/.test(raw)) return raw;
  return "";
}

function loadServiceAccountCredentials() {
  const raw = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  // Allow either plain JSON or base64-encoded JSON
  const trimmed = String(raw).trim();
  try {
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
    const buf = Buffer.from(trimmed, "base64");
    return JSON.parse(buf.toString("utf8"));
  } catch (_) {
    return null;
  }
}

function getAuth() {
  if (_auth) return _auth;

  const creds = loadServiceAccountCredentials();
  if (creds) {
    _auth = new GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
    return _auth;
  }

  // Fallback: Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS, metadata server, etc.)
  _auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  return _auth;
}

async function getAccessToken() {
  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse && tokenResponse.token ? tokenResponse.token : tokenResponse;
  if (!token) throw new Error("Unable to obtain Google access token");
  return token;
}

function getFetch() {
  // Node 18+ has global fetch. Keep a fallback for older runtimes.
  if (typeof fetch === "function") return fetch;
  return (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

async function synthesizeOnce({
  text,
  languageCode = "vi-VN",
  voiceName = "vi-VN-Standard-A",
  speakingRate = 1,
  pitch = 0,
  audioEncoding = "MP3"
}) {
  const f = getFetch();

  const apiKey = getApiKey();
  const url = apiKey
    ? `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`
    : "https://texttospeech.googleapis.com/v1/text:synthesize";
  const body = {
    input: { text },
    voice: {
      languageCode,
      name: voiceName
    },
    audioConfig: {
      audioEncoding,
      speakingRate,
      pitch
    }
  };

  const headers = { "Content-Type": "application/json" };
  if (!apiKey) {
    const token = await getAccessToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await f(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const msg = `Google TTS error (HTTP ${res.status}): ${errText || res.statusText}`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }

  const json = await res.json();
  if (!json || !json.audioContent) {
    throw new Error("Google TTS returned empty audioContent");
  }

  return Buffer.from(json.audioContent, "base64");
}

// Split text into chunks that stay well under the ~5000 bytes/request limit.
// This is deliberately conservative to reduce edge cases with multibyte chars.
function chunkText(text, maxBytes = 4200) {
  const s = String(text || "").trim();
  if (!s) return [];

  const chunks = [];
  const parts = s
    .replace(/\r\n/g, "\n")
    .split(/(?<=[\.!?。！？\n])\s+/g)
    .map(p => p.trim())
    .filter(Boolean);

  let current = "";
  for (const p of parts) {
    const candidate = current ? `${current} ${p}` : p;
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    // If a single sentence is too large, hard-split it.
    if (Buffer.byteLength(p, "utf8") > maxBytes) {
      let tmp = "";
      for (const ch of p) {
        const cand2 = tmp + ch;
        if (Buffer.byteLength(cand2, "utf8") > maxBytes) {
          if (tmp) chunks.push(tmp);
          tmp = ch;
        } else {
          tmp = cand2;
        }
      }
      if (tmp) chunks.push(tmp);
      current = "";
    } else {
      current = p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesizeToMp3Buffer(opts) {
  const chunks = chunkText(opts.text);
  if (!chunks.length) return Buffer.alloc(0);

  // MP3 frames can be concatenated; this is a pragmatic approach for web playback.
  const bufs = [];
  for (const t of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const b = await synthesizeOnce({ ...opts, text: t });
    bufs.push(b);
  }
  return Buffer.concat(bufs);
}

module.exports = {
  synthesizeToMp3Buffer,
  chunkText
};
