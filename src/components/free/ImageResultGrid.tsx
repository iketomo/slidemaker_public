// SlideMaker Public: F2 生成結果グリッド

import type { GeneratedImage } from '../../types';
import { ImageResultCard } from './ImageResultCard';

interface ImageResultGridProps {
  images: GeneratedImage[];
  cropTopPx: number;
  cropBottomPx: number;
}

export function ImageResultGrid({ images, cropTopPx, cropBottomPx }: ImageResultGridProps) {
  if (images.length === 0) return null;

  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <ImageResultCard
          key={image.id}
          image={image}
          index={index}
          cropTopPx={cropTopPx}
          cropBottomPx={cropBottomPx}
        />
      ))}
    </div>
  );
}
