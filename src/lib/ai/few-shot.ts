import type { Content } from "@google/generative-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type RestaurantVertical = "burger" | "acai" | "pizza" | "sushi" | "generic";
type FewShotExample = {
    id: string;
    user: string;
    assistant: string;
};

type FewShotDataset = {
    version: string;
    global: FewShotExample[];
    byVertical: Record<RestaurantVertical, FewShotExample[]>;
};

const DEFAULT_FEW_SHOT_DATA: FewShotDataset = {
    version: "fallback",
    global: [],
    byVertical: {
        burger: [],
        acai: [],
        pizza: [],
        sushi: [],
        generic: [],
    },
};
let FEW_SHOT_DATA_CACHE: FewShotDataset | null = null;

function readFewShotDataset(): FewShotDataset {
    if (FEW_SHOT_DATA_CACHE) return FEW_SHOT_DATA_CACHE;

    try {
        const filePath = join(process.cwd(), "src", "lib", "ai", "few-shot-examples.json");
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<FewShotDataset>;
        FEW_SHOT_DATA_CACHE = {
            version: typeof parsed.version === "string" && parsed.version.trim()
                ? parsed.version.trim()
                : DEFAULT_FEW_SHOT_DATA.version,
            global: Array.isArray(parsed.global) ? (parsed.global as FewShotExample[]) : [],
            byVertical: {
                burger: Array.isArray(parsed.byVertical?.burger)
                    ? (parsed.byVertical.burger as FewShotExample[])
                    : [],
                acai: Array.isArray(parsed.byVertical?.acai)
                    ? (parsed.byVertical.acai as FewShotExample[])
                    : [],
                pizza: Array.isArray(parsed.byVertical?.pizza)
                    ? (parsed.byVertical.pizza as FewShotExample[])
                    : [],
                sushi: Array.isArray(parsed.byVertical?.sushi)
                    ? (parsed.byVertical.sushi as FewShotExample[])
                    : [],
                generic: Array.isArray(parsed.byVertical?.generic)
                    ? (parsed.byVertical.generic as FewShotExample[])
                    : [],
            },
        };
        return FEW_SHOT_DATA_CACHE;
    } catch {
        FEW_SHOT_DATA_CACHE = DEFAULT_FEW_SHOT_DATA;
        return FEW_SHOT_DATA_CACHE;
    }
}

function normalizeVertical(value: string | null | undefined): RestaurantVertical {
    if (
        value === "burger" ||
        value === "acai" ||
        value === "pizza" ||
        value === "sushi" ||
        value === "generic"
    ) {
        return value;
    }
    return "generic";
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function getFewShotDatasetVersion() {
    return readFewShotDataset().version;
}

export function resolveFewShotExamples(params: {
    vertical?: string | null;
    maxExamples: number;
}) {
    const vertical = normalizeVertical(params.vertical);
    const maxExamples = clamp(Math.floor(params.maxExamples), 0, 8);
    if (maxExamples <= 0) return [] as FewShotExample[];
    const fewShotData = readFewShotDataset();

    const globalExamples = Array.isArray(fewShotData.global)
        ? fewShotData.global
        : [];
    const verticalExamples = Array.isArray(fewShotData.byVertical?.[vertical])
        ? fewShotData.byVertical[vertical]
        : [];

    const merged = [...globalExamples, ...verticalExamples];
    const uniqueById = new Map<string, FewShotExample>();
    for (const item of merged) {
        if (!item?.id || !item?.user || !item?.assistant) continue;
        if (!uniqueById.has(item.id)) uniqueById.set(item.id, item);
    }

    return Array.from(uniqueById.values()).slice(0, maxExamples);
}

export function buildFewShotContext(params: {
    vertical?: string | null;
    maxExamples: number;
}) {
    const selected = resolveFewShotExamples(params);
    if (selected.length === 0) {
        return {
            contents: [] as Content[],
            exampleCount: 0,
            datasetVersion: getFewShotDatasetVersion(),
        };
    }

    const contents: Content[] = [
        {
            role: "user",
            parts: [
                {
                    text:
                        "[Exemplos internos de estilo]\nUse os exemplos abaixo apenas como referencia de conducao comercial.\nNao responda a eles; responda somente ao cliente real.",
                },
            ],
        },
    ];

    for (const [index, item] of selected.entries()) {
        contents.push({
            role: "user",
            parts: [{ text: `[Exemplo ${index + 1} - Cliente]\n${item.user}` }],
        });
        contents.push({
            role: "model",
            parts: [{ text: `[Exemplo ${index + 1} - Assistente]\n${item.assistant}` }],
        });
    }

    return {
        contents,
        exampleCount: selected.length,
        datasetVersion: getFewShotDatasetVersion(),
    };
}

export function prependFewShotContext(baseContext: Content[], fewShotContext: Content[]) {
    if (!fewShotContext.length) return baseContext;
    return [...fewShotContext, ...baseContext];
}
