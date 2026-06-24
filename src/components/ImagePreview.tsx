import { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { ImageResizer } from './ImageResizer';
import { loadImage } from '../lib/upscaler/utils/image-loader';
import { resizeImageToExactDimensions } from '../lib/upscaler/utils/image-resizer';

interface ImagePreviewProps {
    original: string;
    upscaled: string | null;
    processing: boolean;
    onResize: (resizedImage: string) => void;
}

export function ImagePreview({ original, upscaled, processing, onResize }: ImagePreviewProps) {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [displayedImage, setDisplayedImage] = useState<string>(original);

    useEffect(() => {
        loadImage(original).then(img => {
            setOriginalImage(img);
            setDisplayedImage(original);
            onResize(original); // Pass initial image to parent
        });
    }, [original]);

    const handleResize = useCallback(async (width: number, height: number) => {
        if (!originalImage) return;
        const resized = await resizeImageToExactDimensions(originalImage, width, height);
        setDisplayedImage(resized);
        onResize(resized); // Pass resized image to parent
    }, [originalImage, onResize]);

    return (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Original/Resized Preview */}
            <div className="space-y-4">
                <h3 className="font-medium text-sm">Original</h3>
                <div className="relative bg-secondary/20 rounded-lg border flex items-center justify-center p-4 min-h-[320px]">
                    <img
                        src={displayedImage}
                        alt="Original"
                        className="max-w-full max-h-[600px] w-auto h-auto"
                        style={{ objectFit: 'contain' }}
                    />
                </div>
                {originalImage && (
                    <ImageResizer
                        originalWidth={originalImage.naturalWidth}
                        originalHeight={originalImage.naturalHeight}
                        onResize={handleResize}
                    />
                )}
            </div>

            {/* Enhanced Preview */}
            <div className="space-y-4">
                <h3 className="font-medium text-sm">Enhanced</h3>
                <div className="relative bg-secondary/20 rounded-lg border flex items-center justify-center p-4 min-h-[320px]">
                    {processing ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : upscaled ? (
                        <>
                            <img
                                src={upscaled}
                                alt="Enhanced"
                                className="max-w-full max-h-[600px] w-auto h-auto"
                                style={{ objectFit: 'contain' }}
                            />
                            <a
                                href={upscaled}
                                download="enhanced.png"
                                className="absolute bottom-4 right-4 bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:bg-primary/90 transition-colors"
                            >
                                <Download className="w-5 h-5" />
                            </a>
                        </>
                    ) : (
                        <div className="text-center text-muted-foreground">
                            Enhanced image will appear here
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
