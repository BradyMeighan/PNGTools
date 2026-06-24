import { getMaxTextureSize } from './webgl-detector';
import { upscaleImage } from './upscaler';
import { resizeImage, calculateSafeDimensions } from './image-resizer';
import { enhancedCanvasProcessing } from './simple-enhancer';
import type { SelectedModel } from '../types';

interface AutoEnhanceOptions {
    maxOutputSize?: number;
    preferredScale?: number;
    quality?: 'fast' | 'balanced' | 'best';
}

/**
 * Automatically enhance an image by selecting the best model and scale
 * based on image characteristics and system capabilities
 */
export async function autoEnhanceImage(
    imageUrl: string, 
    options: AutoEnhanceOptions = {}
): Promise<string> {
    const {
        maxOutputSize = Math.min(getMaxTextureSize() * 0.6, 3072), // Very conservative limit
        preferredScale = 2,
        quality = 'balanced'
    } = options;

    console.log('Auto-enhancing image with options:', { maxOutputSize, preferredScale, quality });

    // Load image to analyze dimensions
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    const { naturalWidth: width, naturalHeight: height } = img;
    console.log('Original image dimensions:', { width, height });

    // Determine optimal model and scale
    const model = selectOptimalModel(width, height, quality, maxOutputSize, preferredScale);
    
    // Calculate safe dimensions and resize if needed
    const safeDimensions = calculateSafeDimensions(width, height, model.scale, maxOutputSize);
    let processableImageUrl = imageUrl;

    if (safeDimensions.width < width || safeDimensions.height < height) {
        console.log('Resizing image for safe processing:', safeDimensions);
        processableImageUrl = await resizeImage(imageUrl, {
            maxWidth: safeDimensions.width,
            maxHeight: safeDimensions.height,
            maintainAspectRatio: true
        });
    }
    
    console.log('Selected model for auto-enhancement:', model);

    try {
        return await upscaleImage(processableImageUrl, model);
    } catch (error) {
        console.warn('Auto-enhancement with preferred model failed, trying more aggressive downsizing');
        
        // Try with much smaller input size
        const veryConservativeSize = Math.min(maxOutputSize / 4, 512); // Very small
        const smallImageUrl = await resizeImage(imageUrl, {
            maxWidth: veryConservativeSize,
            maxHeight: veryConservativeSize,
            maintainAspectRatio: true
        });
        
        const fallbackModel: SelectedModel = {
            type: 'ESRGAN Slim',
            scale: 2
        };

        return await upscaleImage(smallImageUrl, fallbackModel);
    }
}

function selectOptimalModel(
    width: number, 
    height: number, 
    quality: 'fast' | 'balanced' | 'best',
    maxOutputSize: number,
    preferredScale: number
): SelectedModel {
    // Calculate maximum safe scale to stay within texture limits
    const maxScaleWidth = Math.floor(maxOutputSize / width);
    const maxScaleHeight = Math.floor(maxOutputSize / height);
    const maxSafeScale = Math.min(maxScaleWidth, maxScaleHeight, 4); // Cap at 4x
    
    // Choose actual scale (prefer user's preference if safe)
    const scale = Math.min(preferredScale, maxSafeScale, 4);
    
    console.log('Scale calculation:', {
        maxScaleWidth,
        maxScaleHeight,
        maxSafeScale,
        preferredScale,
        selectedScale: scale
    });

    // For very small images, just use 2x scale to avoid issues
    if (width < 100 || height < 100) {
        return {
            type: 'ESRGAN Slim',
            scale: Math.min(scale, 2)
        };
    }

    // Select model based on quality preference and image size
    let modelType: string;
    
    switch (quality) {
        case 'fast':
            modelType = 'ESRGAN Slim';
            break;
        case 'best':
            // Use thicker models for smaller images where we can afford the computation
            if (width * height < 500000) { // < ~700x700
                modelType = 'ESRGAN Thick';
            } else {
                modelType = 'ESRGAN Medium';
            }
            break;
        case 'balanced':
        default:
            modelType = width * height < 200000 ? 'ESRGAN Medium' : 'ESRGAN Slim'; // < ~450x450
            break;
    }

    return {
        type: modelType,
        scale: Math.max(1, scale) // Ensure scale is at least 1
    };
}

/**
 * Enhanced image processing that tries multiple enhancement techniques
 */
export async function smartEnhanceImage(imageUrl: string): Promise<string> {
    try {
        // First try general upscaling
        return await autoEnhanceImage(imageUrl, { 
            quality: 'balanced',
            preferredScale: 2
        });
    } catch (error) {
        console.warn('Standard enhancement failed, trying MAXIM models with downscaled images');
        
        // Try with smaller images for MAXIM models
        const smallImageUrl = await resizeImage(imageUrl, {
            maxWidth: 768,
            maxHeight: 768,
            maintainAspectRatio: true
        });
        
        const restorationModels = [
            'MAXIM Denoising',
            'MAXIM Deblurring', 
            'MAXIM Low Light',
            'MAXIM Retouching'
        ];
        
        for (const modelType of restorationModels) {
            try {
                console.log(`Trying restoration with: ${modelType} (on resized image)`);
                return await upscaleImage(smallImageUrl, { type: modelType, scale: 1 });
            } catch (modelError) {
                console.warn(`${modelType} failed:`, modelError);
                continue;
            }
        }
        
        // Last resort: use canvas-based enhancement (always works)
        console.warn('All AI models failed, using canvas-based enhancement');
        return await enhancedCanvasProcessing(imageUrl);
    }
}