// SlideMaker Public: F1 プレゼン資料を作る
// docs/REQUIREMENTS.md §5（分割モードは docs/DECISIONS.md により廃止済み）

import { useEffect, useRef, useState } from 'react';
import type { AspectRatio, ImageModel } from '../types';
import { detectSpreadsheetPageCount, parseSpreadsheetToPages } from '../lib/ppt/parseTsv';
import { suggestPresentationStructure } from '../lib/gemini/presentation';
import { generateMultiPagePowerPoint, generateSlideImagePowerPoint } from '../lib/ppt/generate';
import { uploadGeneratedImages } from '../lib/storage/generatedImages';
import { useUserSettings } from '../hooks/useUserSettings';
import { useReferenceImages, downloadReferenceImageAsBase64 } from '../hooks/useReferenceImages';
import { generateAllPages, regenerateSinglePage, sweepStalledPages } from '../components/presentation/generation';
import { emptyPageState, type PageImageState, type SlidePageData } from '../components/presentation/types';
import { InputForm } from '../components/presentation/InputForm';
import { PageEditor } from '../components/presentation/PageEditor';
import { GenerationControls } from '../components/presentation/GenerationControls';
import { DownloadControls } from '../components/presentation/DownloadControls';
import { Notice, type NoticeKind } from '../components/common/Notice';

const renumber = (list: SlidePageData[]): SlidePageData[] => list.map((page, i) => ({ ...page, pageNumber: i + 1 }));

