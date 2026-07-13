// デフォルト汎用テンプレート public/defaults/template.pptx を生成するスクリプト。
// 使い方: node scripts/make-default-template.mjs
//
// SLIDE_IMAGE モード（src/lib/ppt/generate.ts）はテンプレートの slide1 を雛形として
// 各ページを複製するため、slide1 は次の構造を満たす必要がある:
// - タイトル用テキスト shape がスライド先頭の <p:sp> であること
// - そのテキスト run が文字列 "title"（<a:t>title</a:t>）であること（ページタイトルに置換される）
import PptxGenJS from 'pptxgenjs';

const OUTPUT_PATH = new URL('../public/defaults/template.pptx', import.meta.url).pathname;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';

const slide = pptx.addSlide();
slide.background = { color: 'FFFFFF' };
slide.addText('title', {
  x: 0.4,
  y: 0.15,
  w: 12.5,
  h: 0.7,
  fontSize: 22,
  bold: true,
  color: '333333',
  align: 'left',
  valign: 'middle',
  fontFace: 'Meiryo',
});

await pptx.writeFile({ fileName: OUTPUT_PATH });
console.log('written:', OUTPUT_PATH);
