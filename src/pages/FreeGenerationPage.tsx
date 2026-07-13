// SlideMaker Public: F2 自由に生成（docs/REQUIREMENTS.md §6）

import { useEffect, useRef, useState } from 'react';
import { buildFreeMergedPrompt } from '../lib/gemini/buildPrompt';
import { generateFreeImageAsync, type ImageGenerationResult } from '../lib/gemini/free';
import { generateGptImagesAsync, type GptImageResult } from '../lib/openai/client';
import { uploadGeneratedImages } from '../lib/storage/generatedImages';
import type { AspectRatio, GeneratedImage, ImageModel } from '../types';
import { useUserSettings } from '../hooks/useUserSettings';
import { Notice } from '../components/common/Notice';
import { InputForm } from '../components/free/InputForm';
import { ImageResultGrid } from '../components/free/ImageResultGrid';
import { HistoryPanel } from '../components/free/HistoryPanel';
import { fileToAttachment, type AttachmentItem } from '../components/free/fileUtils';
import {
  loadFreeGenHistory,
  saveFreeGenHistoryEntry,
  type FreeGenHistoryEntry,
} from '../components/free/historyStorage';

const MAX_ATTACHMENTS = 10;

const maxCountForModel = (model: ImageModel): number => (model === 'nanobanana2' ? 6 : 4);

