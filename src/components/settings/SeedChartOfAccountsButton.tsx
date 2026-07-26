import React, { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { useERPStore } from '@/store/useERPStore';
import { useAuth } from '@/contexts/AuthContext';
import { seedDefaultChartOfAccounts, SeedActions } from '@/lib/chartOfAccountsSeed';

export function SeedChartOfAccountsButton() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Only users with Settings > Edit permission can seed the chart of accounts
  if (!hasPermission('Settings', 'Edit')) {
    return null;
  }

  const handleSeed = async () => {
    setIsSeeding(true);

    try {
      const state = useERPStore.getState();
      const result = seedDefaultChartOfAccounts(() => useERPStore.getState(), state as unknown as SeedActions);

      if (result.skipped) {
        toast.info('Chart of accounts already exists. Seeding skipped.', {
          description: 'No new accounts were created.',
        });
      } else {
        toast.success('Default chart of accounts seeded successfully', {
          description: `${result.created} accounts were created.`,
        });
      }
    } catch (error) {
      console.error('Failed to seed chart of accounts:', error);
      toast.error('Failed to seed chart of accounts. Please try again or contact support.');
    } finally {
      setIsSeeding(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="shrink-0 flex items-center gap-2"
          type="button"
        >
          <Database className="h-4 w-4" />
          Seed Default Chart of Accounts
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Seed Default Chart of Accounts?</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a default chart of accounts structure with asset, liability,
            equity, revenue, and expense accounts. Existing accounts will not be affected.
            Do you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSeeding} onClick={() => setOpen(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isSeeding}
            onClick={(e) => {
              e.preventDefault();
              handleSeed();
            }}
            className="gap-2"
          >
            {isSeeding && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}