// SlideMaker Public: F1 参考画像ライブラリ（slidemakerpublic_reference_images）アクセス
// docs/REQUIREMENTS.md §2.1 / §2.3 準拠。設定画面の CRUD と F1 の選択 UI の両方から使う共通フック。
//
// 移植元に対応するモジュールが無く、かつ src/lib/ の所有権はこのワークストリームに無いため
// ここに置いているが、本来は src/lib/storage/referenceImages.ts に置く方が自然（最終報告の
// 「lib への変更提案」参照）。バケット・テーブルアクセスのロジックのみで、UI 状態は持たない
// 関数群と、一覧状態を持つ React フックを両方エクスポートする。

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const BUCKET = 'slidemakerpublic-reference-images';
const TABLE = 'slidemakerpublic_reference_images';
const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

export interface ReferenceImageRecord {
  id: string;
  user_id: string;
  display_name: string;
  storage_path: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
}

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const getReferenceImageSignedUrl = async (
  storagePath: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS
): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`参考画像の表示URL取得に失敗しました: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
};

/**
 * 参考画像を base64（プレフィックス無し）として取得する。
 * Gemini/GPT-image-2 への送信用（referenceImageBase64s / images パラメータ）。
 */
export const downloadReferenceImageAsBase64 = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`参考画像の取得に失敗しました: ${error?.message ?? 'unknown error'}`);
  }
  const buffer = await data.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(buffer));
};

const extractExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return 'png';
  return fileName.slice(dotIndex + 1).toLowerCase();
};

export function useReferenceImages() {
  const { user } = useAuth();
  const [images, setImages] = useState<ReferenceImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setImages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from(TABLE)
        .select('*')
        .order('sort_order', { ascending: true });
      if (selectError) throw selectError;
      setImages((data ?? []) as ReferenceImageRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '参考画像の一覧取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upload = useCallback(
    async (file: File, displayName: string): Promise<void> => {
      if (!user) throw new Error('ログインが必要です');
      const id = crypto.randomUUID();
      const storagePath = `${user.id}/${id}.${extractExtension(file.name)}`;
      const mimeType = file.type || 'application/octet-stream';

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: mimeType, upsert: false });
      if (uploadError) {
        throw new Error(`参考画像のアップロードに失敗しました: ${uploadError.message}`);
      }

      const nextSortOrder = images.length;
      const { error: insertError } = await supabase.from(TABLE).insert({
        id,
        user_id: user.id,
        display_name: displayName || file.name,
        storage_path: storagePath,
        mime_type: mimeType,
        sort_order: nextSortOrder,
      });
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw new Error(`参考画像の登録に失敗しました: ${insertError.message}`);
      }

      await reload();
    },
    [user, images.length, reload]
  );

  const remove = useCallback(
    async (record: ReferenceImageRecord): Promise<void> => {
      await supabase.storage.from(BUCKET).remove([record.storage_path]);
      const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', record.id);
      if (deleteError) {
        throw new Error(`参考画像の削除に失敗しました: ${deleteError.message}`);
      }
      await reload();
    },
    [reload]
  );

  return { images, loading, error, reload, upload, remove };
}
