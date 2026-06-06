import {
  Agent,
  EnvHttpProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from "undici";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveHttpProxyUrl(): string {
  return (process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.https_proxy ?? process.env.http_proxy ?? "").trim();
}

const dispatcherCache = new Map<string, Dispatcher>();

/**
 * 出站 dispatcher：有 HTTP(S)_PROXY 时走代理（否则直连 302 等境外 API 易 ETIMEDOUT）；
 * 同时用 connect.timeout 覆盖 undici 默认 10s。
 */
function dispatcherForConnectTimeoutMs(connectTimeoutMs: number): Dispatcher {
  const proxy = resolveHttpProxyUrl();
  const cacheKey = `${connectTimeoutMs}:${proxy || "direct"}`;
  let dispatcher = dispatcherCache.get(cacheKey);
  if (!dispatcher) {
    const connect = { timeout: connectTimeoutMs };
    dispatcher = proxy
      ? new EnvHttpProxyAgent({ connect, ...(proxy ? { httpsProxy: proxy, httpProxy: proxy } : {}) })
      : new Agent({ connect });
    dispatcherCache.set(cacheKey, dispatcher);
  }
  return dispatcher;
}

export function outboundConnectTimeoutMs(): number {
  return parsePositiveInt(process.env.OPENAI_FETCH_CONNECT_TIMEOUT_MS, 600_000);
}

export function ttsConnectTimeoutMs(): number {
  return parsePositiveInt(
    process.env.TTS_FETCH_CONNECT_TIMEOUT_MS,
    parsePositiveInt(process.env.OPENAI_FETCH_CONNECT_TIMEOUT_MS, 60_000),
  );
}

export function ttsBodyTimeoutMs(): number {
  return parsePositiveInt(process.env.TTS_FETCH_BODY_TIMEOUT_MS, 120_000);
}

/**
 * 出站 POST：使用 undici Agent 覆盖 Node 内置 fetch 固定的 10s TCP 连接超时。
 */
export async function postOutbound(
  url: string,
  init: {
    headers: Record<string, string>;
    body: string;
    connectTimeoutMs?: number;
    bodyTimeoutMs?: number;
  },
): Promise<Response> {
  const connectTimeoutMs = init.connectTimeoutMs ?? outboundConnectTimeoutMs();
  const bodyTimeoutMs = init.bodyTimeoutMs ?? connectTimeoutMs;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), bodyTimeoutMs);
  try {
    const res = await undiciFetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      dispatcher: dispatcherForConnectTimeoutMs(connectTimeoutMs),
      signal: ac.signal,
    } as UndiciRequestInit);
    return res as unknown as Response;
  } finally {
    clearTimeout(timer);
  }
}
