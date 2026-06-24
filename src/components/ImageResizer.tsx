import { useState, useEffect, useRef } from 'react';
import { Link2, Link2Off } from 'lucide-react';

interface ImageResizerProps {
    originalWidth: number;
    originalHeight: number;
    onResize: (width: number, height: number) => void;
}

export function ImageResizer({ originalWidth, originalHeight, onResize }: ImageResizerProps) {
    const [scale, setScale] = useState(100);
    const [width, setWidth] = useState(originalWidth);
    const [height, setHeight] = useState(originalHeight);
    const [aspectLocked, setAspectLocked] = useState(true);
    const isInitialMount = useRef(true);

    const aspectRatio = originalWidth / originalHeight;

    useEffect(() => {
        const newWidth = Math.round((originalWidth * scale) / 100);
        const newHeight = Math.round((originalHeight * scale) / 100);
        setWidth(newWidth);
        setHeight(newHeight);

        // Only call onResize if it's not the initial mount OR if dimensions changed
        if (!isInitialMount.current) {
            onResize(newWidth, newHeight);
        }
        isInitialMount.current = false;
    }, [scale, originalWidth, originalHeight]);

    const handleWidthChange = (newWidth: number) => {
        setWidth(newWidth);
        if (aspectLocked) {
            const newHeight = Math.round(newWidth / aspectRatio);
            setHeight(newHeight);
            setScale((newWidth / originalWidth) * 100);
            onResize(newWidth, newHeight);
        } else {
            onResize(newWidth, height);
        }
    };

    const handleHeightChange = (newHeight: number) => {
        setHeight(newHeight);
        if (aspectLocked) {
            const newWidth = Math.round(newHeight * aspectRatio);
            setWidth(newWidth);
            setScale((newHeight / originalHeight) * 100);
            onResize(newWidth, newHeight);
        } else {
            onResize(width, newHeight);
        }
    };

    return (
        <div className="space-y-3 bg-card border rounded-lg p-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Resize Image</label>
                    <span className="text-xs text-muted-foreground">{scale}%</span>
                </div>
                <input
                    type="range"
                    min="1"
                    max="100"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
            </div>

            <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                    <label className="block text-xs font-medium text-muted-foreground">Width</label>
                    <input
                        type="number"
                        value={width}
                        onChange={(e) => handleWidthChange(Number(e.target.value))}
                        min="1"
                        max={originalWidth}
                        className="w-full px-3 py-2 bg-secondary border-none rounded-lg text-sm"
                    />
                </div>

                <button
                    onClick={() => setAspectLocked(!aspectLocked)}
                    className={`mt-5 p-2 rounded-lg transition-colors ${
                        aspectLocked ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                    }`}
                    title={aspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                >
                    {aspectLocked ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
                </button>

                <div className="flex-1 space-y-1">
                    <label className="block text-xs font-medium text-muted-foreground">Height</label>
                    <input
                        type="number"
                        value={height}
                        onChange={(e) => handleHeightChange(Number(e.target.value))}
                        min="1"
                        max={originalHeight}
                        className="w-full px-3 py-2 bg-secondary border-none rounded-lg text-sm"
                    />
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Resizing images to be smaller may be needed for MAXIM models to prevent WebGL errors
            </p>
        </div>
    );
}
