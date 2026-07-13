// SlideMaker Public: 生成画像の永続化（新規、移植元に対応なし）
// docs/DECISIONS.md Q1: v1 から生成画像本体を Supabase Storage に保存する方針。
// - バケット: slidemakerpublic-generated-images（プライベート）、パスは {userId}/{generationId}/{index}.png
// - メタ（feature/input_text/metadata/images）は slidemakerpublic_generations に1行として insert
// - 一覧・再ダウンロードは公開URLではなく署名付きURL（短寿命）経由

import { supabase } from '../supabase';

const GENERATED_IMAGES_BUCKET = 'slidemakerpublic-generated-images';
const GENERATIONS_TABLE = 'slidemakerpublic_generations';
const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

export interface GeneratedImageInput {
  base64Data: string; // PNGのbase64データ（data:...プレフィックスなし）
  width?: number;
  height?: number;
  model?: string; // 'nanobanana2' | 'gpt-image-2' など
}

export interface GeneratedImageMeta {
  storage_path: string;
  mime_type: string;
  width?: number;
  height?: number;
  model?: string;
}

export interface UploadGeneratedImagesInput {
  feature: 'presentation' | 'free';
  inputText?: string;
  metadata?: Record<string, unknown>;
  images: GeneratedImageInput[];
}

export interface UploadGeneratedImagesResult {
  generationId: string;
  images: GeneratedImageMeta[];
}

const base64ToUint8Array = (base64: string): Uint8Array => {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('生成画像データの読み込みに失敗しました（不正なデータ形式です）');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * アップロード済みの Storage オブジェクトをベストエフォートで削除する（孤児ファイル対策）。
 * generations への insert 失敗時に、既にアップロード済みの画像をロールバックするために使う。
 * remove 自体が失敗しても呼び出し元の本来のエラーを覆い隠さないよう、ここでは握りつぶす。
 */
const removeUploadedImagesBestEffort = async (storagePaths: string[]): Promise<void> => {
  if (storagePaths.length === 0) return;
  try {
    await supabase.storage.from(GENERATED_IMAGES_BUCKET).remove(storagePaths);
  } catch {
    // ベストエフォートのため失敗は無視する（孤児ファイルは残るが、insert失敗のエラーを優先して伝える）。
  }
};

/**
 * 生成画像を Supabase Storage にアップロードし、slidemakerpublic_generations に
 * メタデータ行を1件 insert する。images は生成順のまま {generationId}/{index}.png として保存する。
 * アップロードは並列に行うが、images 配列の返却順は入力の index 順を維持する。
 */
export const uploadGeneratedImages = async (
  input: UploadGeneratedImagesInput
): Promise<UploadGeneratedImagesResult> => {
  if (input.images.length === 0) {
    throw new Error('保存する画像がありません');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('ログインが必要です。再度ログインしてお試しください。');
  }
  const userId = userData.user.id;
  const generationId = crypto.randomUUID();

  const uploadOne = async (image: GeneratedImageInput, index: number): Promise<GeneratedImageMeta> => {
    const storagePath = `${userId}/${generationId}/${index}.png`;
    const bytes = base64ToUint8Array(image.base64Data);

    const { error: uploadError } = await supabase.storage
      .from(GENERATED_IMAGES_BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: false });

    if (uploadError) {
      throw new Error(`生成画像のアップロードに失敗しました（index: ${index}）: ${uploadError.message}`);
    }

    return {
      storage_path: storagePath,
      mime_type: 'image/png',
      width: image.width,
      height: image.height,
      model: image.model,
    };
  };

  const uploadResults = await Promise.allSettled(input.images.map((image, index) => uploadOne(image, index)));

  const succeededPaths = uploadResults
    .filter((r): r is PromiseFulfilledResult<GeneratedImageMeta> => r.status === 'fulfilled')
    .map((r) => r.value.storage_path);

  const firstFailure = uploadResults.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (firstFailure) {
    // 一部だけ成功している状態で孤児ファイルを残さないよう、成功分もロールバックする。
    await removeUploadedImagesBestEffort(succeededPaths);
    throw firstFailure.reason instanceof Error ? firstFailure.reason : new Error(String(firstFailure.reason));
  }

  const images = (uploadResults as PromiseFulfilledResult<GeneratedImageMeta>[]).map((r) => r.value);

  const { error: insertError } = await supabase.from(GENERATIONS_TABLE).insert({
    id: generationId,
    user_id: userId,
    feature: input.feature,
    input_text: input.inputText ?? null,
    metadata: input.metadata ?? {},
    images,
  });

  if (insertError) {
    // 孤児ファイル対策: insert が失敗した場合、アップロード済みの Storage オブジェクトを
    // ベストエフォートで削除してから throw する（remove 自体の失敗は握りつぶす）。
    await removeUploadedImagesBestEffort(images.map((img) => img.storage_path));
    throw new Error(`生成履歴の保存に失敗しました: ${insertError.message}`);
  }

  return { generationId, images };
};

/**
 * 生成画像の署名付きURL（短寿命）を取得する。履歴画面からの再表示・再ダウンロード用。
 */
export const getSignedUrlForGeneratedImage = async (
  storagePath: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(GENERATED_IMAGES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`署名付きURLの取得に失敗しました: ${error?.message ?? 'unknown error'}`);
  }

  return data.signedUrl;
};
