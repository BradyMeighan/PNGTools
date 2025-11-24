/**
 * Simple canvas-based image enhancement as fallback
 * when AI models fail due to library issues
 */

export async function simpleCanvasUpscale(
    imageUrl: string,
    scale: number = 2
): Promise<string> {
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    const { naturalWidth, naturalHeight } = img;
    canvas.width = naturalWidth * scale;
    canvas.height = naturalHeight * scale;

    // Use high-quality scaling algorithms
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Apply some basic enhancement
    ctx.filter = 'contrast(1.1) brightness(1.05) saturate(1.1)';
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    console.log('Simple canvas upscale completed:', {
        original: { width: naturalWidth, height: naturalHeight },
        output: { width: canvas.width, height: canvas.height },
        scale
    });

    return canvas.toDataURL('image/png', 0.95);
}

/**
 * Enhanced canvas processing with multiple filters
 */
export async function enhancedCanvasProcessing(imageUrl: string): Promise<string> {
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    const { naturalWidth, naturalHeight } = img;
    
    // Don't scale up too much to avoid quality loss
    const maxScale = Math.min(2, 2048 / Math.max(naturalWidth, naturalHeight));
    const scale = Math.max(1, maxScale);
    
    canvas.width = naturalWidth * scale;
    canvas.height = naturalHeight * scale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Apply enhancement filter
    ctx.filter = 'contrast(1.15) brightness(1.03) saturate(1.08) sharpen(0.1)';
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Add some sharpening by drawing a slightly offset copy
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.3;
    ctx.filter = 'contrast(1.3)';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    console.log('Enhanced canvas processing completed:', {
        original: { width: naturalWidth, height: naturalHeight },
        output: { width: canvas.width, height: canvas.height },
        effectiveScale: scale
    });

    return canvas.toDataURL('image/png', 0.95);
}