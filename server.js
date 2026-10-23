// ============================================================
// SERVIDOR EDGE TTS — Audiolibros Diego
// Gratis en Render (https://render.com)
// ============================================================
// Este servidor recibe texto desde tu página web y devuelve
// audio MP3 generado con las voces neurales de Microsoft Edge.
// No necesita API key ni tarjeta de crédito.
//
// Usa el paquete "node-edge-tts" que sí funciona correctamente
// (a diferencia de "msedge-tts" que falla por rate limiting).
// ============================================================

import express from "express";
import cors from "cors";
import crypto from "crypto";
import WebSocket from "ws";

const app = express();

// Permitir que cualquier página web use este servidor (CORS abierto)
app.use(cors());

// Aceptar JSON grande (párrafos largos de libros)
app.use(express.json({ limit: "10mb" }));


// ------------------------------------------------------------
// Cliente Edge TTS propio (protocolo actual de Microsoft, igual
// al de la librería Python edge-tts 7.x): Sec-MS-GEC-Version "2-",
// cookie muid y ConnectionId.
// ------------------------------------------------------------
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM = "143.0.3650.75";
const MAJOR = CHROMIUM.split(".")[0];
const WSS = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" + TOKEN;

function secMsGec() {
  const ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  return crypto.createHash("sha256").update(`${rounded}${TOKEN}`, "ascii").digest("hex").toUpperCase();
}
const uuid = () => crypto.randomUUID().replace(/-/g, "");
const jsDate = () => new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
const esc = (s) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

function edgeSynth({ text, voice, lang, rate, pitch, volume, timeout = 45000 }) {
  return new Promise((resolve, reject) => {
    const url = `${WSS}&ConnectionId=${uuid()}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=2-${CHROMIUM}`;
    const ws = new WebSocket(url, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`
      },
      perMessageDeflate: true
    });
    const chunks = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch (_) {}
      if (err) return reject(err);
      const buf = Buffer.concat(chunks);
      if (buf.length < 100) return reject(new Error("Audio generado vacío o demasiado corto"));
      resolve(buf);
    };
    const timer = setTimeout(() => finish(new Error("Timeout esperando audio de Edge TTS")), timeout);

    ws.on("unexpected-response", (req, res) => finish(new Error("Unexpected server response: " + res.statusCode)));
    ws.on("error", (e) => finish(e));
    ws.on("close", () => finish(new Error("Conexión cerrada antes de terminar el audio")));

    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${jsDate()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${esc(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${jsDate()}Z\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const s = data.toString();
        if (s.includes("Path:turn.end")) finish(null);
        return;
      }
      if (data.length < 2) return;
      const headLen = data.readUInt16BE(0);
      const head = data.subarray(2, 2 + headLen).toString();
      if (head.includes("Path:audio")) chunks.push(data.subarray(2 + headLen));
    });
  });
}

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Ruta raíz: evita el "Cannot GET /" al abrir la URL en el navegador
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Edge TTS Server - Audiolibros Diego",
    endpoints: ["/health", "POST /api/tts"]
  });
});

// ------------------------------------------------------------
// Ruta de salud: para verificar que el servidor está vivo
// Visita https://TU-APP.onrender.com/health en el navegador
// ------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Edge TTS Server - Audiolibros Diego",
    version: "2.2.0",
    engine: "edge-tts-directo",
    timestamp: new Date().toISOString()
  });
});

// ------------------------------------------------------------
// Ruta principal: POST /api/tts
// Body: { text, voice, rate, pitch, volume }
// Devuelve: audio MP3 directamente
// ------------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  try {
    const {
      text,
      voice = "es-MX-JorgeNeural",
      rate = "+0%",
      pitch = "+0Hz",
      volume = "+0%"
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Falta el texto a sintetizar" });
    }

    // Validar que la voz tenga formato correcto (es-XX-NameNeural)
    if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(voice)) {
      return res.status(400).json({ error: "ID de voz inválido" });
    }

    // Extraer lang del voice (ej: "es-MX-JorgeNeural" → "es-MX")
    const lang = voice.split("-").slice(0, 2).join("-");

    const buffer = await edgeSynth({ text, voice, lang, rate, pitch, volume, timeout: 45000 });

    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", buffer.length);
    res.set("Cache-Control", "no-cache");
    res.send(buffer);

  } catch (err) {
    console.error("Error TTS:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err?.message || "Error desconocido",
        details: String(err)
      });
    }
  }
});

// ------------------------------------------------------------
// Manejo de errores global
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("Error no capturado:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ------------------------------------------------------------
// Iniciar servidor
// ------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log("  Edge TTS Server - Audiolibros Diego (v2.2.0)");
  console.log("  Engine: edge-tts directo");
  console.log("  Escuchando en puerto " + PORT);
  console.log("  Health: http://localhost:" + PORT + "/health");
  console.log("=".repeat(60));
});
