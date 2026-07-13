// SlideMaker Public: BYOK オンボーディングゲート（docs/REQUIREMENTS.md §3.3）
// Gemini・OpenAI どちらのキーも未設定なら /onboarding へリダイレクトする。

import { Navigate, Outlet } from 'react-router-dom';
import { getGeminiKey, getOpenAIKey } from '../../lib/apiKeyStore';

export function RequireApiKey() {
  const hasAnyKey = Boolean(getGeminiKey() || getOpenAIKey());

  if (!hasAnyKey) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
