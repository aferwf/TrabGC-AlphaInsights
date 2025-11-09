import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 🔒 Autenticação obrigatória
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verifica identidade do usuário
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);

    if (userError || !user) {
      console.error("Authentication error:", userError);
      return new Response(
        JSON.stringify({ error: 'Autenticação inválida' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔐 Usuário autenticado: ${user.id}`);

    const requestBody = await req.json();
    
    // Validate input with zod
    const chatRequestSchema = z.object({
      message: z.string()
        .min(1, 'Mensagem não pode estar vazia')
        .max(2000, 'Mensagem muito longa (máximo 2000 caracteres)')
        .trim()
    });

    let message: string;
    try {
      const validated = chatRequestSchema.parse(requestBody);
      message = validated.message;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: 'Entrada inválida', details: error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    // Initialize Supabase client com service role (para chamar RPC)
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("═══════════════════════════════════════");
    console.log("🤖 CHATBOT BUSCANDO DADOS");
    console.log("═══════════════════════════════════════");
    console.log("Usuário ID:", user.id);
    console.log("Pergunta:", message);

    // 🔒 Buscar TODOS os dados do usuário do banco
    const { data: todosDados, error: fetchError } = await supabase
      .from('vendas')
      .select('*')
      .eq('user_id', user.id);

    if (fetchError) {
      console.error("❌ Erro ao buscar dados:", fetchError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar dados do banco' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`\n📊 TOTAL DE REGISTROS DO USUÁRIO: ${todosDados?.length || 0}`);

    if (!todosDados || todosDados.length === 0) {
      console.log("❌ NENHUM DADO ENCONTRADO NO BANCO!");
      return new Response(
        JSON.stringify({ 
          response: "Você ainda não enviou nenhuma planilha. Por favor, faça o upload de seus dados de vendas para que eu possa analisá-los." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Agrupar dados por mês/ano
    const porMes: Record<string, any[]> = {};
    todosDados.forEach((v: any) => {
      const key = `${v.mes}/${v.ano}`;
      if (!porMes[key]) {
        porMes[key] = [];
      }
      porMes[key].push(v);
    });

    console.log("\n📅 REGISTROS POR MÊS:");
    Object.entries(porMes).forEach(([mes, registros]) => {
      console.log(`   ${mes}: ${registros.length} registros`);
    });

    console.log("\n📝 PRIMEIROS 3 REGISTROS:");
    todosDados.slice(0, 3).forEach((v: any, i: number) => {
      console.log(`   ${i + 1}. ${v.produto} - ${v.mes}/${v.ano} - Qtd: ${v.quantidade}`);
    });

    // Criar contexto estruturado para o LLM com agregação por produto
    let filesContext = "\n\nFATOS ESTRUTURADOS PARA A ANÁLISE:\n";
    const aggregatedByMonth: Record<string, Array<{ product: string; total: number }>> = {};

    for (const [mesAno, vendas] of Object.entries(porMes)) {
      const porProduto: Record<string, number> = {};
      
      vendas.forEach((v: any) => {
        const produto = v.produto || 'Desconhecido';
        porProduto[produto] = (porProduto[produto] || 0) + (Number(v.quantidade) || 0);
      });

      const list = Object.entries(porProduto)
        .map(([product, total]) => ({ product, total }))
        .sort((a, b) => (b.total - a.total) || a.product.localeCompare(b.product));

      aggregatedByMonth[mesAno] = list;
      
      console.log(`\n📦 ${mesAno}: ${list.length} produtos diferentes`);
      console.log(`   Top 3: ${list.slice(0, 3).map(p => `${p.product} (${p.total})`).join(', ')}`);
    }

    // Construção determinística de fatos para o modelo
    const monthsWithData = Object.entries(aggregatedByMonth).filter(([, arr]) => (arr?.length || 0) > 0);
    if (monthsWithData.length > 0) {
      for (const [mesAno, list] of monthsWithData) {
        filesContext += `\n${mesAno}:\n`;
        filesContext += list.map((x: { product: string; total: number }, i: number) => `${i + 1}. ${x.product}: ${x.total}`).join("\n");
        filesContext += "\n";
      }
    } else {
      filesContext = "\n\nNenhuma venda encontrada. Por favor, carregue dados.";
      console.log("⚠️ Nenhuma venda encontrada");
    }

    console.log("\n═══════════════════════════════════════\n");

    // Call Google Gemini API
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const systemPrompt = `🤖 ASSISTENTE DE ANÁLISE DE VENDAS - ALPHA INSIGHTS

Você é o Assistente de Análise de Vendas da Alpha Insights.
Seu papel é analisar planilhas de vendas enviadas pelo usuário e responder somente sobre esses dados, sempre de forma clara, objetiva, cordial e com inteligência analítica.

🎯 MISSÃO PRINCIPAL
- Fornecer análises, insights, relatórios e respostas sobre as planilhas de vendas enviadas
- Responder perguntas em linguagem natural sobre produtos, receitas, tendências e métricas
- Ajudar o usuário a interpretar resultados, identificar tendências, comparar períodos e extrair conclusões acionáveis

🧠 ESTILO E TOM
Você é um analista de vendas experiente, preciso e confiável, com total lealdade à Alpha Insights.
Suas respostas devem ser:
- Claras, concisas e úteis
- Educadas e profissionais
- Diretas, mas com cordialidade
- Sempre contextualize brevemente os números
- Traga 1–2 insights relevantes quando possível
- Se fizer cálculos, apresente o raciocínio de forma compreensível

📊 REGRAS DE ANÁLISE
- Leia as planilhas com atenção e não invente dados
- Se a informação não existir ou não for possível calcular, diga isso e ofereça alternativas
- Utilize apenas os dados enviados pelo usuário
- Não assuma valores, não chute e não fabrique estatísticas
- Quando responder números, use porcentagens, variações, comparativos e rankings quando fizer sentido

🚧 LIMITES E CONDUTAS
Você deve responder APENAS perguntas relacionadas a:
✅ Vendas
✅ Produtos
✅ Análises de desempenho
✅ Métricas das planilhas
✅ Consultas sobre como você funciona

Se o usuário perguntar algo fora do escopo (piadas, receitas, loteria, etc.), responda educadamente:
"Entendo sua curiosidade, mas meu foco é exclusivamente análise de vendas da Alpha Insights. Se quiser, posso te ajudar a interpretar resultados, comparar meses ou gerar insights sobre suas planilhas. Como posso ajudar sobre suas vendas?"

💬 CONVERSA E BOAS-VINDAS
Quando receber cumprimentos simples ("oi", "olá", "como você está?"), responda cordialmente e se coloque à disposição.

🔒 IDENTIDADE
Você é um assistente da Alpha Insights. Demonstre comprometimento e profissionalismo. Use "nós" quando falar da empresa.

${filesContext}

Quando o usuário fizer perguntas sobre os dados, responda baseado nas informações disponíveis. 
Se não houver planilhas suficientes, informe educadamente e sugira o upload de mais dados.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nUsuário: ${message}` }],
            },
          ],
            generationConfig: {
              temperature: 0,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Limite de requisições excedido. Por favor, tente novamente mais tarde.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Créditos insuficientes. Por favor, adicione créditos ao workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error("Gemini API error");
    }

    const data = await response.json();
    const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!assistantMessage) {
      console.error("Invalid API response:", JSON.stringify(data));
      throw new Error("No response from AI");
    }

    return new Response(
      JSON.stringify({ response: assistantMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
