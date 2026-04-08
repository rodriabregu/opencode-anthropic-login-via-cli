import { log } from "./logger.ts";

/**
 * Parse ANTHROPIC_BASE_URL from the environment.
 * Returns a valid HTTP(S) URL or null if unset/invalid.
 *
 * Rejects URLs with embedded credentials (user:pass@host) for safety.
 */
export function resolveBaseUrl(): URL | null {
  const raw = process.env.ANTHROPIC_BASE_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      log.warn("ANTHROPIC_BASE_URL has unsupported protocol, ignoring", {
        protocol: url.protocol,
      });
      return null;
    }
    if (url.username || url.password) {
      log.warn("ANTHROPIC_BASE_URL contains credentials, ignoring for safety");
      return null;
    }
    return url;
  } catch {
    log.warn("ANTHROPIC_BASE_URL is not a valid URL, ignoring", { raw });
    return null;
  }
}

/**
 * Check if TLS verification should be skipped for custom API endpoints.
 * Only effective when ANTHROPIC_BASE_URL is also set — prevents accidental
 * use against the production Anthropic API.
 */
export function isInsecure(): boolean {
  if (!resolveBaseUrl()) return false;
  const raw = process.env.ANTHROPIC_INSECURE?.trim();
  return raw === "1" || raw === "true";
}

/**
 * Rewrite the origin (protocol + host) of a request URL when
 * ANTHROPIC_BASE_URL is configured. Preserves the original path
 * and query parameters.
 *
 * Returns the input unchanged when no base URL is set.
 */
export function rewriteOrigin(input: RequestInfo | URL): RequestInfo | URL {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return input;

  try {
    let reqUrl: URL;
    if (typeof input === "string") {
      reqUrl = new URL(input);
    } else if (input instanceof URL) {
      reqUrl = new URL(input.toString());
    } else if (input instanceof Request) {
      reqUrl = new URL(input.url);
    } else {
      return input;
    }

    const original = reqUrl.href;
    reqUrl.protocol = baseUrl.protocol;
    reqUrl.host = baseUrl.host;

    if (reqUrl.href === original) return input;

    log.debug("Rewrote request origin", {
      from: new URL(original).host,
      to: baseUrl.host,
    });

    return input instanceof Request ? new Request(reqUrl.toString(), input) : reqUrl;
  } catch {
    return input;
  }
}
