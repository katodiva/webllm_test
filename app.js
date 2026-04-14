import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const chatHistory = document.getElementById("chat-history");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const statusDiv = document.getElementById("status");
const modelSelect = document.getElementById("model-select");

let engine;
let currentRequestController = null;
let isGenerating = false;

async function init() {
    // Populate model list
    const models = webllm.prebuiltAppConfig.model_list;
    models.forEach(m => {
        const option = document.createElement("option");
        option.value = m.model_id;
        option.textContent = m.model_id;
        modelSelect.appendChild(option);
    });

    modelSelect.addEventListener("change", async () => {
        const modelId = modelSelect.value;
        if (!modelId) return;
        
        await loadModel(modelId);
    });
}

async function loadModel(modelId) {
    statusDiv.textContent = `モデル ${modelId} をロード中...`;
    userInput.disabled = true;
    sendBtn.disabled = true;
    stopBtn.disabled = true;

    try {
        if (!engine) {
            engine = await webllm.CreateWebWorkerMLCEngine(
                new Worker(new URL("worker.js", import.meta.url), { type: "module" }),
                modelId,
                {
                    initProgressCallback: (report) => {
                        statusDiv.textContent = `ロード中: ${report.text}`;
                    }
                }
            );
        } else {
            await engine.reload(modelId, {
                initProgressCallback: (report) => {
                    statusDiv.textContent = `切り替え中: ${report.text}`;
                }
            });
        }

        statusDiv.textContent = `準備完了: ${modelId}`;
        userInput.disabled = false;
        sendBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        statusDiv.textContent = "ロードエラー";
        console.error("Initialization Error:", err);
    }
}

function setGenerating(next) {
    isGenerating = next;
    sendBtn.disabled = next || userInput.disabled;
    stopBtn.disabled = !next;
}

async function stopGeneration() {
    // WebWorker 経由のため AbortSignal は渡せない（DataCloneError になる）。
    // WebLLM 側の interrupt を呼んで生成を止める。
    try {
        if (engine?.interruptGenerate) {
            await engine.interruptGenerate();
        } else if (engine?.chat?.interruptGenerate) {
            await engine.chat.interruptGenerate();
        }
    } catch (err) {
        console.warn("interruptGenerate failed:", err);
    } finally {
        currentRequestController = null;
        setGenerating(false);
        statusDiv.textContent = "停止しました";
    }
}

async function sendMessage() {
    const text = userInput.value;
    if (!text) return;
    if (!engine) return;

    // もし前の生成が残っていたら止める（暴走対策）
    await stopGeneration();

    // Add user message to UI
    const userMsg = document.createElement("div");
    userMsg.textContent = "あなた: " + text;
    chatHistory.appendChild(userMsg);

    userInput.value = "";

    // Get response (streaming)
    const botMsg = document.createElement("div");
    botMsg.textContent = "AI: ";
    chatHistory.appendChild(botMsg);

    const controller = new AbortController();
    currentRequestController = controller;
    setGenerating(true);

    try {
        const chunks = await engine.chat.completions.create({
            messages: [{ role: "user", content: text }],
            stream: true
        });

        for await (const chunk of chunks) {
            if (controller.signal.aborted) break;
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) botMsg.textContent += delta;
        }
    } catch (err) {
        // AbortError はユーザー操作なので黙る
        if (err?.name !== "AbortError") {
            console.error("chat error:", err);
            statusDiv.textContent = "生成エラー";
        }
    } finally {
        if (currentRequestController === controller) {
            currentRequestController = null;
        }
        setGenerating(false);
    }
}

sendBtn.addEventListener("click", sendMessage);
stopBtn.addEventListener("click", () => { stopGeneration(); });
userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

init();
