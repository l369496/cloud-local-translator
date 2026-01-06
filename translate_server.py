# translate_server.py
# ============================================================
#  Cloud 专业版 NLLB 翻译服务（段落级翻译 + 上下文窗口 + 句级进度）
# ============================================================

import uvicorn
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
import time
import re
import asyncio
import io
import platform

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from queue import Queue
from threading import Lock
from concurrent.futures import ThreadPoolExecutor

# ============================================================
# 并发任务管理
# ============================================================
MAX_CONCURRENT = 2
current_running = 0
running_lock = Lock()
task_queue = Queue()
executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT)

tasks: Dict[str, Dict[str, Any]] = {}
tasks_lock = asyncio.Lock()

# ============================================================
# 可选：Word / PDF 导出
# ============================================================
try:
    from docx import Document
except ImportError:
    Document = None

try:
    from reportlab.pdfgen import canvas
except ImportError:
    canvas = None

# ============================================================
# 设备选择
# ============================================================
SYSTEM = platform.system().lower()

if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

print(f"[translate_server] 使用设备: {DEVICE}（系统: {SYSTEM}）")

# ============================================================
# bitsandbytes 8bit 加速（仅 Linux + CUDA）
# ============================================================
USE_BNB_INT8 = False
if DEVICE == "cuda" and SYSTEM == "linux":
    try:
        import bitsandbytes
        USE_BNB_INT8 = True
        print("[translate_server] 已启用 bitsandbytes 8bit GPU 加速")
    except ImportError:
        print("[translate_server] 未安装 bitsandbytes，使用全精度 GPU")
else:
    print("[translate_server] 当前平台不支持 bitsandbytes")

# ============================================================
# 加载 NLLB 模型
# ============================================================
model_name = "facebook/nllb-200-distilled-600M"
print(f"[translate_server] 正在加载模型: {model_name}")

tokenizer = AutoTokenizer.from_pretrained(model_name)

# Windows CPU：动态 int8
if DEVICE == "cpu" and SYSTEM == "windows":
    print("[translate_server] Windows CPU：启用动态 int8 量化")
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model = torch.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)
    model.to(DEVICE)

# Linux CUDA：bitsandbytes
elif USE_BNB_INT8:
    from transformers import BitsAndBytesConfig
    quant_config = BitsAndBytesConfig(load_in_8bit=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        model_name,
        quantization_config=quant_config,
        device_map="auto",
    )

# 其他情况：全精度
else:
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.to(DEVICE)

model.eval()
print("[translate_server] 模型加载完成")

# ============================================================
# FastAPI 应用
# ============================================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 语言映射
# ============================================================
LANG_MAP = {
    "en": "eng_Latn",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "es": "spa_Latn",
    "ru": "rus_Cyrl",
    "ar": "arb_Arab",
}
# ============================================================
# 多语言句子切分（用于进度条 + 智能拆分）
# ============================================================

# 支持中/英/日/韩/阿拉伯语/俄语/欧洲语言
SENTENCE_BOUNDARY = r"[。！？.!?؟]"

def split_into_sentences(text: str):
    """
    多语言句子切分器：
    - 支持中/英/日/韩/阿拉伯语/俄语/欧洲语言
    - 自动修复 dangerous.Cases → dangerous. Cases
    - 不依赖语言特定规则
    """

    text = text.strip()
    if not text:
        return []

    # 修复英文无空格句子边界 dangerous.Cases → dangerous. Cases
    text = re.sub(r"([.!?])([A-Z])", r"\1 \2", text)

    # 在句子边界后插入特殊标记
    text = re.sub(f"({SENTENCE_BOUNDARY})", r"\1<SPLIT>", text)

    # 按标记切分
    parts = text.split("<SPLIT>")

    # 清理空白
    return [p.strip() for p in parts if p.strip()]


