import { useState } from 'react';
import { FileType, Download, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import heic2any from 'heic2any';

export function ConversionTool() {
    const [files, setFiles] = useState<File[]>([]);
    const [targetFormat, setTargetFormat] = useState<string>('image/webp');
    const [convertedFiles, setConvertedFiles] = useState<{ name: string; url: string }[]>([]);
    const [isConverting, setIsConverting] = useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
            setConvertedFiles([]);
        }
    };

    const convertFiles = async () => {
        setIsConverting(true);
        const newConvertedFiles: { name: string; url: string }[] = [];

        for (const file of files) {
            try {
                let blob: Blob | null = null;
                let sourceFile = file;

                // Handle HEIC/HEIF files
                if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
                    try {
                        const result = await heic2any({
                            blob: file,
                            toType: 'image/png', // Convert to PNG first
                        });
                        // heic2any can return a Blob or Blob[]
                        const resultBlob = Array.isArray(result) ? result[0] : result;
                        sourceFile = new File([resultBlob], file.name.replace(/\.heic$/i, '.png'), { type: 'image/png' });
                    } catch (e) {
                        console.error("HEIC conversion failed", e);
                        continue;
                    }
                }

                const bitmap = await createImageBitmap(sourceFile);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;

                ctx.drawImage(bitmap, 0, 0);

                blob = await new Promise<Blob | null>(resolve =>
                    canvas.toBlob(resolve, targetFormat, 0.9)
                );

                if (blob) {
                    const ext = targetFormat.split('/')[1];
                    const name = file.name.substring(0, file.name.lastIndexOf('.')) + '.' + ext;
                    newConvertedFiles.push({
                        name,
                        url: URL.createObjectURL(blob)
                    });
                }
            } catch (err) {
                console.error("Error converting file", file.name, err);
            }
        }
        setConvertedFiles(newConvertedFiles);
        setIsConverting(false);
    };

    const downloadAll = async () => {
        if (convertedFiles.length === 0) return;

        if (convertedFiles.length === 1) {
            saveAs(convertedFiles[0].url, convertedFiles[0].name);
        } else {
            const zip = new JSZip();
            for (const file of convertedFiles) {
                const blob = await fetch(file.url).then(r => r.blob());
                zip.file(file.name, blob);
            }
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "converted_images.zip");
        }
    };

    if (files.length === 0) {
        return (
            <div className="max-w-2xl mx-auto mt-10">
                <div className="text-center mb-10 space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
                        Universal Image Converter
                    </h2>
                    <p className="text-muted-foreground text-lg">
                        Convert images to WebP, PNG, JPEG and more.
                        Bulk processing supported. Now supports HEIC!
                    </p>
                </div>

                <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-muted-foreground/25 rounded-xl bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer relative">
                    <input
                        type="file"
                        multiple
                        accept="image/*,.heic,.heif"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <FileType className="w-10 h-10 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">Drop images here or click to upload</p>
                    <p className="text-sm text-muted-foreground mt-2">Supports JPG, PNG, WebP, GIF, HEIC</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="bg-card border rounded-xl p-6 mb-8">
                <div className="flex flex-wrap items-center gap-6 justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                            <FileType className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold">{files.length} Images Selected</h3>
                            <p className="text-sm text-muted-foreground">Ready to convert</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <select
                            value={targetFormat}
                            onChange={(e) => setTargetFormat(e.target.value)}
                            className="bg-secondary border-none rounded-lg px-4 py-2 text-sm font-medium"
                        >
                            <option value="image/webp">Convert to WebP</option>
                            <option value="image/png">Convert to PNG</option>
                            <option value="image/jpeg">Convert to JPEG</option>
                        </select>

                        <button
                            onClick={convertFiles}
                            disabled={isConverting}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isConverting ? 'Converting...' : 'Convert All'}
                        </button>
                    </div>
                </div>
            </div>

            {convertedFiles.length > 0 && (
                <div className="bg-card border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            Conversion Complete
                        </h3>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setFiles([]);
                                    setConvertedFiles([]);
                                }}
                                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                Start Over
                            </button>
                            <button
                                onClick={downloadAll}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                            >
                                <Download className="w-4 h-4" />
                                Download All
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {convertedFiles.map((file, i) => (
                            <div key={i} className="group relative aspect-square bg-secondary/20 rounded-lg overflow-hidden border">
                                <div className="absolute inset-0 checkerboard opacity-50" />
                                <img src={file.url} alt={file.name} className="absolute inset-0 w-full h-full object-contain p-2" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <a
                                        href={file.url}
                                        download={file.name}
                                        className="p-2 bg-white rounded-full text-black hover:scale-110 transition-transform"
                                    >
                                        <Download className="w-5 h-5" />
                                    </a>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 truncate">
                                    {file.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
