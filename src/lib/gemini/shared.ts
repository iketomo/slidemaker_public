// SlideMaker Public: Gemini 画像生成の共通処理
// presentation.ts / free.ts の両方から使う、プロンプトテンプレート差し込み・
// トークン使用量計算・画像抽出失敗時のエラーメッセージ生成・リトライ付き生成をまとめている。
// 移植元プロジェクトの geminiService.ts の該当ロジックを踏襲しつつ、
// console.log/console.error は一切残さない（キー・プロンプト内容を出力しないため）。

import type { GoogleGenAI } from '@google/genai';
import type { TokenUsage } from '../../types';

// Gemini 画像生成モデル（Nano Banana 2）。
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

// コスト定数 (USD per 1M tokens)。移植元の見積もり値をそのまま踏襲。
const COST_INPUT_PER_1M = 2.0;
const COST_OUTPUT_PER_1M = 120.0;

export const fillPrompt = (template: string, variables: Record<string, string | number>): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.split(`{{${key}}}`).join(String(value));
  }
  return result;
};

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export const calculateUsage = (usageMetadata: GeminiUsageMetadata | undefined): TokenUsage => {
  const inputTokens = usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

  const estimatedCostUSD =
    (inputTokens / 1_000_000) * COST_INPUT_PER_1M + (outputTokens / 1_000_000) * COST_OUTPUT_PER_1M;

  return { inputTokens, outputTokens, totalTokens, estimatedCostUSD };
};

export interface ImageGenerationResult {
  data: string; // base64 画像データ
  usage: TokenUsage;
  prompt: string; // API に送信された完全なプロンプト
}

interface GeminiContentPart {
  text?: string;
  inlineData?: { data?: string };
}

interface GeminiCandidate {
  finishReason?: string;
  safetyRatings?: Array<{ blocked?: boolean }>;
  content?: { parts?: GeminiContentPart[] };
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * APIレスポンスから画像が生成されなかった原因を解析してエラーメッセージを生成する。
 */
export const analyzeImageGenerationFailure = (response: GeminiGenerateContentResponse | undefined): string => {
  if (!response) {
    return 'APIからの応答がありませんでした。しばらく待ってから再試行してください。';
  }

  if (!response.candidates || response.candidates.length === 0) {
    if (response.promptFeedback?.blockReason) {
      const reason = response.promptFeedback.blockReason;
      if (reason === 'SAFETY') {
        return 'プロンプトが安全性ポリシーに抵触したため、画像を生成できませんでした。プロンプトを変更してお試しください。';
      }
      return `プロンプトがブロックされました（理由: ${reason}）。プロンプトを変更してお試しください。`;
    }
    return 'APIからの応答に画像候補が含まれていませんでした。';
  }

  const candidate = response.candidates[0];
  const finishReason = candidate.finishReason;

  switch (finishReason) {
    case 'SAFETY':
      return '生成された画像が安全性ポリシーに抵触したため、出力できませんでした。プロンプトを変更してお試しください。';
    case 'RECITATION':
      return '著作権に関する制限により画像を生成できませんでした。';
    case 'MAX_TOKENS':
      return 'トークン制限に達したため画像を生成できませんでした。';
    case 'STOP': {
      const textPart = candidate.content?.parts?.find((p) => p.text);
      if (textPart?.text) {
        if (
          textPart.text.includes('できません') ||
          textPart.text.includes('cannot') ||
          textPart.text.includes('unable')
        ) {
          return `画像を生成できませんでした: ${textPart.text.substring(0, 150)}`;
        }
        return '画像の代わりにテキスト応答が返されました。プロンプトをより具体的にしてお試しください。';
      }
      return '画像生成は完了しましたが、画像データが含まれていませんでした。';
    }
    default:
      if (candidate.safetyRatings?.some((r) => r.blocked)) {
        return '安全性フィルターにより画像がブロックされました。プロンプトを変更してお試しください。';
      }
      return '画像を生成できませんでした。APIが混雑している可能性があります。しばらく待ってから再試行してください。';
  }
};

/**
 * リトライ対象のエラーかどうかを判定する。
 * 安全性ポリシー違反など、再試行しても同じ結果になる恒久的なエラーはリトライしない。
 */
export const isRetryableImageError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return true;
  const nonRetryableKeywords = [
    '安全性ポリシー',
    '安全性フィルター',
    'プロンプトがブロック',
    '著作権',
    'トークン制限',
  ];
  return !nonRetryableKeywords.some((keyword) => error.message.includes(keyword));
};

export interface GeminiContentInputPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Gemini APIで画像を1枚生成する。一時的な失敗時は指数バックオフでリトライする。
 * 画像が抽出できない・APIが画像を返さなかった等のケースも失敗として扱いリトライする。
 */
export const generateImageWithRetry = async (
  ai: GoogleGenAI,
  targetModel: string,
  parts: GeminiContentInputPart[],
  config: Record<string, unknown>,
  prompt: string,
  maxAttempts = 3
): Promise<ImageGenerationResult> => {
  let lastError: Error = new Error('Image generation failed');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: { parts },
        config,
      });

      const usage = calculateUsage(response.usageMetadata);

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, usage, prompt };
        }
      }
      throw new Error(analyzeImageGenerationFailure(response));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxAttempts || !isRetryableImageError(lastError)) {
        throw lastError;
      }
      const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s, ...
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
};
