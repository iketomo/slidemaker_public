// F1 プレゼン作成: 画像生成ロジック（Gemini / GPT-image-2 の分岐をここに集約する）
//
// 既知の制約（src/lib への変更提案）:
// - generatePresentationPagesAsync の onError コールバックはページ index を渡さない仕様のため、
//   Gemini 経路ではどのページが失敗したかを直接特定できない。ここでは onAllCompleted 発火後に
//   まだ 'generating' のままのページを「失敗」とみなすことで対処している（sweepStalledPages）。
//   本来は onError の第2引数に index を追加してもらうのが望ましい。
// - generateGptImage / generateGptImageWithReferences は単発呼び出しでリトライを内蔵していない
//   （generateGptImagesAsync 内部の generateGptImageOnceWithRetry は非公開）。ここではページ単位の
//   簡易リトライ（最大2回・固定バックオフ）をローカルに実装している。本来は
//   generateGptImageOnceWithRetry 相当を src/lib/openai/client.ts から export してもらうのが望ましい。

import type { AspectRatio, ImageModel } from '../../types';
import { buildPresentationPagePrompt } from '../../lib/gemini/buildPrompt';
import { generatePresentationPagesAsync, type ImageGenerationResult } from '../../lib/gemini/presentation';
import { getAiClient } from '../../lib/gemini/client';
import {
  GEMINI_IMAGE_MODEL,
  generateImageWithRetry,
  type GeminiContentInputPart,
} from '../../lib/gemini/shared';
import { generateGptImage, generateGptImageWithReferences } from '../../lib/openai/client';
import type { SlidePageData, PageImageState } from './types';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const generateOneGptPage = async (
  prompt: string,
  referenceImagesBase64: string[],
  aspectRatio: AspectRatio
): Promise<string> => {
  const maxAttempts = 2;
  let lastError: Error = new Error('画像生成に失敗しました');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result =
        referenceImagesBase64.length > 0
          ? await generateGptImageWithReferences(prompt, referenceImagesBase64, aspectRatio, {})
          : await generateGptImage(prompt, aspectRatio, {});
      return result.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) await delay(1500);
    }
  }
  throw lastError;
};

/**
 * 全ページを並列生成する。onPageResult は各ページの完了（成功・失敗）ごとに呼ばれる。
 * Gemini 経路は個別ページの失敗を直接検知できないため、呼び出し側で
 * sweepStalledPages() を使って未解決ページを失敗扱いにする必要がある。
 */
export const generateAllPages = async (
  pages: SlidePageData[],
  designRequests: string | undefined,
  referenceImagesBase64: string[],
  aspectRatio: AspectRatio,
  model: ImageModel,
  onPageResult: (index: number, result: PageImageState) => void
): Promise<void> => {
  if (model === 'nanobanana2') {
    await new Promise<void>((resolve) => {
      generatePresentationPagesAsync(
        pages,
        designRequests,
        (result: ImageGenerationResult, index: number) => {
          onPageResult(index, { status: 'done', base64Image: result.data });
        },
        () => resolve(),
        () => {
          // index が取得できないため、ここでは何もしない（sweepStalledPages で回収する）。
        },
        referenceImagesBase64,
        aspectRatio
      );
    });
    return;
  }

  const hasReferenceImages = referenceImagesBase64.length > 0;
  await Promise.allSettled(
    pages.map(async (_, index) => {
      try {
        const prompt = buildPresentationPagePrompt(pages, index, designRequests, hasReferenceImages);
        const base64Image = await generateOneGptPage(prompt, referenceImagesBase64, aspectRatio);
        onPageResult(index, { status: 'done', base64Image });
      } catch (err) {
        onPageResult(index, {
          status: 'error',
          error: err instanceof Error ? err.message : '画像生成に失敗しました',
        });
      }
    })
  );
};

/**
 * generateAllPages 完了後、まだ 'generating' のままのページを失敗扱いにする。
 * Gemini 経路の onError が index を返さないことへの対処（詳細はファイル冒頭コメント参照）。
 */
export const sweepStalledPages = (states: PageImageState[]): PageImageState[] =>
  states.map((state) =>
    state.status === 'generating' ? { status: 'error', error: '画像生成に失敗しました' } : state
  );

/**
 * 1ページだけ再生成する。
 */
export const regenerateSinglePage = async (
  pages: SlidePageData[],
  index: number,
  designRequests: string | undefined,
  referenceImagesBase64: string[],
  aspectRatio: AspectRatio,
  model: ImageModel
): Promise<PageImageState> => {
  const hasReferenceImages = referenceImagesBase64.length > 0;
  const prompt = buildPresentationPagePrompt(pages, index, designRequests, hasReferenceImages);

  try {
    if (model === 'nanobanana2') {
      const ai = getAiClient();
      const parts: GeminiContentInputPart[] = [{ text: prompt }];
      referenceImagesBase64.forEach((data) => parts.push({ inlineData: { mimeType: 'image/png', data } }));

      const result = await generateImageWithRetry(
        ai,
        GEMINI_IMAGE_MODEL,
        parts,
        { imageConfig: { aspectRatio, imageSize: '1K' } },
        prompt
      );
      return { status: 'done', base64Image: result.data };
    }

    const base64Image = await generateOneGptPage(prompt, referenceImagesBase64, aspectRatio);
    return { status: 'done', base64Image };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : '画像生成に失敗しました' };
  }
};
