// SlideMaker Public: .pptx 生成（F1 出力 / F2 単スライド出力）
// 移植元プロジェクトの pptService.ts
//   - generateMultiPagePowerPoint (FULL_IMAGE, line 311-350)
//   - generateSlideImagePowerPoint (SLIDE_IMAGE, line 600-846)
// 移植元との差分: テンプレート取得を Supabase Storage 経由に変更
// （ユーザーテンプレ slidemakerpublic-pptx-templates/{userId}/template.pptx を認証付き
//   download() で取得し、未設定時は public/defaults/template.pptx にフォールバック。
//   docs/REQUIREMENTS.md §5「per-user 設定」参照）。

import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { supabase } from '../supabase';

const MAX_PPT_FILE_NAME_LENGTH = 60;
const TEMPLATE_BUCKET = 'slidemakerpublic-pptx-templates';
const DEFAULT_TEMPLATE_PATH = '/defaults/template.pptx';

// ========================================
// ファイル名生成
// ========================================

const sanitizePromptForFileName = (prompt?: string, maxLength = 16): string | null => {
  if (!prompt) return null;

  const normalized = prompt.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  if (!normalized) return null;
  return normalized.slice(0, maxLength).replace(/_+$/, '');
};

const sanitizeAsciiSegment = (segment: string): string =>
  segment.replace(/[^A-Za-z0-9_-]+/g, '').replace(/_+/g, '_');

/**
 * プロンプト中の「# 画像の内容」見出しの直後にある最初の非空行をタイトルとして抽出する。
 * buildFreeMergedPrompt（src/lib/gemini/buildPrompt.ts）が組み立てるプロンプトと対応している。
 */
export const extractImageContentTitle = (prompt?: string): string | null => {
  if (!prompt) return null;
  const lines = prompt.split(/\r?\n/);
  const headerRegex = /^\s*#{1,6}\s*画像の内容\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i])) {
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (trimmed) return trimmed;
      }
      return null;
    }
  }
  return null;
};

/**
 * 任意のタイトル文字列（日本語可）をファイル名として安全な形に整える。
 */
const sanitizeTitleForFileName = (title: string, maxLength = 40): string => {
  const cleaned = title
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return cleaned.slice(0, maxLength).replace(/_+$/, '');
};

