import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseSpreadsheet, extractMesAnoFromFilename } from "@/utils/spreadsheet";

interface UploadedFile {
  id: string;
  filename: string;
  file_size: number;
  uploaded_at: string;
  storage_path: string;
}

export const FileUpload = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [lastIngestStats, setLastIngestStats] = useState<{ read: number; inserted: number } | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        // @ts-ignore - Tabela existe no banco, tipos serão regenerados automaticamente
        .from("uploaded_files")
        .select("*")
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error: any) {
      console.error("Error fetching files:", error);
      toast({
        title: "Erro ao carregar arquivos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsUploading(true);
    console.log(`=== UPLOAD E PROCESSAMENTO DE ${selectedFiles.length} ARQUIVO(S) ===`);
    
    let totalRead = 0;
    let totalInserted = 0;
    const resumo: Array<{ arquivo: string; mes: string; ano: string; lidas: number; inseridas: number }> = [];

    try {
      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Autenticação necessária",
          description: "Você precisa estar logado para fazer upload",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        console.log(`\n📁 [${i + 1}/${selectedFiles.length}] Processando: ${file.name}`);

        // Validate file type
        if (
          !file.type.includes("csv") &&
          !file.type.includes("spreadsheet") &&
          !file.type.includes("excel")
        ) {
          console.log(`  ⚠️ Tipo inválido, pulando...`);
          toast({
            title: "Tipo de arquivo inválido",
            description: `${file.name} não é um arquivo CSV ou XLSX válido.`,
            variant: "destructive",
          });
          continue;
        }

        console.log(`  📊 Tipo: ${file.type}, Tamanho: ${file.size} bytes`);

        // Parse spreadsheet
        const parsed = await parseSpreadsheet(file, file.name);
        console.log(`  📋 Linhas lidas: ${parsed.read}`);
        
        if (parsed.rows.length === 0) {
          console.log(`  ⚠️ Nenhum dado válido encontrado, pulando...`);
          toast({
            title: "Arquivo vazio",
            description: `${file.name} não contém dados válidos.`,
            variant: "destructive",
          });
          continue;
        }

        console.log(`  📝 Exemplo do primeiro registro:`, parsed.rows[0]);
        
        // Extrair mês/ano (robusto para hífen, espaço, underscore)
        const { mes, ano } = extractMesAnoFromFilename(file.name);
        console.log(`  📅 Mês: "${mes}", Ano: ${ano}`);
        console.log(`   Mês extraído: "${mes}"`);
        console.log(`   Ano extraído: "${ano}"`);
        console.log(`   Mês extraído: "${mes}"`);
        console.log(`   Ano extraído: "${ano}"`);

        // IMPORTANTE: Limpar dados antigos desse mês específico ANTES de inserir
        console.log(`  🧹 Limpando dados antigos de ${mes}/${ano}...`);
        const { error: deleteError } = await supabase
          // @ts-ignore
          .from("vendas")
          .delete()
          .eq("user_id", user.id)
          .eq("mes", mes)
          .eq("ano", ano);

        if (deleteError) {
          console.error(`  ⚠️ Aviso ao limpar dados antigos:`, deleteError);
        } else {
          console.log(`  ✅ Dados antigos de ${mes}/${ano} removidos`);
        }

        // Upload to storage
        const filePath = `${Date.now()}-${file.name}`;
        console.log(`  ☁️ Fazendo upload para storage: ${filePath}`);
        
        const { error: uploadError } = await supabase.storage
          .from("spreadsheets")
          .upload(filePath, file);

        if (uploadError) {
          console.error(`  ❌ Erro no upload para storage:`, uploadError);
          throw uploadError;
        }
        console.log(`  ✅ Upload para storage concluído`);

        // Save metadata to database
        console.log(`  💾 Salvando metadados no banco...`);
        // @ts-ignore
        const { error: dbError } = await supabase.from("uploaded_files").insert({
          filename: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: filePath,
          user_id: user.id,
        });

        if (dbError) {
          console.error(`  ❌ Erro ao salvar metadados:`, dbError);
          throw dbError;
        }
        console.log(`  ✅ Metadados salvos`);

        // Ingestão via edge function
        const payloadRows = parsed.rows.map((r) => ({
          ...r,
          filename: file.name,
          storage_path: filePath,
        }));

        console.log(`  🚀 Enviando ${payloadRows.length} registros para ingest-vendas...`);
        const { data: ingestRes, error: ingestErr } = await supabase.functions.invoke(
          "ingest-vendas",
          {
            body: {
              rows: payloadRows,
              filename: file.name,
              storage_path: filePath,
            },
          }
        );

        if (ingestErr) {
          console.error(`  ❌ Erro na ingestão:`, ingestErr);
          throw ingestErr;
        }
        
        const inserted = Number((ingestRes as any)?.inserted ?? 0);
        totalRead += parsed.read;
        totalInserted += inserted;

        resumo.push({
          arquivo: file.name,
          mes: mes,
          ano: String(ano),
          lidas: parsed.read,
          inseridas: inserted
        });

        console.log(`  ✅ ${parsed.read} linhas lidas → ${inserted} registros salvos para ${mes}/${ano}`);
        console.log(`   ✅ SALVOU NO BANCO: ${inserted} registros`);
        setLastIngestStats({ read: parsed.read, inserted });
        // Mostrar preview apenas do último arquivo
        if (i === selectedFiles.length - 1) {
          setPreviewRows(parsed.sample);
        }

        // Feedback por arquivo
        toast({
          title: `${file.name} processado`,
          description: `${inserted} registros salvos para ${mes}/${ano}`,
        });
      }

      // Validação final
      console.log("\n=== VALIDAÇÃO FINAL ===");
      console.log(`Total de arquivos processados: ${selectedFiles.length}`);
      console.log(`Total de linhas lidas: ${totalRead}`);
      console.log(`Total de registros salvos: ${totalInserted}`);
      console.log("\nResumo por arquivo:");
      resumo.forEach((r) => {
        console.log(`  • ${r.arquivo} (${r.mes}/${r.ano}): ${r.lidas} lidas → ${r.inseridas} inseridas`);
      });

      // Verificar dados no banco
      const { data: verificacao, error: verifyErr } = await supabase
        // @ts-ignore
        .from("vendas")
        .select("mes, ano")
        .eq("user_id", user.id);

      if (!verifyErr && verificacao) {
        const groupedByMonth: Record<string, number> = {};
        verificacao.forEach((v: any) => {
          const key = `${v.mes}/${v.ano}`;
          groupedByMonth[key] = (groupedByMonth[key] || 0) + 1;
        });

        console.log("\n📊 Dados finais no banco:");
        Object.entries(groupedByMonth).forEach(([key, count]) => {
          console.log(`  • ${key}: ${count} registros`);
        });
      }

      console.log("\n═══════════════════════════════════════");
      console.log("✅ UPLOAD CONCLUÍDO");
      console.log("═══════════════════════════════════════\n");

      toast({
        title: "Upload concluído com sucesso!",
        description: `${selectedFiles.length} arquivo(s) • ${totalInserted} registros salvos`,
      });

      fetchFiles();
    } catch (error: any) {
      console.error("❌ ERRO GERAL no upload:", error);
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string, storagePath: string, filename: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir ${filename}?\n\n` +
      `Todos os dados desta planilha serão removidos permanentemente do banco de dados.`
    );

    if (!confirmed) return;

    try {
      console.log(`🗑️ Iniciando exclusão de: ${filename} (storage_path: ${storagePath})`);

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Autenticação necessária",
          description: "Você precisa estar logado",
          variant: "destructive",
        });
        return;
      }

      // 1. Delete sales data from vendas table (filtrando por storage_path E user_id)
      const { error: vendasError } = await supabase
        // @ts-ignore - Tabela existe no banco, tipos serão regenerados automaticamente
        .from("vendas")
        .delete()
        .eq("storage_path", storagePath)
        .eq("user_id", user.id);

      if (vendasError) throw vendasError;
      console.log(`✅ Dados de vendas removidos do banco (storage_path: ${storagePath})`);

      // 2. Delete from storage
      const { error: storageError } = await supabase.storage
        .from("spreadsheets")
        .remove([storagePath]);

      if (storageError) throw storageError;
      console.log(`✅ Arquivo removido do storage: ${storagePath}`);

      // 3. Delete metadata from database
      const { error: dbError } = await supabase
        // @ts-ignore - Tabela existe no banco, tipos serão regenerados automaticamente
        .from("uploaded_files")
        .delete()
        .eq("id", fileId);

      if (dbError) throw dbError;
      console.log(`✅ Metadados removidos da tabela uploaded_files`);

      toast({
        title: "Planilha excluída",
        description: `${filename} e todos os seus dados foram removidos com sucesso.`,
      });

      fetchFiles();
    } catch (error: any) {
      console.error("❌ Erro ao excluir:", error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleReprocess = async () => {
    try {
      setIsReprocessing(true);
      console.log("=== INICIANDO REPROCESSAMENTO COMPLETO ===");

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Autenticação necessária",
          description: "Você precisa estar logado",
          variant: "destructive",
        });
        return;
      }

      // PRIMEIRO: Limpar TODOS os dados antigos do usuário
      console.log("🧹 Limpando dados antigos do usuário...");
      const { error: deleteError } = await supabase
        // @ts-ignore - Tabela existe no banco, tipos serão regenerados automaticamente
        .from("vendas")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Erro ao limpar dados antigos:", deleteError);
        throw deleteError;
      }
      console.log("✅ Todos os dados antigos removidos");

      // SEGUNDO: Processar cada arquivo
      let totalRead = 0;
      let totalInserted = 0;
      const resumoPorMes: Record<string, number> = {};

      console.log(`\n📊 Processando ${files.length} planilhas...`);

      for (const f of files) {
        console.log(`\n📁 Arquivo: ${f.filename}`);

        const { data: blob, error: dErr } = await supabase.storage
          .from("spreadsheets")
          .download(f.storage_path);

        if (dErr || !blob) {
          console.error(`  ❌ Erro ao baixar arquivo:`, dErr);
          continue;
        }

        const parsed = await parseSpreadsheet(blob, f.filename);
        console.log(`  📋 Linhas lidas: ${parsed.read}`);

        if (parsed.rows.length > 0) {
          console.log(`  📝 Exemplo do primeiro registro:`, parsed.rows[0]);
        }

        const payloadRows = parsed.rows.map((r) => ({
          ...r,
          filename: f.filename,
          storage_path: f.storage_path,
        }));

        const { data: ingestRes, error: ingestErr } = await supabase.functions.invoke("ingest-vendas", {
          body: {
            rows: payloadRows,
            filename: f.filename,
            storage_path: f.storage_path,
          },
        });

        if (ingestErr) {
          console.error(`  ❌ Erro na ingestão:`, ingestErr);
          continue;
        }

        const inserted = Number((ingestRes as any)?.inserted ?? 0);
        totalRead += parsed.read;
        totalInserted += inserted;

        // Track por mês
        const mes = parsed.rows[0]?.mes || "Desconhecido";
        resumoPorMes[mes] = (resumoPorMes[mes] || 0) + inserted;

        console.log(`  ✅ ${parsed.read} linhas lidas → ${inserted} registros salvos`);
      }

      // TERCEIRO: Validar o que foi salvo no banco
      console.log("\n=== VALIDAÇÃO FINAL ===");
      const { data: verificacao, error: verifyErr } = await supabase
        // @ts-ignore - Tabela existe no banco, tipos serão regenerados automaticamente
        .from("vendas")
        .select("mes, ano")
        .eq("user_id", user.id);

      if (!verifyErr && verificacao) {
        const groupedByMonth: Record<string, number> = {};
        verificacao.forEach((v: any) => {
          const key = `${v.mes}/${v.ano}`;
          groupedByMonth[key] = (groupedByMonth[key] || 0) + 1;
        });

        console.log("📊 Dados no banco após reprocessamento:");
        Object.entries(groupedByMonth).forEach(([key, count]) => {
          console.log(`  • ${key}: ${count} registros`);
        });
      }

      toast({
        title: "Reprocessamento concluído",
        description: `${files.length} arquivos • ${totalRead} linhas lidas → ${totalInserted} registros salvos`,
      });
    } catch (error: any) {
      console.error("❌ ERRO GERAL no reprocessamento:", error);
      toast({ 
        title: "Erro no reprocessamento", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">Upload de Planilhas</h2>
        <p className="text-sm text-muted-foreground">
          Envie suas planilhas mensais de vendas (CSV ou XLSX)
        </p>
      </div>

      <div className="mb-4 space-y-2">
        <label htmlFor="file-upload">
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={isUploading}
            asChild
          >
            <span className="cursor-pointer flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              {isUploading ? "Enviando..." : "Selecionar Arquivos"}
            </span>
          </Button>
        </label>
        <input
          id="file-upload"
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />


        {lastIngestStats && (
          <p className="text-xs text-muted-foreground">
            Último upload: {lastIngestStats.read} linhas lidas → {lastIngestStats.inserted} registros salvos
          </p>
        )}

        {previewRows.length > 0 && (
          <div className="mt-2 border border-border rounded-md p-2">
            <p className="text-xs font-semibold mb-1 text-foreground">Prévia dos dados (5 primeiras linhas)</p>
            <div className="text-xs text-muted-foreground space-y-1">
              {previewRows.map((r, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <span className="font-medium text-foreground">{r.produto}</span>
                  <span>• Qtd: {r.quantidade}</span>
                  <span>• {r.mes}/{r.ano}</span>
                  {r.valor != null && <span>• Valor: {r.valor}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
          Arquivos enviados
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum arquivo enviado ainda
            </p>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="bg-card border border-border rounded-lg p-3 flex items-start gap-3 hover:border-primary transition-colors animate-fade-in"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {file.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)} • {formatDate(file.uploaded_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(file.id, file.storage_path, file.filename)}
                  className="flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
