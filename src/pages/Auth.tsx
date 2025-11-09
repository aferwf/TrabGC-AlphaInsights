import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import logo from "@/assets/logo-alpha.png";

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`
          }
        });
        if (error) throw error;
        toast({
          title: 'Conta criada com sucesso!',
          description: 'Você já pode fazer login.'
        });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (error: any) {
      toast({
        title: 'Erro de autenticação',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center gap-4">
          <img src={logo} alt="Alpha Insights Logo" className="w-16 h-16" />
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground">Alpha Insights</h1>
            <p className="text-sm text-muted-foreground">Pense. Crie. Conecte.</p>
          </div>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-center">
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </h2>
          </div>
          
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Carregando...' : isSignUp ? 'Criar Conta' : 'Entrar'}
          </Button>
          
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Cadastre-se'}
          </button>
        </form>
      </div>
    </div>
  );
}