function FreeGenerationPage() {
  const { settings } = useUserSettings();

  const [content, setContent] = useState('');
  const [style, setStyle] = useState('');
  const [url, setUrl] = useState('');
  const [model, setModel] = useState<ImageModel>('gpt-image-2');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [count, setCount] = useState(2);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [history, setHistory] = useState<FreeGenHistoryEntry[]>(() => loadFreeGenHistory());

  const appliedDefaultsRef = useRef(false);

  useEffect(() => {
    if (settings && !appliedDefaultsRef.current) {
      appliedDefaultsRef.current = true;
      setModel(settings.default_model);
      setAspectRatio(settings.default_aspect_ratio);
      setCount((prev) => Math.min(prev, maxCountForModel(settings.default_model)));
    }
  }, [settings]);

  const handleModelChange = (next: ImageModel) => {
    setModel(next);
    setCount((prev) => Math.min(prev, maxCountForModel(next)));
  };

  const handleAddFiles = (files: FileList) => {
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      setAttachmentError(`添付できる画像は最大${MAX_ATTACHMENTS}枚までです`);
      return;
    }
    setAttachmentError(null);
    void Promise.all(incoming.map(fileToAttachment))
      .then((converted) => setAttachments((prev) => [...prev, ...converted]))
      .catch((err) => setAttachmentError(err instanceof Error ? err.message : '画像の読み込みに失敗しました'));
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSelectHistory = (entry: FreeGenHistoryEntry) => {
    setContent(entry.content);
    setStyle(entry.style);
    setUrl(entry.url ?? '');
    setModel(entry.model);
    setAspectRatio(entry.aspectRatio);
    setCount(Math.min(entry.imageCount, maxCountForModel(entry.model)));
    setAttachmentError(null);
    setAttachments(
      entry.attachedImages.map((base64) => ({
        id: crypto.randomUUID(),
        name: '履歴からの添付画像',
        base64,
        previewUrl: `data:image/png;base64,${base64}`,
      }))
    );
  };

  const persistBatch = async (batchImages: GeneratedImage[], mergedPrompt: string) => {
    try {
      await uploadGeneratedImages({
        feature: 'free',
        inputText: content,
        metadata: { style, url: url.trim() || undefined, model, aspectRatio, count },
        images: batchImages.map((img) => ({ base64Data: img.base64Data, model: img.model })),
      });
    } catch (err) {
      setUploadNotice(
        err instanceof Error
          ? `画像の保存に失敗しました（ダウンロードは可能です）: ${err.message}`
          : '画像の保存に失敗しました（ダウンロードは可能です）'
      );
    }

    const entry: FreeGenHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      content,
      style,
      prompt: mergedPrompt,
      url: url.trim() || undefined,
      imageCount: batchImages.length,
      aspectRatio,
      model,
      attachedImages: attachments.map((a) => a.base64),
    };
    setHistory(saveFreeGenHistoryEntry(entry));
  };

  const handleGenerate = () => {
    if (!content.trim()) {
      setGenerateError('画像の内容を入力してください');
      return;
    }

    setGenerateError(null);
    setUploadNotice(null);
    setImages([]);
    setProgress({ completed: 0, total: count });
    setGenerating(true);

    const mergedPrompt = buildFreeMergedPrompt(content, style);
    const attachedBase64 = attachments.map((a) => a.base64);
    const bottomLeftUrl = url.trim() || undefined;

    const batchImages: GeneratedImage[] = [];
    const errors: string[] = [];

    const onImageCompleted = (result: ImageGenerationResult | GptImageResult) => {
      const image: GeneratedImage = {
        id: crypto.randomUUID(),
        url: `data:image/png;base64,${result.data}`,
        base64Data: result.data,
        prompt: mergedPrompt,
        fullPrompt: result.prompt,
        timestamp: Date.now(),
        usage: result.usage,
        model,
        bottomLeftUrl,
      };
      batchImages.push(image);
      setImages((prev) => [...prev, image]);
      setProgress((prev) => (prev ? { ...prev, completed: prev.completed + 1 } : prev));
    };

    const onError = (err: Error) => {
      errors.push(err.message);
      setProgress((prev) => (prev ? { ...prev, completed: prev.completed + 1 } : prev));
    };

    const onAllCompleted = (successCount: number, errorCount: number) => {
      setGenerating(false);
      if (errorCount > 0) {
        setGenerateError(`${count}枚中${errorCount}枚の生成に失敗しました: ${errors.join(' / ')}`);
      }
      if (successCount > 0) {
        void persistBatch(batchImages, mergedPrompt);
      }
    };

    try {
      if (model === 'nanobanana2') {
        generateFreeImageAsync(
          mergedPrompt,
          count,
          onImageCompleted,
          onAllCompleted,
          attachedBase64.length > 0 ? attachedBase64 : undefined,
          onError,
          aspectRatio
        );
      } else {
        generateGptImagesAsync(
          mergedPrompt,
          count,
          onImageCompleted,
          onAllCompleted,
          onError,
          aspectRatio,
          attachedBase64.length > 0 ? attachedBase64 : undefined,
          {}
        );
      }
    } catch (err) {
      setGenerating(false);
      setProgress(null);
      setGenerateError(err instanceof Error ? err.message : '画像生成に失敗しました');
    }
  };

  const progressLabel = progress ? `${progress.completed}/${progress.total} 完了` : null;

  return (
    <main className="container-wide">
      <h1 className="section-title">自由に生成</h1>
      <p className="section-desc">テキストと参考画像から画像を生成し、PNG または単スライドPPTとしてダウンロードできます。</p>

      {generateError && <Notice kind="error" message={generateError} />}
      {uploadNotice && <Notice kind="info" message={uploadNotice} />}

      <InputForm
        content={content}
        onContentChange={setContent}
        style={style}
        onStyleChange={setStyle}
        url={url}
        onUrlChange={setUrl}
        model={model}
        onModelChange={handleModelChange}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        count={count}
        onCountChange={setCount}
        maxCount={maxCountForModel(model)}
        attachments={attachments}
        onAddFiles={handleAddFiles}
        onRemoveAttachment={handleRemoveAttachment}
        attachmentError={attachmentError}
        onSubmit={handleGenerate}
        generating={generating}
        progressLabel={progressLabel}
      />

      <ImageResultGrid
        images={images}
        cropTopPx={settings?.crop_top_px ?? 0}
        cropBottomPx={settings?.crop_bottom_px ?? 0}
      />

      <HistoryPanel entries={history} onSelect={handleSelectHistory} />
    </main>
  );
}

export default FreeGenerationPage;
