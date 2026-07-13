// SlideMaker Public: Gemini クライアント（BYOK）
// generativelanguage.googleapis.com はブラウザ CORS 対応のため、サーバーを経由せず直接呼び出す。
// docs/REQUIREMENTS.md §4.1 参照。

import { GoogleGenAI } from '@google/genai';
import { getGeminiKey } from '../apiKeyStore';

export const getAiClient = (): GoogleGenAI => {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error('Gemini API キーを設定画面で入力してください');
  }
  return new GoogleGenAI({ apiKey });
};
