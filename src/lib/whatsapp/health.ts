export type WhatsappHealthState =
    | "online"
    | "connecting"
    | "unstable"
    | "token_invalid"
    | "instance_limit"
    | "offline"
    | "unknown";

export type WhatsappHealthView = {
    state: WhatsappHealthState;
    label: string;
    reason: string;
    status: string;
    updatedAt: string | null;
};

type DeriveParams = {
    uazStatus: string | null | undefined;
    warningTitle?: string | null;
    warningMessage?: string | null;
    warningCreatedAt?: string | null;
};

const ONLINE_STATUSES = new Set(["online", "open", "ready", "connected"]);

function normalizeText(value: string | null | undefined): string {
    if (!value) return "";
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function includesAny(text: string, patterns: string[]) {
    return patterns.some((pattern) => text.includes(pattern));
}

function reasonByState(state: WhatsappHealthState): { label: string; reason: string } {
    switch (state) {
        case "online":
            return {
                label: "Online",
                reason: "Instancia conectada e pronta para atendimento.",
            };
        case "connecting":
            return {
                label: "Conectando",
                reason: "Instancia em pareamento ou reconexao.",
            };
        case "unstable":
            return {
                label: "Instavel",
                reason: "Conexao do aparelho com oscilacao (rede/bateria).",
            };
        case "token_invalid":
            return {
                label: "Token invalido",
                reason: "Token da instancia invalido ou expirado.",
            };
        case "instance_limit":
            return {
                label: "Limite de instancia",
                reason: "Limite de instancias atingido no provedor.",
            };
        case "offline":
            return {
                label: "Offline",
                reason: "Instancia desconectada.",
            };
        default:
            return {
                label: "Indefinido",
                reason: "Nao foi possivel determinar o estado da conexao.",
            };
    }
}

export function deriveWhatsappHealth(params: DeriveParams): WhatsappHealthView {
    const status = normalizeText(params.uazStatus) || "unknown";
    const warningText = normalizeText([params.warningTitle, params.warningMessage].filter(Boolean).join(" "));

    let state: WhatsappHealthState;
    if (includesAny(warningText, ["token", "invalido", "unauthorized"])) {
        state = "token_invalid";
    } else if (includesAny(warningText, ["limite", "instancia", "maximo"])) {
        state = "instance_limit";
    } else if (includesAny(warningText, ["instavel", "battery", "bateria", "network", "internet"])) {
        state = "unstable";
    } else if (ONLINE_STATUSES.has(status)) {
        state = "online";
    } else if (includesAny(status, ["connect", "pair", "qr", "sync"])) {
        state = "connecting";
    } else if (includesAny(status, ["disconnect", "offline", "close"])) {
        state = "offline";
    } else {
        state = "unknown";
    }

    const defaults = reasonByState(state);
    const warningReason = params.warningMessage?.trim();

    return {
        state,
        label: defaults.label,
        reason: warningReason || defaults.reason,
        status,
        updatedAt: params.warningCreatedAt ?? null,
    };
}
