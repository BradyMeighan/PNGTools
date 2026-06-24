import { useState } from 'react';
import { Header } from './components/Header';
import { ToolSwitcher } from './components/ToolSwitcher';
import type { ToolType } from './components/ToolSwitcher';
import { TransparencyTool } from './components/tools/TransparencyTool';
import { CompressionTool } from './components/tools/CompressionTool';
import { ConversionTool } from './components/tools/ConversionTool';
import { EnhancerTool } from './components/tools/EnhancerTool';
import { FaviconGeneratorTool } from './components/tools/FaviconGeneratorTool';

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('transparency');

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <ToolSwitcher activeTool={activeTool} onToolChange={setActiveTool} />

        <div className="animate-in fade-in duration-300 slide-in-from-bottom-4">
          {activeTool === 'transparency' && <TransparencyTool />}
          {activeTool === 'compression' && <CompressionTool />}
          {activeTool === 'conversion' && <ConversionTool />}
          {activeTool === 'enhancer' && <EnhancerTool />}
          {activeTool === 'favicon' && <FaviconGeneratorTool />}
        </div>
      </main>
    </div>
  );
}

export default App;
