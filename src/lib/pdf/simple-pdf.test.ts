import { describe, it, expect } from "vitest";
import { buildSimplePdf } from "./simple-pdf";

describe("buildSimplePdf", () => {
    it("should generate a valid PDF header/footer", () => {
        const bytes = buildSimplePdf(["Relatorio ROI", "Linha 2"]);
        const raw = Buffer.from(bytes).toString("utf8");

        expect(raw.startsWith("%PDF-1.4")).toBe(true);
        expect(raw.includes("xref")).toBe(true);
        expect(raw.includes("trailer")).toBe(true);
        expect(raw.includes("%%EOF")).toBe(true);
    });

    it("should sanitize non-ascii and keep content stream", () => {
        const bytes = buildSimplePdf(["Visão Geral", "Recuperação mês"]);
        const raw = Buffer.from(bytes).toString("utf8");

        expect(raw.includes("Visao Geral")).toBe(true);
        expect(raw.includes("Recuperacao mes")).toBe(true);
    });
});
