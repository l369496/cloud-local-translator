// ============================================================
// 配置与语言列表
// ============================================================
const API_BASE = "http://127.0.0.1:8000";

const languages = {
    "zh": "中文",
    "en": "英语",
    "ja": "日语",
    "ko": "韩语",
    "fr": "法语",
    "de": "德语",
    "es": "西班牙语",
    "ru": "俄语",
    "ar": "阿拉伯语",
    "it": "意大利语",
    "pt": "葡萄牙语",
    "nl": "荷兰语",
    "sv": "瑞典语",
    "fi": "芬兰语",
    "no": "挪威语",
    "da": "丹麦语",
    "pl": "波兰语",
    "cs": "捷克语",
    "tr": "土耳其语",
    "vi": "越南语",
    "th": "泰语",
    "id": "印尼语",
    "ms": "马来语",
    "hi": "印地语",
    "bn": "孟加拉语",
    "uk": "乌克兰语",
    "el": "希腊语",
    "he": "希伯来语",
    "ro": "罗马尼亚语",
    "hu": "匈牙利语",
    "bg": "保加利亚语",
    "sr": "塞尔维亚语",
    "sk": "斯洛伐克语",
    "sl": "斯洛文尼亚语",
    "hr": "克罗地亚语",
    "lt": "立陶宛语",
    "lv": "拉脱维亚语",
    "et": "爱沙尼亚语"
};

// ============================================================
// 初始化语言下拉框
// ============================================================
function fillLanguageSelect(id) {
    const select = document.getElementById(id);
    select.innerHTML = "";
    for (const code in languages) {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = languages[code] + " (" + code + ")";
        select.appendChild(opt);
    }
}

fillLanguageSelect("sourceLang");
fillLanguageSelect("targetLang");

document.getElementById("sourceLang").value = "en";
document.getElementById("targetLang").value = "zh";
// ============================================================
// 工具函数：防抖与节流
// ============================================================
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function throttle(fn, interval) {
    let lastTime = 0;
    let pendingArgs = null;
    let pendingThis = null;
    let timer = null;

    function invoke() {
        lastTime = Date.now();
        if (pendingArgs) {
            const args = pendingArgs;
            const ctx = pendingThis;
            pendingArgs = null;
            pendingThis = null;
            fn.apply(ctx, args);
        }
    }

    return function (...args) {
        const now = Date.now();
        const remaining = interval - (now - lastTime);
        if (remaining <= 0) {
            lastTime = now;
            fn.apply(this, args);
        } else {
            pendingArgs = args;
            pendingThis = this;
            if (!timer) {
                timer = setTimeout(() => {
                    timer = null;
                    invoke();
                }, remaining);
            }
        }
    };
}

// ============================================================
// 顶部进度条
// ============================================================
function setProgressVisible(visible) {
    const container = document.getElementById("progressBarContainer");
    if (!container) return;
    container.style.display = visible ? "block" : "none";
}

function setProgressPercent(percent) {
    const bar = document.getElementById("progressBar");
    if (!bar) return;
    bar.style.width = Math.max(0, Math.min(100, percent)) + "%";
}

// ============================================================
// 显示“正在翻译第 x/x 句…”
// ============================================================
function showLoading(currentSentence, totalSentence, elapsedSeconds, etaSeconds) {
    const resultElem = document.getElementById("resultText");
    if (!resultElem) return;

    const elapsed = elapsedSeconds.toFixed(1);
    const eta = etaSeconds.toFixed(1);

    resultElem.value =
        `正在翻译第 ${currentSentence}/${totalSentence} 句 ` +
        `（已用时 ${elapsed} 秒，预计剩余 ${eta} 秒）`;
}
// ============================================================
// Markdown 渲染与视图更新
// ============================================================
function renderMarkdown(text) {
    let html = text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

    // 行内代码
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // 斜体
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // 换行
    html = html.replace(/\n/g, "<br>");

    return html;
}

