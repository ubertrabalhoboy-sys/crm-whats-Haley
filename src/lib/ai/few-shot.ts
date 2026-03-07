import type { Content } from "@google/generative-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type RestaurantVertical = "burger" | "acai" | "pizza" | "sushi" | "generic";
type FewShotExample = {
    id: string;
    keywords?: string[];
    user: string;
    assistant: string;
};
type FewShotNegativeExample = {
    id: string;
    keywords?: string[];
    rule: string;
    bad_assistant: string;
    good_assistant: string;
};

type FewShotDataset = {
    version: string;
    global: FewShotExample[];
    byVertical: Record<RestaurantVertical, FewShotExample[]>;
    negative: {
        global: FewShotNegativeExample[];
        byVertical: Record<RestaurantVertical, FewShotNegativeExample[]>;
    };
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
    negative: {
        global: [],
        byVertical: {
            burger: [],
            acai: [],
            pizza: [],
            sushi: [],
            generic: [],
        },
    },
};

let FEW_SHOT_DATA_CACHE: FewShotDataset | null = null;

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

function normalizeText(text: string) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function toTokens(text: string) {
    const stopwords = new Set([
        "o", "a", "os", "as", "de", "do", "da", "dos", "das", "e", "ou", "um", "uma",
        "pra", "para", "com", "sem", "que", "como", "ja", "agora", "so", "isso",
        "voce", "voces", "me", "te", "seu", "sua", "no", "na", "nos", "nas",
    ]);
    return normalizeText(text)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !stopwords.has(token));
}

function scoreBySeedText(seedText: string, contentText: string, keywords?: string[]) {
    const normalizedSeed = normalizeText(seedText);
    if (!normalizedSeed) return 0;
    const seedTokens = new Set(toTokens(normalizedSeed));
    if (seedTokens.size === 0) return 0;

    let score = 0;
    const contentTokens = new Set(toTokens(contentText));
    for (const token of seedTokens) {
        if (contentTokens.has(token)) score += 2;
    }

    for (const keyword of keywords || []) {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) continue;
        if (normalizedSeed.includes(normalizedKeyword)) score += 3;
    }

    return score;
}

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
            negative: {
                global: Array.isArray(parsed.negative?.global)
                    ? (parsed.negative.global as FewShotNegativeExample[])
                    : [],
                byVertical: {
                    burger: Array.isArray(parsed.negative?.byVertical?.burger)
                        ? (parsed.negative.byVertical.burger as FewShotNegativeExample[])
                        : [],
                    acai: Array.isArray(parsed.negative?.byVertical?.acai)
                        ? (parsed.negative.byVertical.acai as FewShotNegativeExample[])
                        : [],
                    pizza: Array.isArray(parsed.negative?.byVertical?.pizza)
                        ? (parsed.negative.byVertical.pizza as FewShotNegativeExample[])
                        : [],
                    sushi: Array.isArray(parsed.negative?.byVertical?.sushi)
                        ? (parsed.negative.byVertical.sushi as FewShotNegativeExample[])
                        : [],
                    generic: Array.isArray(parsed.negative?.byVertical?.generic)
                        ? (parsed.negative.byVertical.generic as FewShotNegativeExample[])
                        : [],
                },
            },
        };
        return FEW_SHOT_DATA_CACHE;
    } catch {
        FEW_SHOT_DATA_CACHE = DEFAULT_FEW_SHOT_DATA;
        return FEW_SHOT_DATA_CACHE;
    }
}

function rankBySeedText<T extends { keywords?: string[] }>(
    items: T[],
    seedText: string,
    getContent: (item: T) => string
) {
    if (!seedText.trim()) {
        return items;
    }

    return [...items]
        .map((item, index) => ({
            item,
            index,
            score: scoreBySeedText(seedText, getContent(item), item.keywords),
        }))
        .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return a.index - b.index;
        })
        .map((entry) => entry.item);
}

function resolveFewShotNegativeExample(params: {
    vertical?: string | null;
    seedText?: string | null;
}) {
    const fewShotData = readFewShotDataset();
    const vertical = normalizeVertical(params.vertical);
    const seedText = String(params.seedText || "");

    const merged = [
        ...fewShotData.negative.global,
        ...fewShotData.negative.byVertical[vertical],
    ];
    const uniqueById = new Map<string, FewShotNegativeExample>();
    for (const item of merged) {
        if (!item?.id || !item?.rule || !item?.bad_assistant || !item?.good_assistant) continue;
        if (!uniqueById.has(item.id)) uniqueById.set(item.id, item);
    }

    const ranked = rankBySeedText(
        Array.from(uniqueById.values()),
        seedText,
        (item) => `${item.rule}\n${item.bad_assistant}\n${item.good_assistant}`
    );

    return ranked[0] || null;
}

export function getFewShotDatasetVersion() {
    return readFewShotDataset().version;
}

export function resolveFewShotExamples(params: {
    vertical?: string | null;
    maxExamples: number;
    seedText?: string | null;
}) {
    const vertical = normalizeVertical(params.vertical);
    const maxExamples = clamp(Math.floor(params.maxExamples), 0, 8);
    if (maxExamples <= 0) return [] as FewShotExample[];
    const fewShotData = readFewShotDataset();
    const seedText = String(params.seedText || "");

    const merged = [...fewShotData.global, ...fewShotData.byVertical[vertical]];
    const uniqueById = new Map<string, FewShotExample>();
    for (const item of merged) {
        if (!item?.id || !item?.user || !item?.assistant) continue;
        if (!uniqueById.has(item.id)) uniqueById.set(item.id, item);
    }

    const ranked = rankBySeedText(
        Array.from(uniqueById.values()),
        seedText,
        (item) => `${item.user}\n${item.assistant}`
    );

    return ranked.slice(0, maxExamples);
}

export function buildFewShotContext(params: {
    vertical?: string | null;
    maxExamples: number;
    seedText?: string | null;
}) {
    const normalizedMaxExamples = clamp(Math.floor(params.maxExamples), 0, 8);
    if (normalizedMaxExamples <= 0) {
        return {
            contents: [] as Content[],
            exampleCount: 0,
            negativeExampleApplied: false,
            datasetVersion: getFewShotDatasetVersion(),
        };
    }

    const selected = resolveFewShotExamples(params);
    const selectedNegative = resolveFewShotNegativeExample(params);

    if (selected.length === 0 && !selectedNegative) {
        return {
            contents: [] as Content[],
            exampleCount: 0,
            negativeExampleApplied: false,
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

    if (selectedNegative) {
        contents.push({
            role: "user",
            parts: [
                {
                    text: [
                        "[Exemplo negativo - regra]",
                        selectedNegative.rule,
                        `[Nao fazer] ${selectedNegative.bad_assistant}`,
                        `[Fazer] ${selectedNegative.good_assistant}`,
                    ].join("\n"),
                },
            ],
        });
    }

    return {
        contents,
        exampleCount: selected.length,
        negativeExampleApplied: Boolean(selectedNegative),
        datasetVersion: getFewShotDatasetVersion(),
    };
}

export function prependFewShotContext(baseContext: Content[], fewShotContext: Content[]) {
    if (!fewShotContext.length) return baseContext;
    return [...fewShotContext, ...baseContext];
}