# ============================================================
# 单段翻译（动态 max_length + <unk> 对齐）
# ============================================================
def translate_paragraph(text: str, source_lang: str, target_lang: str, generate_params=None) -> str:
    generate_params = generate_params or {}
    src = LANG_MAP.get(source_lang, "eng_Latn")
    tgt = LANG_MAP.get(target_lang, "zho_Hans")

    inputs = tokenizer._build_translation_inputs(
        text,
        src_lang=src,
        tgt_lang=tgt,
        return_tensors="pt"
    )

    if DEVICE != "cpu":
        inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    # 动态 max_length（语言无关）
    input_len = len(inputs["input_ids"][0])
    factor = 6 if tgt in ["zho_Hans", "jpn_Jpan", "kor_Hang"] else 3
    max_len = min(1024, input_len * factor)

    with torch.no_grad():
        # 默认参数
        default_params = {
            "num_beams": 1,
            "repetition_penalty": 1.1,
            "no_repeat_ngram_size": 3,
            "encoder_no_repeat_ngram_size": 3,
        }

        # 合并前端参数
        params = {**default_params, **generate_params}

        generated = model.generate(
            **inputs,
            max_length=max_len,
            **params
        )



    result = tokenizer.batch_decode(generated, skip_special_tokens=True)[0]

    # <unk> 对齐
    if "<unk>" in result:
        try:
            align = tokenizer.get_alignments(generated[0], inputs["input_ids"][0])
            result_tokens = result.split()
            source_tokens = align["source_tokens"]
            tgt2src = align["target_to_source"]

            for i, tok in enumerate(result_tokens):
                if tok == "<unk>" and i < len(tgt2src):
                    src_index = tgt2src[i]
                    if src_index is not None and src_index < len(source_tokens):
                        result_tokens[i] = source_tokens[src_index]

            result = "".join(result_tokens)
        except:
            pass

    return result


# ============================================================
# 智能拆分（多语言句子切分 + 不丢句子 + 智能聚合）
# ============================================================
def smart_split(text: str, max_len=450):
    """
    返回：
    - chunks: 拆分后的可翻译片段
    - mapping: 每个片段对应原文的行号
    """

    raw_paragraphs = text.split("\n")

    chunks = []
    mapping = []

    for idx, para in enumerate(raw_paragraphs):
        p = para.strip()

        # 空行 → 保留
        if not p:
            chunks.append("")
            mapping.append(idx)
            continue

        # 多语言句子切分
        sentences = split_into_sentences(p)

        # 智能聚合
        buf = ""
        for sent in sentences:
            if not buf:
                buf = sent
            elif len(buf) + len(sent) + 1 <= max_len:
                buf += " " + sent
            else:
                chunks.append(buf)
                mapping.append(idx)
                buf = sent

        if buf:
            chunks.append(buf)
            mapping.append(idx)

    return chunks, mapping


# ============================================================
# 整段翻译（保留原文换行 + 智能拆分 + 真实进度 + 不丢句子）
# ============================================================
def translate_text_with_progress(text: str, source_lang: str, target_lang: str, task_id: str):
    # 1. 智能拆分（并保留原文段落映射）
    chunks, mapping = smart_split(text)

    # 2. 设置真实总进度
    total = len(chunks)
    tasks[task_id]["total_sentences"] = total

    # 3. 翻译每个 chunk
    translated_chunks = []
    for idx, chunk in enumerate(chunks, start=1):
        task = tasks.get(task_id)
        if not task or task.get("status") == "cancelled":
            break

        if chunk.strip():
            translated = translate_paragraph(chunk, source_lang, target_lang, task.get("generate", {}))
        else:
            translated = ""  # 空行保持空行

        translated_chunks.append(translated)
        task["progress"] = int(idx / total * 100)

    # 4. 按原文换行结构重建译文
    raw_lines = text.split("\n")
    output_lines = [""] * len(raw_lines)

    for chunk, line_idx in zip(translated_chunks, mapping):
        if output_lines[line_idx]:
            output_lines[line_idx] += " " + chunk
        else:
            output_lines[line_idx] = chunk

    # 5. 拼接为最终译文（完全保留原文换行）
    return "\n".join(output_lines)

# ============================================================
# 异步任务接口
# ============================================================
class TranslateRequest(BaseModel):
    text: str
    source: Optional[str] = None
    target: str
    generate: Optional[Dict[str, Any]] = None

