// SlideMaker Public: gpt-image-proxy Edge Function
//
// OpenAI 画像生成/編集 API への CORS プロキシ。
// 対象: docs/REQUIREMENTS.md §4.2
//
// 設計上の要点:
// - Supabase JWT 検証必須。service_role は使わずユーザーの JWT をそのまま
//   createClient に渡し、auth.getUser() で検証する（anon key だけの呼び出しは拒否）。
// - X-User-OpenAI-Key ヘッダで受け取ったユーザーの OpenAI キーは、
//   このリクエスト処理の中でのみ保持し、永続化しない。
// - ログ全面禁止: キー・プロンプト・画像データ・アップストリーム応答本文は
//   console.log/console.error に一切出さない。エラー時も静的メッセージ +
//   ステータスコードのみを返す（アップストリームの本文は返さない・ログにも出さない）。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_GENERATE_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";

const GENERATE_TIMEOUT_MS = 60_000;
const EDIT_TIMEOUT_MS = 120_000;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_GENERATE_PER_MIN = 10;
const RATE_LIMIT_EDIT_PER_MIN = 5;

const ALLOWED_REQUEST_HEADERS =
  "authorization, x-user-openai-key, apikey, content-type";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS,
};

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}

// ------------------------------------------------------------
// レート制限（JWT の sub 単位、operation 単位: generate 10/min, edit 5/min）
//
// 第一線: Postgres の security definer 関数 slidemakerpublic_check_rate_limit を
// ユーザー JWT の rpc で呼ぶ（共有ストアなので全インスタンス横断で正しく数えられる。
// user_id は関数内で auth.uid() から取るため偽装不可）。
// フォールバック: rpc が失敗した場合のみ、以下の in-memory sliding window（Map）で
// インスタンス単位のベストエフォート判定を行う（実射で「インスタンス分散により
// in-memory 単独では機能しない」ことを確認済みのため、単独では使わない）。
// ------------------------------------------------------------

const rateLimitStore = new Map<string, number[]>();

// Map サイズがこれを超えたら、次のチェック時に期限切れエントリを全体掃除する。
const RATE_LIMIT_STORE_MAX_SIZE = 10_000;

function sweepRateLimitStore(windowStart: number): void {
  for (const [storeKey, timestamps] of rateLimitStore) {
    const recent = timestamps.filter((ts) => ts > windowStart);
    if (recent.length === 0) {
      rateLimitStore.delete(storeKey);
    } else if (recent.length !== timestamps.length) {
      rateLimitStore.set(storeKey, recent);
    }
  }
}

