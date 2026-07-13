// SlideMaker Public: 画像生成プロンプト組み立て
// - buildPresentationPagePrompt: 移植元 geminiService.ts:574-634 を移植（F1、Gemini/GPT-image-2 で共用）
// - buildFreeMergedPrompt: docs/REQUIREMENTS.md §6 の仕様に基づき新規実装（F2）。
//   移植元 App.tsx には同名関数が存在しない（最終報告の「移植元と要件の食い違い」参照）。
//   「# 画像の内容」見出しは pptService (extractImageContentTitle) がPPTファイル名生成に
//   使う見出しと一致させている。

import designInstructionsPrompt from '../../prompts/design_instructions.md?raw';
import referenceImageInstructionsPrompt from '../../prompts/reference_image_instructions.md?raw';
import presentationPageGenPrompt from '../../prompts/presentation_page_generation.md?raw';
import type { PresentationPagePromptInput } from '../../types';
import { fillPrompt } from './shared';

/**
 * プレゼンテーションのページ単位の画像生成プロンプトを組み立てる。
 * Gemini と GPT-image-2 で同じプロンプトロジックを再利用するため公開している。
 */
export const buildPresentationPagePrompt = (
  pages: PresentationPagePromptInput[],
  pageIndex: number,
  designRequests: string | undefined,
  hasReferenceImages: boolean
): string => {
  const totalPages = pages.length;
  const page = pages[pageIndex];

  let designReqContent = '';
  if (designRequests && designRequests.trim().length > 0) {
    designReqContent = fillPrompt(designInstructionsPrompt, { designRequests });
  }

  const referenceInstructions = hasReferenceImages ? referenceImageInstructionsPrompt : '';

  let contextInfo: string;
  const hasPreviousPage = pageIndex > 0;
  const hasNextPage = pageIndex < totalPages - 1;

  if (hasPreviousPage || hasNextPage) {
    const contextLines: string[] = [];
    if (hasPreviousPage) {
      contextLines.push(`- 直前のページ: 「${pages[pageIndex - 1].title}」`);
    }
    if (hasNextPage) {
      contextLines.push(`- 次のページ: 「${pages[pageIndex + 1].title}」`);
    }
    contextInfo = contextLines.join('\n');
  } else {
    contextInfo = '- このページは単独のページです。';
  }

  let prompt = fillPrompt(presentationPageGenPrompt, {
    totalPages,
    pageNumber: page.pageNumber,
    title: page.title,
    content: page.content,
    designRequests: designReqContent,
    referenceImageInstructions: referenceInstructions,
    visualSuggestion: page.visualSuggestion || '',
    emphasis: page.emphasis || '',
    tone: page.tone || '',
    contextInfo,
  });

  if (!page.visualSuggestion?.trim()) {
    prompt = prompt.replace(/## 視覚化の方向性[\s\S]*?(?=## 強調ポイント|## トーン|制約事項:)/g, '');
  }
  if (!page.emphasis?.trim()) {
    prompt = prompt.replace(/## 強調ポイント[\s\S]*?(?=## トーン|制約事項:)/g, '');
  }
  if (!page.tone?.trim()) {
    prompt = prompt.replace(/## トーン＆マナー[\s\S]*?(?=制約事項:)/g, '');
  }

  return prompt;
};

/**
 * F2（自由に生成）用のプロンプトを組み立てる。
 * ラッパー指示は一切追加せず、ユーザーが入力した「画像の内容」「画像スタイル」を
 * そのまま見出し付きで連結するだけ（docs/REQUIREMENTS.md §6）。
 */
export const buildFreeMergedPrompt = (content: string, style?: string): string => {
  const trimmedContent = content.trim();
  const trimmedStyle = style?.trim();

  if (!trimmedStyle) {
    return `# 画像の内容\n${trimmedContent}`;
  }

  return `# 画像の内容\n${trimmedContent}\n\n# 画像スタイル\n${trimmedStyle}`;
};