def run_translation_task(task_id, text, source_lang, target_lang, generate_params):
    global current_running

    try:
        task = tasks.get(task_id)
        task["generate"] = generate_params
        result = translate_text_with_progress(text, source_lang, target_lang, task_id)
        if task and task["status"] != "cancelled":
            task["result"] = result
            task["status"] = "done"
            task["progress"] = 100
    except Exception as e:
        print("task error:", e)
        task = tasks.get(task_id)
        if task:
            task["status"] = "error"
            task["error"] = str(e)
    finally:
        with running_lock:
            current_running -= 1
        start_next_task()

def start_next_task():
    global current_running

    with running_lock:
        if current_running >= MAX_CONCURRENT:
            return
        if task_queue.empty():
            return

        job = task_queue.get()
        task_id = job["task_id"]
        current_running += 1

    executor.submit(
        run_translation_task,
        task_id,
        job["text"],
        job["source"],
        job["target"],
        job.get("generate", {})
    )

@app.post("/translate_async")
async def translate_async(req: TranslateRequest):
    source_lang = req.source or "en"
    target_lang = req.target

    task_id = str(uuid.uuid4())

    async with tasks_lock:
        tasks[task_id] = {
            "status": "queued",
            "progress": 0,
            "result": None,
            "source": source_lang,
            "target": target_lang,
            "created_at": time.time()
        }

    task_queue.put({
        "task_id": task_id,
        "text": req.text,
        "source": source_lang,
        "target": target_lang,
        "generate": req.generate or {}
    })

    start_next_task()

    return {"task_id": task_id, "status": "queued"}

@app.get("/progress/{task_id}")
async def get_progress(task_id: str):
    task = tasks.get(task_id)
    if not task:
        return {"progress": 0, "status": "not_found", "total_sentences": None}

    return {
        "progress": task.get("progress", 0),
        "status": task.get("status", "queued"),
        "total_sentences": task.get("total_sentences", None)
    }

@app.get("/result/{task_id}")
async def get_result(task_id: str):
    task = tasks.get(task_id)
    if not task:
        return {"status": "not_found", "result": None}
    return {"status": task.get("status", "running"), "result": task.get("result")}

@app.post("/cancel/{task_id}")
async def cancel_task(task_id: str):
    task = tasks.get(task_id)
    if not task:
        return {"status": "not_found"}

    task["status"] = "cancelled"

    async def cleanup():
        await asyncio.sleep(30)
        tasks.pop(task_id, None)

    asyncio.create_task(cleanup())
    return {"status": "cancelled"}

# ============================================================
# 文件翻译 + 导出
# ============================================================
@app.post("/translate_file_async")
async def translate_file_async(file: UploadFile = File(...), target: str = "zh"):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    source_lang = "en"
    task_id = str(uuid.uuid4())

    async with tasks_lock:
        tasks[task_id] = {
            "status": "queued",
            "progress": 0,
            "result": None,
            "source": source_lang,
            "target": target,
            "created_at": time.time()
        }

    task_queue.put({
        "task_id": task_id,
        "text": text,
        "source": source_lang,
        "target": target
    })

    start_next_task()

    return {"task_id": task_id, "status": "queued"}

class ExportRequest(BaseModel):
    text: str
    filename: Optional[str] = "translation"

@app.post("/export/word")
async def export_word(req: ExportRequest):
    if Document is None:
        return {"error": "python-docx 未安装"}

    doc = Document()
    for line in req.text.split("\n"):
        doc.add_paragraph(line)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{req.filename}.docx"'}
    )

@app.post("/export/pdf")
async def export_pdf(req: ExportRequest):
    if canvas is None:
        return {"error": "reportlab 未安装"}

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    textobject = c.beginText(40, 800)
    for line in req.text.split("\n"):
        textobject.textLine(line)
    c.drawText(textobject)
    c.showPage()
    c.save()
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{req.filename}.pdf"'}
    )

# ============================================================
# 本地运行入口
# ============================================================
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
