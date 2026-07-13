// SlideMaker Public: OpenAI (gpt-image-2) クライアント
// 移植元プロジェクトの gptImageService.ts
// OpenAI はブラウザ CORS 非対応のため、Supabase Edge Function `gpt-image-proxy` を経由する
// (docs/REQUIREMENTS.md §4.2)。fetch先・認証ヘッダ・エラーメッセージの扱いは移植元から
// Edge Function プロキシ構成に合わせて作り直している。

import type { AspectRatio, TokenUsage } from '../../types';
import { getOpenAIKey } from '../apiKeyStore';
import { supabase } from '../supabase';

// gpt-image-2 のみサポート（docs/DECISIONS.md Q6: デフォルトモデルは gpt-image-2 のまま踏襲）。
const GPT_IMAGE_MODEL = 'gpt-image-2';

// 概算コスト (USD/枚)。正確な単価は変動するため、表示用の目安として扱う。
const COST_PER_IMAGE_USD = 0.04;

export interface GptImageResult {
  data: string; // base64 画像データ
  usage: TokenUsage;
  prompt: string;
  model: string;
}

export interface GptImageOptions {
  /** 画像サイズ: "1024x1024" など。未指定時は aspectRatio から自動決定 */
  size?: string;
  /** 画質: "low" | "medium" | "high" */
  quality?: 'low' | 'medium' | 'high';
  /** 背景: "transparent" で透過背景（png/webpのみ） */
  background?: 'transparent' | 'opaque';
  /** 使用するモデル。未指定時は 'gpt-image-2' */
  model?: string;
}

/**
 * Edge Function `gpt-image-proxy` からのエラーレスポンス。
 * アップストリーム（OpenAI）のエラー本文はプロキシ側で握りつぶされ、
 * 静的メッセージ + ステータスコードのみが返る設計（§4.2）。
 * retryAfterSec はレスポンスの Retry-After ヘッダ由来（無ければ undefined）。
 */
export class GptImageProxyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = 'GptImageProxyError';
  }
}

const getImageSize = (aspectRatio: AspectRatio): string => {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024';
    // 横長系 → 1536x1024 (gpt-image がサポートする横長サイズはこれのみ)
    case '16:9':
    case '21:9':
    case '3:2':
    case '4:3':
    case '5:4':
      return '1536x1024';
    // 縦長系 → 1024x1536 (2:3相当)
    case '9:16':
    case '2:3':
    case '3:4':
    case '4:5':
      return '1024x1536';
    default:
      return '1024x1024';
  }
};

const calculateUsage = (imageCount = 1): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCostUSD: COST_PER_IMAGE_USD * imageCount,
});

interface GptImageResponseItem {
  b64_json?: string;
}

// gpt-image-2 は response_format 未指定時に b64_json をデフォルトで返すため、
// url 形式のレスポンス経路はサポートしない（外部URLへの追加fetchを避ける）。
const extractImageData = (item: GptImageResponseItem): string => {
  if (item.b64_json) {
    return item.b64_json;
  }
  throw new Error('画像データ（b64_json）がレスポンスに含まれていません');
};

