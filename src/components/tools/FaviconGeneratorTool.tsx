import { useState } from 'react';
import { ImageUploader } from '../ImageUploader';
import { Image, Download, CheckCircle2, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { InfoTip } from '../Tooltip';

export function FaviconGeneratorTool() {
    const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [siteName, setSiteName] = useState('My Website');

    const handleImageSelect = (file: File) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            setOriginalImage(img);
        };
    };

    const generateFavicons = async () => {
        if (!originalImage) return;
        setIsGenerating(true);

        try {
            const zip = new JSZip();

            // Helper to resize and add to zip
            const addToZip = async (width: number, height: number, name: string) => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.drawImage(originalImage, 0, 0, width, height);

                const blob = await new Promise<Blob | null>(resolve =>
                    canvas.toBlob(resolve, 'image/png')
                );
                if (blob) zip.file(name, blob);
            };

            // Generate all required files
            await addToZip(192, 192, 'android-chrome-192x192.png');
            await addToZip(512, 512, 'android-chrome-512x512.png');
            await addToZip(180, 180, 'apple-touch-icon.png');
            await addToZip(16, 16, 'favicon-16x16.png');
            await addToZip(32, 32, 'favicon-32x32.png');

            // favicon.ico
            await addToZip(32, 32, 'favicon.ico');

            // site.webmanifest
            const manifest = {
                "name": siteName || "My Website",
                "short_name": (siteName || "Website").slice(0, 12),
                "icons": [
                    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
                    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
                ],
                "theme_color": "#ffffff",
                "background_color": "#ffffff",
                "display": "standalone"
            };
            zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "favicons.zip");

        } catch (err) {
            console.error("Favicon generation failed", err);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!originalImage) {
        return (
            <div className="max-w-2xl mx-auto mt-10">
                <div className="text-center mb-10 space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                        Favicon Generator
                    </h2>
                    <p className="text-muted-foreground text-lg">
                        Create all necessary favicon formats for your website in one click.
                        Includes manifest and mobile icons.
                    </p>
                </div>
                <ImageUploader onImageSelect={handleImageSelect} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-card border rounded-xl p-6 flex flex-col gap-6">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Preview
                    </h3>
                    <div className="aspect-square bg-secondary/20 rounded-lg flex items-center justify-center p-8">
                        <img src={originalImage.src} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg" />
                    </div>
                </div>

                <div className="flex flex-col justify-center gap-6">
                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold">Ready to Generate</h3>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                Site name
                                <InfoTip text="Used inside site.webmanifest for the name shown when your site is installed to a home screen." />
                            </label>
                            <input
                                type="text"
                                value={siteName}
                                onChange={(e) => setSiteName(e.target.value)}
                                placeholder="My Website"
                                className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <p className="text-muted-foreground">
                            We will generate the following files:
                        </p>
                        <ul className="space-y-2 text-sm">
                            <li className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                android-chrome-192x192.png
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                android-chrome-512x512.png
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                apple-touch-icon.png
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                favicon-16x16.png & 32x32.png
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                site.webmanifest
                            </li>
                        </ul>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={generateFavicons}
                            disabled={isGenerating}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isGenerating ? (
                                'Generating...'
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    Generate & Download Zip
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => setOriginalImage(null)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Start Over
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
