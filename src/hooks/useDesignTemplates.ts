// SlideMaker Public: F1 デザイン要望テンプレート（slidemakerpublic_design_templates）アクセス
// 設定画面の CRUD と F1 の選択 UI の両方から使う共通フック。

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const TABLE = 'slidemakerpublic_design_templates';

export interface DesignTemplateRecord {
  id: string;
  user_id: string;
  name: string;
  content: string;
  is_default: boolean;
  created_at: string;
}

export function useDesignTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<DesignTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false });
      if (selectError) throw selectError;
      setTemplates((data ?? []) as DesignTemplateRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'デザイン要望テンプレートの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (name: string, content: string): Promise<void> => {
      if (!user) throw new Error('ログインが必要です');
      const { error: insertError } = await supabase
        .from(TABLE)
        .insert({ user_id: user.id, name, content, is_default: false });
      if (insertError) {
        throw new Error(`デザイン要望テンプレートの追加に失敗しました: ${insertError.message}`);
      }
      await reload();
    },
    [user, reload]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', id);
      if (deleteError) {
        throw new Error(`デザイン要望テンプレートの削除に失敗しました: ${deleteError.message}`);
      }
      await reload();
    },
    [reload]
  );

  return { templates, loading, error, reload, add, remove };
}
