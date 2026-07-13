// SlideMaker Public: 共通型定義
// 移植元プロジェクトの types.ts から F1（プレゼン資料作成）/ F2（自由生成）に
// 必要な型のみを抽出している。GCS 保存・比較ビュー・履歴閲覧など、
// docs/REQUIREMENTS.md で「持ち込まないもの」と明記された機能に紐づく型は含めない。

// ========================================
// トークン使用量・コスト
// ========================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

// ========================================
// 画像生成モデル
// ========================================

// docs/REQUIREMENTS.md §6 (default_model) / §4.1 に対応する2モデルのみ。
// 移植元 ImageModelType にあった legacy な nanobanana(無印) / gptimage1.5 は含めない。
export type ImageModel = 'nanobanana2' | 'gpt-image-2';

// ========================================
// アスペクト比
// ========================================

export type AspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string; description: string }[] = [
  { value: '16:9', label: '16:9', description: '横長（プレゼン向け）' },
  { value: '4:3', label: '4:3', description: '横長（標準）' },
  { value: '3:2', label: '3:2', description: '横長（写真向け）' },
  { value: '1:1', label: '1:1', description: '正方形' },
  { value: '2:3', label: '2:3', description: '縦長（写真向け）' },
  { value: '3:4', label: '3:4', description: '縦長（標準）' },
  { value: '9:16', label: '9:16', description: '縦長（スマホ向け）' },
  { value: '4:5', label: '4:5', description: '縦長（SNS向け）' },
  { value: '5:4', label: '5:4', description: '横長（軽め）' },
  { value: '21:9', label: '21:9', description: 'ワイド（シネマ）' },
];

// ========================================
// F1: プレゼンテーション
// ========================================

export interface PresentationPage {
  pageNumber: number; // ページ番号
  title: string; // ページタイトル
  content: string; // ページコンテンツ
  visualSuggestion: string; // 推奨される視覚表現（例: "比較表", "棒グラフ", "アイコン+数字"）
  emphasis: string; // 強調すべきポイント（例: "50%増加を大きく強調"）
  tone: string; // メッセージの温度感（例: "希望を感じさせる", "客観的に提示"）
}

// buildPresentationPagePrompt / suggestPresentationStructure の入出力で共有する
// ページ入力の最小形（PresentationPage と同型だが、呼び出し側で編集途中の
// 部分的なページ配列を渡せるよう独立した型として定義する）。
export interface PresentationPagePromptInput {
  pageNumber: number;
  title: string;
  content: string;
  visualSuggestion?: string;
  emphasis?: string;
  tone?: string;
}

// ========================================
// 生成画像
// ========================================

export interface GeneratedImage {
  id: string;
  url: string; // 表示用（data: URL または署名付きURL）
  base64Data: string; // 再送信・PPT埋め込み用に base64 を保持
  prompt: string; // ユーザー向けに表示するプロンプト（自由生成の場合は入力そのもの）
  originalInputText?: string; // 元の入力テキスト
  fullPrompt?: string; // API に送信された完全なプロンプト（検証用）
  timestamp: number;
  usage?: TokenUsage;
  model?: ImageModel;
  bottomLeftUrl?: string; // F2で指定された左下URL（PPT出力時に左下へ配置）
  pageNumber?: number; // F1の場合のページ番号（1始まり、PresentationPage.pageNumber と一致）
}

// ========================================
// デザイン要望テンプレート（F1）
// ========================================

export interface DesignRequestTemplate {
  id: string;
  name: string;
  content: string;
}

// ========================================
// F2: 自由生成の設定履歴（localStorage 保存用）
// ========================================

export interface FreeGenerationHistoryItem {
  id: string;
  timestamp: number; // 保存時刻（ms）
  prompt: string; // buildFreeMergedPrompt 適用後のプロンプト
  url?: string; // 左下URL
  imageCount: number; // 生成枚数
  aspectRatio: AspectRatio;
  model: ImageModel;
  attachedImages: string[]; // 添付画像のbase64（容量超過時は空で保存）
}
