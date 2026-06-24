import { useState, useCallback } from 'react';
import { Wand2 } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { ImagePreview } from '../ImagePreview';
import { upscaleImage } from '../../lib/upscaler/utils/upscaler';
import { MODEL_CATEGORIES } from '../../lib/upscaler/constants';
import type { SelectedModel } from '../../lib/upscaler/types';

interface ImageState {
    original: string | null;
    upscaled: string | null;
    processing: boolean;
    error: string | null;
}

export function EnhancerTool() {
    const [selectedModel, setSelectedModel] = useState<SelectedModel>({
        type: MODEL_CATEGORIES[0].models[0].name,
        scale: MODEL_CATEGORIES[0].models[0].scales[0]
    });
    const [imageState, setImageState] = useState<ImageState>({
        original: null,
        upscaled: null,
        processing: false,
        error: null,
    });
    const [processableImage, setProcessableImage] = useState<string | null>(null);

    const handleImageSelect = useCallback(async (file: File) => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target?.result as string;
            setImageState((prev) => ({
                ...prev,
                original: imageUrl,
                upscaled: null,
                error: null,
            }));
            setProcessableImage(imageUrl);
        };
        reader.onerror = () => {
            setImageState((prev) => ({
                ...prev,
                error: 'Failed to load image. Please try again.',
            }));
        };
        reader.readAsDataURL(file);
    }, []);

    const handleResize = useCallback((resizedImageUrl: string) => {
        setProcessableImage(resizedImageUrl);
    }, []);

    const handleUpscale = useCallback(async () => {
        if (!processableImage) return;

        setImageState((prev) => ({ ...prev, processing: true, error: null }));

        try {
            const upscaledUrl = await upscaleImage(processableImage, selectedModel);

            setImageState((prev) => ({
                ...prev,
                upscaled: upscaledUrl,
                processing: false,
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
            console.error('Upscale error:', errorMessage);
            setImageState((prev) => ({
                ...prev,
                processing: false,
                error: errorMessage,
            }));
        }
    }, [processableImage, selectedModel]);

    if (!imageState.original) {
        return (
            <div className="max-w-2xl mx-auto mt-10">
                <div className="text-center mb-10 space-y-4">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Wand2 className="w-10 h-10 text-primary" />
                        <h2 className="text-4xl font-bold tracking-tight">AI Image Enhancer</h2>
                    </div>
                    <p className="text-muted-foreground text-lg">
                        Upscale and enhance your images with AI-powered models
                    </p>
                </div>
                <ImageUploader onImageSelect={handleImageSelect} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 py-8 px-4">
            <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <Wand2 className="w-10 h-10 text-primary" />
                    <h2 className="text-4xl font-bold tracking-tight">AI Image Enhancer</h2>
                </div>
                <p className="text-muted-foreground text-lg">
                    Upscale and enhance your images with AI-powered models
                </p>
            </div>

            <ImagePreview
                original={imageState.original}
                upscaled={imageState.upscaled}
                processing={imageState.processing}
                onResize={handleResize}
            />

            <div className="max-w-3xl mx-auto space-y-6">
                {/* Model Selection */}
                <div className="bg-card border rounded-lg p-6 space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-primary" />
                        AI Model Selection
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Model Category</label>
                            <select
                                className="w-full bg-secondary border-none rounded-lg px-4 py-2 text-sm"
                                onChange={(e) => {
                                    const category = MODEL_CATEGORIES.find(c => c.name === e.target.value);
                                    if (category) {
                                        setSelectedModel({
                                            type: category.models[0].name,
                                            scale: category.models[0].scales[0]
                                        });
                                    }
                                }}
                            >
                                {MODEL_CATEGORIES.map(cat => (
                                    <option key={cat.name} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Specific Model</label>
                            <select
                                className="w-full bg-secondary border-none rounded-lg px-4 py-2 text-sm"
                                value={selectedModel.type}
                                onChange={(e) => {
                                    const model = MODEL_CATEGORIES.flatMap(c => c.models).find(m => m.name === e.target.value);
                                    if (model) {
                                        setSelectedModel({
                                            type: model.name,
                                            scale: model.scales[0]
                                        });
                                    }
                                }}
                            >
                                {MODEL_CATEGORIES.flatMap(c => c.models).map(model => (
                                    <option key={model.name} value={model.name}>{model.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Scale Factor</label>
                            <div className="flex gap-2">
                                {MODEL_CATEGORIES.flatMap(c => c.models)
                                    .find(m => m.name === selectedModel.type)?.scales.map(scale => (
                                        <button
                                            key={scale}
                                            onClick={() => setSelectedModel(prev => ({ ...prev, scale }))}
                                            className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${selectedModel.scale === scale
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'hover:bg-secondary'
                                                }`}
                                        >
                                            {scale}x
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center gap-4">
                    <button
                        onClick={handleUpscale}
                        disabled={imageState.processing}
                        className={`px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2 transition-colors ${imageState.processing
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-primary/90'
                            }`}
                    >
                        {imageState.processing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-5 h-5" />
                                Enhance Image
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            setImageState({
                                original: null,
                                upscaled: null,
                                processing: false,
                                error: null,
                            });
                            setProcessableImage(null);
                        }}
                        disabled={imageState.processing}
                        className="px-8 py-3 rounded-lg border bg-background text-foreground font-medium transition-colors hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Start Over
                    </button>
                </div>

                {imageState.error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-center text-destructive font-medium">{imageState.error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
