import { useState, useEffect } from 'react';
import { ImageUploader } from '../ImageUploader';
import imageCompression from 'browser-image-compression';
import { Download, RefreshCw } from 'lucide-react';

export function CompressionTool() {
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [compressedFile, setCompressedFile] = useState<File | null>(null);
    const [originalPreview, setOriginalPreview] = useState<string>('');
    const [compressedPreview, setCompressedPreview] = useState<string>('');
    const [quality, setQuality] = useState(0.8);
    const [isCompressing, setIsCompressing] = useState(false);

    const handleImageSelect = async (file: File) => {
        setOriginalFile(file);
        setOriginalPreview(URL.createObjectURL(file));
        compressImage(file, quality);
    };

    const compressImage = async (file: File, q: number) => {
        setIsCompressing(true);
        try {
            const options = {
                maxSizeMB: 10, // Large limit, rely on quality
                maxWidthOrHeight: 4096,
                useWebWorker: true,
                initialQuality: q,
            };
            const compressed = await imageCompression(file, options);
            setCompressedFile(compressed);
            setCompressedPreview(URL.createObjectURL(compressed));
        } catch (error) {
            console.error('Compression failed:', error);
        } finally {
            setIsCompressing(false);
        }
    };

    useEffect(() => {
        if (originalFile) {
            const timer = setTimeout(() => {
                compressImage(originalFile, quality);
            }, 300); // Debounce slider
            return () => clearTimeout(timer);
        }
    }, [quality]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getCompressionRate = () => {
        if (!originalFile || !compressedFile) return 0;
        return Math.round(((originalFile.size - compressedFile.size) / originalFile.size) * 100);
    };

    const handleDownload = () => {
        if (!compressedFile) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(compressedFile);
        link.download = `compressed_${originalFile?.name}`;
        link.click();
    };

    if (!originalFile) {
        return (
            <div className="max-w-2xl mx-auto mt-10">
                <div className="text-center mb-10 space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                        Smart Image Compression
                    </h2>
                    <p className="text-muted-foreground text-lg">
                        Reduce file size without losing quality.
                        Compare results instantly and download optimized images.
                    </p>
                </div>
                <ImageUploader onImageSelect={handleImageSelect} />
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-[300px_1fr] gap-8 h-[calc(100vh-14rem)]">
            {/* Controls */}
            <div className="bg-card border rounded-xl p-6 flex flex-col gap-6 h-fit">
                <div>
                    <h3 className="font-semibold mb-4">Compression Settings</h3>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <label>Quality</label>
                                <span>{Math.round(quality * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.01"
                                value={quality}
                                onChange={(e) => setQuality(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-secondary/20 rounded-lg space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Original Size</span>
                        <span className="font-medium">{formatSize(originalFile.size)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Compressed Size</span>
                        <span className="font-medium text-primary">{compressedFile ? formatSize(compressedFile.size) : '...'}</span>
                    </div>
                    <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                        <span className="text-sm font-medium">Savings</span>
                        <span className="text-green-500 font-bold">-{getCompressionRate()}%</span>
                    </div>
                </div>

                <button
                    onClick={handleDownload}
                    disabled={!compressedFile}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    <Download className="w-4 h-4" />
                    Download Compressed
                </button>

                <button
                    onClick={() => setOriginalFile(null)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Start Over
                </button>
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-4 h-full overflow-hidden">
                <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-2 h-full">
                        <h3 className="font-medium text-center">Original</h3>
                        <div className="relative flex-1 bg-secondary/20 rounded-xl border overflow-hidden">
                            <div className="absolute inset-0 checkerboard opacity-50" />
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                <img src={originalPreview} alt="Original" className="max-w-full max-h-full object-contain" />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 h-full">
                        <h3 className="font-medium text-center">Compressed Preview</h3>
                        <div className="relative flex-1 bg-secondary/20 rounded-xl border overflow-hidden">
                            <div className="absolute inset-0 checkerboard opacity-50" />
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                                {isCompressing ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span className="text-sm text-muted-foreground">Compressing...</span>
                                    </div>
                                ) : (
                                    <img src={compressedPreview} alt="Compressed" className="max-w-full max-h-full object-contain" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
