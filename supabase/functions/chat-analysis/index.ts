import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    console.log("Received message:", message);

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Mensagem inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all spreadsheet files
    const { data: files, error: listError } = await supabase.storage
      .from("spreadsheets")
      .list("");

    if (listError) {
      console.error("Error listing files:", listError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar planilhas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read content from all spreadsheet files
    let spreadsheetsContext = "";
    if (files && files.length > 0) {
      for (const file of files) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("spreadsheets")
          .download(file.name);

        if (downloadError) {
          console.error("Download error for", file.name, downloadError);
          continue;
        }

        if (fileData) {
          try {
            const text = await fileData.text();
            spreadsheetsContext += `\n\n=== Planilha: ${file.name} ===\n${text.substring(0, 10000)}\n`;
          } catch (e) {
            console.error("Parse error for", file.name, e);
          }
        }
      }
    }

    // Get Gemini API key
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    console.log("GEMINI_API_KEY configured:", !!GEMINI_API_KEY);
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not found in environment");
      return new Response(
        JSON.stringify({ error: "API key não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare system prompt with spreadsheet context
    const systemPrompt = `Você é um assistente de análise de vendas da Alpha Insights, especializado em interpretar dados de planilhas de vendas.

${spreadsheetsContext ? `Aqui estão os dados das planilhas disponíveis:\n${spreadsheetsContext}` : "Nenhuma planilha foi enviada ainda. Informe ao usuário que ele precisa fazer upload de planilhas primeiro."}

INSTRUÇÕES:
- Analise os dados fornecidos e responda perguntas sobre vendas, produtos, receitas, etc.
- Seja educado, cordial e direto
- Forneça números específicos e percentuais quando relevante
- Se não houver dados suficientes, informe claramente
- Responda sempre em português do Brasil
- Mantenha as respostas concisas e objetivas`;

   // Chamada correta à API Gemini v1beta
console.log("Chamando Gemini API (v1beta) com gemini-1.5-pro-latest...");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY não está definida nas variáveis de ambiente da Vercel.");
}

const aiResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${systemPrompt}\n\nUsuário: ${message}` }],
        },
      ],
    }),
  }
);

if (!aiResponse.ok) {
  const errorText = await aiResponse.text();
  console.error("Erro na chamada da API Gemini:", aiResponse.status, errorText);
  throw new Error(`Falha na requisição: ${aiResponse.status}`);
}

const result = await aiResponse.json();
console.log("Resposta da Gemini:", result);

const botMessage = result?.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível gerar uma resposta.";


    console.log("Gemini API response status:", aiResponse.status);

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limit" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "payment_required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: "Erro ao processar com IA",
          details: errorText,
          status: aiResponse.status 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    console.log("AI Response:", JSON.stringify(aiData, null, 2));
    const responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar sua pergunta.";

    console.log("Sending response:", responseText);
    return new Response(
      JSON.stringify({ response: responseText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in chat-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

