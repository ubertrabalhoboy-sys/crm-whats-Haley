import { describe, it, expect } from "vitest";
import { detectSentiment } from "./conversation-analyzer";
import { sanitizeGeminiHistory } from "./gemini-client";
import { Content } from "@google/generative-ai";

describe("AI Roadmap 2.0 - Sentiment Analysis", () => {
    it("should detect Satisfeito when positive words are present", () => {
        const history: Content[] = [
            { role: "user", parts: [{ text: "Obrigado, o pedido estava ótimo!" }] }
        ];
        expect(detectSentiment(history)).toBe("Satisfeito");
    });

    it("should detect Frustrado when negative words are present", () => {
        const history: Content[] = [
            { role: "user", parts: [{ text: "Que demora absurda para entregar!" }] }
        ];
        expect(detectSentiment(history)).toBe("Frustrado");
    });

    it("should detect Neutro for normal conversation", () => {
        const history: Content[] = [
            { role: "user", parts: [{ text: "Quero um x-frango com coca" }] }
        ];
        expect(detectSentiment(history)).toBe("Neutro");
    });

    it("should prioritize Frustrado if both types are present but negative dominates", () => {
        const history: Content[] = [
            { role: "user", parts: [{ text: "Obrigado, mas o lanche chegou ruim e frio, que lixo." }] }
        ];
        expect(detectSentiment(history)).toBe("Frustrado");
    });
});

describe("AI Roadmap 2.0 - History Sanitization (Multimodal)", () => {
    it("should preserve audio parts during sanitization", () => {
        const history: Content[] = [
            {
                role: "user",
                parts: [
                    { text: "[Mensagem de Áudio]" },
                    { inlineData: { data: "base64data", mimeType: "audio/ogg" } }
                ]
            }
        ];
        const sanitized = sanitizeGeminiHistory(history);
        expect(sanitized[0].parts).toHaveLength(2);
        expect(sanitized[0].parts[1]).toHaveProperty("inlineData");
    });

    it("should merge consecutive text parts but keep sequence", () => {
        const history: Content[] = [
            { role: "user", parts: [{ text: "Oi" }] },
            { role: "user", parts: [{ text: "Tudo bem?" }] }
        ];
        const sanitized = sanitizeGeminiHistory(history);
        expect(sanitized).toHaveLength(1);
        expect(sanitized[0].parts).toHaveLength(2);
    });
});
