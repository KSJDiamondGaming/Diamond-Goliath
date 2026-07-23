'use strict';

const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;
const MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10000;
const USER_AGENT = 'Goliath-Social-Studio/1.0';

const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  timeouts: 0,
  rateLimits: 0,
  totalResponseTimeMs: 0,
  byProvider: Object.create(null),
};

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeTimeoutMs(value) {
  return boundedNumber(value, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
}

function normalizeRetries(value) {
  return boundedNumber(value, DEFAULT_RETRIES, 0, MAX_RETRIES);
}

function providerMetrics(provider) {
  const key = String(provider || 'unknown').toLowerCase();
  if (!metrics.byProvider[key]) {
    metrics.byProvider[key] = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      timeouts: 0,
      rateLimits: 0,
      totalResponseTimeMs: 0,
      lastStatus: null,
      lastError: null,
      lastRequestAt: null,
    };
  }
  return metrics.byProvider[key];
}

function record(provider, values = {}) {
  const target = providerMetrics(provider);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && typeof target[key] === 'number') {
      target[key] += value;
      if (typeof metrics[key] === 'number') metrics[key] += value;
    } else {
      target[key] = value;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function retryDelayMs(attempt, response) {
  const headerDelay = retryAfterMs(response);
  if (headerDelay !== null) return Math.min(MAX_RETRY_DELAY_MS, headerDelay);
  return Math.min(MAX_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS * (2 ** attempt));
}

function classify(status, timedOut = false) {
  if (timedOut) return 'timeout';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider_unavailable';
  if (status >= 400) return 'request_rejected';
  return 'network';
}

function shouldRetry(status, error, attempt, retries) {
  if (attempt >= retries) return false;
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') return true;
  if (status === 429 || status >= 500) return true;
  return status === 0;
}

async function parseBody(response) {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function errorMessage(data, response, fallback) {
  return data?.error?.message
    || data?.message
    || data?.error_description
    || data?.error
    || response?.statusText
    || fallback;
}

async function requestJson(url, options = {}) {
  const provider = String(options.provider || 'unknown').toLowerCase();
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const retries = normalizeRetries(options.retries);
  const method = options.method || 'GET';
  const headers = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    ...(options.headers || {}),
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutRef = setTimeout(() => controller.abort(), timeoutMs);
    timeoutRef.unref?.();
    record(provider, { requests: 1, lastRequestAt: new Date().toISOString() });

    try {
      const response = await fetch(url, {
        ...options,
        provider: undefined,
        timeoutMs: undefined,
        retries: undefined,
        method,
        headers,
        signal: controller.signal,
      });
      const data = await parseBody(response);
      const responseTimeMs = Date.now() - startedAt;
      record(provider, {
        totalResponseTimeMs: responseTimeMs,
        lastStatus: response.status,
        lastError: null,
      });

      if (response.ok) {
        record(provider, { successes: 1 });
        return {
          data,
          status: response.status,
          responseTimeMs,
          attempts: attempt + 1,
          headers: response.headers,
        };
      }

      const message = errorMessage(data, response, `${provider} request failed`);
      const error = new Error(`${message} (${response.status})`);
      error.status = response.status;
      error.type = classify(response.status);
      error.provider = provider;
      error.responseTimeMs = responseTimeMs;
      error.attempts = attempt + 1;
      error.data = data;
      lastError = error;

      if (response.status === 429) record(provider, { rateLimits: 1 });
      if (!shouldRetry(response.status, error, attempt, retries)) throw error;

      record(provider, { retries: 1 });
      await sleep(retryDelayMs(attempt, response));
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      const normalized = timedOut
        ? Object.assign(new Error(`${provider} request timed out after ${timeoutMs}ms.`), {
          code: 'ETIMEDOUT',
          type: 'timeout',
          provider,
          timeoutMs,
          attempts: attempt + 1,
        })
        : error;
      lastError = normalized;
      record(provider, {
        ...(timedOut ? { timeouts: 1 } : {}),
        lastError: normalized?.message || String(normalized),
      });

      if (!shouldRetry(Number(normalized?.status || 0), normalized, attempt, retries)) {
        record(provider, { failures: 1 });
        throw normalized;
      }

      record(provider, { retries: 1 });
      await sleep(retryDelayMs(attempt));
    } finally {
      clearTimeout(timeoutRef);
    }
  }

  record(provider, { failures: 1 });
  throw lastError || new Error(`${provider} request failed.`);
}

function summary() {
  const byProvider = {};
  for (const [provider, values] of Object.entries(metrics.byProvider)) {
    byProvider[provider] = {
      ...values,
      averageResponseTimeMs: values.requests > 0
        ? Math.round(values.totalResponseTimeMs / values.requests)
        : 0,
    };
  }
  return {
    ...metrics,
    averageResponseTimeMs: metrics.requests > 0
      ? Math.round(metrics.totalResponseTimeMs / metrics.requests)
      : 0,
    byProvider,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_RETRIES,
  MAX_RETRIES,
  normalizeTimeoutMs,
  normalizeRetries,
  requestJson,
  summary,
};