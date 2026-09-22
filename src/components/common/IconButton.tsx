import type { LucideIcon } from 'lucide-react';

interface Props { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean }
export function IconButton({ icon: Icon, label, onClick, active }: Props) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick} data-active={active}><Icon size={17} strokeWidth={1.65} /></button>;
}
