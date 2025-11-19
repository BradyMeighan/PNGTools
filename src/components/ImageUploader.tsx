import { Upload, Image as ImageIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '../lib/utils';

interface ImageUploaderProps {
    onImageSelect: (file: File) => void;
}

export function ImageUploader({ onImageSelect }: ImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            onImageSelect(file);
        }
    }, [onImageSelect]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
    }, [onImageSelect]);

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                "relative group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out h-64 flex flex-col items-center justify-center gap-4",
                isDragging
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            )}
        >
            <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileInput}
            />

            <div className={cn(
                "p-4 rounded-full transition-colors duration-300",
                isDragging ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
            )}>
                {isDragging ? <ImageIcon className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
            </div>

            <div className="text-center space-y-1">
                <p className="text-lg font-medium text-foreground">
                    {isDragging ? "Drop image here" : "Click or drag image to upload"}
                </p>
                <p className="text-sm text-muted-foreground">
                    Supports PNG, JPG, WEBP
                </p>
            </div>
        </div>
    );
}
