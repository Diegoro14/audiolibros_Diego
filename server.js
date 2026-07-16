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
import fs from "fs";
import os from "os";
import path from "path";
import { EdgeTTS } from "node-edge-tts";

const app = express();

// Permitir que cualquier página web use este servidor (CORS abierto)
app.use(cors());

// Aceptar JSON grande (párrafos largos de libros)
app.use(express.json({ limit: "10mb" }));

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
    version: "2.1.0",
    engine: "node-edge-tts",
    timestamp: new Date().toISOString()
  });
});

// ------------------------------------------------------------
// Ruta principal: POST /api/tts
// Body: { text, voice, rate, pitch, volume }
// Devuelve: audio MP3 directamente
// ------------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  // Crear archivo temporal único para esta request
  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

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

    // Crear instancia de Edge TTS
    const tts = new EdgeTTS({
      voice: voice,
      lang: lang,
      rate: rate,
      pitch: pitch,
      volume: volume,
      timeout: 45000
    });

    // Sintetizar a archivo temporal
    await tts.ttsPromise(text, tmpFile);

    // Leer el archivo y enviarlo como MP3
    const buffer = fs.readFileSync(tmpFile);

    if (buffer.length < 100) {
      throw new Error("Audio generado vacío o demasiado corto");
    }

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
  } finally {
    // Limpiar archivo temporal
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch (_) {}
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
  console.log("  Edge TTS Server - Audiolibros Diego (v2.1.0)");
  console.log("  Engine: node-edge-tts");
  console.log("  Escuchando en puerto " + PORT);
  console.log("  Health: http://localhost:" + PORT + "/health");
  console.log("=".repeat(60));
});
