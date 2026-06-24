import { HexColorPicker } from 'react-colorful';
import { Sliders, Droplet, PaintBucket } from 'lucide-react';

interface ControlsProps {
    targetColor: string;
    setTargetColor: (color: string) => void;
    tolerance: number;
    setTolerance: (val: number) => void;
    smoothEdges: boolean;
    setSmoothEdges: (val: boolean) => void;
    matchOuterOnly: boolean;
    setMatchOuterOnly: (val: boolean) => void;
    replaceTransparency: boolean;
    setReplaceTransparency: (val: boolean) => void;
    replacementColor: string;
    setReplacementColor: (val: string) => void;
}

export function Controls({
    targetColor,
    setTargetColor,
    tolerance,
    setTolerance,
    smoothEdges,
    setSmoothEdges,
    matchOuterOnly,
    setMatchOuterOnly,
    replaceTransparency,
    setReplaceTransparency,
    replacementColor,
    setReplacementColor
}: ControlsProps) {
    return (
        <div className="space-y-6 p-6 bg-card rounded-xl border shadow-sm h-fit overflow-y-auto max-h-[calc(100vh-12rem)]">
            <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                    <Droplet className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Target Color</h2>
                </div>
                <div className="flex flex-col gap-4">
                    <HexColorPicker color={targetColor} onChange={setTargetColor} className="!w-full !h-40" />
                    <div className="flex gap-2">
                        <div className="w-10 h-10 rounded-md border shadow-sm shrink-0" style={{ backgroundColor: targetColor }} />
                        <input
                            type="text"
                            value={targetColor}
                            onChange={(e) => setTargetColor(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-md bg-background border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                    <Sliders className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Adjustments</h2>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2">
                        <label className="text-sm font-medium">Color Tolerance</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={tolerance}
                                onChange={(e) => setTolerance(Number(e.target.value))}
                                className="w-16 px-2 py-1 text-sm rounded-md bg-background border font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                        </div>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={tolerance}
                        onChange={(e) => setTolerance(Number(e.target.value))}
                        className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                </div>

                <div className="space-y-3 pt-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors">
                        <input
                            type="checkbox"
                            checked={smoothEdges}
                            onChange={(e) => setSmoothEdges(e.target.checked)}
                            className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium">Smooth Edges</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors">
                        <input
                            type="checkbox"
                            checked={matchOuterOnly}
                            onChange={(e) => setMatchOuterOnly(e.target.checked)}
                            className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium">Match Outer Pixels Only</span>
                    </label>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                    <PaintBucket className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Background Fill</h2>
                </div>

                <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 rounded-lg border bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors">
                        <input
                            type="checkbox"
                            checked={replaceTransparency}
                            onChange={(e) => setReplaceTransparency(e.target.checked)}
                            className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium">Replace Transparency</span>
                    </label>

                    {replaceTransparency && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <HexColorPicker color={replacementColor} onChange={setReplacementColor} className="!w-full !h-32" />
                            <div className="flex gap-2">
                                <div className="w-10 h-10 rounded-md border shadow-sm shrink-0" style={{ backgroundColor: replacementColor }} />
                                <input
                                    type="text"
                                    value={replacementColor}
                                    onChange={(e) => setReplacementColor(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-md bg-background border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
