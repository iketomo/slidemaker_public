// SlideMaker Public: F1（プレゼン資料を作る）の Gemini 呼び出し
// 移植元プロジェクトの geminiService.ts:
//   - suggestPresentationStructure (line 496-559)
//   - generatePresentationPagesAsync (line 643-721)

import { Type } from '@google/genai';
import presentationStructurePrompt from '../../prompts/presentation_structure.md?raw';
import type { AspectRatio, PresentationPagePromptInput } from '../../types';
import { getAiClient } from './client';
import { buildPresentationPagePrompt } from './buildPrompt';
import {
  GEMINI_IMAGE_MODEL,
  GEMINI_TEXT_MODEL,
  fillPrompt,
  generateImageWithRetry,
  type GeminiContentInputPart,
  type ImageGenerationResult,
} from './shared';

export interface PresentationStructurePage {
  pageNumber: number;
  title: string;
  content: string;
  visualSuggestion: string;
  emphasis: string;
  tone: string;
}

/**
 * プレゼンテーションのページ構成を提案する（gemini-2.5-flash）。
 * 分割モード（旧 PageSplitMode）は docs/DECISIONS.md の「追加決定: 分割モードは廃止」により
 * 廃止済み。構成提案は presentation_structure.md 1本に統一している。
 * TSV貼り付けのケースはクライアント側で完結する parseSpreadsheetToPages
 * （src/lib/ppt/parseTsv.ts）が担当し、この関数は呼ばれない。
 *
 * 移植元は JSON パース失敗時に汎用プレースホルダへ静かにフォールバックしていたが、
 * BYOK でユーザーが実費を払っている以上、失敗を握りつぶさずエラーを投げる方針に変更している
 * （最終報告の「判断に迷った点」参照）。
 */
export const suggestPresentationStructure = async (
  userText: string,
  pageCount: number
): Promise<PresentationStructurePage[]> => {
  const ai = getAiClient();
  const totalPages = Math.max(1, pageCount);

  const prompt = fillPrompt(presentationStructurePrompt, { totalPages, userText });

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pageNumber: { type: Type.INTEGER },
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            visualSuggestion: { type: Type.STRING },
            emphasis: { type: Type.STRING },
            tone: { type: Type.STRING },
          },
          required: ['pageNumber', 'title', 'content', 'visualSuggestion', 'emphasis', 'tone'],
        },
      },
    },
  });

  const jsonText = response.text;
  if (!jsonText) {
    throw new Error('ページ構成の提案に失敗しました（APIからの応答が空でした）。');
  }

  let pages: PresentationStructurePage[];
  try {
    pages = JSON.parse(jsonText) as PresentationStructurePage[];
  } catch {
    throw new Error('AIの応答を解析できませんでした。もう一度お試しください。');
  }

  return [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
};

export type { ImageGenerationResult };

/**
 * 複数ページのプレゼンテーション用に画像を生成する（各ページは独立して並列生成される）。
 * @param pages ページ構成の配列（タイトル・コンテンツを含む）
 * @param designRequests デザイン要望の自由テキスト
 * @param onImageCompleted 各ページの画像生成が完了するたびに呼ばれる
 * @param onAllCompleted 全ページの生成が完了した時点で呼ばれる（成功数・失敗数）
 * @param onError 個別ページの生成失敗時に呼ばれる
 * @param referenceImageBase64s 参考画像のbase64データ配列（任意）
 * @param aspectRatio 画像のアスペクト比
 * @param modelOverride 既定モデル（gemini-3.1-flash-image-preview）を上書きする場合に指定
 */
export const generatePresentationPagesAsync = (
  pages: PresentationPagePromptInput[],
  designRequests: string | undefined,
  onImageCompleted: (result: ImageGenerationResult, index: number) => void | Promise<void>,
  onAllCompleted: (successCount: number, errorCount: number) => void,
  onError: ((error: Error) => void) | undefined,
  referenceImageBase64s: string[] | undefined,
  aspectRatio: AspectRatio = '16:9',
  modelOverride?: string
): void => {
  const totalPages = pages.length;
  if (totalPages === 0) {
    onAllCompleted(0, 0);
    return;
  }

  const ai = getAiClient();
  const targetModel = modelOverride || GEMINI_IMAGE_MODEL;

  const hasReferenceImages = !!(referenceImageBase64s && referenceImageBase64s.length > 0);

  let completedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < totalPages; i++) {
    void (async (pageIndex: number) => {
      try {
        const prompt = buildPresentationPagePrompt(pages, pageIndex, designRequests, hasReferenceImages);

        const parts: GeminiContentInputPart[] = [{ text: prompt }];
        if (referenceImageBase64s && referenceImageBase64s.length > 0) {
          referenceImageBase64s.forEach((base64) => {
            parts.push({ inlineData: { mimeType: 'image/png', data: base64 } });
          });
        }

        const result = await generateImageWithRetry(
          ai,
          targetModel,
          parts,
          { imageConfig: { aspectRatio, imageSize: '1K' } },
          prompt
        );

        try {
          await onImageCompleted(result, pageIndex);
        } catch {
          // onImageCompleted 側（UI更新等）の例外は生成自体の成否と切り離す。
          // 画像生成は成功しているため completedCount に計上し、握りつぶす。
        }
        completedCount++;

        if (completedCount + errorCount === totalPages) {
          onAllCompleted(completedCount, errorCount);
        }
      } catch (error) {
        errorCount++;
        if (onError && error instanceof Error) {
          onError(error);
        }

        if (completedCount + errorCount === totalPages) {
          onAllCompleted(completedCount, errorCount);
        }
      }
    })(i);
  }
};
