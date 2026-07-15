// ============================================================
// SERVIDOR EDGE TTS — Audiolibros Diego
// Gratis en Render (https://render.com)
// ============================================================
// Este servidor recibe texto desde tu página web y devuelve
// audio MP3 generado con las voces neurales de Microsoft Edge.
// No necesita API key ni tarjeta de crédito.
// ============================================================

import express from "express";
import cors from "cors";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const app = express();

// Permitir que cualquier página web use este servidor (CORS abierto)
app.use(cors());

// Aceptar JSON grande (párrafos largos de libros)
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Ruta de salud: para verificar que el servidor está vivo
// Visita https://TU-APP.onrender.com/health en el navegador
// ------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Edge TTS Server - Audiolibros Diego",
    version: "1.0.0",
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

    // Crear instancia fresca de Edge TTS para cada request
    // (evita problemas de estado compartido entre requests concurrentes)
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const chunks = [];
    const stream = tts.toStream(text, { rate, pitch, volume });

    stream.on("data", (chunk) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else chunks.push(Buffer.from(chunk));
    });

    stream.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 100) {
          res.status(500).json({ error: "Audio vacío o demasiado corto" });
        } else {
          res.set("Content-Type", "audio/mpeg");
          res.set("Content-Length", buffer.length);
          res.set("Cache-Control", "no-cache");
          res.send(buffer);
        }
        tts.close();
      } catch (e) {
        console.error("Error al enviar audio:", e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message });
        try { tts.close(); } catch (_) {}
      }
    });

    stream.on("error", (err) => {
      console.error("Error TTS:", err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      try { tts.close(); } catch (_) {}
    });

  } catch (err) {
    console.error("Error general:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
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
  console.log("  Edge TTS Server - Audiolibros Diego");
  console.log("  Escuchando en puerto " + PORT);
  console.log("  Health: http://localhost:" + PORT + "/health");
  console.log("=".repeat(60));
});

// Mantener el proceso vivo en Render (evitar sleep agresivo)
// No es obligatorio, pero ayuda a que las primeras requests no tarden tanto
setInterval(() => {
  try {
    process.stdout.write("");
  } catch (_) {}
}, 5 * 60 * 1000); // cada 5 min
