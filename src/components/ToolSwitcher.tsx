import { useEffect, useRef } from 'react';
import {
  Crop,
  Eraser,
  FileType,
  Gauge,
  Image,
  Minimize2,
  Scissors,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type ToolType =
  | 'transparency'
  | 'crop'
  | 'compression'
  | 'conversion'
  | 'enhancer'
  | 'favicon'
  | 'video-trim'
  | 'video-enhance';

interface ToolSwitcherProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

interface ToolDefinition {
  id: ToolType;
  label: string;
  icon: LucideIcon;
  group: 'Image' | 'Output' | 'Video';
  badge?: string;
}

const TOOLS: ToolDefinition[] = [
  { id: 'transparency', label: 'Transparency', icon: Eraser, group: 'Image' },
  { id: 'crop', label: 'Crop', icon: Crop, group: 'Image' },
  { id: 'enhancer', label: 'Image enhance', icon: Wand2, group: 'Image' },
  { id: 'compression', label: 'Compress', icon: Minimize2, group: 'Output' },
  { id: 'conversion', label: 'Convert', icon: FileType, group: 'Output' },
  { id: 'favicon', label: 'Favicon', icon: Image, group: 'Output' },
  { id: 'video-trim', label: 'Quick trim', icon: Scissors, group: 'Video' },
  { id: 'video-enhance', label: 'AI video', icon: Gauge, group: 'Video', badge: 'New' },
];

export function ToolSwitcher({ activeTool, onToolChange }: ToolSwitcherProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeTool]);

  return (
    <div className="relative -mx-4 mb-8 sm:-mx-2">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent sm:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
      <nav
        aria-label="Editing tools"
        className="tool-nav mx-4 flex items-center gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-card/80 p-1.5 shadow-[0_16px_45px_rgba(0,0,0,.16)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-2"
      >
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          const startsGroup = index > 0 && TOOLS[index - 1].group !== tool.group;

          return (
            <div key={tool.id} className={cn('flex shrink-0 items-center', startsGroup && 'ml-1 border-l border-border pl-2')}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onToolChange(tool.id)}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5',
                  active
                    ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/.18)]'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tool.label}</span>
                {tool.badge && (
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', active ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary')}>
                    {tool.badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
