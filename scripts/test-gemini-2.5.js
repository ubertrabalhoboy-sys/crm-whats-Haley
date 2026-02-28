
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

function getApiKey() {
    try {
        const envPath = path.join(process.cwd(), ".env.local");
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/GEMINI_API_KEY=([^\s]+)/);
        return match ? match[1].replace(/['"]/g, "") : null;
    } catch (e) {
        return null;
    }
}

async function listModels() {
    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];

    for (const modelName of models) {
        console.log(`\nTesting ${modelName} (default config)...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("ping");
            console.log(`✅ OK: ${result.response.text().substring(0, 20)}`);
        } catch (err) {
            console.log(`❌ FAIL: ${err.message}`);
        }
    }
}

listModels();
