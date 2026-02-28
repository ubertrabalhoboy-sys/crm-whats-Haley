
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

function getApiKey() {
    try {
        const envPath = path.join(process.cwd(), ".env.local");
        if (!fs.existsSync(envPath)) return null;
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/GEMINI_API_KEY=([^\s]+)/);
        return match ? match[1].replace(/['"]/g, "") : null;
    } catch (e) {
        return null;
    }
}

async function listModels() {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.error("GEMINI_API_KEY NOT FOUND");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];

    for (const mName of models) {
        process.stdout.write(`Testing ${mName}... `);
        try {
            const model = genAI.getGenerativeModel({ model: mName });
            const result = await model.generateContent("ping");
            console.log("✅ OK");
        } catch (err) {
            console.log(`❌ FAIL: ${err.message}`);
        }
    }
}

listModels();
