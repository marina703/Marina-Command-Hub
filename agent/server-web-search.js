/* ============================================================
   MarinaAI — Web Search Tool

   Provides web search capability with multiple provider support.
   Designed to be used as a tool in the durable workflow system.
   ============================================================ */

const CRYPTO = require("crypto");

const PROVIDERS = {
  tavily: {
    name: "tavily",
    baseUrl: "https://api.tavily.com/search",
    requiredEnv: "TAVILY_API_KEY",
    maxResults: 10,
  },
  serpapi: {
    name: "serpapi",
    baseUrl: "https://serpapi.com/search",
    requiredEnv: "SERPAPI_API_KEY",
    maxResults: 10,
  },
  exa: {
    name: "exa",
    baseUrl: "https://api.exa.ai/search",
    requiredEnv: "EXA_API_KEY",
    maxResults: 10,
  },
};

const DEFAULT_PROVIDER = process.env.WEB_SEARCH_PROVIDER || "tavily";
const MAX_RESULTS = Number(process.env.WEB_SEARCH_MAX_RESULTS) || 10;
const TIMEOUT_MS = Number(process.env.WEB_SEARCH_TIMEOUT_MS) || 15000;

function getProviderConfig() {
  const providerName = DEFAULT_PROVIDER;
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new Error(`Unknown search provider: ${providerName}`);
  }
  const apiKey = process.env[config.requiredEnv];
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${providerName}: set ${config.requiredEnv}`,
    );
  }
  return { ...config, apiKey };
}

async function searchWeb(query, options = {}) {
  const { maxResults = MAX_RESULTS, provider: customProvider } = options;

  let providerConfig;
  try {
    providerConfig = customProvider
      ? {
          ...PROVIDERS[customProvider],
          apiKey: process.env[PROVIDERS[customProvider]?.requiredEnv],
        }
      : getProviderConfig();
  } catch (err) {
    // Gracefully handle missing API key for default provider
    const providerName = customProvider || DEFAULT_PROVIDER;
    return {
      ok: false,
      message: `No API key configured for ${providerName}`,
    };
  }

  if (!providerConfig.apiKey) {
    return {
      ok: false,
      message: `No API key configured for ${providerConfig.name}`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let results;

    if (providerConfig.name === "tavily") {
      const response = await fetch(providerConfig.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: "advanced",
          include_answer: true,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Tavily API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      results = (data.results || []).map((r, i) => ({
        rank: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
        raw_content: r.raw_content,
      }));
    } else if (providerConfig.name === "serpapi") {
      const params = new URLSearchParams({
        q: query,
        api_key: providerConfig.apiKey,
        num: maxResults.toString(),
        engine: "google",
      });

      const response = await fetch(`${providerConfig.baseUrl}?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SerpAPI error: ${response.status} ${error}`);
      }

      const data = await response.json();
      results = (data.organic_results || []).map((r, i) => ({
        rank: i + 1,
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        score: 1.0 - i * 0.1,
      }));
    } else if (providerConfig.name === "exa") {
      const response = await fetch(providerConfig.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": providerConfig.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: maxResults,
          useAutoprompt: true,
          type: "neural",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Exa API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      results = (data.results || []).map((r, i) => ({
        rank: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.text?.slice(0, 300),
        score: r.score,
      }));
    }

    clearTimeout(timeoutId);

    return {
      ok: true,
      provider: providerConfig.name,
      query,
      results,
      resultCount: results.length,
      searchedAt: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return { ok: false, message: `Search timeout after ${TIMEOUT_MS}ms` };
    }
    return { ok: false, message: error.message };
  }
}

/**
 * Search with automatic provider fallback
 */
async function searchWithFallback(query, options = {}) {
  const providers = Object.keys(PROVIDERS).filter(
    (p) => process.env[PROVIDERS[p].requiredEnv],
  );

  for (const provider of providers) {
    const result = await searchWeb(query, { ...options, provider });
    if (result.ok) return result;
    console.warn(
      `Search provider ${provider} failed: ${result.message}, trying next...`,
    );
  }

  return { ok: false, message: "All search providers failed" };
}

/**
 * Batch search multiple queries in parallel
 */
async function batchSearch(queries, options = {}) {
  const concurrency = options.concurrency || 3;
  const results = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((q) => searchWeb(q, options)),
    );
    results.push(...batchResults);
  }

  return { ok: true, results };
}

module.exports = {
  searchWeb,
  searchWithFallback,
  batchSearch,
  PROVIDERS,
  DEFAULT_PROVIDER,
};
