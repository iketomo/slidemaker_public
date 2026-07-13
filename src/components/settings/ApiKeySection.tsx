// SlideMaker Public: 設定画面 — API キー管理（docs/REQUIREMENTS.md §3.3）
// キーは常にマスク表示（末尾4文字のみボタンで一時表示）。再入力・削除・保存モード切替に対応する。

import { useState } from 'react';
import {
  clearGeminiKey,
  clearOpenAIKey,
  getGeminiKey,
  getOpenAIKey,
  getPersistMode,
  setGeminiKey,
  setOpenAIKey,
  setPersistMode,
  type PersistMode,
} from '../../lib/apiKeyStore';
import { Notice } from '../common/Notice';

const maskKey = (key: string, revealLast4: boolean): string => {
  const dots = '••••••••';
  return revealLast4 ? `${dots}${key.slice(-4)}` : dots;
};

interface KeyRowProps {
  label: string;
  helpUrl: string;
  helpLabel: string;
  getKey: () => string | null;
  setKey: (key: string) => void;
  clearKey: () => void;
}

function KeyRow({ label, helpUrl, helpLabel, getKey, setKey, clearKey }: KeyRowProps) {
  const [currentKey, setCurrentKey] = useState<string | null>(getKey());
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState(false);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setKey(trimmed);
    setCurrentKey(trimmed);
    setInput('');
    setRevealed(false);
  };

  const handleDelete = () => {
    clearKey();
    setCurrentKey(null);
    setRevealed(false);
  };

  return (
    <div className="field">
      <label>{label}</label>
      <p className="field-hint">
        {currentKey ? (
          <span className="mask-value">{maskKey(currentKey, revealed)}</span>
        ) : (
          '未設定'
        )}
        {currentKey && (
          <>
            {' '}
            <button type="button" className="btn-sm" onClick={() => setRevealed((v) => !v)}>
              {revealed ? '隠す' : '末尾4文字を表示'}
            </button>{' '}
            <button type="button" className="btn-sm btn-danger" onClick={handleDelete}>
              削除
            </button>
          </>
        )}
      </p>
      <div className="field-row">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={currentKey ? '新しいキーで上書き' : 'キーを入力'}
          autoComplete="off"
        />
        <button type="button" onClick={handleSave} disabled={!input.trim()}>
          保存
        </button>
      </div>
      <p className="field-hint">
        取得方法:{' '}
        <a href={helpUrl} target="_blank" rel="noreferrer">
          {helpLabel}
        </a>
      </p>
    </div>
  );
}

export function ApiKeySection() {
  const [persist, setPersist] = useState<PersistMode>(getPersistMode());
  const [notice, setNotice] = useState<string | null>(null);

  const handlePersistChange = (mode: PersistMode) => {
    setPersistMode(mode);
    setPersist(mode);
    setNotice('保存先を切り替えました。');
  };

  return (
    <section className="card">
      <h2>API キー</h2>
      <p className="field-hint">
        API キーはこのブラウザにのみ保存され、当サービスのサーバーには保存・記録されません（OpenAI
        画像生成の中継時に一時的に経由するのみ）。
      </p>

      {notice && <Notice kind="success" message={notice} />}

      <fieldset>
        <legend>保存先</legend>
        <div className="checkbox-row">
          <input
            type="radio"
            id="settings-persist-local"
            checked={persist === 'local'}
            onChange={() => handlePersistChange('local')}
          />
          <label htmlFor="settings-persist-local">このブラウザに保存する</label>
        </div>
        <div className="checkbox-row">
          <input
            type="radio"
            id="settings-persist-session"
            checked={persist === 'session'}
            onChange={() => handlePersistChange('session')}
          />
          <label htmlFor="settings-persist-session">タブを閉じるまで</label>
        </div>
      </fieldset>

      <KeyRow
        label="Gemini API キー"
        helpUrl="https://aistudio.google.com/apikey"
        helpLabel="Google AI Studio"
        getKey={getGeminiKey}
        setKey={setGeminiKey}
        clearKey={clearGeminiKey}
      />
      <KeyRow
        label="OpenAI API キー"
        helpUrl="https://platform.openai.com/api-keys"
        helpLabel="OpenAI Platform"
        getKey={getOpenAIKey}
        setKey={setOpenAIKey}
        clearKey={clearOpenAIKey}
      />
    </section>
  );
}
