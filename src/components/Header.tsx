const Header = () => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
                      <img
            src="/logo-cnome.png"
            alt="Logo Alpha Insights"
            className="h-10 w-10 object-contain"
          />

          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Alpha Insights</h1>
            <p className="text-sm text-muted-foreground">Pense. Crie. Conecte.</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