function PresentationPage() {
  const { settings } = useUserSettings();
  const { images: referenceImages, loading: referenceImagesLoading } = useReferenceImages();

  const [sourceText, setSourceText] = useState('');
  const [pageCountHint, setPageCountHint] = useState('');
  const [designRequests, setDesignRequests] = useState('');
  const [selectedReferenceImageIds, setSelectedReferenceImageIds] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [model, setModel] = useState<ImageModel>('gpt-image-2');

  const [pages, setPages] = useState<SlidePageData[]>([]);
  const [imageStates, setImageStates] = useState<PageImageState[]>([]);

  const [structureLoading, setStructureLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: NoticeKind; message: string } | null>(null);

  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (!settings || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    setAspectRatio(settings.default_aspect_ratio);
    setModel(settings.default_model);
  }, [settings]);

  const { isSpreadsheet, pageCount: spreadsheetPageCount } = detectSpreadsheetPageCount(sourceText);

  const resolveReferenceBase64 = async (): Promise<string[]> => {
    const selected = referenceImages.filter((img) => selectedReferenceImageIds.includes(img.id));
    return Promise.all(selected.map((img) => downloadReferenceImageAsBase64(img.storage_path)));
  };

  const handleToggleReferenceImage = (id: string) => {
    setSelectedReferenceImageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleParseTsv = () => {
    const parsed = parseSpreadsheetToPages(sourceText);
    setPages(parsed);
    setImageStates(parsed.map(() => emptyPageState()));
    setNotice(null);
  };

  const handleSuggestStructure = async () => {
    if (!sourceText.trim()) return;
    setStructureLoading(true);
    setNotice(null);
    try {
      const count = Number(pageCountHint) > 0 ? Number(pageCountHint) : 8;
      const result = await suggestPresentationStructure(sourceText, count);
      setPages(result);
      setImageStates(result.map(() => emptyPageState()));
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : '構成提案に失敗しました' });
    } finally {
      setStructureLoading(false);
    }
  };

  const handleEditPage = (index: number, patch: Partial<SlidePageData>) => {
    setPages((prev) => prev.map((page, i) => (i === index ? { ...page, ...patch } : page)));
  };

  const handleDeletePage = (index: number) => {
    setPages((prev) => renumber(prev.filter((_, i) => i !== index)));
    setImageStates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMovePage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    setPages((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return renumber(next);
    });
    setImageStates((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleAddPage = () => {
    setPages((prev) =>
      renumber([
        ...prev,
        { pageNumber: prev.length + 1, title: '新しいページ', content: '', visualSuggestion: '', emphasis: '', tone: '' },
      ])
    );
    setImageStates((prev) => [...prev, emptyPageState()]);
  };

  const handleGenerateAll = async () => {
    if (pages.length === 0) return;
    setGenerating(true);
    setNotice(null);
    setCompletedCount(0);

    let localStates: PageImageState[] = pages.map(() => ({ status: 'generating' }));
    setImageStates(localStates);

    try {
      const referenceBase64 = await resolveReferenceBase64();
      let doneCount = 0;

      await generateAllPages(pages, designRequests, referenceBase64, aspectRatio, model, (index, result) => {
        localStates = localStates.map((state, i) => (i === index ? result : state));
        doneCount += 1;
        setCompletedCount(doneCount);
        setImageStates(localStates);
      });

      const finalStates = sweepStalledPages(localStates);
      setImageStates(finalStates);

      const successfulImages = finalStates
        .filter((state): state is PageImageState & { base64Image: string } => state.status === 'done' && !!state.base64Image)
        .map((state) => ({ base64Data: state.base64Image, model }));

      if (successfulImages.length > 0) {
        try {
          await uploadGeneratedImages({
            feature: 'presentation',
            inputText: sourceText,
            metadata: { pageCount: pages.length, model, aspectRatio },
            images: successfulImages,
          });
        } catch (err) {
          setNotice({
            kind: 'error',
            message: `生成画像の保存に失敗しました（ダウンロードは可能です）: ${err instanceof Error ? err.message : ''}`,
          });
        }
      }
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : '画像生成に失敗しました' });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegeneratePage = async (index: number) => {
    setRegeneratingIndex(index);
    setNotice(null);
    try {
      const referenceBase64 = await resolveReferenceBase64();
      const result = await regenerateSinglePage(pages, index, designRequests, referenceBase64, aspectRatio, model);
      setImageStates((prev) => {
        const next = [...prev];
        next[index] = result;
        return next;
      });
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : '再生成に失敗しました' });
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const allDone =
    pages.length > 0 &&
    imageStates.length === pages.length &&
    imageStates.every((state) => state.status === 'done' && !!state.base64Image);

  const handleDownloadFullImage = async () => {
    if (!allDone) return;
    setDownloadBusy(true);
    setNotice(null);
    try {
      const images = imageStates.map((state) => state.base64Image as string);
      await generateMultiPagePowerPoint(images, pages[0]?.title);
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'PPTの生成に失敗しました' });
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!allDone) return;
    setDownloadBusy(true);
    setNotice(null);
    try {
      const slidePages = pages.map((page, i) => ({
        title: page.title,
        base64Image: imageStates[i].base64Image as string,
      }));
      await generateSlideImagePowerPoint(
        slidePages,
        settings?.crop_top_px ?? 0,
        settings?.crop_bottom_px ?? 0,
        pages[0]?.title
      );
    } catch (err) {
      setNotice({ kind: 'error', message: err instanceof Error ? err.message : 'PPTの生成に失敗しました' });
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <main className="container-wide">
      <h1 className="section-title">プレゼン資料を作る</h1>
      <p className="section-desc">
        テキストからスライド構成を提案し、ページごとに画像を生成して PowerPoint としてダウンロードできます。
      </p>

      {notice && <Notice kind={notice.kind} message={notice.message} />}

      <InputForm
        sourceText={sourceText}
        onSourceTextChange={setSourceText}
        pageCountHint={pageCountHint}
        onPageCountHintChange={setPageCountHint}
        designRequests={designRequests}
        onDesignRequestsChange={setDesignRequests}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        model={model}
        onModelChange={setModel}
        referenceImages={referenceImages}
        referenceImagesLoading={referenceImagesLoading}
        selectedReferenceImageIds={selectedReferenceImageIds}
        onToggleReferenceImage={handleToggleReferenceImage}
        isSpreadsheet={isSpreadsheet}
        spreadsheetPageCount={spreadsheetPageCount}
        onParseTsv={handleParseTsv}
        onSuggestStructure={() => void handleSuggestStructure()}
        structureLoading={structureLoading}
      />

      {pages.length > 0 && (
        <>
          <PageEditor
            pages={pages}
            imageStates={imageStates}
            onEditPage={handleEditPage}
            onDeletePage={handleDeletePage}
            onMovePage={handleMovePage}
            onAddPage={handleAddPage}
            onRegeneratePage={(index) => void handleRegeneratePage(index)}
            regeneratingIndex={regeneratingIndex}
          />

          <GenerationControls
            onGenerate={() => void handleGenerateAll()}
            generating={generating}
            completedCount={completedCount}
            pageCount={pages.length}
          />

          <DownloadControls
            allDone={allDone}
            busy={downloadBusy}
            onDownloadFullImage={() => void handleDownloadFullImage()}
            onDownloadTemplate={() => void handleDownloadTemplate()}
          />
        </>
      )}
    </main>
  );
}

export default PresentationPage;
