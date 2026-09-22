import { DatabaseBackup, Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { downloadRawDatabaseExport, exportRawDatabase } from '../../services/recovery';

function isChinese(): boolean {
  return localStorage.getItem('paperflow:ui-language') === 'zh'
    || localStorage.getItem('uiLanguage') === 'zh';
}

export function RecoveryApp() {
  const chinese = isChinese();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reason = new URLSearchParams(window.location.search).get('reason') || '';

  const exportData = async () => {
    setBusy(true);
    setMessage('');
    try {
      downloadRawDatabaseExport(await exportRawDatabase());
      setMessage(chinese ? '恢复数据已导出。' : 'Recovery data exported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return <main className="recovery-page">
    <section className="recovery-panel">
      <DatabaseBackup aria-hidden="true" />
      <p className="recovery-eyebrow">PaperFlow AI</p>
      <h1>{chinese ? '资料库需要恢复' : 'Library recovery required'}</h1>
      <p>{chinese
        ? 'PaperFlow 已停止写入，以免旧客户端或失败的升级继续修改资料。请先导出 IndexedDB 原始数据，再更新或重新安装兼容版本。'
        : 'PaperFlow stopped writing to protect your library from an incompatible client or failed upgrade. Export the raw IndexedDB data before updating or reinstalling a compatible version.'}</p>
      {reason && <code>{reason}</code>}
      <div className="recovery-actions">
        <button disabled={busy} onClick={() => void exportData()}>
          <Download aria-hidden="true" />
          {busy
            ? (chinese ? '正在导出…' : 'Exporting…')
            : (chinese ? '导出恢复数据' : 'Export recovery data')}
        </button>
        <button onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden="true" />
          {chinese ? '重试打开' : 'Retry'}
        </button>
      </div>
      {message && <p className="recovery-message" role="status">{message}</p>}
      <small>{chinese
        ? '原始导出不包含 OPFS 中的 PDF 二进制文件，也不会读取系统凭据库。'
        : 'The raw export excludes PDF bytes stored in OPFS and never reads the OS credential store.'}</small>
    </section>
  </main>;
}
