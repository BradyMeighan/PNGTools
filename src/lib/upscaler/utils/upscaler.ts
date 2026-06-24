import Upscaler from 'upscaler';
import { getModel } from './model-loader';
import { isMaximModel } from './model-utils';
import { preprocessMaximImage } from './maxim-preprocessor';
import { loadImage } from './image-loader';
import type { SelectedModel } from '../types';

let upscalerInstance: InstanceType<typeof Upscaler> | null = null;
let currentModelKey: string = '';

async function getUpscaler(modelSelection: SelectedModel): Promise<InstanceType<typeof Upscaler>> {
    const modelKey = `${modelSelection.type}-${modelSelection.scale}`;

    if (upscalerInstance && modelKey === currentModelKey) {
        return upscalerInstance;
    }

    const model = await getModel(modelSelection.type, modelSelection.scale);
    console.log('Creating Upscaler with model:', model);
    
    upscalerInstance = new Upscaler({
        model,
        // Note: patchSize/padding options may not be available in this library version
    });
    currentModelKey = modelKey;

    return upscalerInstance;
}

export async function upscaleImage(
    imageUrl: string,
    modelSelection: SelectedModel
): Promise<string> {
    try {
        if (!imageUrl) {
            throw new Error('No image provided');
        }

        console.log('Starting upscale with model:', modelSelection);
        
        const upscaler = await getUpscaler(modelSelection);

        // For MAXIM models, preprocess the image
        const img = isMaximModel(modelSelection.type)
            ? await preprocessMaximImage(imageUrl)
            : await loadImage(imageUrl);

        console.log('Image loaded, dimensions:', {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            modelType: modelSelection.type,
            scale: modelSelection.scale
        });

        // Add size validation to prevent huge textures
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const scale = modelSelection.scale;
        const expectedWidth = width * scale;
        const expectedHeight = height * scale;

        console.log('Expected output dimensions:', {
            expectedWidth,
            expectedHeight,
            withinLimits: expectedWidth <= 16384 && expectedHeight <= 16384
        });

        if (expectedWidth > 16384 || expectedHeight > 16384) {
            throw new Error(`Output image would be too large: ${expectedWidth}x${expectedHeight}. Max supported: 16384x16384`);
        }

        const upscaledImage = await upscaler.upscale(img);
        if (!upscaledImage) {
            throw new Error('Upscaling failed to produce an image');
        }

        return upscaledImage;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Upscale error:', errorMessage);
        throw new Error(`Failed to upscale image: ${errorMessage}`);
    }
}
