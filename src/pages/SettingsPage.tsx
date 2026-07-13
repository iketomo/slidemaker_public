// SlideMaker Public: 設定ページ（docs/REQUIREMENTS.md §5「per-user 設定」/ §3.3）

import { useUserSettings } from '../hooks/useUserSettings';
import { ApiKeySection } from '../components/settings/ApiKeySection';
import { TemplateSection } from '../components/settings/TemplateSection';
import { DefaultsSection } from '../components/settings/DefaultsSection';
import { DesignTemplatesSection } from '../components/settings/DesignTemplatesSection';
import { ReferenceImagesSection } from '../components/settings/ReferenceImagesSection';
import { Notice } from '../components/common/Notice';

function SettingsPage() {
  const { settings, loading, error, updateSettings } = useUserSettings();

  return (
    <main className="container">
      <h1 className="section-title">設定</h1>

      <ApiKeySection />

      {error && <Notice kind="error" message={error} />}
      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <>
          <TemplateSection settings={settings} onUpdate={updateSettings} />
          <DefaultsSection settings={settings} onUpdate={updateSettings} />
        </>
      )}

      <DesignTemplatesSection />
      <ReferenceImagesSection />
    </main>
  );
}

export default SettingsPage;
