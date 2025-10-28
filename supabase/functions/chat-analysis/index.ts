import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função aprimorada para ler e consolidar planilhas
async function parseSpreadsheet(fileData: Blob, fileName: string): Promise<string> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Identifica o mês no nome do arquivo
    const monthMatch = fileName.match(/janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i);
    const month = monthMatch ? monthMatch[0].toLowerCase() : "não identificado";

    let text = `\n\n=== Planilha: ${fileName} (${month}) ===\n`;
    let totalRows = 0;

    // Lê todas as abas e formata os dados como texto estruturado
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (jsonData.length > 0) {
        text += `\n--- Aba: ${sheetName} ---\n`;
        jsonData.forEach((row: any) => {
          const rowText = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ");
          text += rowText + "\n";
          totalRows++;
        });
      }
    });

    console.log(`✅ Arquivo ${fileName} processado (${month}): ${totalRows} linhas extraídas`);
    return text;
  } catch (error) {
    console.error(`❌ Erro ao processar ${fileName}:`, error);
    return `\n\n=== Erro ao ler ${fileName}: ${error instanceof Error ? error.message : "erro desconhecido"} ===\n`;
  }
}

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

    // Inicializa o Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lista todas as planilhas enviadas
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

    // Lê e combina os dados de todas as planilhas
    let spreadsheetsContext = "";
    if (files && files.length > 0) {
      console.log(`📊 Processando ${files.length} arquivo(s)...`);
      for (const file of files) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("spreadsheets")
          .download(file.name);

        if (downloadError) {
          console.error("❌ Erro ao baixar", file.name, downloadError);
          continue;
        }

        if (fileData) {
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            spreadsheetsContext += await parseSpreadsheet(fileData, file.name);
          } else if (file.name.endsWith('.csv')) {
            try {
              const text = await fileData.text();
              spreadsheetsContext += `\n\n=== Planilha: ${file.name} ===\n${text}\n`;
              console.log(`✅ Arquivo CSV ${file.name} lido com sucesso`);
            } catch (e) {
              console.error("❌ Erro ao processar CSV", file.name, e);
            }
          }
        }
      }
    }

    // Chave da API Gemini
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not found in environment");
      return new Response(
        JSON.stringify({ error: "API key não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PROMPT aprimorado para respostas consistentes e contexto unificado
    const systemPrompt = `Você é um assistente de análise de vendas da Alpha Insights, especializado em interpretar e comparar dados de planilhas mensais (.xlsx e .csv).

Seu objetivo é fornecer respostas precisas, consistentes e explicativas com base nos dados disponíveis.

=== REGRAS FIXAS ===
1. Sempre utilize todas as planilhas enviadas — nenhuma deve ser ignorada.
2. Considere que cada planilha representa um mês (identifique pelo nome do arquivo).
3. Dê a mesma resposta para perguntas idênticas, a menos que novas planilhas sejam adicionadas.
4. Se houver inconsistências, esclareça ao usuário o motivo (ex: “dados incompletos em março”).
5. Nunca invente valores — use apenas os dados fornecidos.
6. Sempre responda em português do Brasil.
7. Explique o raciocínio de forma clara e analítica, mostrando comparações e tendências.
8. Ao citar produtos, inclua unidades vendidas e valores totais.

=== EXEMPLO DE RESPOSTA ===
"Em fevereiro, o produto mais vendido foi o Produto X, com 320 unidades e R$ 12.500,00 em vendas. Em março, o mesmo produto teve aumento de 15% nas vendas."

${spreadsheetsContext
  ? `\n\n=== DADOS CONSOLIDADOS ===\n${spreadsheetsContext}`
  : "\n\nNenhuma planilha foi enviada ainda. Peça ao usuário para fazer upload das planilhas primeiro."}

Agora, analise os dados e responda a esta pergunta do usuário:
"${message}"
`;

    // Chamada à API Gemini (modelo fixo)
    console.log("Chamando Gemini API com modelo gemini-2.5-flash...");
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: systemPrompt }],
            },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Erro na API Gemini:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar com IA", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const responseText =
      aiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Desculpe, não consegui processar sua pergunta.";

    console.log("✅ Resposta gerada:", responseText);

    return new Response(
      JSON.stringify({ response: responseText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro no chat-analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