function checkRateLimit(
  userId: string,
  operation: "generate" | "edit",
): { allowed: boolean; retryAfterSec: number } {
  const limit =
    operation === "generate" ? RATE_LIMIT_GENERATE_PER_MIN : RATE_LIMIT_EDIT_PER_MIN;
  const key = `${userId}:${operation}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const existing = rateLimitStore.get(key) ?? [];
  const recent = existing.filter((ts) => ts > windowStart);

  // window 外エントリのフィルタ結果が空になったキーは、この時点では
  // 掃除しておく（この直後に allowed 判定で push する場合は再度 set され直す）。
  if (recent.length === 0) {
    rateLimitStore.delete(key);
  } else {
    rateLimitStore.set(key, recent);
  }

  if (recent.length >= limit) {
    const oldestInWindow = recent[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { allowed: false, retryAfterSec };
  }

  recent.push(now);
  rateLimitStore.set(key, recent);

  if (rateLimitStore.size > RATE_LIMIT_STORE_MAX_SIZE) {
    sweepRateLimitStore(windowStart);
  }

  return { allowed: true, retryAfterSec: 0 };
}

// Postgres 共有ストアでのレート制限判定。rpc 失敗時のみ in-memory にフォールバックする。
async function checkRateLimitShared(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  operation: "generate" | "edit",
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  try {
    const { data, error } = await supabase.rpc("slidemakerpublic_check_rate_limit", {
      op: operation,
    });
    if (!error && data && typeof (data as { allowed?: unknown }).allowed === "boolean") {
      const result = data as { allowed: boolean; retry_after?: number };
      return {
        allowed: result.allowed,
        retryAfterSec: Number(result.retry_after) || 60,
      };
    }
  } catch {
    // フォールバックへ（エラー内容はログに出さない方針）
  }
  return checkRateLimit(userId, operation);
}

// ------------------------------------------------------------
// リクエストボディ
// ------------------------------------------------------------

interface ProxyRequestBody {
  operation: "generate" | "edit";
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  background?: string;
  n?: number;
  images?: string[]; // base64 文字列（edit のみ必須）。data URL prefix 有無どちらも許容
}

const MAX_PROMPT_LENGTH = 32_000;
const MAX_MODEL_LENGTH = 64;
const MIN_N = 1;
const MAX_N = 4;
const MAX_IMAGES = 10;
const MAX_IMAGE_BASE64_LENGTH = 28_000_000;

function isValidBody(body: unknown): body is ProxyRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  if (b.operation !== "generate" && b.operation !== "edit") return false;
  if (typeof b.prompt !== "string" || b.prompt.length === 0) return false;
  if (b.prompt.length > MAX_PROMPT_LENGTH) return false;
  if (b.model !== undefined) {
    if (typeof b.model !== "string") return false;
    if (b.model.length > MAX_MODEL_LENGTH) return false;
  }
  if (b.size !== undefined && typeof b.size !== "string") return false;
  if (b.quality !== undefined && typeof b.quality !== "string") return false;
  if (b.background !== undefined && typeof b.background !== "string") return false;
  if (b.n !== undefined) {
    if (typeof b.n !== "number" || !Number.isInteger(b.n)) return false;
    if (b.n < MIN_N || b.n > MAX_N) return false;
  }
  if (b.images !== undefined) {
    if (!Array.isArray(b.images)) return false;
    if (b.images.length > MAX_IMAGES) return false;
    if (
      !b.images.every(
        (img) => typeof img === "string" && img.length <= MAX_IMAGE_BASE64_LENGTH,
      )
    ) {
      return false;
    }
  }

  return true;
}

function base64ToBlob(base64: string): Blob {
  const commaIndex = base64.indexOf(",");
  const raw =
    base64.startsWith("data:") && commaIndex !== -1
      ? base64.slice(commaIndex + 1)
      : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/png" });
}

class NoImagesError extends Error {}

async function callOpenAI(
  body: ProxyRequestBody,
  openaiKey: string,
): Promise<Response> {
  // outbound ヘッダは Authorization / Content-Type / User-Agent のみに限定する。
  // Content-Type は generate では明示 JSON、edit では FormData に boundary 付き
  // multipart/form-data を自動付与させるため、ここでは含めない。
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${openaiKey}`,
    "User-Agent": "slidemakerpublic/1.0",
  };

  const controller = new AbortController();
  const timeoutMs =
    body.operation === "generate" ? GENERATE_TIMEOUT_MS : EDIT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (body.operation === "generate") {
      const payload: Record<string, unknown> = {
        prompt: body.prompt,
        model: body.model ?? "gpt-image-2",
      };
      if (body.size) payload.size = body.size;
      if (body.quality) payload.quality = body.quality;
      if (body.background) payload.background = body.background;
      if (body.n) payload.n = body.n;

      return await fetch(OPENAI_GENERATE_URL, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    // edit: OpenAI /v1/images/edits は multipart/form-data 必須。
    // クライアントから base64 で受け取った画像を Blob に変換して FormData で転送する。
    const images = body.images ?? [];
    if (images.length === 0) {
      throw new NoImagesError("images is required for edit operation");
    }

    const form = new FormData();
    form.append("prompt", body.prompt);
    form.append("model", body.model ?? "gpt-image-2");
    if (body.size) form.append("size", body.size);
    if (body.quality) form.append("quality", body.quality);
    if (body.background) form.append("background", body.background);
    if (body.n) form.append("n", String(body.n));

    images.forEach((base64, index) => {
      const blob = base64ToBlob(base64);
      form.append("image[]", blob, `image_${index}.png`);
    });

    return await fetch(OPENAI_EDIT_URL, {
      method: "POST",
      headers: baseHeaders,
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse(500, "Server not configured");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "Missing Authorization header");
  }

  const openaiKey = req.headers.get("X-User-OpenAI-Key");
  if (!openaiKey) {
    return errorResponse(401, "Missing X-User-OpenAI-Key header");
  }

  // service_role は使わず、呼び出し元の JWT をそのまま anon client に渡して検証する。
  // anon key のみ（ユーザーセッション無し）の場合は getUser() がユーザーを返さないため 401 になる。
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return errorResponse(401, "Invalid or expired session");
  }
  const userId = userData.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (!isValidBody(rawBody)) {
    return errorResponse(400, "Invalid request body");
  }
  const body = rawBody;

  if (body.operation === "edit" && (!body.images || body.images.length === 0)) {
    return errorResponse(400, "images is required for edit operation");
  }

  const rateLimit = await checkRateLimitShared(supabase, userId, body.operation);
  if (!rateLimit.allowed) {
    return errorResponse(429, "Rate limit exceeded", {
      "Retry-After": String(rateLimit.retryAfterSec),
    });
  }

  try {
    const upstreamResponse = await callOpenAI(body, openaiKey);

    if (!upstreamResponse.ok) {
      // アップストリームの応答本文はプロンプト echo 対策のため
      // クライアントに返さない・ログにも出さない。破棄のみ行う。
      try {
        await upstreamResponse.text();
      } catch {
        // ignore
      }

      if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
        return errorResponse(401, "OpenAI API key was rejected");
      }
      if (upstreamResponse.status === 429) {
        return errorResponse(429, "Upstream rate limit exceeded");
      }
      return errorResponse(502, "Upstream image generation failed");
    }

    const upstreamJson = await upstreamResponse.json();
    return jsonResponse(upstreamJson, 200);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse(504, "Upstream request timed out");
    }
    if (err instanceof NoImagesError) {
      return errorResponse(400, "images is required for edit operation");
    }
    return errorResponse(502, "Upstream image generation failed");
  }
});
