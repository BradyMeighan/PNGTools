import { Layers } from 'lucide-react';

export function Header() {
    return (
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="container mx-auto px-4 h-16 flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <Layers className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                    TransparentPNG
                </h1>
            </div>
        </header>
    );
}
