import assert from "node:assert/strict";
import {
    AI_TRANSCRIPT_DATASET_VERSION,
    runTranscriptBenchmark,
} from "./ai-transcript-benchmark.mjs";

function toFixedNumber(value) {
    return Number(value.toFixed(1));
}

const configuredRuns = Number(process.env.AI_TRANSCRIPT_RUNS || 5);
const runs = Number.isFinite(configuredRuns) && configuredRuns > 0
    ? Math.floor(configuredRuns)
    : 5;

const runResults = [];

for (let index = 0; index < runs; index += 1) {
    const result = runTranscriptBenchmark({
        print: false,
        failOnError: false,
    });
    runResults.push(result);
}

const scores = runResults.map((result) => result.overallScore);
const minScore = Math.min(...scores);
const maxScore = Math.max(...scores);
const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
const variance = scores.reduce((sum, score) => sum + ((score - meanScore) ** 2), 0) / scores.length;
const standardDeviation = Math.sqrt(variance);
const unstableRuns = runResults.filter((result) => result.failures.length > 0).length;

console.log(`AI transcript multirun benchmark (${runs} execucoes) - dataset ${AI_TRANSCRIPT_DATASET_VERSION}`);
console.log(`- score medio: ${toFixedNumber(meanScore)}%`);
console.log(`- score minimo: ${toFixedNumber(minScore)}%`);
console.log(`- score maximo: ${toFixedNumber(maxScore)}%`);
console.log(`- desvio padrao: ${toFixedNumber(standardDeviation)}`);
console.log(`- execucoes instaveis: ${unstableRuns}/${runs}`);

assert.equal(unstableRuns, 0);
