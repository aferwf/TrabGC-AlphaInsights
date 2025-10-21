import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  name: string;
  created_at: string;
  metadata?: {
    size?: number;
  };
}

const UploadSection = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const { data, error } = await supabase.storage
        .from("spreadsheets")
        .list("", {
          sortBy: { column: "created_at", order: "desc" }
        });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error("Erro ao carregar arquivos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(selectedFiles)) {
        // Validar tipo de arquivo
        if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
          toast({
            title: "Arquivo inválido",
            description: `${file.name} não é uma planilha válida. Use CSV ou XLSX.`,
            variant: "destructive"
          });
          continue;
        }

        // Upload para o Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("spreadsheets")
          .upload(file.name, file, {
            upsert: true
          });

        if (uploadError) throw uploadError;
      }

      toast({
        title: "Upload concluído",
        description: `${selectedFiles.length} arquivo(s) enviado(s) com sucesso!`
      });

      // Recarregar lista de arquivos
      await loadFiles();
    } catch (error) {
      console.error("Erro no upload:", error);
      toast({
        title: "Erro no upload",
        description: "Não foi possível enviar os arquivos. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileName: string) => {
    try {
      const { error } = await supabase.storage
        .from("spreadsheets")
        .remove([fileName]);

      if (error) throw error;

      toast({
        title: "Arquivo removido",
        description: `${fileName} foi excluído com sucesso.`
      });

      await loadFiles();
    } catch (error) {
      console.error("Erro ao deletar:", error);
      toast({
        title: "Erro",
        description: "Não foi possível remover o arquivo.",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="bg-card rounded-2xl border border-border shadow-medium p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Upload de Planilhas</h2>
        <p className="text-sm text-muted-foreground">
          Envie suas planilhas mensais de vendas (CSV ou XLSX)
        </p>
      </div>

      {/* Upload Button */}
      <div className="mb-6">
        <label htmlFor="file-upload">
          <Button
            disabled={isUploading}
            className="w-full rounded-xl bg-primary hover:bg-primary/90 shadow-soft"
            size="lg"
            asChild
          >
            <span className="cursor-pointer">
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Selecionar Arquivos
                </>
              )}
            </span>
          </Button>
        </label>
        <input
          id="file-upload"
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-medium mb-3">Arquivos enviados</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhuma planilha enviada ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileSpreadsheet className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.metadata?.size)} • {formatDate(file.created_at)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(file.name)}
                  className="ml-2 h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadSection;