import { FileText } from 'lucide-react';
import type { Citation as CitationType } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';

export function Citation({ citation }: { citation: CitationType }) {
  const uiLanguage = useAppStore((state) => state.uiLanguage);
  const navigate = () => window.dispatchEvent(new CustomEvent('paperflow:navigate-page', { detail: { page: citation.page } }));
  return <button className="citation" title={citation.excerpt} onClick={navigate}>
    <FileText size={13} strokeWidth={1.7} />{text(uiLanguage, `Page ${citation.page}`, `第 ${citation.page} 页`)}<span>·</span>{citation.label}
  </button>;
}
