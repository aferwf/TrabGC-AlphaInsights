import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Eu sou o assistente de dados da Alpha Insights.\n\nEstou aqui para ajudar você a analisar suas planilhas de vendas. Você pode fazer perguntas sobre os dados, solicitar resumos ou extrair insights.\n\nAo lado, você encontra as planilhas já disponíveis e a opção para fazer o upload de novos arquivos.\n\nComo posso ajudá-lo hoje?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Auto-focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // DEBUG: Inspeção dos dados antes da chamada do chatbot
      try {
        console.log("═══════════════════════════════════════");
        console.log("🤖 CHATBOT BUSCANDO DADOS");
        console.log("═══════════════════════════════════════");
        const { data: userData } = await supabase.auth.getUser();
        console.log("Usuário ID:", userData?.user?.id);
        console.log("Pergunta:", userMessage);

        if (userData?.user?.id) {
          const { data: todosDados, error: fetchErr } = await supabase
            // @ts-ignore - Tabela existe no banco
            .from("vendas")
            .select("*")
            .eq("user_id", userData.user.id);

          if (fetchErr) {
            console.error("Erro ao buscar dados do usuário:", fetchErr);
          } else {
            console.log(`\n📊 TOTAL DE REGISTROS DO USUÁRIO: ${todosDados?.length || 0}`);
            if ((todosDados?.length || 0) > 0) {
              const porMes: Record<string, number> = {};
              (todosDados || []).forEach((v: any) => {
                const key = `${v.mes}/${v.ano}`;
                porMes[key] = (porMes[key] || 0) + 1;
              });
              console.log("\n📅 REGISTROS POR MÊS:");
              Object.entries(porMes).forEach(([mes, qtd]) => {
                console.log(`   ${mes}: ${qtd} registros`);
              });

              console.log("\n📝 PRIMEIROS 3 REGISTROS:");
              (todosDados || []).slice(0, 3).forEach((v: any, i: number) => {
                console.log(`   ${i + 1}. ${v.produto} - ${v.mes}/${v.ano} - Qtd: ${v.quantidade}`);
              });
            } else {
              console.log("\n❌ NENHUM DADO ENCONTRADO NO BANCO!");
            }
          }
        } else {
          console.log("❌ Usuário não autenticado");
        }
        console.log("\n═══════════════════════════════════════\n");
      } catch (dbgErr) {
        console.error("Erro no DEBUG do chatbot:", dbgErr);
      }

      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: userMessage },
      });
      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (error: any) {
      console.error("Chat error:", error);
      toast({
        title: "Erro ao processar mensagem",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
      // Remove the user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      // Re-focus input after sending
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col justify-between bg-card rounded-2xl p-4 h-[550px] overflow-hidden">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">
          Chatbot de Análise de Planilhas
        </h2>
        <p className="text-sm text-muted-foreground">Pergunte sobre suas vendas</p>
      </div>

      {/* Messages area with fixed height and scroll */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 animate-fade-in ${
              msg.role === "assistant" ? "justify-start" : "justify-end"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === "assistant"
                  ? "bg-card border border-border"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <User className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - fixed at bottom */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite sua pergunta..."
          disabled={isLoading}
          className="flex-1 bg-card border-border"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
