// F1 プレゼン作成: 画面内でのみ使うローカル型
// PresentationPage は src/types.ts のものをそのまま使う（別名で re-export し、
// コンポーネントファイル名 "PresentationPage" との衝突を避ける）。

import type { PresentationPage } from '../../types';

export type SlidePageData = PresentationPage;

export type PageImageStatus = 'idle' | 'generating' | 'done' | 'error';

export interface PageImageState {
  status: PageImageStatus;
  base64Image?: string;
  error?: string;
}

export const emptyPageState = (): PageImageState => ({ status: 'idle' });
