import { describe, expect, it } from "vitest";
import { deriveWhatsappHealth } from "./health";

describe("deriveWhatsappHealth", () => {
    it("returns online when status is connected and no warning", () => {
        const result = deriveWhatsappHealth({ uazStatus: "connected" });
        expect(result.state).toBe("online");
        expect(result.label).toBe("Online");
    });

    it("prioritizes token warnings over status", () => {
        const result = deriveWhatsappHealth({
            uazStatus: "connected",
            warningTitle: "Token da instância inválido",
            warningMessage: "Token da instancia invalido ou expirado.",
        });
        expect(result.state).toBe("token_invalid");
    });

    it("maps unstable warnings correctly", () => {
        const result = deriveWhatsappHealth({
            uazStatus: "disconnected",
            warningMessage: "Conexao instavel no celular. Verifique internet.",
        });
        expect(result.state).toBe("unstable");
    });

    it("returns connecting for qr/pairing statuses", () => {
        const result = deriveWhatsappHealth({ uazStatus: "waiting_qr_pair" });
        expect(result.state).toBe("connecting");
    });
});
