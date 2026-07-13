// SlideMaker Public: BYOK オンボーディング（docs/REQUIREMENTS.md §3.3）
// ログイン後、キー未設定ならここでゲートされる（RequireApiKey 参照）。

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPersistMode,
  setGeminiKey,
  setOpenAIKey,
  setPersistMode,
  type PersistMode,
} from '../lib/apiKeyStore';
import { Notice } from '../components/common/Notice';

function Onboarding() {
  const navigate = useNavigate();
  const [geminiKey, setGeminiKeyInput] = useState('');
  const [openaiKey, setOpenaiKeyInput] = useState('');
  const [persist, setPersist] = useState<PersistMode>(getPersistMode());
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedGemini = geminiKey.trim();
    const trimmedOpenAi = openaiKey.trim();

    if (!trimmedGemini && !trimmedOpenAi) {
      setError('Gemini または OpenAI のいずれか1つ以上の API キーを入力してください');
      return;
    }

    setPersistMode(persist);
    if (trimmedGemini) setGeminiKey(trimmedGemini);
    if (trimmedOpenAi) setOpenAIKey(trimmedOpenAi);

    navigate('/app/presentation', { replace: true });
  };

  return (
    <main className="container">
      <h1 className="section-title">API キーの設定</h1>
      <p className="section-desc">
        API キーはこのブラウザにのみ保存され、当サービスのサーバーには保存・記録されません（OpenAI
        画像生成の中継時に一時的に経由するのみ）。どちらか一方のキーだけでも先に進めます。
      </p>

      {error && <Notice kind="error" message={error} />}

      <form onSubmit={handleSubmit} className="card">
        <fieldset>
          <legend>保存先</legend>
          <div className="checkbox-row">
            <input
              type="radio"
              id="persist-local"
              name="persist"
              checked={persist === 'local'}
              onChange={() => setPersist('local')}
            />
            <label htmlFor="persist-local">このブラウザに保存する</label>
          </div>
          <div className="checkbox-row">
            <input
              type="radio"
              id="persist-session"
              name="persist"
              checked={persist === 'session'}
              onChange={() => setPersist('session')}
            />
            <label htmlFor="persist-session">タブを閉じるまで（session storage）</label>
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="gemini-key">Gemini API キー</label>
          <input
            type="password"
            id="gemini-key"
            value={geminiKey}
            onChange={(e) => setGeminiKeyInput(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
          />
          <p className="field-hint">
            取得方法:{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
          </p>
        </div>

        <div className="field">
          <label htmlFor="openai-key">OpenAI API キー</label>
          <input
            type="password"
            id="openai-key"
            value={openaiKey}
            onChange={(e) => setOpenaiKeyInput(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
          <p className="field-hint">
            取得方法:{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              OpenAI Platform
            </a>
          </p>
        </div>

        <button type="submit" className="btn-primary">
          保存して始める
        </button>
      </form>
    </main>
  );
}

export default Onboarding;
