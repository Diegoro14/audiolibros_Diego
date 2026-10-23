from fastapi import FastAPI, Response, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import edge_tts
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "service": "Edge TTS Python"}

async def process_tts(data: dict):
    try:
        text = data.get("text") or data.get("texto") or data.get("input") or ""
        if not text or not str(text).strip():
            raise HTTPException(status_code=400, detail="Texto vacío")

        voice = data.get("voice") or data.get("voz") or "es-MX-JorgeNeural"
        rate = data.get("rate") or data.get("velocidad") or "+0%"
        pitch = data.get("pitch") or "+0Hz"
        volume = data.get("volume") or "+0%"

        if isinstance(rate, (int, float)):
            rate = f"{int(rate)}%"
        if not str(rate).startswith(("+", "-")):
            rate = f"+{rate}" if not str(rate).endswith("%") else rate

        communicate = edge_tts.Communicate(str(text), str(voice), rate=str(rate), pitch=str(pitch), volume=str(volume))
        audio_bytes = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes.extend(chunk["data"])

        return Response(content=bytes(audio_bytes), media_type="audio/mpeg")
    except Exception as e:
        error_msg = traceback.format_exc()
        print("--- ERROR DETALLADO EN TTS ---")
        print(error_msg)
        print("------------------------------")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tts")
@app.post("/tts")
async def generate_tts_post(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    return await process_tts(body)

@app.get("/api/tts")
@app.get("/tts")
async def generate_tts_get(request: Request):
    params = dict(request.query_params)
    return await process_tts(params)
