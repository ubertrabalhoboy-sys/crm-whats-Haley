export type UazapiEndpoint =
    | "/send/text"
    | "/send/location-button"
    | "/send/carousel"
    | "/send/request-payment"
    | "/send/pix-button"
    | "/send/button"
    | "/send/buttons"
    | "/send/list"
    | "/send/template";

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function resolveUazapiRequest(payloadInput: Record<string, unknown>) {
    const payload = { ...payloadInput };

    let endpoint: UazapiEndpoint = "/send/text";

    if (payload.locationButton) {
        endpoint = "/send/location-button";
        delete payload.locationButton;
    } else if (payload.carousel) {
        endpoint = "/send/carousel";
    } else if (payload.pixKey && payload.amount) {
        endpoint = "/send/request-payment";
    } else if (payload.pixKey) {
        endpoint = "/send/pix-button";
    } else if (payload.type === "button" || payload.buttonsMessage || payload.choices) {
        endpoint = "/send/buttons";
    } else if (payload.listMessage || payload.list) {
        endpoint = "/send/list";
    } else if (payload.templateMessage || payload.template) {
        endpoint = "/send/template";
    }

    return {
        endpoint,
        payload,
    };
}

function normalizeButtonChoices(choices: unknown[]) {
    return choices
        .map((choice, index) => {
            if (!isNonEmptyString(choice)) {
                return null;
            }

            return {
                buttonId: `btn_${index + 1}`,
                buttonText: {
                    displayText: choice.trim(),
                },
                type: 1,
            };
        })
        .filter((choice): choice is NonNullable<typeof choice> => Boolean(choice));
}

export function buildButtonFallbackRequests(payloadInput: Record<string, unknown>) {
    const payload = { ...payloadInput };
    const candidates: Array<{ endpoint: UazapiEndpoint; payload: Record<string, unknown> }> = [
        {
            endpoint: "/send/button",
            payload,
        },
    ];

    if (Array.isArray(payload.choices) && payload.choices.length > 0) {
        const buttonsMessage = normalizeButtonChoices(payload.choices);
        if (buttonsMessage.length > 0) {
            const compactPayload: Record<string, unknown> = {
                ...payload,
                buttonsMessage,
            };

            delete compactPayload.choices;
            delete compactPayload.type;

            if (isNonEmptyString(compactPayload.footerText)) {
                compactPayload.footer = compactPayload.footerText;
            }

            candidates.push({
                endpoint: "/send/button",
                payload: compactPayload,
            });
        }
    }

    return candidates;
}

export function validateOutgoingPayload(
    endpoint: UazapiEndpoint,
    payload: Record<string, unknown>
) {
    if (!isNonEmptyString(payload.number)) {
        return { ok: false, error: "INVALID_UAZ_PAYLOAD_NUMBER" } as const;
    }

    if (endpoint === "/send/request-payment") {
        if (typeof payload.amount !== "number" || !Number.isFinite(payload.amount) || payload.amount <= 0) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_AMOUNT" } as const;
        }
        if (!isNonEmptyString(payload.pixKey) || !isNonEmptyString(payload.pixType)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_PIX" } as const;
        }
    }

    if (endpoint === "/send/pix-button") {
        if (!isNonEmptyString(payload.pixKey) || !isNonEmptyString(payload.pixType)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_PIX" } as const;
        }
    }

    if (endpoint === "/send/location-button") {
        if (!isNonEmptyString(payload.text)) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_TEXT" } as const;
        }
    }

    if (endpoint === "/send/carousel") {
        if (!Array.isArray(payload.carousel) || payload.carousel.length === 0) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_CAROUSEL" } as const;
        }
    }

    if (endpoint === "/send/buttons") {
        const hasChoices = Array.isArray(payload.choices) && payload.choices.length > 0;
        const hasButtonsMessage = Array.isArray(payload.buttonsMessage) && payload.buttonsMessage.length > 0;
        if (!hasChoices && !hasButtonsMessage) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_BUTTONS" } as const;
        }
    }

    if (endpoint === "/send/button") {
        const hasChoices = Array.isArray(payload.choices) && payload.choices.length > 0;
        const hasButtonsMessage = Array.isArray(payload.buttonsMessage) && payload.buttonsMessage.length > 0;
        if (!hasChoices && !hasButtonsMessage) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_BUTTONS" } as const;
        }
    }

    if (endpoint === "/send/list") {
        const hasList = Array.isArray(payload.list) && payload.list.length > 0;
        const hasListMessage = Array.isArray(payload.listMessage) && payload.listMessage.length > 0;
        if (!hasList && !hasListMessage) {
            return { ok: false, error: "INVALID_UAZ_PAYLOAD_LIST" } as const;
        }
    }

    return { ok: true } as const;
}
