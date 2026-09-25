import {
  Check,
  Clipboard,
  ExternalLink,
  MonitorCog,
  Settings,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { text } from '../../i18n';
import type { Language } from '../../types';

const PRODUCTION_EXTENSION_ID = 'dffiahjmpkmellmjijffpcofoahbccoc';
const CODEX_COMMANDS = [
  'npm install -g @openai/codex',
  'codex login',
  'codex login status',
].join('\n');

function currentExtensionId(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.id
    ? chrome.runtime.id
    : '';
}

function platformName(language: Language): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('mac')) return 'macOS';
  return text(language, 'this computer', '当前电脑');
}

function openExtensionSettings(): void {
  const extensionId = currentExtensionId();
  const url = extensionId
    ? `chrome://extensions/?id=${extensionId}`
    : 'chrome://extensions';
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function DeviceSetupGuide({
  language,
  defaultOpen = false,
  onOpenSettings,
}: {
  language: Language;
  defaultOpen?: boolean;
  onOpenSettings?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const extensionId = currentExtensionId();
  const stableId = extensionId === PRODUCTION_EXTENSION_ID;
  const platform = platformName(language);

  const copyCommands = async () => {
    await navigator.clipboard.writeText(CODEX_COMMANDS);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <details className="device-setup-guide" open={defaultOpen}>
    <summary>
      <span><MonitorCog />{text(language, 'Device login guide', '设备登录向导')}</span>
      <small>{text(
        language,
        'Set up ChatGPT through Codex',
        '通过 Codex 配置 ChatGPT',
      )}</small>
    </summary>

    <div className="device-guide-body">
      <div className="device-guide-status" data-valid={stableId}>
        {stableId ? <Check /> : <MonitorCog />}
        <span>
          <strong>{stableId
            ? text(language, 'Stable extension ID detected', '已检测到固定扩展 ID')
            : text(language, 'Extension ID needs attention', '扩展 ID 需要处理')}</strong>
          <code>{extensionId || text(language, 'Unavailable outside Chrome', '仅在 Chrome 扩展中可检测')}</code>
        </span>
      </div>

      <ol>
        <li>
          <strong>{text(language, 'Load the device-test build', '加载设备测试版')}</strong>
          <p>{text(
            language,
            `On ${platform}, use the device-test package and confirm the ID is ${PRODUCTION_EXTENSION_ID}.`,
            `在 ${platform} 上使用设备测试包，并确认扩展 ID 为 ${PRODUCTION_EXTENSION_ID}。`,
          )}</p>
        </li>
        <li>
          <strong>{text(language, 'Install the Native Host', '安装 Native Host')}</strong>
          <p>{platform === 'Windows'
            ? text(language, 'Run INSTALL-PAPERFLOW.cmd from the extracted package.', '在解压后的文件夹中运行 INSTALL-PAPERFLOW.cmd。')
            : text(language, 'Run install-device-test.sh from the extracted package.', '在解压后的文件夹中运行 install-device-test.sh。')}</p>
        </li>
        <li>
          <strong>{text(language, 'Sign in to Codex', '登录 Codex')}</strong>
          <p>{text(
            language,
            'Install the official Codex CLI, run codex login, then return to PaperFlow.',
            '安装官方 Codex CLI，运行 codex login，再返回 PaperFlow。',
          )}</p>
        </li>
      </ol>

      <div className="device-guide-actions">
        <button type="button" onClick={openExtensionSettings}>
          <ExternalLink />{text(language, 'Extension settings', '扩展管理')}
        </button>
        {onOpenSettings && <button type="button" onClick={onOpenSettings}>
          <Settings />{text(language, 'PaperFlow settings', 'PaperFlow 设置')}
        </button>}
        <button type="button" onClick={() => void copyCommands()}>
          {copied ? <Check /> : <Clipboard />}
          {copied
            ? text(language, 'Copied', '已复制')
            : text(language, 'Copy Codex commands', '复制 Codex 命令')}
        </button>
      </div>

      <pre><Terminal />{CODEX_COMMANDS}</pre>
    </div>
  </details>;
}