const buildShortTimestamp = (now: Date = new Date()): string => {
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}_${hh}${mi}${ss}`;
};

export const buildPptFileName = (descriptor: string, prompt?: string): string => {
  const safeDescriptor = sanitizeAsciiSegment(descriptor) || 'slides';
  const timestamp = buildShortTimestamp();

  const extractedTitle = extractImageContentTitle(prompt);
  const titleSegment = extractedTitle ? sanitizeTitleForFileName(extractedTitle) : '';
  const promptSegment = titleSegment || sanitizePromptForFileName(prompt);

  const stem = promptSegment ? `${promptSegment}_${safeDescriptor}_${timestamp}` : `${safeDescriptor}_${timestamp}`;
  const trimmed = stem.slice(0, MAX_PPT_FILE_NAME_LENGTH - '.pptx'.length).replace(/_+$/, '');
  return `${trimmed}.pptx`;
};

// ========================================
// 画像処理
// ========================================

const loadImage = (base64: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
};

/**
 * 16:9スライド用に画像を中央クロップする。
 * 画像のアスペクト比が16:9と異なる場合、縦横比を維持したまま上下（縦長画像）
 * または左右（横長画像）をカットする。
 */
const cropImageToSlideAspect = (img: HTMLImageElement): HTMLCanvasElement | null => {
  const slideAspect = 16 / 9;
  const imageAspect = img.width / img.height;

  let cropX = 0;
  let cropY = 0;
  let cropW = img.width;
  let cropH = img.height;

  if (Math.abs(imageAspect - slideAspect) > 0.001) {
    if (imageAspect < slideAspect) {
      cropH = img.width / slideAspect;
      cropY = (img.height - cropH) / 2;
    } else {
      cropW = img.height * slideAspect;
      cropX = (img.width - cropW) / 2;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropW);
  canvas.height = Math.round(cropH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return canvas;
};

/**
 * 画像の四隅のピクセルを平均して背景色を検出する。
 */
const detectBackgroundColor = (ctx: CanvasRenderingContext2D, width: number, height: number): string => {
  const corners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 },
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  corners.forEach((c) => {
    const pixel = ctx.getImageData(c.x, c.y, 1, 1).data;
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  });

  r = Math.round(r / 4);
  g = Math.round(g / 4);
  b = Math.round(b / 4);

  const toHex = (c: number) => {
    const hex = c.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// ========================================
// FULL_IMAGE モード
// ========================================

/**
 * 複数のbase64画像から1つのPowerPointファイルを生成する（各画像が1ページ、16:9スライド）。
 */
export const generateMultiPagePowerPoint = async (base64Images: string[], prompt?: string): Promise<void> => {
  if (base64Images.length === 0) {
    throw new Error('画像が指定されていません');
  }

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  for (const base64Image of base64Images) {
    const img = await loadImage(base64Image);

    const canvas = cropImageToSlideAspect(img);
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const bgColor = detectBackgroundColor(ctx, canvas.width, canvas.height);

    const slide = pres.addSlide();
    slide.background = { color: bgColor };

    slide.addImage({
      data: canvas.toDataURL('image/png'),
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
    });
  }

  const fileName = buildPptFileName(`slides_${base64Images.length}p`, prompt);
  await pres.writeFile({ fileName });
};

// ========================================
// SLIDE_IMAGE モード
// ========================================

// U+0000-U+0008, U+000B, U+000C, U+000E-U+001F はコードポイントで判定して除去する
// (制御文字リテラルを正規表現に直接埋め込むと環境依存で化けるため、文字コード比較にする)。
// タイトルにこれらの文字が混入すると PowerPoint がファイルを壊れているとみなすため、
// sanitizeTitleForFileName（ファイル名側）と同等の除去を XML 側にも行う。
const isXmlInvalidControlCodePoint = (codePoint: number): boolean =>
  (codePoint >= 0 && codePoint <= 8) || codePoint === 11 || codePoint === 12 || (codePoint >= 14 && codePoint <= 31);

const stripXmlInvalidControlChars = (str: string): string =>
  Array.from(str)
    .filter((ch) => !isXmlInvalidControlCodePoint(ch.codePointAt(0) ?? 0))
    .join('');

const escapeXml = (str: string): string =>
  stripXmlInvalidControlChars(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * スライド左下に配置するURLテキストの <p:sp>（テキストボックス）要素を生成する。
 * テンプレートのタイトルと左マージンを揃え、最前面（spTree末尾）に挿入して画像の上に重ねる。
 */
const buildFooterUrlShape = (url: string, id: number): string =>
  [
    '<p:sp>',
    '<p:nvSpPr>',
    `<p:cNvPr id="${id}" name="FooterUrl ${id}"/>`,
    '<p:cNvSpPr txBox="1"/>',
    '<p:nvPr/>',
    '</p:nvSpPr>',
    '<p:spPr>',
    '<a:xfrm><a:off x="161903" y="6543675"/><a:ext cx="10000000" cy="365760"/></a:xfrm>',
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '<a:noFill/>',
    '</p:spPr>',
    '<p:txBody>',
    '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
    '<a:p>',
    '<a:pPr algn="l"/>',
    `<a:r><a:rPr lang="en-US" sz="900" dirty="0"><a:solidFill><a:srgbClr val="888888"/></a:solidFill></a:rPr><a:t>${escapeXml(url)}</a:t></a:r>`,
    '</a:p>',
    '</p:txBody>',
    '</p:sp>',
  ].join('');

export interface SlideImagePage {
  title: string;
  base64Image: string; // base64エンコードされたPNG（data:...プレフィックスなし）
}

/**
 * base64画像のピクセル寸法を取得する。
 * （PPTX側で <a:srcRect> によるトリミングを行うため、画像本体は加工しない）
 */
const getImageDimensions = async (base64Image: string): Promise<{ width: number; height: number }> => {
  const img = await loadImage(base64Image);
  return { width: img.width, height: img.height };
};

/**
 * ログイン中のユーザーがアップロードした .pptx テンプレートを Supabase Storage から取得する。
 * 未アップロード（storage にファイルが無い）の場合は null を返す（呼び出し側でデフォルトにフォールバック）。
 */
const fetchUserTemplateArrayBuffer = async (): Promise<ArrayBuffer | null> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(`${userData.user.id}/template.pptx`);
  if (error || !data) return null;

  return data.arrayBuffer();
};

const fetchDefaultTemplateArrayBuffer = async (): Promise<ArrayBuffer> => {
  const response = await fetch(DEFAULT_TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error(`デフォルトテンプレートPPTXの取得に失敗しました（status: ${response.status}）`);
  }
  return response.arrayBuffer();
};

const getTemplateArrayBuffer = async (): Promise<ArrayBuffer> => {
  const userTemplate = await fetchUserTemplateArrayBuffer();
  return userTemplate ?? (await fetchDefaultTemplateArrayBuffer());
};

/**
 * テンプレートPPTXを使用してスライド画像モードのPowerPointを生成する。
 * - ユーザーテンプレ（未設定時はデフォルトテンプレ）をベースに使用
 * - 各スライドに画像を16:9最大サイズで配置（最下層レイヤー）
 * - 元画像は加工せずそのまま埋め込み、16:9に揃える際の上下/左右トリミングは
 *   PowerPointネイティブの <a:srcRect> で表現する（非破壊・PowerPoint上で再調整可能）
 * - テンプレート内の "title" テキストをページタイトルに置換（画像の上に表示）
 * - cropTopPx / cropBottomPx > 0 の場合、上記アスペクトトリミングに加えて画像上部/下部を
 *   さらにトリミングする（トリミングした分だけスライド上部/下部に余白が空き、画像の縦比率は維持される）
 * - footerUrl が指定された場合、スライド左下にURLをテキストとして配置（画像の上に重ねる）
 * @param cropTopPx 呼び出し側が slidemakerpublic_user_settings.crop_top_px から渡す
 * @param cropBottomPx 呼び出し側が slidemakerpublic_user_settings.crop_bottom_px から渡す
 */
export const generateSlideImagePowerPoint = async (
  pages: SlideImagePage[],
  cropTopPx = 0,
  cropBottomPx = 0,
  prompt?: string,
  footerUrl?: string
): Promise<void> => {
  if (pages.length === 0) {
    throw new Error('ページが指定されていません');
  }

  const templateData = await getTemplateArrayBuffer();
  const zip = await JSZip.loadAsync(templateData);

  const slide1XmlRaw = await zip.file('ppt/slides/slide1.xml')?.async('string');
  if (!slide1XmlRaw) {
    throw new Error('テンプレートの slide1.xml が見つかりません');
  }

  // テンプレートがタイトル挿入位置として使う "title" プレースホルダを持っているか検証する。
  // 無い場合、下の .replace(/<a:t>title<\/a:t>/g, ...) が何も置換せず、
  // タイトルが表示されないまま silent に壊れたPPTXが生成されてしまうため fail fast する。
  if (!slide1XmlRaw.includes('<a:t>title</a:t>')) {
    throw new Error("テンプレートに 'title' というテキストが必要です。タイトル挿入位置として使われます");
  }

  let presentationXml = await zip.file('ppt/presentation.xml')!.async('string');
  let presentationRels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
  let contentTypes = await zip.file('[Content_Types].xml')!.async('string');

  // presentation.xml / presentation.xml.rels が rId2 → slides/slide1.xml の想定構造を
  // 持っているかを検証する。想定外の構造（PowerPoint以外のツールで作られた等）だと、
  // 下の .replace() 群が何もマッチせず、スライド1が削除されないまま新スライドが
  // 追加された壊れたPPTXが silent に生成されてしまうため fail fast する。
  const hasExpectedSldId = /<p:sldId[^>]*r:id="rId2"[^/]*\/>/.test(presentationXml);
  const hasExpectedRel = /<Relationship[^>]*Id="rId2"[^>]*Target="slides\/slide1\.xml"[^>]*\/>/.test(
    presentationRels
  );
  if (!hasExpectedSldId || !hasExpectedRel) {
    throw new Error(
      'このテンプレートの内部構造に対応していません。PowerPoint で新規作成したシンプルなテンプレートをお使いください'
    );
  }

  zip.remove('ppt/slides/slide1.xml');
  zip.remove('ppt/slides/_rels/slide1.xml.rels');

  presentationXml = presentationXml.replace(/<p:sldId[^>]*r:id="rId2"[^/]*\/>/, '');
  presentationRels = presentationRels.replace(
    /<Relationship[^>]*Id="rId2"[^>]*Target="slides\/slide1\.xml"[^>]*\/>/,
    ''
  );
  contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/slides\/slide1\.xml"[^>]*\/>/, '');

  // notesSlideも削除（テンプレートのスライド1に紐づいているため）
  zip.remove('ppt/notesSlides/notesSlide1.xml');
  zip.remove('ppt/notesSlides/_rels/notesSlide1.xml.rels');
  contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/notesSlides\/notesSlide1\.xml"[^>]*\/>/, '');

  // PNGのContent Typeを追加（テンプレートにはJPEGのみ定義されている場合）
  if (!contentTypes.includes('Extension="png"')) {
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }

  const baseRId = 20; // 既存のrIdと衝突しないよう大きめの値から開始
  const baseSldId = 2147478000;

  let sldIdEntries = '';
  let presRelsEntries = '';
  let contentTypeEntries = '';

  // 16:9スライドサイズ (EMU)
  const slideCx = 12192000;
  const slideCy = 6858000;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slideNum = i + 1;
    const rId = `rId${baseRId + i}`;
    const sldId = baseSldId + i;
    const imageRId = 'rId20'; // スライド内での画像リレーションID
    const mediaFileName = `slideimage${slideNum}.png`;

    const { width: imgW, height: imgH } = await getImageDimensions(page.base64Image);
    zip.file(`ppt/media/${mediaFileName}`, page.base64Image, { base64: true });

    const slideAspect = 16 / 9;
    const imageAspect = imgW > 0 && imgH > 0 ? imgW / imgH : slideAspect;
    let aspectCropTopPx = 0;
    let aspectCropBottomPx = 0;
    let aspectCropLeftPx = 0;
    let aspectCropRightPx = 0;
    let displayHeightPx = imgH; // 16:9表示部分の高さ（元画像ピクセル）
    if (Math.abs(imageAspect - slideAspect) > 0.001) {
      if (imageAspect < slideAspect) {
        displayHeightPx = imgW / slideAspect;
        const totalCrop = imgH - displayHeightPx;
        aspectCropTopPx = totalCrop / 2;
        aspectCropBottomPx = totalCrop / 2;
      } else {
        const displayWidthPx = imgH * slideAspect;
        const totalCrop = imgW - displayWidthPx;
        aspectCropLeftPx = totalCrop / 2;
        aspectCropRightPx = totalCrop / 2;
      }
    }

    const userCropTopRatio = displayHeightPx > 0 ? cropTopPx / displayHeightPx : 0;
    const userCropBottomRatio = displayHeightPx > 0 ? cropBottomPx / displayHeightPx : 0;

    // PowerPointネイティブトリミング: <a:srcRect> で元画像からの切り出し領域を指定
    // 値は 1/100000 単位（100% = 100000）
    const srcLeft = Math.round((aspectCropLeftPx / imgW) * 100000);
    const srcRight = Math.round((aspectCropRightPx / imgW) * 100000);
    const srcTop = Math.round(((aspectCropTopPx + cropTopPx) / imgH) * 100000);
    const srcBottom = Math.round(((aspectCropBottomPx + cropBottomPx) / imgH) * 100000);

    const srcRectAttrs: string[] = [];
    if (srcLeft > 0) srcRectAttrs.push(`l="${srcLeft}"`);
    if (srcTop > 0) srcRectAttrs.push(`t="${srcTop}"`);
    if (srcRight > 0) srcRectAttrs.push(`r="${srcRight}"`);
    if (srcBottom > 0) srcRectAttrs.push(`b="${srcBottom}"`);
    const srcRectElement = srcRectAttrs.length > 0 ? `<a:srcRect ${srcRectAttrs.join(' ')}/>` : '';

    const imageY = Math.round(slideCy * userCropTopRatio);
    const imageCy = slideCy - imageY - Math.round(slideCy * userCropBottomRatio);

    const picElement = [
      '<p:pic>',
      '  <p:nvPicPr>',
      `    <p:cNvPr id="${100 + i}" name="SlideImage ${slideNum}"/>`,
      '    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>',
      '    <p:nvPr/>',
      '  </p:nvPicPr>',
      '  <p:blipFill>',
      `    <a:blip r:embed="${imageRId}"/>`,
      srcRectElement,
      '    <a:stretch><a:fillRect/></a:stretch>',
      '  </p:blipFill>',
      '  <p:spPr>',
      '    <a:xfrm>',
      `      <a:off x="0" y="${imageY}"/>`,
      `      <a:ext cx="${slideCx}" cy="${imageCy}"/>`,
      '    </a:xfrm>',
      '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
      '  </p:spPr>',
      '</p:pic>',
    ].join('');

    let slideXml = slide1XmlRaw;

    slideXml = slideXml.replace(/<a:t>title<\/a:t>/g, `<a:t>${escapeXml(page.title)}</a:t>`);
    slideXml = slideXml.replace('<p:sp>', picElement + '<p:sp>');

    const trimmedFooterUrl = footerUrl?.trim();
    if (trimmedFooterUrl) {
      const footerSp = buildFooterUrlShape(trimmedFooterUrl, 300 + i);
      slideXml = slideXml.replace('</p:spTree>', footerSp + '</p:spTree>');
    }

    slideXml = slideXml.replace(/<Relationship[^>]*Type="[^"]*notesSlide"[^>]*\/>/g, '');

    zip.file(`ppt/slides/slide${slideNum}.xml`, slideXml);

    const slideRelsXml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
      `  <Relationship Id="${imageRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFileName}"/>`,
      '</Relationships>',
    ].join('');

    zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, slideRelsXml);

    sldIdEntries += `<p:sldId id="${sldId}" r:id="${rId}"/>`;
    presRelsEntries += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`;
    contentTypeEntries += `<Override PartName="/ppt/slides/slide${slideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }

  presentationXml = presentationXml.replace('</p:sldIdLst>', sldIdEntries + '</p:sldIdLst>');
  presentationRels = presentationRels.replace('</Relationships>', presRelsEntries + '</Relationships>');
  contentTypes = contentTypes.replace('</Types>', contentTypeEntries + '</Types>');

  zip.file('ppt/presentation.xml', presentationXml);
  zip.file('ppt/_rels/presentation.xml.rels', presentationRels);
  zip.file('[Content_Types].xml', contentTypes);

  const blob = await zip.generateAsync({ type: 'blob' });

  const fileName = buildPptFileName(`slides_${pages.length}p`, prompt);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
