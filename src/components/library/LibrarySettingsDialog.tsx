import {
  BookOpen,
  CloudUpload,
  Languages,
  Laptop,
  Moon,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { text } from '../../i18n';
import {
  isPdfCloudSyncEnabled,
  setPdfCloudSyncEnabled,
} from '../../services/storage/documentStore';
import { useAppStore } from '../../store/useAppStore';
import type { Language, Theme } from '../../types';
import { VaultSetup } from '../sync/VaultSetup';

export function LibrarySettingsDialog(props: {
  language: Language;
  theme: Theme;
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
}) {
  const [syncPdfDocuments, setSyncPdfDocumentsState] = useState(false);
  const {
    defaultOpenReader,
    setDefaultOpenReader,
    setUiLanguage,
  } = useAppStore();

  useEffect(() => {
    void isPdfCloudSyncEnabled().then(setSyncPdfDocumentsState);
  }, []);

  return <div
    className="dialog-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}
  >
    <section
      className="library-dialog library-settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-settings-title"
    >
      <header>
        <div>
          <h2 id="library-settings-title">
            <Settings2 />{text(props.language, 'Library settings', '资料库设置')}
          </h2>
          <p>{text(
            props.language,
            'Reading, storage, and cross-device sync.',
            '管理阅读方式、本机存储和跨设备同步。',
          )}</p>
        </div>
        <button
          type="button"
          title={text(props.language, 'Close', '关闭')}
          onClick={props.onClose}
        ><X /></button>
      </header>

      <div className="library-settings-content">
        <section>
          <h3><Languages />{text(props.language, 'Language', '语言')}</h3>
          <div className="library-setting-segmented">
            <button
              type="button"
              data-active={props.language === 'en'}
              onClick={() => setUiLanguage('en')}
            >English</button>
            <button
              type="button"
              data-active={props.language === 'zh'}
              onClick={() => setUiLanguage('zh')}
            >中文</button>
          </div>
        </section>

        <section>
          <h3><Sun />{text(props.language, 'Appearance', '外观')}</h3>
          <div className="library-setting-segmented three">
            <button
              type="button"
              data-active={props.theme === 'light'}
              onClick={() => props.onThemeChange('light')}
            ><Sun />{text(props.language, 'Light', '浅色')}</button>
            <button
              type="button"
              data-active={props.theme === 'dark'}
              onClick={() => props.onThemeChange('dark')}
            ><Moon />{text(props.language, 'Dark', '深色')}</button>
            <button
              type="button"
              data-active={props.theme === 'system'}
              onClick={() => props.onThemeChange('system')}
            ><Laptop />{text(props.language, 'System', '跟随系统')}</button>
          </div>
        </section>

        <section>
          <h3><BookOpen />{text(props.language, 'Reading', '阅读')}</h3>
          <label className="library-setting-row">
            <span>
              <strong>{text(
                props.language,
                'Open direct PDFs in PaperFlow',
                '默认用 PaperFlow 打开直接 PDF',
              )}</strong>
              <small>{text(
                props.language,
                'arXiv keeps its original address and site icon.',
                'arXiv 会保留原始地址和站点图标。',
              )}</small>
            </span>
            <input
              type="checkbox"
              checked={defaultOpenReader}
              onChange={(event) => setDefaultOpenReader(event.target.checked)}
            />
          </label>
        </section>

        <section>
          <h3><CloudUpload />{text(props.language, 'Cross-device sync', '跨设备同步')}</h3>
          <p className="library-sync-explanation">{text(
            props.language,
            'Sign in with Google to sync library records, notes, annotations, conversations, and optional PDFs across devices.',
            '登录 Google 账号，即可在设备间同步资料库、笔记、批注、对话和可选 PDF。',
          )}</p>
          <label className="library-setting-row">
            <span>
              <strong>{text(props.language, 'Back up offline PDFs', '备份离线 PDF')}</strong>
              <small>{text(
                props.language,
                'Off by default. Library records, notes, and annotations still sync.',
                '默认关闭；资料库、笔记和批注仍会同步。',
              )}</small>
            </span>
            <input
              type="checkbox"
              checked={syncPdfDocuments}
              onChange={(event) => {
                const enabled = event.target.checked;
                setSyncPdfDocumentsState(enabled);
                void setPdfCloudSyncEnabled(enabled);
              }}
            />
          </label>
          <VaultSetup language={props.language} />
        </section>
      </div>
    </section>
  </div>;
}