const parseRetryAfterSec = (response: Response): number | undefined => {
  const header = response.headers.get('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

interface GptImageProxyRequestBody {
  operation: 'generate' | 'edit';
  prompt: string;
  model: string;
  size: string;
  quality?: 'low' | 'medium' | 'high';
  background?: 'transparent' | 'opaque';
  images?: string[];
}

const callGptImageProxy = async (
  body: GptImageProxyRequestBody
): Promise<{ data: GptImageResponseItem[] }> => {
  const openAiKey = getOpenAIKey();
  if (!openAiKey) {
    throw new Error('OpenAI API キーを設定画面で入力してください');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('ログインが必要です。再度ログインしてお試しください。');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/gpt-image-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-User-OpenAI-Key': openAiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new GptImageProxyError(
      `画像生成に失敗しました（status: ${response.status}）`,
      response.status,
      parseRetryAfterSec(response)
    );
  }

  return response.json();
};

/**
 * gpt-image-2 で1枚画像を生成する（参考画像なし）。
 * 複数枚が必要な場合は generateGptImagesAsync が並列に本関数を呼ぶ（1リクエスト=1枚）。
 */
export const generateGptImage = async (
  prompt: string,
  aspectRatio: AspectRatio = '16:9',
  options: GptImageOptions = {}
): Promise<GptImageResult> => {
  const model = options.model || GPT_IMAGE_MODEL;
  const size = options.size || getImageSize(aspectRatio);

  const result = await callGptImageProxy({
    operation: 'generate',
    prompt,
    model,
    size,
    ...(options.quality ? { quality: options.quality } : {}),
    ...(options.background ? { background: options.background } : {}),
  });

  if (!result.data?.[0]) {
    throw new Error('画像データがレスポンスに含まれていません');
  }
  const imageData = extractImageData(result.data[0]);

  return { data: imageData, usage: calculateUsage(1), prompt, model };
};

/**
 * 参考画像を元に gpt-image-2 の画像編集APIで生成する（F1参考画像・F2添付画像）。
 */
export const generateGptImageWithReferences = async (
  prompt: string,
  referenceImages: string[],
  aspectRatio: AspectRatio = '16:9',
  options: GptImageOptions = {}
): Promise<GptImageResult> => {
  const model = options.model || GPT_IMAGE_MODEL;
  const size = options.size || getImageSize(aspectRatio);

  const result = await callGptImageProxy({
    operation: 'edit',
    prompt,
    model,
    size,
    images: referenceImages,
    ...(options.quality ? { quality: options.quality } : {}),
  });

  if (!result.data?.[0]) {
    throw new Error('画像データがレスポンスに含まれていません');
  }
  const imageData = extractImageData(result.data[0]);

  return { data: imageData, usage: calculateUsage(1), prompt, model };
};

/**
 * リトライ対象のエラーかどうかを判定する。
 * - 5xx と 429 (レート制限) はリトライ
 * - それ以外の 4xx (400/401/403/404 など) はリトライしない
 * - ネットワークエラーや画像抽出失敗はリトライ
 */
const isRetryableGptImageError = (error: unknown): boolean => {
  if (error instanceof GptImageProxyError) {
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
    if (error.status >= 400) return false;
  }
  return true;
};

const generateGptImageOnceWithRetry = async (
  prompt: string,
  aspectRatio: AspectRatio,
  options: GptImageOptions,
  referenceImages: string[] | undefined,
  maxAttempts = 3
): Promise<GptImageResult> => {
  let lastError: Error = new Error('GPT Image generation failed');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return referenceImages && referenceImages.length > 0
        ? await generateGptImageWithReferences(prompt, referenceImages, aspectRatio, options)
        : await generateGptImage(prompt, aspectRatio, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxAttempts || !isRetryableGptImageError(lastError)) {
        throw lastError;
      }
      const backoffMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s, ...
      // 429 の場合はサーバー指定の Retry-After を尊重し、指数バックオフとの大きい方を待つ。
      const retryAfterMs =
        lastError instanceof GptImageProxyError && lastError.retryAfterSec !== undefined
          ? lastError.retryAfterSec * 1000
          : 0;
      const delayMs = Math.max(backoffMs, retryAfterMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
};

/**
 * gpt-image-2 で複数枚を並列生成する（コールバック形式、最大4枚）。
 * @param count 生成枚数（1〜4。docs/REQUIREMENTS.md §6: OpenAIは1〜4枚）
 */
export const generateGptImagesAsync = (
  prompt: string,
  count: number,
  onImageCompleted: (result: GptImageResult, index: number) => void | Promise<void>,
  onAllCompleted: (successCount: number, errorCount: number) => void,
  onError?: (error: Error) => void,
  aspectRatio: AspectRatio = '16:9',
  referenceImages?: string[],
  options: GptImageOptions = {}
): void => {
  const totalImages = Math.max(1, Math.min(4, count));

  let completedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < totalImages; i++) {
    void (async (index: number) => {
      try {
        const result = await generateGptImageOnceWithRetry(prompt, aspectRatio, options, referenceImages);

        try {
          await onImageCompleted(result, index);
        } catch {
          // onImageCompleted 側（UI更新等）の例外は生成自体の成否と切り離す。
          // 画像生成は成功しているため completedCount に計上し、握りつぶす。
        }
        completedCount++;

        if (completedCount + errorCount === totalImages) {
          onAllCompleted(completedCount, errorCount);
        }
      } catch (error) {
        errorCount++;
        if (onError && error instanceof Error) {
          onError(error);
        }

        if (completedCount + errorCount === totalImages) {
          onAllCompleted(completedCount, errorCount);
        }
      }
    })(i);
  }
};
