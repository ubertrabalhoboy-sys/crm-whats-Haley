import assert from "node:assert/strict";
import {
    getActiveChatCouponCode,
    persistChatCartSnapshot,
} from "../src/lib/ai/toolHandlerData.ts";
import { buildCartSnapshotData } from "../src/lib/ai/toolRules.ts";
import {
    resolveUazapiRequest,
    validateOutgoingPayload,
} from "../src/lib/ai/uazapiRules.ts";

function createCouponDbMock(couponValue) {
    return {
        from(table) {
            assert.equal(table, "chats");
            return {
                select(columns) {
                    assert.equal(columns, "cupom_ganho");
                    return {
                        eq(column, value) {
                            assert.equal(column, "id");
                            assert.equal(value, "chat-1");
                            return this;
                        },
                        maybeSingle() {
                            return Promise.resolve({
                                data: { cupom_ganho: couponValue },
                                error: null,
                            });
                        },
                    };
                },
            };
        },
    };
}

function createPersistDbMock() {
    const state = {
        payload: null,
        filters: [],
    };

    const query = {
        eq(column, value) {
            state.filters.push([column, value]);
            return query;
        },
        then(resolve, reject) {
            return Promise.resolve({ error: null }).then(resolve, reject);
        },
    };

    return {
        state,
        db: {
            from(table) {
                assert.equal(table, "chats");
                return {
                    update(values) {
                        state.payload = values;
                        return query;
                    },
                };
            },
        },
    };
}

const couponDb = createCouponDbMock("GANHE15");
assert.equal(await getActiveChatCouponCode(couponDb, "chat-1"), "GANHE15");
assert.equal(await getActiveChatCouponCode(couponDb, undefined), "");

const persistMock = createPersistDbMock();
const snapshot = buildCartSnapshotData({
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: 30,
    discount: 3,
    delivery_fee: 7,
    total: 34,
    applied_coupon_code: "GANHE10",
    source: "calculate_cart_total",
    updated_at: "2026-03-02T02:00:00.000Z",
});

const persistResult = await persistChatCartSnapshot(
    persistMock.db,
    {
        restaurant_id: "rest-1",
        chat_id: "chat-1",
        wa_chat_id: "5511999999999@s.whatsapp.net",
        base_url: "http://localhost:3000",
    },
    snapshot
);
assert.deepEqual(persistResult, { ok: true, skipped: false });
assert.deepEqual(persistMock.state.payload, {
    cart_snapshot: snapshot,
    updated_at: "2026-03-02T02:00:00.000Z",
});
assert.deepEqual(persistMock.state.filters, [
    ["id", "chat-1"],
    ["restaurant_id", "rest-1"],
]);

const locationRequest = resolveUazapiRequest({
    number: "5511999999999",
    text: "Compartilhe sua localizacao",
    locationButton: true,
});
assert.equal(locationRequest.endpoint, "/send/location-button");
assert.equal("locationButton" in locationRequest.payload, false);
assert.deepEqual(
    validateOutgoingPayload(locationRequest.endpoint, locationRequest.payload),
    { ok: true }
);

const pixRequest = resolveUazapiRequest({
    number: "5511999999999",
    amount: 42,
    pixKey: "abc",
    pixType: "EVP",
    text: "Pague aqui",
});
assert.equal(pixRequest.endpoint, "/send/request-payment");
assert.deepEqual(
    validateOutgoingPayload(pixRequest.endpoint, pixRequest.payload),
    { ok: true }
);

const invalidButtonsRequest = resolveUazapiRequest({
    number: "5511999999999",
    type: "button",
    text: "Escolha",
});
assert.equal(invalidButtonsRequest.endpoint, "/send/buttons");
assert.deepEqual(
    validateOutgoingPayload(invalidButtonsRequest.endpoint, invalidButtonsRequest.payload),
    { ok: false, error: "INVALID_UAZ_PAYLOAD_BUTTONS" }
);

console.log("AI integration mocks smoke tests passed");
