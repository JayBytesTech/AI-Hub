type CircuitState = {
  consecutiveFailures: number;
  openedAt: number | null;
};

type ReliabilityConfig = {
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
};

const circuitByProvider = new Map<string, CircuitState>();

export function resetReliabilityStateForTests() {
  circuitByProvider.clear();
}

function parseIntEnv(name: string, fallback: number, minValue: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= minValue ? Math.floor(raw) : fallback;
}

function config(): ReliabilityConfig {
  return {
    timeoutMs: parseIntEnv("PROVIDER_REQUEST_TIMEOUT_MS", 20000, 1),
    retries: parseIntEnv("PROVIDER_REQUEST_RETRIES", 2, 0),
    retryBaseDelayMs: parseIntEnv("PROVIDER_RETRY_BASE_DELAY_MS", 300, 1),
    circuitFailureThreshold: parseIntEnv("PROVIDER_CIRCUIT_FAILURE_THRESHOLD", 3, 1),
    circuitCooldownMs: parseIntEnv("PROVIDER_CIRCUIT_COOLDOWN_MS", 30000, 1)
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCircuit(provider: string) {
  const existing = circuitByProvider.get(provider);
  if (existing) {
    return existing;
  }
  const next: CircuitState = { consecutiveFailures: 0, openedAt: null };
  circuitByProvider.set(provider, next);
  return next;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly statusCode: number | null;

  constructor(input: {
    provider: string;
    code: string;
    message: string;
    retryable: boolean;
    statusCode?: number | null;
  }) {
    super(input.message);
    this.name = "ProviderError";
    this.provider = input.provider;
    this.code = input.code;
    this.retryable = input.retryable;
    this.statusCode = input.statusCode ?? null;
  }
}

function classifyUnknown(provider: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError({
      provider,
      code: "timeout",
      message: "Provider request timed out",
      retryable: true
    });
  }

  return new ProviderError({
    provider,
    code: "network_error",
    message: error instanceof Error ? error.message : "Provider request failed",
    retryable: true
  });
}

function shouldRetry(error: ProviderError) {
  return error.retryable;
}

function beforeRequest(provider: string, now: number, cfg: ReliabilityConfig) {
  const state = getCircuit(provider);
  if (state.openedAt === null) {
    return;
  }

  const elapsed = now - state.openedAt;
  if (elapsed >= cfg.circuitCooldownMs) {
    state.openedAt = null;
    state.consecutiveFailures = 0;
    return;
  }

  throw new ProviderError({
    provider,
    code: "circuit_open",
    message: `Provider circuit is open for ${provider}`,
    retryable: true
  });
}

function onSuccess(provider: string) {
  const state = getCircuit(provider);
  state.consecutiveFailures = 0;
  state.openedAt = null;
}

function onFailure(provider: string, cfg: ReliabilityConfig) {
  const state = getCircuit(provider);
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= cfg.circuitFailureThreshold) {
    state.openedAt = Date.now();
  }
}

export function providerHttpError(provider: string, status: number, body: string) {
  if (status === 401 || status === 403) {
    return new ProviderError({
      provider,
      code: "auth_error",
      message: `${provider} authentication failed (${status})`,
      retryable: false,
      statusCode: status
    });
  }
  if (status === 429) {
    return new ProviderError({
      provider,
      code: "rate_limited",
      message: `${provider} is rate limited (${status})`,
      retryable: true,
      statusCode: status
    });
  }
  if (status === 408 || status >= 500) {
    return new ProviderError({
      provider,
      code: "upstream_error",
      message: `${provider} upstream failed (${status}): ${body}`,
      retryable: true,
      statusCode: status
    });
  }
  return new ProviderError({
    provider,
    code: "bad_request",
    message: `${provider} request failed (${status}): ${body}`,
    retryable: false,
    statusCode: status
  });
}

export async function executeWithReliability<T>(
  provider: string,
  operation: (signal: AbortSignal) => Promise<T>
) {
  const cfg = config();
  beforeRequest(provider, Date.now(), cfg);

  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= cfg.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const value = await operation(controller.signal);
      clearTimeout(timeout);
      onSuccess(provider);
      return value;
    } catch (error) {
      clearTimeout(timeout);
      const normalized = classifyUnknown(provider, error);
      lastError = normalized;
      if (!shouldRetry(normalized) || attempt === cfg.retries) {
        onFailure(provider, cfg);
        throw normalized;
      }
      const delayMs = cfg.retryBaseDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  const fallback =
    lastError ??
    new ProviderError({
      provider,
      code: "unknown",
      message: "Provider request failed unexpectedly",
      retryable: false
    });
  onFailure(provider, cfg);
  throw fallback;
}