function updateMarkdownView() {
    const mdMode = document.getElementById("markdownMode").checked;
    const raw = document.getElementById("resultText").value;
    const mdView = document.getElementById("markdownView");

    if (mdMode) {
        mdView.innerHTML = renderMarkdown(raw);
        mdView.style.display = "block";
        document.getElementById("resultText").style.display = "none";
    } else {
        mdView.style.display = "none";
        document.getElementById("resultText").style.display = "block";
    }
}
// ============================================================
// 历史记录
// ============================================================
function loadHistory() {
    const histDiv = document.getElementById("history");
    if (!histDiv) return;

    histDiv.innerHTML = "";
    const raw = localStorage.getItem("translate_history");
    if (!raw) return;

    const arr = JSON.parse(raw);
    for (const item of arr) {
        const div = document.createElement("div");
        div.className = "history-item";

        // ⭐ 新增：耗时字段（兼容旧记录）
        const cost = item.cost ? `（耗时 ${item.cost} 秒）` : "（耗时未知）";

        div.textContent =
            "[" + item.source + "->" + item.target + "] " +
            item.text.slice(0, 40) + " => " +
            item.result.slice(0, 40) + " " +
            cost;   // ⭐ 追加耗时

        div.onclick = () => {
            document.getElementById("inputText").value = item.text;
            document.getElementById("resultText").value = item.result;
            document.getElementById("sourceLang").value = item.source;
            document.getElementById("targetLang").value = item.target;
            updateMarkdownView();
        };

        histDiv.appendChild(div);
    }
}

