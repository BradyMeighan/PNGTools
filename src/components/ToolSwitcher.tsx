import { Eraser, Minimize2, FileType, Wand2, Image } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToolType = 'transparency' | 'compression' | 'conversion' | 'enhancer' | 'favicon';

interface ToolSwitcherProps {
    activeTool: ToolType;
    onToolChange: (tool: ToolType) => void;
}

export function ToolSwitcher({ activeTool, onToolChange }: ToolSwitcherProps) {
    const tools: { id: ToolType; label: string; icon: React.ElementType }[] = [
        { id: 'transparency', label: 'Transparency', icon: Eraser },
        { id: 'compression', label: 'Compression', icon: Minimize2 },
        { id: 'conversion', label: 'Converter', icon: FileType },
        { id: 'enhancer', label: 'Enhancer', icon: Wand2 },
        { id: 'favicon', label: 'Favicon', icon: Image },
    ];

    return (
        <div className="flex justify-center mb-8">
            <div className="inline-flex items-center p-1 bg-secondary/50 backdrop-blur-sm rounded-full border shadow-sm">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    const isActive = activeTool === tool.id;

                    return (
                        <button
                            key={tool.id}
                            onClick={() => onToolChange(tool.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-background text-foreground shadow-sm scale-105"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tool.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
