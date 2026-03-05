export type HubProfile = "development" | "test" | "production";
export type ProviderName = "mock" | "claude" | "gemini" | "chatgpt";

export type HubConfig = {
  profile: HubProfile;
  server: {
    host: string;
    port: number;
  };
  storage: {
    dbPath?: string;
    retention: {
      artifactsDays: number;
      terminalAuditDays: number;
    };
  };
  security: {
    terminalConfirmRequired: boolean;
    workspaceAllowedRoots: string[];
    terminalBlockedPatterns: string[];
  };
  reliability: {
    requestTimeoutMs: number;
    requestRetries: number;
    retryBaseDelayMs: number;
    circuitFailureThreshold: number;
    circuitCooldownMs: number;
  };
  providers: {
    enabled: ProviderName[];
    requireSecretsOnStartup: boolean;
    openai: { apiKey: string; model: string };
    anthropic: { apiKey: string; model: string };
    gemini: { apiKey: string; model: string };
  };
};

function parseCsv(raw: string | undefined) {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseInteger(raw: string | undefined, fallback: number, min: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const intValue = Math.floor(value);
  if (intValue < min) {
    return fallback;
  }
  return intValue;
}

function parseProfile(rawProfile: string | undefined, rawNodeEnv: string | undefined): HubProfile {
  const value = (rawProfile ?? rawNodeEnv ?? "development").trim().toLowerCase();
  if (value === "production") {
    return "production";
  }
  if (value === "test") {
    return "test";
  }
  return "development";
}

function parseProviderNames(raw: string | undefined): ProviderName[] {
  const allowed: ProviderName[] = ["mock", "claude", "gemini", "chatgpt"];
  const selected = parseCsv(raw);
  if (selected.length === 0) {
    return allowed;
  }
  const deduped = [...new Set(selected)];
  const invalid = deduped.filter((item) => !allowed.includes(item as ProviderName));
  if (invalid.length > 0) {
    throw new Error(`HUB_ENABLED_PROVIDERS contains invalid provider(s): ${invalid.join(", ")}`);
  }
  return deduped as ProviderName[];
}

function requiredSecretFor(provider: ProviderName, config: HubConfig) {
  if (provider === "chatgpt") {
    return config.providers.openai.apiKey;
  }
  if (provider === "claude") {
    return config.providers.anthropic.apiKey;
  }
  if (provider === "gemini") {
    return config.providers.gemini.apiKey;
  }
  return "not-required";
}

export function getHubConfig(): HubConfig {
  const profile = parseProfile(process.env.HUB_PROFILE, process.env.NODE_ENV);
  const enabledProviders = parseProviderNames(process.env.HUB_ENABLED_PROVIDERS);
  const requireSecretsOnStartup = parseBoolean(
    process.env.HUB_REQUIRE_PROVIDER_SECRETS,
    profile === "production"
  );

  const config: HubConfig = {
    profile,
    server: {
      host: process.env.HUB_HOST ?? "0.0.0.0",
      port: parseInteger(process.env.HUB_PORT, 3000, 1)
    },
    storage: {
      dbPath: (process.env.HUB_DB_PATH ?? "").trim() || undefined,
      retention: {
        artifactsDays: parseInteger(process.env.HUB_RETENTION_ARTIFACT_DAYS, 0, 0),
        terminalAuditDays: parseInteger(process.env.HUB_RETENTION_TERMINAL_AUDIT_DAYS, 0, 0)
      }
    },
    security: {
      terminalConfirmRequired: parseBoolean(process.env.TERMINAL_CONFIRM_REQUIRED, true),
      workspaceAllowedRoots: parseCsv(process.env.HUB_WORKSPACE_ALLOWED_ROOTS),
      terminalBlockedPatterns: parseCsv(process.env.TERMINAL_BLOCKLIST_PATTERNS)
    },
    reliability: {
      requestTimeoutMs: parseInteger(process.env.PROVIDER_REQUEST_TIMEOUT_MS, 20000, 1),
      requestRetries: parseInteger(process.env.PROVIDER_REQUEST_RETRIES, 2, 0),
      retryBaseDelayMs: parseInteger(process.env.PROVIDER_RETRY_BASE_DELAY_MS, 300, 1),
      circuitFailureThreshold: parseInteger(process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD, 3, 1),
      circuitCooldownMs: parseInteger(process.env.PROVIDER_CIRCUIT_COOLDOWN_MS, 30000, 1)
    },
    providers: {
      enabled: enabledProviders,
      requireSecretsOnStartup,
      openai: {
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        model: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest"
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY ?? "",
        model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash"
      }
    }
  };

  if (requireSecretsOnStartup) {
    const missing = config.providers.enabled.filter((provider) => requiredSecretFor(provider, config).length === 0);
    if (missing.length > 0) {
      throw new Error(
        `Missing required provider secrets for profile=${profile}: ${missing.join(", ")}. Set HUB_ENABLED_PROVIDERS or provider API keys.`
      );
    }
  }

  return config;
}
