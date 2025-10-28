import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx"; // MODIFICAÇÃO: Importa a biblioteca para ler Excel

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função para formatar o histórico para a API do Gemini (Resolve o Problema 2)
function buildGeminiContents(systemPrompt, history, newMessage) {
  const contents = [];
  
  // 1. Adiciona o Prompt do Sistema (Instruções)
  contents.push({
    role: "user",
    parts: [{ text: systemPrompt }],
  });
  contents.push({
    role: "model",
    parts: [{ text: "Entendido. Estou pronto para analisar as planilhas." }],
  });

  // 2. Adiciona o Histórico (se existir)
  if (history && history.length > 0) {
    history.forEach(item => {
      // 'item' deve ter a estrutura { role: 'user' | 'model', text: '...' }
      contents.push({
        role: item.role,
        parts: [{ text: item.text }],
      });
    });
  }

  // 3. Adiciona a Nova Mensagem do Usuário
  contents.push({
    role: "user",
    parts: [{ text: newMessage }],
  });

  return contents;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // MODIFICAÇÃO: Espera 'history' para resolver o Problema 2
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Mensagem inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Carregamento do Supabase ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: files, error: listError } = await supabase.storage
      .from("spreadsheets")
      .list("");

    if (listError) throw new Error("Erro ao listar arquivos: " + listError.message);

    let spreadsheetsContext = "";
    if (files && files.length > 0) {
      for (const file of files) {
        // MODIFICAÇÃO: Procura por .xlsx
        if (!file.name.endsWith('.xlsx')) {
          console.warn(`Ignorando arquivo não-excel: ${file.name}`);
          continue;
        }

        const { data: fileData, error: downloadError } = await supabase.storage
          .from("spreadsheets")
          .download(file.name);

        if (downloadError) {
          console.error("Erro no download de", file.name, downloadError);
          continue;
        }

        if (fileData) {
          try {
            // --- MODIFICAÇÃO PRINCIPAL (Resolve o Problema 1) ---
            
            // 1. Converte o Blob (fileData) em ArrayBuffer (dados binários)
            const arrayBuffer = await fileData.arrayBuffer();
            
            // 2. A biblioteca XLSX lê os dados binários
            const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
            
            let fileContentAsText = ""; // Armazena o texto de todas as abas

            // 3. Itera sobre CADA ABA (sheet) da planilha
            for (const sheetName of workbook.SheetNames) {
              const sheet = workbook.Sheets[sheetName];
              
              // 4. Converte a aba em um texto formato CSV (fácil para a IA ler)
              const csvText = XLSX.utils.sheet_to_csv(sheet);
              
              fileContentAsText += `\n--- Aba: ${sheetName} ---\n${csvText}\n`;
            }
            
            // 5. Adiciona o texto extraído ao contexto
            spreadsheetsContext += `\n\n=== Planilha: ${file.name} ===\n${fileContentAsText.substring(0, 10000)}\n`;
            // --- Fim da Modificação ---
            
          } catch (e) {
            console.error(`ERRO AO PROCESSAR O ARQUIVO ${file.name}:`, e);
            // Isso vai pegar o erro do 'Janeiro-2025.xlsx' se ele estiver corrompido
            spreadsheetsContext += `\n\n=== Planilha: ${file.name} ===\nERRO: Não foi possível ler este arquivo. Pode estar corrompido.\n`;
          }
        }
      }
    }
    // --- Fim do Carregamento do Supabase ---

    // --- Preparação do Prompt ---
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada");
    }

    const systemPrompt = `Você é um assistente de análise de vendas da Alpha Insights...
    
${spreadsheetsContext ? `Aqui estão os dados das planilhas disponíveis:\n${spreadsheetsContext}` : "Nenhuma planilha foi enviada. Informe ao usuário que ele precisa fazer upload."}

INSTRUÇÕES IMPORTANTES:
- Os dados da planilha estão em formato CSV.
- Responda APENAS com base nos dados das planilhas fornecidas.
- Se a pergunta for "e em [mês]?", use o contexto da pergunta anterior para entender o que analisar.
- Sempre responda em português do Brasil.
`;
    // --- Fim do Prompt ---

    // MODIFICAÇÃO: Construir o payload 'contents' usando o histórico
    const contents = buildGeminiContents(systemPrompt, history, message);

    // --- Chamada à API Gemini (Seu código original tinha duas, limpei para ficar só uma) ---
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contents, // Envia os 'contents' completos com histórico
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Erro na API Gemini:", aiResponse.status, errorText);
      throw new Error(`Falha na requisição à IA: ${aiResponse.status} ${errorText}`);
    }

    const result = await aiResponse.json();
    const botMessage = result?.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";

    return new Response(
      JSON.stringify({ response: botMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro principal no Deno serve:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
