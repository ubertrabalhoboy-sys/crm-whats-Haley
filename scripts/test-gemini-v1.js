
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

    // Pass apiVersion here
    const model = genAI.getGenerativeModel(
        { model: "gemini-1.5-flash" },
        { apiVersion: "v1" }
    );

    console.log("Testing with v1 apiVersion");
    try {
        const result = await model.generateContent("ping");
        console.log("✅ OK");
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
    }
}

listModels();
