import {
  CheckCircle2,
  Cloud,
  CloudOff,
  KeyRound,
  LoaderCircle,
  LogOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { vaultController } from '../../services/sync/vaultController';
import { text } from '../../i18n';
import type { Language } from '../../types';
import { ConflictCenter } from './ConflictCenter';
import { SyncStatus } from './SyncStatus';
import { syncEngine } from '../../sync/SyncEngine';
import { DeviceSetupGuide } from '../setup/DeviceSetupGuide';

type SyncStage = 'unconfigured' | 'disconnected' | 'legacy' | 'connected';
type LegacyUnlockMethod = 'password' | 'recovery';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Google Drive sync failed.';
}

export function VaultSetup({ language }: { language: Language }) {
  const [stage, setStage] = useState<SyncStage>(
    vaultController.isConfigured() ? 'disconnected' : 'unconfigured',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacyUnlockMethod, setLegacyUnlockMethod] =
    useState<LegacyUnlockMethod>('password');
  const [legacyCredential, setLegacyCredential] = useState('');

  useEffect(() => {
    if (!vaultController.isConfigured()) return;
    void vaultController.inspect()
      .then((connection) => setStage(
        connection.legacyMigrationRequired
          ? 'legacy'
          : connection.unlocked
            ? 'connected'
            : 'disconnected',
      ))
      .catch(() => setStage('disconnected'));
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const connection = await vaultController.connect();
    if (connection.legacyMigrationRequired) {
      setStage('legacy');
      return;
    }
    setStage('connected');
    await syncEngine.run({ force: true });
  });

  const migrateLegacy = () => run(async () => {
    if (!legacyCredential.trim()) return;
    if (legacyUnlockMethod === 'password') {
      await vaultController.migrateLegacyWithPassword(legacyCredential);
    } else {
      await vaultController.migrateLegacyWithRecoveryKey(legacyCredential);
    }
    setLegacyCredential('');
    setStage('connected');
    await syncEngine.run({ force: true });
  });

  const disconnect = () => run(async () => {
    await vaultController.disconnect();
    setStage('disconnected');
  });

  if (stage === 'unconfigured') {
    return <div className="vault-state" role="status"><CloudOff /><div>
      <strong>{text(
        language,
        'Google Drive is unavailable in this build',
        '此版本暂不可使用 Google Drive',
      )}</strong>
      <p>{text(
        language,
        'This development build does not include Google OAuth credentials. Install a release build configured for Google Drive to connect your account. Local library features remain available.',
        '当前开发版未包含 Google OAuth 凭据。请安装已配置 Google Drive 的发行版本后再连接账号；本地资料库功能不受影响。',
      )}</p>
    </div></div>;
  }

  return <div className="vault-setup">
    <div className="vault-heading">
      <span className="vault-icon">
        {stage === 'connected' ? <CheckCircle2 /> : <Cloud />}
      </span>
      <div>
        <strong>{text(language, 'Google Drive sync', 'Google 云同步')}</strong>
        <small>{stage === 'disconnected'
          ? text(language, 'Not connected', '未连接')
          : stage === 'legacy'
            ? text(language, 'Old encrypted data found', '发现旧版加密数据')
            : text(language, 'Connected · automatic sync is active', '已连接 · 自动同步已启用')}</small>
      </div>
    </div>

    {stage === 'disconnected' && <div className="vault-form">
      <p>{text(
        language,
        'Sign in once to sync your library, notes, annotations, conversations, and reading progress across devices.',
        '登录一次，即可在设备间同步资料库、笔记、批注、对话和阅读进度。',
      )}</p>
      <button
        className="vault-primary"
        disabled={busy}
        onClick={() => void connect()}
      >
        {busy ? <LoaderCircle className="spin" /> : <Cloud />}
        {text(language, 'Sign in with Google', '使用 Google 账号登录')}
      </button>
    </div>}

    {stage === 'legacy' && <div className="vault-form">
      <p>{text(
        language,
        'PaperFlow found data created by an older version. Enter the old password or recovery key once to upgrade it to one-click Google sync.',
        'PaperFlow 发现旧版本创建的云端数据。输入一次旧密码或恢复密钥，即可升级为 Google 一键同步。',
      )}</p>
      <div className="segmented">
        <button
          data-active={legacyUnlockMethod === 'password'}
          onClick={() => setLegacyUnlockMethod('password')}
        >{text(language, 'Old password', '旧密码')}</button>
        <button
          data-active={legacyUnlockMethod === 'recovery'}
          onClick={() => setLegacyUnlockMethod('recovery')}
        >{text(language, 'Recovery key', '恢复密钥')}</button>
      </div>
      {legacyUnlockMethod === 'password'
        ? <input
            type="password"
            autoComplete="current-password"
            value={legacyCredential}
            onChange={(event) => setLegacyCredential(event.target.value)}
            placeholder={text(language, 'Old sync password', '旧同步密码')}
          />
        : <textarea
            value={legacyCredential}
            onChange={(event) => setLegacyCredential(event.target.value)}
            placeholder={text(language, 'Old recovery key', '旧恢复密钥')}
          />}
      <button
        className="vault-primary"
        disabled={busy || !legacyCredential.trim()}
        onClick={() => void migrateLegacy()}
      >
        {busy ? <LoaderCircle className="spin" /> : <KeyRound />}
        {text(language, 'Upgrade and sync', '升级并同步')}
      </button>
    </div>}

    {stage === 'connected' && <div className="vault-form">
      <SyncStatus language={language} />
      <ConflictCenter language={language} />
      <div className="vault-actions">
        <button disabled={busy} onClick={() => void disconnect()}>
          <LogOut />{text(language, 'Disconnect Google account', '断开 Google 账号')}
        </button>
      </div>
    </div>}

    {error && <p className="vault-error" role="alert">{error}</p>}
    {/extension ID|Native Host|device-test/i.test(error) && <DeviceSetupGuide
      language={language}
      defaultOpen
    />}
    <p className="vault-footnote">{text(
      language,
      'Sync data is encrypted before upload. Anyone with access to this Google account and its PaperFlow Drive files can restore it.',
      '同步数据会先加密再上传；能够访问此 Google 账号及其 PaperFlow 云端文件的人可以恢复这些数据。',
    )}</p>
  </div>;
}
