import { loadImage } from './image-loader';
import { MAXIM_PATCH_SIZE, getMaximWorkingDimensions } from './maxim-config';

function ensureMultipleOf64(size: number): number {
    // Ensure size is at least MAXIM_PATCH_SIZE and a multiple of it
    const result = Math.max(MAXIM_PATCH_SIZE, Math.floor(size / MAXIM_PATCH_SIZE) * MAXIM_PATCH_SIZE);
    console.log(`ensureMultipleOf64: input=${size}, result=${result}`);
    return result;
}

export async function preprocessMaximImage(imageUrl: string): Promise<HTMLImageElement> {
    const img = await loadImage(imageUrl);
    
    // Use extremely conservative limits for MAXIM models
    const maxWorkingSize = Math.min(getMaximWorkingDimensions(), 256); // Cap at 256 - very small!

    // Calculate scale to fit within maxWorkingSize while maintaining aspect ratio
    const scale = Math.min(
        maxWorkingSize / img.naturalWidth,
        maxWorkingSize / img.naturalHeight,
        1 // Don't upscale if image is already smaller
    );

    // Calculate new dimensions that are multiples of 64
    const targetWidth = ensureMultipleOf64(Math.floor(img.naturalWidth * scale));
    const targetHeight = ensureMultipleOf64(Math.floor(img.naturalHeight * scale));

    console.log('Processing MAXIM image:', {
        original: { width: img.naturalWidth, height: img.naturalHeight },
        target: { width: targetWidth, height: targetHeight },
        maxWorkingSize,
        scale
    });

    // Create canvas for resizing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Use high-quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Convert to new image
    const processedImg = new Image();
    return new Promise((resolve, reject) => {
        processedImg.onload = () => resolve(processedImg);
        processedImg.onerror = reject;
        processedImg.src = canvas.toDataURL('image/png');
    });
}
