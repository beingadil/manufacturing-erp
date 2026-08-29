import { AlertTriangle, Lock } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Input } from '../ui/input';

interface SafeDeleteDialogProps {
  isOpen: boolean;
  itemName: string;
  itemType: string;
  actionType?: 'Delete' | 'Deactivate';
  impactDetails?: string[];
  requiresAuth?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function SafeDeleteDialog({ 
  isOpen, 
  itemName, 
  itemType,
  actionType = 'Delete',
  impactDetails = [],
  requiresAuth = false,
  onConfirm, 
  onCancel 
}: SafeDeleteDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [authCode, setAuthCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleNext = () => {
    if (requiresAuth && step === 1) {
      setStep(2);
    } else {
      handleConfirm();
    }
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      handleCancel();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setStep(1);
    setAuthCode('');
    onCancel();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>{actionType === 'Delete' ? 'Delete' : 'Deactivate'} {itemType}?</AlertDialogTitle>
          </div>
          
          {step === 1 ? (
            <div className="space-y-4">
              <AlertDialogDescription className="text-foreground">
                You are about to permanently {actionType === 'Delete' ? 'delete' : 'deactivate'} <strong>{itemName}</strong>.
              </AlertDialogDescription>
              
              {impactDetails.length > 0 && (
                <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-sm">
                  <p className="font-semibold text-destructive mb-2">Impact Analysis:</p>
                  <ul className="list-disc pl-5 space-y-1 text-destructive/90">
                    {impactDetails.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <AlertDialogDescription>
                This action will be logged in the audit trail. You will have 5 minutes to undo this action from the activity history.
              </AlertDialogDescription>
            </div>
          ) : (
            <div className="space-y-4">
              <AlertDialogDescription className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> Security verification required for sensitive {actionType === 'Delete' ? 'deletion' : 'deactivation'}.
              </AlertDialogDescription>
              <div className="space-y-2">
                <label className="text-sm font-medium">Please type <strong>{actionType.toUpperCase()}</strong> to confirm:</label>
                <Input 
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder={`Type ${actionType.toUpperCase()}`}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => { e.preventDefault(); handleNext(); }}
            disabled={isDeleting || (step === 2 && authCode !== actionType.toUpperCase())}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Processing..." : step === 1 && requiresAuth ? "Continue" : `Confirm ${actionType}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}