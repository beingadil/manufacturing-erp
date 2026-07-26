import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettingsStore } from '../store/useSettingsStore';

function Register() {
  const { dashboardName, logo } = useSettingsStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-8 animate-in fade-in zoom-in-95 duration-500 text-center">
        <div className="flex justify-center mb-4">
          {logo ? (
            <img src={logo} alt="Logo" className="h-12 object-contain" />
          ) : (
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">{dashboardName.substring(0, 3).toUpperCase()}</span>
            </div>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-4">Registration Disabled</h1>
        <p className="text-sm text-muted-foreground mb-8">
          This is an offline system. Registration is managed by the system administrator. Please contact your IT department for access.
        </p>

        <Link 
          to="/login"
          className="w-full flex items-center justify-center py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all active:scale-[0.98]"
        >
          Return to Sign In
        </Link>
      </div>
    </div>
  );
}
