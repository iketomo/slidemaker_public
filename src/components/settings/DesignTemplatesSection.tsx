// SlideMaker Public: 設定画面 — デザイン要望テンプレート CRUD（docs/REQUIREMENTS.md §5）

import { useState } from 'react';
import { useDesignTemplates } from '../../hooks/useDesignTemplates';
import { Notice } from '../common/Notice';

export function DesignTemplatesSection() {
  const { templates, loading, error, add, remove } = useDesignTemplates();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!name.trim() || !content.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await add(name.trim(), content.trim());
      setName('');
      setContent('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '追加に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setActionError(null);
    try {
      await remove(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  return (
    <section className="card">
      <h2>デザイン要望テンプレート</h2>
      <p className="field-hint">プレゼン作成のデザイン要望欄で選択できる定型文を登録できます。</p>

      {error && <Notice kind="error" message={error} />}
      {actionError && <Notice kind="error" message={actionError} />}

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">まだテンプレートがありません。</div>
      ) : (
        <ul className="page-list">
          {templates.map((template) => (
            <li key={template.id} className="page-card">
              <div className="page-card__head">
                <strong>{template.name}</strong>
                <button type="button" className="btn-sm btn-danger" onClick={() => void handleRemove(template.id)}>
                  削除
                </button>
              </div>
              <p>{template.content}</p>
            </li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend>新規テンプレート</legend>
        <div className="field">
          <label htmlFor="dt-name">テンプレート名</label>
          <input id="dt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dt-content">内容</label>
          <textarea id="dt-content" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <button type="button" onClick={() => void handleAdd()} disabled={busy || !name.trim() || !content.trim()}>
          追加
        </button>
      </fieldset>
    </section>
  );
}
