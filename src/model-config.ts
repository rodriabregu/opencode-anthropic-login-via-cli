import { log } from "./logger.ts";

export const BASE_BETAS = [
  "claude-code-20250219",
  "interleaved-thinking-2025-05-14",
  "oauth-2025-04-20",
  "context-management-2025-06-27",
  "prompt-caching-scope-2026-01-05",
];

export const LONG_CONTEXT_BETAS = ["context-1m-2025-08-07"];

const MODEL_OVERRIDES: Record<string, { add?: string[]; remove?: string[] }> = {
  "4-6": { add: ["effort-2025-11-24"] },
};

const excludedBetas = new Map<string, Set<string>>();

export function addExcludedBeta(modelId: string, beta: string): void {
  if (!excludedBetas.has(modelId)) {
    excludedBetas.set(modelId, new Set());
  }
  excludedBetas.get(modelId)!.add(beta);
  log.info("Beta excluded for model", { modelId, excludedBeta: beta });
}

export function getExcludedBetas(modelId: string): Set<string> {
  return excludedBetas.get(modelId) ?? new Set();
}

export function getNextBetaToExclude(modelId: string): string | null {
  const excluded = getExcludedBetas(modelId);
  for (const beta of LONG_CONTEXT_BETAS) {
    if (!excluded.has(beta)) return beta;
  }
  return null;
}

export function resetExcludedBetas(): void {
  excludedBetas.clear();
}

export function getCliVersion(fallback: string): string {
  return process.env.ANTHROPIC_CLI_VERSION || fallback;
}

export function getUserAgent(version: string): string {
  if (process.env.ANTHROPIC_USER_AGENT) return process.env.ANTHROPIC_USER_AGENT;
  return `claude-cli/${version} (external, cli)`;
}

export function getBetaFlags(baseBetas?: string[]): string[] {
  if (process.env.ANTHROPIC_BETA_FLAGS) {
    const custom = process.env.ANTHROPIC_BETA_FLAGS.split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    log.info("Using custom beta flags from ANTHROPIC_BETA_FLAGS", {
      flags: custom,
    });
    return custom;
  }
  return baseBetas ?? BASE_BETAS;
}

export function getBetasForModel(
  modelId: string,
  baseBetas: string[],
  options?: { enableLongContext?: boolean },
): string[] {
  let betas = [...baseBetas];

  const longContextEnabled =
    options?.enableLongContext ||
    process.env.ANTHROPIC_ENABLE_1M_CONTEXT === "1" ||
    process.env.ANTHROPIC_ENABLE_1M_CONTEXT === "true";

  if (longContextEnabled) {
    for (const beta of LONG_CONTEXT_BETAS) {
      if (!betas.includes(beta)) betas.push(beta);
    }
  }

  for (const [pattern, overrides] of Object.entries(MODEL_OVERRIDES)) {
    if (modelId.includes(pattern)) {
      if (overrides.add) {
        for (const beta of overrides.add) {
          if (!betas.includes(beta)) betas.push(beta);
        }
      }
      if (overrides.remove) {
        betas = betas.filter((b) => !overrides.remove!.includes(b));
      }
    }
  }

  const excluded = getExcludedBetas(modelId);
  if (excluded.size > 0) {
    betas = betas.filter((b) => !excluded.has(b));
  }

  return betas;
}

export function isLongContextError(body: string): boolean {
  return (
    body.includes("Extra usage is required for long context requests") ||
    body.includes("extra_usage") ||
    body.includes("usage_limit_exceeded")
  );
}

export function addCacheControlToBody(body: string): string {
  try {
    const parsed = JSON.parse(body);

    if (parsed.system) {
      const blocks = Array.isArray(parsed.system)
        ? parsed.system
        : [{ type: "text", text: parsed.system }];
      const last = blocks[blocks.length - 1];
      if (last && !last.cache_control) {
        last.cache_control = { type: "ephemeral" };
      }
      parsed.system = blocks;
    }

    if (parsed.messages) {
      const recent = parsed.messages.slice(-3);
      for (const msg of recent) {
        const content = Array.isArray(msg.content)
          ? msg.content
          : [{ type: "text", text: msg.content }];
        const last = content[content.length - 1];
        if (last && !last.cache_control) {
          last.cache_control = { type: "ephemeral" };
        }
        msg.content = content;
      }
    }

    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}
