// SlideMaker Public: slidemakerpublic_user_settings の取得・更新フック
// docs/REQUIREMENTS.md §2.1 / §5「per-user 設定」/ §6 に対応。
// AuthProvider が初回ログイン時にデフォルト行を upsert 済みの前提だが、
// 念のため行が無い場合はここでも upsert してから再取得する（防御的処理）。

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { AspectRatio, ImageModel } from '../types';

export interface UserSettings {
  user_id: string;
  crop_top_px: number;
  crop_bottom_px: number;
  pptx_template_path: string | null;
  default_model: ImageModel;
  default_aspect_ratio: AspectRatio;
  updated_at: string;
}

export type UserSettingsPatch = Partial<
  Pick<
    UserSettings,
    'crop_top_px' | 'crop_bottom_px' | 'pptx_template_path' | 'default_model' | 'default_aspect_ratio'
  >
>;

const TABLE = 'slidemakerpublic_user_settings';

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (selectError) throw selectError;

      if (data) {
        setSettings(data as UserSettings);
        return;
      }

      // 行が無い場合はデフォルト値で作成してから再取得する。
      const { error: upsertError } = await supabase
        .from(TABLE)
        .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (upsertError) throw upsertError;

      const { data: created, error: reselectError } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (reselectError) throw reselectError;
      setSettings(created as UserSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザー設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateSettings = useCallback(
    async (patch: UserSettingsPatch): Promise<UserSettings> => {
      if (!user) throw new Error('ログインが必要です');
      const { data, error: updateError } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      const next = data as UserSettings;
      setSettings(next);
      return next;
    },
    [user]
  );

  return { settings, loading, error, reload, updateSettings };
}
