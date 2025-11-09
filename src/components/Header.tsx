import logo from "@/assets/logo-alpha.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

export const Header = () => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Alpha Insights Logo" className="w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Alpha Insights</h1>
              <p className="text-sm text-muted-foreground">Pense. Crie. Conecte.</p>
            </div>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm">
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
};
