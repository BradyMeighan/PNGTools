import { useState, useEffect, useRef } from 'react';
import { ImageUploader } from '../ImageUploader';
import { Controls } from '../Controls';
import { useImageProcessor } from '../../hooks/useImageProcessor';
import { Download, Copy, RefreshCw, MousePointer2 } from 'lucide-react';

export function TransparencyTool() {
    const [targetColor, setTargetColor] = useState("#ffffff");
    const [tolerance, setTolerance] = useState(15);
    const [smoothEdges, setSmoothEdges] = useState(true);
    const [matchOuterOnly, setMatchOuterOnly] = useState(false);
    const [replaceTransparency, setReplaceTransparency] = useState(false);
    const [replacementColor, setReplacementColor] = useState("#ffffff");

    const {
        originalImage,
        processedImageUrl,
        isProcessing,
        loadImage,
        processImage
    } = useImageProcessor();

    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (originalImage) {
            processImage({
                targetColor,
                tolerance,
                smoothEdges,
                smoothingRadius: 1,
                matchOuterOnly,
                replaceTransparency,
                replacementColor
            });
        }
    }, [originalImage, targetColor, tolerance, smoothEdges, matchOuterOnly, replaceTransparency, replacementColor, processImage]);

    const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;

        const img = imageRef.current;
        const rect = img.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate actual pixel position based on natural size vs displayed size
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;

        const hex = "#" + [pixel[0], pixel[1], pixel[2]].map(x => x.toString(16).padStart(2, '0')).join('');
        setTargetColor(hex);
    };

    const handleDownload = () => {
        if (!processedImageUrl) return;
        const link = document.createElement('a');
        link.download = replaceTransparency ? 'processed_image.png' : 'transparent.png';
        link.href = processedImageUrl;
        link.click();
    };

    const handleCopy = async () => {
        if (!processedImageUrl) return;
        try {
            const response = await fetch(processedImageUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            alert('Copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!originalImage) {
        return (
            <div className="max-w-2xl mx-auto mt-10">
                <div className="text-center mb-10 space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                        Remove Background Colors Instantly
                    </h2>
                    <p className="text-muted-foreground text-lg">
                        Upload an image, click a color, and watch it vanish.
                        Free, fast, and runs entirely in your browser.
                    </p>
                </div>
                <ImageUploader onImageSelect={loadImage} />
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-[300px_1fr] gap-8 h-[calc(100vh-14rem)]">
            <Controls
                targetColor={targetColor}
                setTargetColor={setTargetColor}
                tolerance={tolerance}
                setTolerance={setTolerance}
                smoothEdges={smoothEdges}
                setSmoothEdges={setSmoothEdges}
                matchOuterOnly={matchOuterOnly}
                setMatchOuterOnly={setMatchOuterOnly}
                replaceTransparency={replaceTransparency}
                setReplaceTransparency={setReplaceTransparency}
                replacementColor={replacementColor}
                setReplacementColor={setReplacementColor}
            />

            <div className="flex flex-col gap-4 h-full overflow-hidden">
                <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
                    {/* Input View */}
                    <div className="flex flex-col gap-2 h-full">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="font-medium flex items-center gap-2">
                                <MousePointer2 className="w-4 h-4" />
                                Original (Click to pick color)
                            </h3>
                        </div>
                        <div className="relative flex-1 bg-secondary/20 rounded-xl border overflow-hidden group">
                            <div className="absolute inset-0 checkerboard opacity-50" />
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                <img
                                    ref={imageRef}
                                    src={originalImage.src}
                                    alt="Original"
                                    className="max-w-full max-h-full object-contain cursor-crosshair shadow-lg"
                                    onClick={handleImageClick}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Output View */}
                    <div className="flex flex-col gap-2 h-full">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="font-medium">
                                {replaceTransparency ? "Processed Result" : "Transparent Result"}
                            </h3>
                            {isProcessing && <span className="text-xs text-primary animate-pulse">Processing...</span>}
                        </div>
                        <div className="relative flex-1 bg-secondary/20 rounded-xl border overflow-hidden">
                            <div className="absolute inset-0 checkerboard opacity-50" />
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                {processedImageUrl && (
                                    <img
                                        src={processedImageUrl}
                                        alt="Processed"
                                        className="max-w-full max-h-full object-contain shadow-lg transition-opacity duration-200"
                                        style={{ opacity: isProcessing ? 0.5 : 1 }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions Bar */}
                <div className="bg-card border rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Start Over
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                            Copy Image
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                        >
                            <Download className="w-4 h-4" />
                            Download PNG
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
