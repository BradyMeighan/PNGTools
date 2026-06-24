/**
 * Image resizing utilities to prevent WebGL texture size issues
 */

export interface ResizeOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    maintainAspectRatio?: boolean;
}

/**
 * Resize an image to fit within specified dimensions
 */
export async function resizeImage(
    imageUrl: string, 
    options: ResizeOptions = {}
): Promise<string> {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        quality = 0.92,
        maintainAspectRatio = true
    } = options;

    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    const { naturalWidth: originalWidth, naturalHeight: originalHeight } = img;

    console.log('Original image dimensions:', { originalWidth, originalHeight });

    // Check if resizing is needed
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
        console.log('No resizing needed');
        return imageUrl;
    }

    // Calculate new dimensions
    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (maintainAspectRatio) {
        const aspectRatio = originalWidth / originalHeight;
        
        if (originalWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = maxWidth / aspectRatio;
        }
        
        if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = maxHeight * aspectRatio;
        }
    } else {
        newWidth = Math.min(originalWidth, maxWidth);
        newHeight = Math.min(originalHeight, maxHeight);
    }

    // Ensure minimum size (avoid tiny images)
    newWidth = Math.max(newWidth, 64);
    newHeight = Math.max(newHeight, 64);

    console.log('Resizing to:', { newWidth, newHeight });

    // Create canvas and resize
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        throw new Error('Failed to get canvas context for resizing');
    }

    canvas.width = Math.round(newWidth);
    canvas.height = Math.round(newHeight);

    // Use high quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png', quality);
}

/**
 * Calculate safe dimensions for upscaling based on target scale and WebGL limits
 */
export function calculateSafeDimensions(
    width: number, 
    height: number, 
    targetScale: number,
    maxTextureSize: number = 16384
): { width: number; height: number; scale: number } {
    // Calculate what the output dimensions would be
    const outputWidth = width * targetScale;
    const outputHeight = height * targetScale;

    // If output would be within limits, return as-is
    if (outputWidth <= maxTextureSize && outputHeight <= maxTextureSize) {
        return { width, height, scale: targetScale };
    }

    // Calculate max input size that would produce safe output
    const maxInputWidth = Math.floor(maxTextureSize / targetScale);
    const maxInputHeight = Math.floor(maxTextureSize / targetScale);

    // Calculate scale factor to fit within limits
    const scaleWidth = maxInputWidth / width;
    const scaleHeight = maxInputHeight / height;
    const safeScale = Math.min(scaleWidth, scaleHeight, 1); // Don't upscale input

    const safeWidth = Math.floor(width * safeScale);
    const safeHeight = Math.floor(height * safeScale);

    console.log('Safe dimensions calculation:', {
        original: { width, height },
        targetScale,
        maxTextureSize,
        safe: { width: safeWidth, height: safeHeight, scale: targetScale },
        outputWouldBe: { width: safeWidth * targetScale, height: safeHeight * targetScale }
    });

    return {
        width: safeWidth,
        height: safeHeight,
        scale: targetScale
    };
}

/**
 * Resize an image to exact dimensions (used for user-controlled resizing)
 */
export async function resizeImageToExactDimensions(
    image: HTMLImageElement,
    targetWidth: number,
    targetHeight: number
): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not get canvas context');
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Use high quality image scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL('image/png');
}