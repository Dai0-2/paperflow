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

const TOOLS: Array<{
  tool: AnnotationTool;
  label: string;
  icon: typeof MousePointer2;
}> = [
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'highlight', label: 'Highlight', icon: Highlighter },
  { tool: 'underline', label: 'Underline', icon: Underline },
  { tool: 'strikeout', label: 'Strikeout', icon: Strikethrough },
  { tool: 'text', label: 'Text note', icon: StickyNote },
  { tool: 'area', label: 'Area note', icon: Scan },
  { tool: 'ink', label: 'Draw', icon: Pencil },
];

const COLORS = ['#f4cf4f', '#67bd77', '#5e9ee8', '#df78a8', '#d85d5d'];

export function AnnotationToolbar({
  tool,
  color,
  annotationCount,
  onToolChange,
  onColorChange,
  onExport,
}: {
  tool: AnnotationTool;
  color: string;
  annotationCount: number;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onExport: () => void;
}) {
  return <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
    {TOOLS.map((item) => {
      const Icon = item.icon;
      return <button
        key={item.tool}
        title={item.label}
        aria-label={item.label}
        data-active={tool === item.tool}
        onClick={() => onToolChange(item.tool)}
      ><Icon /></button>;
    })}
    <i />
    <div className="annotation-colors" aria-label="Annotation color">
      {COLORS.map((value) => <button
        key={value}
        className="annotation-color"
        title={`Use ${value}`}
        aria-label={`Use annotation color ${value}`}
        data-active={color === value}
        style={{ '--annotation-color': value } as React.CSSProperties}
        onClick={() => onColorChange(value)}
      />)}
    </div>
    <i />
    <button
      title="Export annotated PDF"
      aria-label="Export annotated PDF"
      disabled={!annotationCount}
      onClick={onExport}
    ><FileDown /></button>
  </div>;
}
