🌐 Cloud Translate Pro
本地运行的专业级多语言翻译工具（NLLB-200 600M）  
支持实时翻译、文件翻译、自动语言检测、自动调优、Markdown 预览、翻译历史、可调节生成参数。

✨ 功能亮点
🔥 本地运行，无需联网
使用 Meta NLLB-200-distilled-600M

支持 CPU / CUDA / MPS

支持 Windows / Linux / macOS

可选 8bit 加速（Linux + CUDA）

🌍 多语言支持
英语、中文、日语、韩语、法语、德语、西班牙语、俄语、阿拉伯语等

自动检测源语言

多语言句子切分（中/英/日/韩/阿拉伯语/俄语）

⚙️ 高级翻译参数（可选）
Beam 数

重复惩罚

no_repeat_ngram_size

encoder_no_repeat_ngram_size

自动调优（AutoTune）

技术文档 → 防重复模式

长文本 → 高质量 beam search

短句 → greedy 最稳定

普通文本 → 平衡模式

📄 文件翻译
支持上传并翻译：

.txt

.md

.docx（读取文本）

并可导出为：

Markdown

Word（.docx）

PDF

🧠 智能拆分 + 句级进度
多语言句子切分

智能聚合（不跨句、不跨子句）

动态 max_length

<unk> 对齐

真实句级进度条 + ETA 预测

📝 Markdown 预览
支持代码块、行内代码、粗体、斜体

实时切换

🕒 翻译历史
自动保存最近 100 条

可点击回填

可清空

🖥️ 项目结构
代码
cloud-translate-pro/
│
├── translate_server.py      # FastAPI 后端 + NLLB 翻译引擎
├── translate.js             # 前端逻辑（自动调优、进度轮询、UI 控制）
├── index.html               # 前端页面
├── style.css                # UI 样式
└── README.md                # 项目说明
🚀 启动方式
1. 安装依赖
bash
pip install -r requirements.txt
如果你没有 requirements.txt，可以使用：

bash
pip install fastapi uvicorn transformers torch python-docx reportlab
2. 启动后端
bash
python translate_server.py
后端默认运行在：

代码
http://127.0.0.1:8000
3. 打开前端
直接打开：

代码
index.html
即可使用。

⚡ 性能优化
Windows CPU
自动启用动态 int8 量化。

Linux CUDA
自动启用 bitsandbytes 8bit 加速（如果已安装）。

MPS（Apple Silicon）
自动使用 MPS 加速。

🧩 高级参数说明
参数	说明
num_beams	Beam Search 宽度，越大越自然但越慢
repetition_penalty	提高可减少重复
no_repeat_ngram_size	禁止重复 n-gram
encoder_no_repeat_ngram_size	防止重复输入中的 n-gram
AutoTune	自动根据文本类型选择最佳参数
🧠 自动调优（AutoTune）策略
文本类型	自动参数
技术文档（含代码/参数/函数）	防重复模式（no_repeat_ngram=4）
长文本（>300 字）	高质量 beam search
短句（<80 字）	greedy 最稳定
普通文本	平衡模式
📦 文件翻译
支持上传 .txt .md .docx  
翻译完成后可导出为：

Markdown

Word

PDF

🛠️ 后端 API
POST /translate_async
异步翻译文本。

GET /progress/{task_id}
查询进度。

GET /result/{task_id}
获取结果。

POST /cancel/{task_id}
取消任务。

POST /translate_file_async
异步翻译文件。