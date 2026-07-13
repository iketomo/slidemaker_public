// F1: デザイン要望の保存済みテンプレートから選択するピッカー

import { useDesignTemplates } from '../../hooks/useDesignTemplates';

interface DesignTemplatePickerProps {
  onSelect: (content: string) => void;
}

export function DesignTemplatePicker({ onSelect }: DesignTemplatePickerProps) {
  const { templates, loading } = useDesignTemplates();

  if (loading) return null;
  if (templates.length === 0) {
    return <p className="field-hint">保存済みのデザイン要望テンプレートはありません（設定画面で追加できます）。</p>;
  }

  return (
    <div className="btn-row">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          className="btn-sm"
          onClick={() => onSelect(template.content)}
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}
