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

function ToolFallback() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('transparency');

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <ToolSwitcher activeTool={activeTool} onToolChange={setActiveTool} />

        <div className="animate-in fade-in duration-300 slide-in-from-bottom-4">
          <Suspense fallback={<ToolFallback />}>
            {activeTool === 'transparency' && <TransparencyTool />}
            {activeTool === 'crop' && <CropTool />}
            {activeTool === 'compression' && <CompressionTool />}
            {activeTool === 'conversion' && <ConversionTool />}
            {activeTool === 'enhancer' && <EnhancerTool />}
            {activeTool === 'favicon' && <FaviconGeneratorTool />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
