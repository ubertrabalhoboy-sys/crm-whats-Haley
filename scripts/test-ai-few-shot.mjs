import assert from "node:assert/strict";
import {
    buildFewShotContext,
    getFewShotDatasetVersion,
    prependFewShotContext,
    resolveFewShotExamples,
} from "../src/lib/ai/few-shot.ts";

const burgerExamples = resolveFewShotExamples({
    vertical: "burger",
    maxExamples: 4,
});
assert.ok(burgerExamples.length > 0);
assert.ok(burgerExamples.some((item) => item.id === "burger_after_principal"));

const genericExamples = resolveFewShotExamples({
    vertical: "unknown",
    maxExamples: 2,
});
assert.equal(genericExamples.length, 2);

const bundle = buildFewShotContext({
    vertical: "pizza",
    maxExamples: 3,
});
assert.equal(bundle.exampleCount, 3);
assert.equal(bundle.datasetVersion, getFewShotDatasetVersion());
assert.equal(bundle.contents.length, 1 + bundle.exampleCount * 2);
assert.equal(bundle.contents[0].role, "user");
assert.match(String(bundle.contents[0].parts?.[0]?.text || ""), /Exemplos internos/i);

const baseContext = [{ role: "user", parts: [{ text: "Cliente real: oi" }] }];
const merged = prependFewShotContext(baseContext, bundle.contents);
assert.equal(merged.length, bundle.contents.length + 1);
assert.equal(merged[merged.length - 1].parts?.[0]?.text, "Cliente real: oi");

const emptyBundle = buildFewShotContext({
    vertical: "burger",
    maxExamples: 0,
});
assert.equal(emptyBundle.exampleCount, 0);
assert.deepEqual(emptyBundle.contents, []);

console.log("AI few-shot smoke tests passed");
