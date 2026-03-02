import assert from "node:assert/strict";
import {
    buildCarouselPriceText,
    buildCartSnapshotData,
    calculateCouponDiscount,
    resolveAppliedDiscount,
} from "../src/lib/ai/toolRules.ts";

assert.equal(calculateCouponDiscount(100, "GANHE10"), 10);
assert.equal(calculateCouponDiscount(80, "PROMO 25%"), 20);
assert.equal(calculateCouponDiscount(50, "SEM_DESCONTO"), 0);

assert.equal(resolveAppliedDiscount(100, 15, "GANHE10"), 15);
assert.equal(resolveAppliedDiscount(100, 0, "GANHE10"), 10);
assert.equal(resolveAppliedDiscount(100, null, ""), 0);

assert.equal(
    buildCarouselPriceText({
        price: 30,
        promoPrice: null,
        activeCouponCode: "",
    }),
    "*R$ 30.00*"
);

assert.equal(
    buildCarouselPriceText({
        price: 30,
        promoPrice: 24,
        activeCouponCode: "",
    }),
    "De ~R$ 30.00~ por *R$ 24.00*"
);

assert.equal(
    buildCarouselPriceText({
        price: 30,
        promoPrice: null,
        activeCouponCode: "GANHE10",
    }),
    "De ~R$ 30.00~ por *R$ 27.00* com seu cupom"
);

assert.equal(
    buildCarouselPriceText({
        price: 30,
        promoPrice: 24,
        activeCouponCode: "GANHE10",
    }),
    "De ~R$ 30.00~ por *R$ 24.00*\nCom seu cupom: *R$ 21.60*"
);

const snapshot = buildCartSnapshotData({
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: 39.999,
    discount: 4.444,
    delivery_fee: 7.555,
    distance_km: 4.444,
    total: 43.11,
    applied_coupon_code: "GANHE10",
    payment_method: "pix",
    order_id: "order-1",
    source: "submit_final_order",
    updated_at: "2026-03-02T00:00:00.000Z",
});

assert.deepEqual(snapshot, {
    items: [{ product_id: "1", quantity: 1, category: "principal" }],
    subtotal: 40,
    discount: 4.44,
    delivery_fee: 7.55,
    distance_km: 4.44,
    total: 43.11,
    applied_coupon_code: "GANHE10",
    payment_method: "pix",
    order_id: "order-1",
    source: "submit_final_order",
    updated_at: "2026-03-02T00:00:00.000Z",
});

console.log("AI tool rules smoke tests passed");
