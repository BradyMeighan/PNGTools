import { lazy, Suspense, useState } from 'react';
import { Header } from './components/Header';
import { ToolSwitcher } from './components/ToolSwitcher';
import type { ToolType } from './components/ToolSwitcher';

// Each tool (and its heavier dependencies) loads only when first opened, keeping
// the initial page fast.
const TransparencyTool = lazy(() =>
  import('./components/tools/TransparencyTool').then((m) => ({ default: m.TransparencyTool })),
);
const CropTool = lazy(() =>
  import('./components/tools/CropTool').then((m) => ({ default: m.CropTool })),
);
const CompressionTool = lazy(() =>
  import('./components/tools/CompressionTool').then((m) => ({ default: m.CompressionTool })),
);
const ConversionTool = lazy(() =>
  import('./components/tools/ConversionTool').then((m) => ({ default: m.ConversionTool })),
);
const EnhancerTool = lazy(() =>
  import('./components/tools/EnhancerTool').then((m) => ({ default: m.EnhancerTool })),
);
const FaviconGeneratorTool = lazy(() =>
  import('./components/tools/FaviconGeneratorTool').then((m) => ({ default: m.FaviconGeneratorTool })),
);
const VideoTrimmerTool = lazy(() =>
  import('./components/tools/VideoTrimmerTool').then((m) => ({ default: m.VideoTrimmerTool })),
);
const VideoEnhancerTool = lazy(() =>
  import('./components/tools/VideoEnhancerTool').then((m) => ({ default: m.VideoEnhancerTool })),
);

function ToolFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      <p className="text-sm text-muted-foreground">Opening local tool…</p>
    </div>
  );
}

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('transparency');

  return (
    <div className="app-shell min-h-screen bg-background font-sans text-foreground flex flex-col">
      <Header />

      <main className="relative z-[1] mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <ToolSwitcher activeTool={activeTool} onToolChange={setActiveTool} />

        <div
          id={`tool-panel-${activeTool}`}
          role="region"
          aria-label={`${activeTool.replaceAll('-', ' ')} tool`}
          className="animate-in fade-in duration-300 slide-in-from-bottom-4"
        >
          <Suspense fallback={<ToolFallback />}>
            {activeTool === 'transparency' && <TransparencyTool />}
            {activeTool === 'crop' && <CropTool />}
            {activeTool === 'compression' && <CompressionTool />}
            {activeTool === 'conversion' && <ConversionTool />}
            {activeTool === 'enhancer' && <EnhancerTool />}
            {activeTool === 'favicon' && <FaviconGeneratorTool />}
            {activeTool === 'video-trim' && <VideoTrimmerTool />}
            {activeTool === 'video-enhance' && <VideoEnhancerTool />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
