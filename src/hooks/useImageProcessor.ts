import { useState, useCallback } from 'react';

interface RGB {
    r: number;
    g: number;
    b: number;
}

interface ProcessorOptions {
    targetColor: string; // Hex
    tolerance: number; // 0-100
    smoothEdges: boolean;
    smoothingRadius: number;
    matchOuterOnly: boolean;
    replaceTransparency: boolean;
    replacementColor: string;
}

export function useImageProcessor() {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const hexToRgb = (hex: string): RGB => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    };

    const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number => {
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    };

    const floodFill = (
        data: Uint8ClampedArray,
        width: number,
        height: number,
        targetRgb: RGB,
        tolerance: number
    ): boolean[] => {
        const visited = new Array(width * height).fill(false);
        const toProcess: number[] = [];

        // Start from all edges
        // Top and bottom edges
        for (let x = 0; x < width; x++) {
            toProcess.push(x); // Top edge
            toProcess.push((height - 1) * width + x); // Bottom edge
        }
        // Left and right edges
        for (let y = 1; y < height - 1; y++) {
            toProcess.push(y * width); // Left edge
            toProcess.push(y * width + (width - 1)); // Right edge
        }

        while (toProcess.length > 0) {
            const idx = toProcess.pop()!;

            if (visited[idx]) continue;

            const pixelIdx = idx * 4;
            const r = data[pixelIdx];
            const g = data[pixelIdx + 1];
            const b = data[pixelIdx + 2];

            const dist = colorDistance(r, g, b, targetRgb.r, targetRgb.g, targetRgb.b);

            if (dist > tolerance) {
                visited[idx] = false;
                continue;
            }

            visited[idx] = true;

            // Add neighbors
            const x = idx % width;
            const y = Math.floor(idx / width);

            // Right
            if (x < width - 1 && !visited[idx + 1]) {
                toProcess.push(idx + 1);
            }
            // Left
            if (x > 0 && !visited[idx - 1]) {
                toProcess.push(idx - 1);
            }
            // Down
            if (y < height - 1 && !visited[idx + width]) {
                toProcess.push(idx + width);
            }
            // Up
            if (y > 0 && !visited[idx - width]) {
                toProcess.push(idx - width);
            }
        }

        return visited;
    };

    const processImage = useCallback(async (options: ProcessorOptions) => {
        if (!originalImage) return;

        setIsProcessing(true);

        // Use a timeout to allow UI to update before heavy processing
        setTimeout(() => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = originalImage.width;
            canvas.height = originalImage.height;
            ctx.drawImage(originalImage, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const targetRgb = hexToRgb(options.targetColor);
            const replacementRgb = options.replaceTransparency ? hexToRgb(options.replacementColor) : null;
            const tolerance = (options.tolerance / 100) * 441.67; // Max distance is sqrt(255^2 * 3) approx 441.67

            if (options.matchOuterOnly) {
                // Use flood fill from edges
                const toMakeTransparent = floodFill(data, canvas.width, canvas.height, targetRgb, tolerance);

                for (let i = 0; i < toMakeTransparent.length; i++) {
                    if (toMakeTransparent[i]) {
                        const pixelIdx = i * 4;

                        if (options.smoothEdges) {
                            // Check if this is an edge pixel
                            const x = i % canvas.width;
                            const y = Math.floor(i / canvas.width);
                            let neighborCount = 0;
                            let nonTransparentNeighbors = 0;

                            // Check 8 neighbors
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    if (dx === 0 && dy === 0) continue;
                                    const nx = x + dx;
                                    const ny = y + dy;
                                    if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                                        neighborCount++;
                                        const nIdx = ny * canvas.width + nx;
                                        if (!toMakeTransparent[nIdx]) {
                                            nonTransparentNeighbors++;
                                        }
                                    }
                                }
                            }

                            if (nonTransparentNeighbors > 0) {
                                // Edge pixel - apply partial transparency
                                data[pixelIdx + 3] = Math.floor(255 * (nonTransparentNeighbors / neighborCount));
                            } else {
                                data[pixelIdx + 3] = 0;
                            }
                        } else {
                            data[pixelIdx + 3] = 0;
                        }
                    }
                }
            } else {
                // Global color replacement
                const toleranceSq = tolerance ** 2;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    const distSq = (r - targetRgb.r) ** 2 + (g - targetRgb.g) ** 2 + (b - targetRgb.b) ** 2;

                    if (distSq <= toleranceSq) {
                        data[i + 3] = 0; // Transparent
                    } else if (options.smoothEdges && distSq <= toleranceSq * 1.2) {
                        // Simple smoothing at the edge
                        const factor = (distSq - toleranceSq) / (toleranceSq * 0.2);
                        data[i + 3] = Math.floor(255 * factor);
                    }
                }
            }

            // Second pass: Replace transparency if requested
            if (options.replaceTransparency && replacementRgb) {
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];

                    if (alpha < 255) {
                        // Blend with background color
                        // Result = Foreground * Alpha + Background * (1 - Alpha)
                        const a = alpha / 255;
                        const invA = 1 - a;

                        data[i] = Math.round(data[i] * a + replacementRgb.r * invA);
                        data[i + 1] = Math.round(data[i + 1] * a + replacementRgb.g * invA);
                        data[i + 2] = Math.round(data[i + 2] * a + replacementRgb.b * invA);
                        data[i + 3] = 255; // Full opacity
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
            setProcessedImageUrl(canvas.toDataURL('image/png'));
            setIsProcessing(false);
        }, 10);
    }, [originalImage]);

    const loadImage = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setOriginalImage(img);
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    return {
        originalImage,
        processedImageUrl,
        isProcessing,
        loadImage,
        processImage
    };
}