function saveHistory(entry) {
    const raw = localStorage.getItem("translate_history");
    let arr = raw ? JSON.parse(raw) : [];

    arr.unshift(entry);
    if (arr.length > 100) arr = arr.slice(0, 100);

    localStorage.setItem("translate_history", JSON.stringify(arr));
    loadHistory();
}
// ===============================
// 清空翻译历史
// ===============================
function clearHistory() {
    localStorage.removeItem("translate_history");
    loadHistory();  // 刷新 UI
}
function getGenerateParams() {
    const autoTune = document.getElementById("autoTuneCheckbox").checked;

    if (autoTune) {
        return autoTuneGenerateParams();  // ⭐ 自动调优器
    }

    return {
        num_beams: Number(document.getElementById("gen_num_beams").value),
        repetition_penalty: Number(document.getElementById("gen_repetition_penalty").value),
        no_repeat_ngram_size: Number(document.getElementById("gen_no_repeat_ngram").value),
        encoder_no_repeat_ngram_size: Number(document.getElementById("gen_encoder_no_repeat_ngram").value)
    };
}
function autoTuneGenerateParams() {
    const text = document.getElementById("inputText").value;

    const length = text.length;
    const hasCode = /[`{}();=<>]/.test(text);
    const hasList = /[-*]\s/.test(text);
    const hasTechnicalWords = /(parameter|function|class|API|null|void|return)/i.test(text);

    // ⭐ 技术文档（最容易重复）
    if (hasCode || hasTechnicalWords) {
        return {
            num_beams: 1,
            repetition_penalty: 1.1,
            no_repeat_ngram_size: 4,
            encoder_no_repeat_ngram_size: 4
        };
    }

    // ⭐ 长文本（需要 beam search）
    if (length > 300) {
        return {
            num_beams: 4,
            repetition_penalty: 1.0,
            no_repeat_ngram_size: 3,
            encoder_no_repeat_ngram_size: 3
        };
    }

    // ⭐ 短句（greedy 最稳定）
    if (length < 80) {
        return {
            num_beams: 1,
            repetition_penalty: 1.0,
            no_repeat_ngram_size: 2,
            encoder_no_repeat_ngram_size: 2
        };
    }

    // ⭐ 默认（通用文本）
    return {
        num_beams: 2,
        repetition_penalty: 1.0,
        no_repeat_ngram_size: 3,
        encoder_no_repeat_ngram_size: 3
    };
}

// 页面加载时初始化历史记录
loadHistory();

// ============================================================
// 翻译调度核心：TranslationManager（增强版）
// ============================================================
class TranslationManager {
    constructor() {
        this.currentTaskId = null;
        this.currentAbortController = null;
        this.progressTimer = null;
        this.isRunning = false;
        this.queue = [];
        this.throttleInterval = 500;
        this.lastRequestTime = 0;

        this.startTime = 0;
        this.totalSentences = 1;
        this.initialETA = null;
        this.lastProgressTimestamp = null;
    }

    // ------------------------
    // 请求翻译（关键修复：清空输入时取消任务）
    // ------------------------
    async requestTranslate(reason) {
        const inputElem = document.getElementById("inputText");
        const text = inputElem.value.trim();
        const resultElem = document.getElementById("resultText");

        // ⭐ 清空输入 → 必须取消任务
        if (!text) {
            await this.cancelCurrentTask();
            resultElem.value = "";
            updateMarkdownView();
            this.clearState();
            return;
        }

        // ⭐ 输入时立即显示占位提示
        resultElem.value = "正在准备翻译…";
        updateMarkdownView();

        const sourceSelect = document.getElementById("sourceLang");
        const targetSelect = document.getElementById("targetLang");
        const autoDetectCheckbox = document.getElementById("autoDetectCheckbox");

        const job = {
            text,
            autoDetect: autoDetectCheckbox ? autoDetectCheckbox.checked : true,
            manualSource: sourceSelect.value,
            target: targetSelect.value,
            reason: reason || "auto"
        };

        this.queue = [job];

        // ⭐ 新任务 → 立即取消旧任务
        if (this.isRunning) {
            await this.cancelCurrentTask();
            this.isRunning = false;
        }

        this.runNext();
    }

    runNext() {
        if (this.queue.length === 0) {
            this.isRunning = false;
            this.clearState();
            return;
        }

        this.isRunning = true;
        const job = this.queue[this.queue.length - 1];
        this.queue = [];
        this.startTask(job);
    }
}
// ============================================================
// 轮询进度（完整版本）
// ============================================================
TranslationManager.prototype.startProgressPolling = function (taskId, job) {
    const resultElem = document.getElementById("resultText");

    if (this.progressTimer) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
    }

    this.progressTimer = setInterval(async () => {
        try {
            // 如果任务已被取消，停止轮询
            if (this.currentTaskId !== taskId) {
                clearInterval(this.progressTimer);
                this.progressTimer = null;
                return;
            }

            // 获取进度
            const progRes = await fetch(API_BASE + "/progress/" + taskId);
            const progData = await progRes.json();

            if (typeof progData.progress === "number") {
                const progress = progData.progress;
                setProgressPercent(progress);

                // ⭐ 从后端获取句子总数
                if (progData.total_sentences != null && this.totalSentences == null) {
                    this.totalSentences = progData.total_sentences;
                }

                const total = Math.max(1, this.totalSentences || 1);

                const currentSentence = Math.max(
                    1,
                    Math.min(total, Math.ceil(total * progress / 100))
                );

                const now = Date.now();
                const elapsed = (now - this.startTime) / 1000;

                // ⭐ 初始化 ETA（基于句子数，而不是百分比）
                if (this.initialETA === null && progress > 0) {
                    const currentSentence = Math.ceil(total * progress / 100);

                    // 避免除以 0
                    if (currentSentence > 0) {
                        const avgPerSentence = elapsed / currentSentence;
                        const remaining = total - currentSentence;

                        // 初始 ETA = 剩余句子 * 平均每句耗时
                        this.initialETA = Math.max(0, remaining * avgPerSentence);
                    }
                }

                let eta = 0;

                // ⭐ 递减 ETA（倒计时）
                if (this.initialETA != null) {
                    if (this.lastProgressTimestamp == null) {
                        this.lastProgressTimestamp = now;
                    }

                    const delta = (now - this.lastProgressTimestamp) / 1000;
                    this.lastProgressTimestamp = now;

                    this.initialETA = Math.max(0, this.initialETA - delta);
                    eta = this.initialETA;
                }

                showLoading(currentSentence, total, elapsed, eta);
            }

            // 获取最终结果
            const resultRes = await fetch(API_BASE + "/result/" + taskId);
            const resultData = await resultRes.json();

            if (resultData.status === "done") {
                clearInterval(this.progressTimer);
                this.progressTimer = null;

                const translated = resultData.result || "";
                resultElem.value = translated;
                updateMarkdownView();

                // ⭐ 计算翻译耗时
                const endTime = Date.now();
                const costSeconds = ((endTime - this.startTime) / 1000).toFixed(2);

                // ⭐ 显示到“翻译结果”标签后
                const costLabel = document.getElementById("costTimeLabel");
                if (costLabel) {
                    costLabel.innerText = `（耗时 ${costSeconds} 秒）`;
                }

                setProgressVisible(false);

                // ⭐ 写入历史
                saveHistory({
                    text: job.text,
                    result: translated,
                    source: document.getElementById("sourceLang").value,
                    target: document.getElementById("targetLang").value,
                    cost: costSeconds
                });

                this.currentTaskId = null;
                this.currentAbortController = null;
                this.isRunning = false;

                this.runNext();
            }


        } catch (err) {
            console.error("轮询进度或结果错误：", err);
            clearInterval(this.progressTimer);
            this.progressTimer = null;
            setProgressVisible(false);
            this.isRunning = false;
        }
    }, 300);
};

// ============================================================
// 启动任务 + 轮询进度（增强版 + 时间戳调试输出）
// ============================================================
TranslationManager.prototype.startTask = async function (job) {

    const ts = () => new Date().toISOString();  // ⭐ 时间戳函数

    console.log(`[${ts()}] === [startTask] 开始启动任务 ===`);
    console.log(`[${ts()}] job =`, job);

    await this.cancelCurrentTask();
    console.log(`[${ts()}] [startTask] 已取消旧任务`);
    
    this.initialETA = null;
    this.lastProgressTimestamp = null;

    setProgressVisible(true);
    setProgressPercent(0);

    const detectedLabel = document.getElementById("detectedLabel");

    if (job.autoDetect) {
        detectedLabel.innerText = "自动检测：进行中...";
        console.log(`[${ts()}] [startTask] 自动检测开启`);
    } else {
        detectedLabel.innerText = "已选择源语言：" + languages[job.manualSource];
        console.log(`[${ts()}] [startTask] 使用手动源语言 = ${job.manualSource}`);
    }

    const controller = new AbortController();
    this.currentAbortController = controller;

    // ⭐ JSON 安全处理
    const safeText = job.text.replace(/\u2028|\u2029/g, "");
    console.log(`[${ts()}] [startTask] safeText 长度 = ${safeText.length}`);

    const payload = {
        text: safeText,
        source: job.autoDetect ? null : job.manualSource,
        target: job.target,
        generate: getGenerateParams()
    };

    console.log(`[${ts()}] [startTask] payload =`, payload);

    try {
        console.log(`[${ts()}] [startTask] 正在发送 /translate_async 请求…`);

        const res = await fetch(API_BASE + "/translate_async", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        console.log(`[${ts()}] [startTask] 后端响应状态 = ${res.status}`);

        if (!res.ok) {
            console.error(`[${ts()}] [startTask] 后端返回错误状态 = ${res.status}`);
            throw new Error("启动翻译任务失败：" + res.status);
        }

        const data = await res.json();
        console.log(`[${ts()}] [startTask] 后端返回 JSON =`, data);

        const taskId = data.task_id;
        this.currentTaskId = taskId;

        console.log(`[${ts()}] [startTask] 已获取 taskId = ${taskId}`);

        this.startTime = Date.now();
        this.totalSentences = null;

        console.log(`[${ts()}] [startTask] totalSentences = ${this.totalSentences}`);

        showLoading(1, this.totalSentences, 0, 0);

        console.log(`[${ts()}] [startTask] 准备启动进度轮询…`);
        this.startProgressPolling(taskId, job);

        console.log(`[${ts()}] === [startTask] 启动任务完成 ===`);

    } catch (err) {
        if (err.name === "AbortError") {
            console.warn(`[${ts()}] [startTask] 请求已被取消（AbortError）`);
            return;
        }

        console.error(`[${ts()}] [startTask] 启动翻译任务错误：`, err);
        setProgressVisible(false);
        this.isRunning = false;
    }
};

// ============================================================
// 取消任务（增强版）
// ============================================================
TranslationManager.prototype.cancelCurrentTask = async function () {
    if (this.currentAbortController) {
        this.currentAbortController.abort();
        this.currentAbortController = null;
    }

    const taskId = this.currentTaskId;
    if (taskId) {
        try {
            await fetch(API_BASE + "/cancel/" + taskId, { method: "POST" });
        } catch (err) {
            console.warn("取消后端任务失败：", err);
        }
    }

    if (this.progressTimer) {
        clearInterval(this.progressTimer);
        this.progressTimer = null;
    }

    // ⭐ 清空进度条
    setProgressPercent(0);
    setProgressVisible(false);

    this.currentTaskId = null;
};

// ------------------------
// 清理 UI 状态
// ------------------------
TranslationManager.prototype.clearState = function () {
    setProgressVisible(false);
};

// 创建全局实例
const translationManager = new TranslationManager();

// ============================================================
// 事件绑定与自动翻译逻辑（节流 + 防抖）
// ============================================================
const AUTO_DEBOUNCE_DELAY = 600;

const throttledRequestTranslate = throttle(
    () => translationManager.requestTranslate("auto"),
    800
);

const debouncedAutoTranslate = debounce(
    () => throttledRequestTranslate(),
    AUTO_DEBOUNCE_DELAY
);

// 输入变更 → 自动翻译
document.getElementById("inputText").addEventListener("input", () => {
    debouncedAutoTranslate();
});

// 手动翻译按钮
function triggerTranslate() {
    translationManager.requestTranslate("manual");
}
window.triggerTranslate = triggerTranslate;

// 语言变更 → 触发翻译
function onLanguageChanged(e) {
    if (!e.isTrusted) return;
    const text = document.getElementById("inputText").value.trim();
    if (text.length > 0) {
        translationManager.requestTranslate("lang-change");
    }
}

document.getElementById("sourceLang").addEventListener("change", onLanguageChanged);
document.getElementById("targetLang").addEventListener("change", onLanguageChanged);

// 自动检测开关
const autoDetectCheckbox = document.getElementById("autoDetectCheckbox");
if (autoDetectCheckbox) {
    autoDetectCheckbox.addEventListener("change", (e) => {
        const text = document.getElementById("inputText").value.trim();
        const detectedLabel = document.getElementById("detectedLabel");
        if (e.target.checked) {
            detectedLabel.innerText = "自动检测：未开始";
        } else {
            detectedLabel.innerText = "自动检测：关闭，使用选择的源语言";
        }
        if (text.length > 0) {
            translationManager.requestTranslate("auto-detect-toggle");
        }
    });
}
function updateAdvancedParamsUI() {
    const autoTune = document.getElementById("autoTuneCheckbox").checked;
    const container = document.getElementById("advancedParams");

    const inputs = container.querySelectorAll("input[type='number']");

    if (autoTune) {
        container.classList.add("adv-disabled");
        inputs.forEach(i => {
            i.disabled = true;
        });
    } else {
        container.classList.remove("adv-disabled");
        inputs.forEach(i => {
            i.disabled = false;
        });
    }
}

document.getElementById("autoTuneCheckbox").addEventListener("change", updateAdvancedParamsUI);

// 语言互换按钮
document.getElementById("swapBtn").onclick = () => {
    const s = document.getElementById("sourceLang");
    const t = document.getElementById("targetLang");
    const tmp = s.value;
    s.value = t.value;
    t.value = tmp;

    const input = document.getElementById("inputText");
    const output = document.getElementById("resultText");
    if (output.value.trim()) {
        const tmp2 = input.value;
        input.value = output.value;
        output.value = tmp2;
        updateMarkdownView();
    }

    if (input.value.trim()) {
        translationManager.requestTranslate("swap");
    }
};

// 复制结果
document.getElementById("copyBtn").onclick = async () => {
    const text = document.getElementById("resultText").value;
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyBtn");
    btn.innerText = "已复制";
    setTimeout(() => { btn.innerText = "复制"; }, 1200);
};

// Markdown 模式切换
document.getElementById("markdownMode").onchange = updateMarkdownView;

// ============================================================
// 文件翻译与导出
// ============================================================
// 文件翻译按钮（异步任务 + 进度条 + ETA + 句子编号）
document.getElementById("translateFileBtn").onclick = async () => {
    const file = document.getElementById("fileInput").files[0];
    if (!file) {
        alert("请先选择文件。");
        return;
    }

    const resultElem = document.getElementById("resultText");
    resultElem.value = "正在上传文件…";

    try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("target", document.getElementById("targetLang").value);

        // ⭐ 调用异步文件翻译接口
        const res = await fetch(API_BASE + "/translate_file_async", {
            method: "POST",
            body: formData
        });

        const data = await res.json();
        if (!res.ok || data.error) {
            alert(data.error || "文件翻译任务启动失败");
            return;
        }

        const taskId = data.task_id;

        // ⭐ 启动进度条
        translationManager.currentTaskId = taskId;
        translationManager.startTime = Date.now();
        translationManager.totalSentences = null;   // 等后端返回真实句数
        translationManager.initialETA = null;
        translationManager.lastProgressTimestamp = null;

        resultElem.value = "正在翻译文件内容…";
        updateMarkdownView();

        // ⭐ 启动轮询
        translationManager.startProgressPolling(taskId, {
            text: file.name,   // 用文件名作为 job.text
            autoDetect: false,
            manualSource: "en",
            target: document.getElementById("targetLang").value
        });

    } catch (err) {
        console.error("文件翻译错误：", err);
        alert("文件翻译失败。");
    }
};

// 通用下载工具函数
function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// 导出 Markdown
document.getElementById("exportMdBtn").onclick = () => {
    const text = document.getElementById("resultText").value;
    if (!text.trim()) return;
    downloadBlob(text, "translation.md", "text/markdown;charset=utf-8");
};

// 导出 Word
document.getElementById("exportWordBtn").onclick = async () => {
    const text = document.getElementById("resultText").value;
    if (!text.trim()) return;

    const resultElem = document.getElementById("resultText");
    const old = resultElem.value;
    resultElem.value = "正在导出 Word，请稍候...";

    try {
        const res = await fetch(API_BASE + "/export/word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text, filename: "translation" })
        });
        const blob = await res.blob();
        downloadBlob(blob, "translation.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch (err) {
        console.error("导出 Word 错误：", err);
        alert("导出 Word 失败。");
    } finally {
        resultElem.value = old;
        updateMarkdownView();
    }
};

// 导出 PDF
document.getElementById("exportPdfBtn").onclick = async () => {
    const text = document.getElementById("resultText").value;
    if (!text.trim()) return;

    const resultElem = document.getElementById("resultText");
    const old = resultElem.value;
    resultElem.value = "正在导出 PDF，请稍候...";

    try {
        const res = await fetch(API_BASE + "/export/pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text, filename: "translation" })
        });
        const blob = await res.blob();
        downloadBlob(blob, "translation.pdf", "application/pdf");
    } catch (err) {
        console.error("导出 PDF 错误：", err);
        alert("导出 PDF 失败。");
    } finally {
        resultElem.value = old;
        updateMarkdownView();
    }
};
