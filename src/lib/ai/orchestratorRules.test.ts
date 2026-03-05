import { describe, it, expect } from "vitest";
import { buildPostAddToCartSalesPlan } from "./orchestratorRules";

describe("Orchestrator Rules — Post Add To Cart", () => {
    it("should suggest adicionales after adding a principal burger", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "principal",
            addedProductName: "Cheese Burger",
            latestOutboundText: "Vou te mostrar os lanches.",
            hasAdditional: false,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("adicional");
        expect(plan.searchQuery).toBe(null);
        expect(plan.followupText).toContain("adicionais mais pedidos");
    });

    it("should handle pizza size selection if missing", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "principal",
            addedProductName: "Pizza Calabresa",
            latestOutboundText: "Olha nossas pizzas.",
            hasAdditional: false,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("principal");
        expect(plan.searchQuery).toBe("pizza media grande gigante");
        expect(plan.followupText).toContain("escolhe o tamanho");
    });

    it("should skip size selection if pizza size is already in name", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "principal",
            addedProductName: "Pizza Calabresa Grande",
            latestOutboundText: "Olha nossas pizzas.",
            hasAdditional: false,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("adicional");
        expect(plan.followupText).toContain("adicionais que mais saem");
    });

    it("should suggest adicionales for acai", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "principal",
            addedProductName: "Copo de Acai 500ml",
            latestOutboundText: "Vou te mostrar os acais.",
            hasAdditional: false,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("adicional");
        expect(plan.followupText).toContain("complementos");
    });

    it("should suggest another acai principal after adicionales are added", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "principal",
            addedProductName: "Copo de Acai 500ml",
            latestOutboundText: "Vou te mostrar os acais.",
            hasAdditional: true,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("principal");
        expect(plan.searchQuery).toBe("acai");
        expect(plan.followupText).toContain("mais um acai");
    });

    it("should suggest drinks after principal and additional are present", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "adicional",
            addedProductName: "Batata Frita",
            latestOutboundText: "Quer um adicional?",
            hasAdditional: true,
            hasDrink: false,
        });

        expect(plan.nextCategory).toBe("bebida");
        expect(plan.followupText).toContain("Agora ja te mostro as bebidas");
    });

    it("should finish flow if all categories are present", () => {
        const plan = buildPostAddToCartSalesPlan({
            addedCategory: "bebida",
            addedProductName: "Coca Cola",
            latestOutboundText: "Temos essas bebidas.",
            hasAdditional: true,
            hasDrink: true,
        });

        expect(plan.nextCategory).toBe(null);
        expect(plan.followupText).toContain("me fala e eu ja te peco a localizacao");
    });
});
