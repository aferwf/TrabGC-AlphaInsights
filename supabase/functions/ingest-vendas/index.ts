import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type VendaRow = {
  produto: string;
  quantidade: number;
  valor?: number | null;
  mes: string;
  ano: number;
  filename?: string;
  storage_path?: string;
  data?: any;
  id_transacao?: string;
  categoria?: string;
  regiao?: string;
  preco_unitario?: number | null;
  receita_total?: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify user identity using anon key
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);

    if (userError || !user) {
      console.error("Authentication error:", userError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestBody = await req.json();

    // Validate input with zod
    const vendaRowSchema = z.object({
      produto: z.string().min(1).max(200),
      quantidade: z.number().int().min(0).max(1000000),
      valor: z.number().min(0).max(1000000).nullable().optional(),
      mes: z.string().min(1).max(50),
      ano: z.number().int().min(2000).max(2100),
      filename: z.string().max(255).optional(),
      storage_path: z.string().regex(/^[a-zA-Z0-9_\-\.\s]+$/).max(500).optional(),
      data: z.any().optional(),
      id_transacao: z.string().max(100).optional(),
      categoria: z.string().max(100).optional(),
      regiao: z.string().max(100).optional(),
      preco_unitario: z.number().min(0).max(1000000).nullable().optional(),
      receita_total: z.number().min(0).max(10000000).nullable().optional(),
    });

    const ingestRequestSchema = z.object({
      rows: z.array(vendaRowSchema).min(1, 'Pelo menos uma linha é necessária').max(10000, 'Muitas linhas (máximo 10000)'),
      filename: z.string().max(255).optional(),
      storage_path: z.string().regex(/^[a-zA-Z0-9_\-\.\s]+$/).max(500).optional()
    });

    let rows: any[];
    let filename: string | undefined;
    let storage_path: string | undefined;

    try {
      const validated = ingestRequestSchema.parse(requestBody);
      rows = validated.rows;
      filename = validated.filename;
      storage_path = validated.storage_path;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: 'Dados inválidos', details: error.errors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate that the storage_path belongs to the authenticated user
    if (storage_path) {
      const { data: fileRecord, error: fileError } = await supabase
        .from('uploaded_files')
        .select('user_id')
        .eq('storage_path', storage_path)
        .maybeSingle();
      
      if (fileError) {
        console.error("Error validating file ownership:", fileError);
        return new Response(
          JSON.stringify({ error: 'Failed to validate file ownership' }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!fileRecord) {
        console.log(`⚠️ File not found: ${storage_path}`);
        return new Response(
          JSON.stringify({ error: 'File not found' }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (fileRecord.user_id !== user.id) {
        console.log(`⚠️ Unauthorized access attempt: User ${user.id} tried to access file owned by ${fileRecord.user_id}`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized: File belongs to another user' }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`✅ Ownership validated: User ${user.id} owns file ${storage_path}`);
    }

    // Helper function to convert Excel date serial number to ISO timestamp
    const excelDateToISO = (excelDate: any): string | undefined => {
      if (!excelDate) return undefined;
      
      // If it's already a valid date string, return it
      if (typeof excelDate === 'string' && excelDate.includes('-')) {
        return excelDate;
      }
      
      // Convert Excel serial number to JavaScript Date
      const excelNum = Number(excelDate);
      if (!Number.isFinite(excelNum) || excelNum < 0) return undefined;
      
      // Excel epoch starts at 1900-01-01, but has a leap year bug
      // Days are counted from 1899-12-30
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + excelNum * 86400000);
      
      return date.toISOString();
    };

    // Sanitiza e valida linhas - ADICIONA user_id
    const sanitized = rows
      .map((r: any) => ({
        user_id: user.id,  // 🔒 CRÍTICO: Vincula ao usuário autenticado
        produto: String(r.produto ?? r.product ?? "").trim(),
        quantidade: Number(r.quantidade ?? r.qtd ?? r.quantity ?? r.units ?? 0),
        valor: r.valor !== undefined && r.valor !== null ? Number(r.valor) : null,
        mes: String(r.mes ?? r.month ?? "").trim(),
        ano: Number(r.ano ?? r.year ?? 0),
        filename: String(r.filename ?? filename ?? "").trim(),
        storage_path: String(r.storage_path ?? storage_path ?? "").trim(),
        data: excelDateToISO(r.data),
        id_transacao: r.id_transacao ? String(r.id_transacao).trim() : undefined,
        categoria: r.categoria ? String(r.categoria).trim() : undefined,
        regiao: r.regiao ? String(r.regiao).trim() : undefined,
        preco_unitario: r.preco_unitario !== undefined && r.preco_unitario !== null ? Number(r.preco_unitario) : null,
        receita_total: r.receita_total !== undefined && r.receita_total !== null ? Number(r.receita_total) : null,
      }))
      .filter((r) => r.produto && Number.isFinite(r.quantidade) && r.quantidade >= 0 && r.mes && Number.isFinite(r.ano) && r.ano > 0);

    const received = rows.length;

    if (sanitized.length === 0) {
      console.log(`⚠️ Nenhuma linha válida para inserir. Recebidas: ${received}`);
      return new Response(
        JSON.stringify({ received, inserted: 0, message: "Nenhuma linha válida após validação" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Evita duplicidades por arquivo: remove registros anteriores do mesmo storage_path E user_id
    if (storage_path) {
      const { error: delErr } = await supabase
        .from("vendas")
        .delete()
        .eq("storage_path", storage_path)
        .eq("user_id", user.id);  // 🔒 Garante que só deleta dados do próprio usuário
      if (delErr) {
        console.error("Erro ao limpar dados anteriores do arquivo:", delErr);
      }
    }

    // Inserção em lotes
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < sanitized.length; i += chunkSize) {
      const chunk = sanitized.slice(i, i + chunkSize);
      const { error: insertErr, count } = await supabase
        .from("vendas")
        .insert(chunk, { count: "exact" });
      if (insertErr) {
        console.error("Erro ao inserir lote:", insertErr);
        return new Response(
          JSON.stringify({ error: insertErr.message, received, inserted }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted += count ?? chunk.length;
    }

    console.log(`✅ Ingestão concluída: arquivo=${filename ?? "(n/d)"} | recebidas=${received} | inseridas=${inserted}`);

    return new Response(
      JSON.stringify({ received, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na ingest-vendas:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});