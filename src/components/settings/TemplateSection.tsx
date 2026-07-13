// SlideMaker Public: 設定画面 — PPT テンプレート（docs/REQUIREMENTS.md §5「per-user 設定」）

import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Notice } from '../common/Notice';
import type { UserSettings, UserSettingsPatch } from '../../hooks/useUserSettings';

const BUCKET = 'slidemakerpublic-pptx-templates';

interface TemplateSectionProps {
  settings: UserSettings | null;
  onUpdate: (patch: UserSettingsPatch) => Promise<UserSettings>;
}

export function TemplateSection({ settings, onUpdate }: TemplateSectionProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const path = `${user.id}/template.pptx`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      if (uploadError) throw uploadError;
      await onUpdate({ pptx_template_path: path });
      setNotice('テンプレートをアップロードしました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートのアップロードに失敗しました');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!user || !settings?.pptx_template_path) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await supabase.storage.from(BUCKET).remove([settings.pptx_template_path]);
      await onUpdate({ pptx_template_path: null });
      setNotice('テンプレートを削除し、デフォルトに戻しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テンプレートの削除に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>PPT テンプレート</h2>
      <p className="field-hint">
        現在: {settings?.pptx_template_path ? 'アップロード済みのテンプレートを使用中' : 'デフォルトテンプレートを使用中'}
      </p>

      {error && <Notice kind="error" message={error} />}
      {notice && <Notice kind="success" message={notice} />}

      <div className="btn-row">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        {settings?.pptx_template_path && (
          <button type="button" className="btn-danger" onClick={() => void handleDelete()} disabled={busy}>
            削除してデフォルトに戻す
          </button>
        )}
      </div>
    </section>
  );
}
