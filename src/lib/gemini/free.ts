// SlideMaker Public: F2（自由に生成）の Gemini 呼び出し
// 移植元プロジェクトの geminiService.ts generateFreeImageAsync (line 841-927)
//
// 移植元との差分: 元実装は1回失敗したら即エラー扱いだったが、presentation.ts と同じ
// generateImageWithRetry（一時的失敗のみ指数バックオフで最大3回リトライ）を共用する形に変更した。
// BYOK でユーザーが実費を負担する以上、一時的なAPIエラーで生成枚数が減るのは避けたい判断。

import type { AspectRatio } from '../../types';
import { getAiClient } from './client';
import {
  GEMINI_IMAGE_MODEL,
  generateImageWithRetry,
  type GeminiContentInputPart,
  type ImageGenerationResult,
} from './shared';

export type { ImageGenerationResult };

/**
 * 自由画像生成：buildFreeMergedPrompt で組み立てたプロンプトをそのまま送信して画像を生成する。
 * プロンプトには余計な指示を追加しない。
 * @param prompt buildFreeMergedPrompt() の出力（そのまま送信）
 * @param count 生成する画像の数（1〜6、デフォルト2）
 * @param onImageCompleted 各画像が完了したときのコールバック
 * @param onAllCompleted 全画像完了時のコールバック（成功数・失敗数）
 * @param attachedImagesBase64 添付画像のbase64データ配列（任意、最大10枚）
 * @param onError エラー発生時のコールバック
 * @param aspectRatio 画像のアスペクト比
 * @param modelOverride 既定モデル（gemini-3.1-flash-image-preview）を上書きする場合に指定
 */
export const generateFreeImageAsync = (
  prompt: string,
  count: number,
  onImageCompleted: (result: ImageGenerationResult, index: number) => void | Promise<void>,
  onAllCompleted: (successCount: number, errorCount: number) => void,
  attachedImagesBase64?: string[],
  onError?: (error: Error) => void,
  aspectRatio: AspectRatio = '16:9',
  modelOverride?: string
): void => {
  const ai = getAiClient();
  const targetModel = modelOverride || GEMINI_IMAGE_MODEL;

  const totalImages = Math.max(1, Math.min(6, count));

  let completedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < totalImages; i++) {
    void (async (index: number) => {
      try {
        const parts: GeminiContentInputPart[] = [{ text: prompt }];
        if (attachedImagesBase64 && attachedImagesBase64.length > 0) {
          attachedImagesBase64.forEach((imageBase64) => {
            parts.push({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
          });
        }

        const result = await generateImageWithRetry(
          ai,
          targetModel,
          parts,
          {
            // TEXTとIMAGE両方を指定することで、確実に画像生成モードで応答させる
            // （IMAGEのみだと不安定なため、公式推奨の設定を使用）
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio, imageSize: '1K' },
          },
          prompt
        );

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
