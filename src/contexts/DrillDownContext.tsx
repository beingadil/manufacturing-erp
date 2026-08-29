import { ChevronRight, Home, X } from 'lucide-react';
import React, { createContext, useContext, useState } from 'react';

export interface DrillDownLevel {
  title: string;
  component: React.ReactNode;
}

interface DrillDownContextType {
  levels: DrillDownLevel[];
  pushLevel: (level: DrillDownLevel) => void;
  popLevel: () => void;
  goToLevel: (index: number) => void;
  clearLevels: () => void;
}

export const DrillDownContext = createContext<DrillDownContextType | undefined>(undefined);

export function DrillDownProvider({ children }: { children: React.ReactNode }) {
  const [levels, setLevels] = useState<DrillDownLevel[]>([]);

  const pushLevel = (level: DrillDownLevel) => setLevels(prev => [...prev, level]);
  const popLevel = () => setLevels(prev => prev.slice(0, -1));
  const clearLevels = () => setLevels([]);
  const goToLevel = (index: number) => setLevels(prev => prev.slice(0, index + 1));

  return (
    <DrillDownContext.Provider value={{ levels, pushLevel, popLevel, clearLevels, goToLevel }}>
      {children}
      {levels.length > 0 && (
        <div className="absolute inset-0 z-40 bg-background flex flex-col overflow-hidden">
          {/* Breadcrumbs Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card shrink-0">
            <div className="flex items-center flex-wrap gap-2 text-sm">
              <button 
                onClick={clearLevels}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Reports</span>
              </button>
              
              {levels.map((level, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => goToLevel(index)}
                    disabled={index === levels.length - 1}
                    className={`font-medium transition-colors ${
                      index === levels.length - 1 
                        ? 'text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {level.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <button 
              onClick={clearLevels}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title="Close drill-down"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Active Level Content */}
          <div className="flex-1 overflow-auto bg-muted/10 relative">
            <div className="absolute inset-0 p-6">
              {levels[levels.length - 1].component}
            </div>
          </div>
        </div>
      )}
    </DrillDownContext.Provider>
  );
}

export function useDrillDown() {
  const context = useContext(DrillDownContext);
  if (!context) {
    throw new Error('useDrillDown must be used within a DrillDownProvider');
  }
  return context;
}
