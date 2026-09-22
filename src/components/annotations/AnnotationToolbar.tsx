import {
  FileDown,
  Highlighter,
  MousePointer2,
  Pencil,
  Scan,
  StickyNote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import type { AnnotationTool } from '../../hooks/useAnnotationTool';
import { text } from '../../i18n';
import type { Language } from '../../types';

const TOOLS: Array<{
  tool: AnnotationTool;
  label: [string, string];
  icon: typeof MousePointer2;
}> = [
  { tool: 'select', label: ['Select', '选择'], icon: MousePointer2 },
  { tool: 'highlight', label: ['Highlight', '高亮'], icon: Highlighter },
  { tool: 'underline', label: ['Underline', '下划线'], icon: Underline },
  { tool: 'strikeout', label: ['Strikeout', '删除线'], icon: Strikethrough },
  { tool: 'text', label: ['Text note', '文字笔记'], icon: StickyNote },
  { tool: 'area', label: ['Area note', '区域笔记'], icon: Scan },
  { tool: 'ink', label: ['Draw', '绘图'], icon: Pencil },
];

const COLORS = ['#f4cf4f', '#67bd77', '#5e9ee8', '#df78a8', '#d85d5d'];

export function AnnotationToolbar({
  tool,
  language,
  color,
  annotationCount,
  onToolChange,
  onColorChange,
  onExport,
}: {
  tool: AnnotationTool;
  language: Language;
  color: string;
  annotationCount: number;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onExport: () => void;
}) {
  return <div className="annotation-toolbar" role="toolbar" aria-label={text(language, 'Annotation tools', '批注工具')}>
    {TOOLS.map((item) => {
      const Icon = item.icon;
      const label = text(language, ...item.label);
      return <button
        key={item.tool}
        title={label}
        aria-label={label}
        data-active={tool === item.tool}
        onClick={() => onToolChange(item.tool)}
      ><Icon /></button>;
    })}
    <i />
    <div className="annotation-colors" aria-label={text(language, 'Annotation color', '批注颜色')}>
      {COLORS.map((value) => <button
        key={value}
        className="annotation-color"
        title={text(language, `Use ${value}`, `使用 ${value}`)}
        aria-label={text(language, `Use annotation color ${value}`, `使用批注颜色 ${value}`)}
        data-active={color === value}
        style={{ '--annotation-color': value } as React.CSSProperties}
        onClick={() => onColorChange(value)}
      />)}
    </div>
    <i />
    <button
      title={text(language, 'Export annotated PDF', '导出带批注的 PDF')}
      aria-label={text(language, 'Export annotated PDF', '导出带批注的 PDF')}
      disabled={!annotationCount}
      onClick={onExport}
    ><FileDown /></button>
  </div>;
}
