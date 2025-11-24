/**
 * Debug version to test upscaler library issues
 */

import { simpleCanvasUpscale } from './simple-enhancer';

export async function debugUpscale(imageUrl: string): Promise<string> {
    console.log('=== DEBUG UPSCALE START ===');
    
    // For now, just use canvas upscaling until we fix the library issue
    console.log('Using canvas fallback due to library texture size bug');
    return await simpleCanvasUpscale(imageUrl, 2);
    
    /* 
    // Disabled AI upscaling until texture size bug is fixed
    try {
        // Test with default model only
        const model = await import('@upscalerjs/esrgan-slim');
        console.log('Loaded model:', model);
        
        const Upscaler = (await import('upscaler')).default;
        
        const upscaler = new Upscaler({
            model: model.x2,
            patchSize: 32,  // Very small patch size
            padding: 1      // Minimal padding
        });
        
        console.log('Upscaler created successfully');
        
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });
        
        console.log('Image loaded:', { width: img.naturalWidth, height: img.naturalHeight });
        
        // Process with the smallest possible input
        if (img.naturalWidth > 200 || img.naturalHeight > 200) {
            throw new Error('Image too large for debug test');
        }
        
        const result = await upscaler.upscale(img);
        console.log('=== DEBUG UPSCALE SUCCESS ===');
        return result;
        
    } catch (error) {
        console.error('Debug upscale failed:', error);
        console.log('Falling back to canvas processing');
        return await simpleCanvasUpscale(imageUrl, 2);
    }
    */
}