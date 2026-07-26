import React from 'react';
import { Database } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

export function SyncStatusIndicator() {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/10 text-success cursor-help">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <Database className="h-4 w-4" />
            <span className="text-xs font-semibold">Local DB</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="text-xs">
          <p>Offline-First Mode</p>
          <p className="text-muted-foreground mt-1">All data is stored securely on your local device.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}