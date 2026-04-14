import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const chatHistory = document.getElementById("chat-history");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusDiv = document.getElementById("status");
const modelSelect = document.getElementById("model-select");

let engine;

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
    } catch (err) {
        statusDiv.textContent = "ロードエラー";
        console.error("Initialization Error:", err);
    }
}

async function sendMessage() {
    const text = userInput.value;
    if (!text) return;
    
    // Add user message to UI
    const userMsg = document.createElement("div");
    userMsg.textContent = "あなた: " + text;
    chatHistory.appendChild(userMsg);
    
    userInput.value = "";
    
    // Get response (streaming)
    const botMsg = document.createElement("div");
    botMsg.textContent = "AI: ";
    chatHistory.appendChild(botMsg);

    const chunks = await engine.chat.completions.create({
        messages: [{ role: "user", content: text }],
        stream: true
    });

    for await (const chunk of chunks) {
        const delta = chunk.choices[0].delta.content;
        if (delta) {
            botMsg.textContent += delta;
        }
    }
}

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

init();
