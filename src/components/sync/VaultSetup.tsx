import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UnlockKeyhole,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getVaultCredentialStatus } from '../../services/bridge';
import { vaultController } from '../../services/sync/vaultController';
import { text } from '../../i18n';
import type { Language } from '../../types';
import { ConflictCenter } from './ConflictCenter';
import { SyncStatus } from './SyncStatus';
import { syncEngine } from '../../sync/SyncEngine';

type VaultStage = 'unconfigured' | 'disconnected' | 'new' | 'locked' | 'unlocked';
type UnlockMethod = 'password' | 'recovery';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Google Drive vault operation failed.';
}

export function VaultSetup({ language }: { language: Language }) {
  const [stage, setStage] = useState<VaultStage>(
    vaultController.isConfigured() ? 'disconnected' : 'unconfigured',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [unlockMethod, setUnlockMethod] = useState<UnlockMethod>('password');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [rememberAvailable, setRememberAvailable] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');

  useEffect(() => {
    void getVaultCredentialStatus().then((result) => setRememberAvailable(result.ok));
    if (!vaultController.isConfigured()) return;
    void vaultController.inspect()
      .then((connection) => setStage(
        !connection.header ? 'new' : connection.unlocked ? 'unlocked' : 'locked',
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
    setStage(!connection.header ? 'new' : connection.unlocked ? 'unlocked' : 'locked');
  });

  const create = () => run(async () => {
    if (password !== confirmation) throw new Error('Vault passwords do not match.');
    const result = await vaultController.create(password, rememberDevice);
    setRecoveryKey(result.recoveryKey);
    setPassword('');
    setConfirmation('');
    setStage('unlocked');
    void syncEngine.run({ force: true }).catch(() => undefined);
    if (rememberDevice && !result.remembered) {
      setError(text(language, 'Vault created, but this device could not be remembered.', '保险库已创建，但无法记住此设备。'));
    }
  });

  const unlock = () => run(async () => {
    let remembered: boolean;
    if (unlockMethod === 'password') {
      remembered = await vaultController.unlockWithPassword(password, rememberDevice);
    } else {
      remembered = await vaultController.unlockWithRecoveryKey(recoveryInput, rememberDevice);
    }
    setPassword('');
    setRecoveryInput('');
    setStage('unlocked');
    void syncEngine.run({ force: true }).catch(() => undefined);
    if (rememberDevice && !remembered) {
      setError(text(language, 'Vault unlocked, but this device could not be remembered.', '保险库已解锁，但无法记住此设备。'));
    }
  });

  const changePassword = () => run(async () => {
    if (newPassword !== newPasswordConfirmation) throw new Error('New vault passwords do not match.');
    await vaultController.changePassword(newPassword);
    setNewPassword('');
    setNewPasswordConfirmation('');
  });

  if (stage === 'unconfigured') {
    return <div className="vault-state"><CloudOff /><div><strong>{text(language, 'Google Drive sync is not configured', 'Google Drive 同步尚未配置')}</strong><p>{text(language, 'Set PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID when building the extension. Local library features remain available.', '构建扩展时设置 PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID。本地资料库功能不受影响。')}</p></div></div>;
  }

  return <div className="vault-setup">
    <div className="vault-heading"><span className="vault-icon">{stage === 'unlocked' ? <ShieldCheck /> : <Cloud />}</span><div><strong>{text(language, 'Encrypted Google Drive vault', 'Google Drive 加密保险库')}</strong><small>{stage === 'disconnected'
      ? text(language, 'Not connected', '未连接')
      : stage === 'new'
        ? text(language, 'Connected · no vault yet', '已连接 · 尚未创建保险库')
        : stage === 'locked'
          ? text(language, 'Connected · vault locked', '已连接 · 保险库已锁定')
          : text(language, 'Connected · end-to-end encrypted', '已连接 · 端到端加密')}</small></div></div>

    {stage === 'disconnected' && <button className="vault-primary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" /> : <Cloud />}{text(language, 'Connect Google Drive', '连接 Google Drive')}</button>}

    {stage === 'new' && <div className="vault-form">
      <p>{text(language, 'Create a separate vault password. Your Google account cannot decrypt this data.', '创建独立的保险库密码。Google 账号本身无法解密这些数据。')}</p>
      <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text(language, 'Vault password · 12+ characters', '保险库密码 · 至少 12 个字符')} />
      <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={text(language, 'Confirm vault password', '确认保险库密码')} />
      <RememberDevice language={language} checked={rememberDevice} available={rememberAvailable} onChange={setRememberDevice} />
      <button className="vault-primary" disabled={busy || !password || !confirmation} onClick={() => void create()}>{busy ? <LoaderCircle className="spin" /> : <LockKeyhole />}{text(language, 'Create encrypted vault', '创建加密保险库')}</button>
    </div>}

    {stage === 'locked' && <div className="vault-form">
      <div className="segmented"><button data-active={unlockMethod === 'password'} onClick={() => setUnlockMethod('password')}>{text(language, 'Password', '密码')}</button><button data-active={unlockMethod === 'recovery'} onClick={() => setUnlockMethod('recovery')}>{text(language, 'Recovery key', '恢复密钥')}</button></div>
      {unlockMethod === 'password'
        ? <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text(language, 'Vault password', '保险库密码')} />
        : <textarea value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} placeholder={text(language, 'Enter the recovery key', '输入恢复密钥')} />}
      <RememberDevice language={language} checked={rememberDevice} available={rememberAvailable} onChange={setRememberDevice} />
      <button className="vault-primary" disabled={busy || (unlockMethod === 'password' ? !password : !recoveryInput)} onClick={() => void unlock()}>{busy ? <LoaderCircle className="spin" /> : <UnlockKeyhole />}{text(language, 'Unlock vault', '解锁保险库')}</button>
    </div>}

    {stage === 'unlocked' && <div className="vault-form">
      <SyncStatus language={language} />
      <ConflictCenter language={language} />
      {recoveryKey && <div className="recovery-key"><strong>{text(language, 'Save this recovery key now', '请立即保存此恢复密钥')}</strong><p>{text(language, 'It is shown once. Without the password or this key, the vault cannot be recovered.', '它只显示一次。若密码和恢复密钥均丢失，保险库将无法恢复。')}</p><code>{recoveryKey}</code><div><button onClick={() => void navigator.clipboard.writeText(recoveryKey)}><Copy />{text(language, 'Copy', '复制')}</button><button onClick={() => setRecoveryKey('')}><Check />{text(language, 'I saved it', '我已保存')}</button></div></div>}
      <details><summary><KeyRound />{text(language, 'Change vault password', '更改保险库密码')}</summary><div className="vault-password-change"><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={text(language, 'New password · 12+ characters', '新密码 · 至少 12 个字符')} /><input type="password" autoComplete="new-password" value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} placeholder={text(language, 'Confirm new password', '确认新密码')} /><button disabled={busy || !newPassword || !newPasswordConfirmation} onClick={() => void changePassword()}>{text(language, 'Update password', '更新密码')}</button></div></details>
      <div className="vault-actions"><button onClick={() => { vaultController.lock(); setStage('locked'); }}><LockKeyhole />{text(language, 'Lock', '锁定')}</button><button onClick={() => void run(async () => { await vaultController.forgetDevice(); setRememberDevice(false); })}><KeyRound />{text(language, 'Forget device', '忘记此设备')}</button><button onClick={() => void run(async () => { await vaultController.disconnect(); setStage('disconnected'); })}><LogOut />{text(language, 'Disconnect', '断开连接')}</button></div>
    </div>}

    {error && <p className="vault-error" role="alert">{error}</p>}
    <p className="vault-footnote">{text(language, 'Drive stores opaque encrypted objects. The vault key stays in memory unless you explicitly save it to the OS credential store.', 'Drive 仅保存不透明的加密对象。除非你明确选择保存到系统凭据库，否则保险库密钥只存在于内存。')}</p>
  </div>;
}

function RememberDevice(props: {
  language: Language;
  checked: boolean;
  available: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="remember-device"><input type="checkbox" checked={props.checked} disabled={!props.available} onChange={(event) => props.onChange(event.target.checked)} /><span><strong>{text(props.language, 'Remember this device', '记住此设备')}</strong><small>{props.available ? text(props.language, 'Save the vault key in the OS credential store', '将保险库密钥保存到系统凭据库') : text(props.language, 'Requires the PaperFlow Native Host', '需要 PaperFlow Native Host')}</small></span></label>;
}
