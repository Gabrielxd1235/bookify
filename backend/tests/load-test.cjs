
const { performance } = require("node:perf_hooks");

const BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 10000;

async function runTest(totalRequests) {
  console.log(`\n===== BOOKIFY: ${totalRequests} REQUESTS =====`);

  const results = [];
  const start = performance.now();

  const requests = Array.from({ length: totalRequests }, async (_, index) => {
    const requestStart = performance.now();

    try {
      const response = await fetch(`${BASE_URL}/api/health?test=${index + 1}`, {
        method: "GET",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      return {
        status: response.status,
        duration: performance.now() - requestStart,
        error: false,
      };
    } catch (error) {
      return {
        status: "ERROR",
        duration: performance.now() - requestStart,
        error: true,
        message: error.message,
      };
    }
  });

  results.push(...(await Promise.all(requests)));

  const totalTime = (performance.now() - start) / 1000;
  const successful = results.filter(r => r.status === 200).length;
  const failed = results.length - successful;

  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const average = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];

  const statusCounts = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }

  console.log("Total requests:", totalRequests);
  console.log("HTTP 200:", successful);
  console.log("Failed or non-HTTP 200 requests:", failed);
  console.log("Total time:", totalTime.toFixed(2), "seconds");
  console.log("Average time:", average.toFixed(2), "ms");
  console.log("Maximum time:", Math.max(...durations).toFixed(2), "ms");
  console.log("95th percentile:", p95.toFixed(2), "ms");
  console.log("Requests per second:", (totalRequests / totalTime).toFixed(2));
  console.log("HTTP status codes:", statusCounts);

  return { totalRequests, successful, failed };
}

(async () => {
  await runTest(50);
  console.log("\nWaiting 3 seconds...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  await runTest(100);
})().catch(console.error);
