import * as XLSX from "xlsx";

export type VendaRow = {
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

const monthsPtBr = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function normalizeKey(key: string) {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .replace(/[^a-z0-9]+/g, ""); // remove não alfanum
}

export function extractMesAnoFromFilename(filename: string): { mes: string; ano: number } {
  const clean = filename.replace(/\.(xlsx?|csv)$/i, "");
  // Normalize for robust matching (remove accents, lowercase)
  const norm = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  console.log(`🔍 Extraindo mês/ano de: "${filename}"`);
  console.log(`   Nome limpo: "${clean}"`);
  console.log(`   Nome normalizado: "${norm}"`);

  // Map normalized month -> original month
  const monthMap = monthsPtBr.reduce<Record<string, string>>((acc, m) => {
    const key = m.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    acc[key] = m;
    return acc;
  }, {});

  // Try to find any known month present anywhere in the filename (supports space, hyphen, underscore)
  let mesDetected: string | undefined;
  for (const [normKey, original] of Object.entries(monthMap)) {
    if (norm.includes(normKey)) {
      mesDetected = original;
      console.log(`   ✅ Mês detectado: "${original}" (matched: "${normKey}")`);
      break;
    }
  }

  // Extract first 4-digit year
  const yearMatch = norm.match(/(20\d{2}|19\d{2})/);
  const anoDetected = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  if (!mesDetected) {
    console.error(`   ❌ ERRO: Mês não detectado no nome do arquivo "${filename}"`);
    console.error(`   Meses válidos: ${monthsPtBr.join(", ")}`);
    throw new Error(
      `Não foi possível detectar o mês no nome do arquivo "${filename}". ` +
      `O nome do arquivo deve conter um mês em português (ex: "Janeiro 2025.xlsx", "Fevereiro-2025.xlsx", "marco_2025.xlsx")`
    );
  }

  console.log(`   ✅ Ano detectado: ${anoDetected}`);

  return {
    mes: mesDetected,
    ano: anoDetected,
  };
}

export async function parseSpreadsheet(fileOrBlob: File | Blob, filename: string) {
  try {
    console.log("📁 Iniciando leitura do arquivo:", filename);
    
    const buf = await (fileOrBlob as Blob).arrayBuffer();
    console.log("✅ Arquivo lido, tamanho:", buf.byteLength, "bytes");
    
    const wb = XLSX.read(buf, { type: "array" });
    console.log("✅ Workbook criado, sheets:", wb.SheetNames);
    
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      throw new Error("Nenhuma aba encontrada na planilha");
    }
    
    const sheet = wb.Sheets[sheetName];
    console.log("✅ Worksheet selecionada:", sheetName);
    
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
    console.log("✅ Dados convertidos, total de linhas:", raw.length);
    if (raw.length > 0) {
      console.log("📊 Primeira linha (exemplo):", raw[0]);
      console.log("📊 Colunas encontradas:", Object.keys(raw[0]));
    }

  // Extrai mês e ano do NOME DO ARQUIVO (não da coluna Data!)
  const { mes, ano } = extractMesAnoFromFilename(filename);
  console.log("📅 Mês/Ano extraído do filename:", { mes, ano, filename });

  const rows: VendaRow[] = [];
  const warnings: string[] = [];
  const produtosUnicos = new Set<string>();
  let totalQuantidade = 0;
  let totalReceita = 0;

  for (let i = 0; i < raw.length; i++) {
    try {
      const r = raw[i];
      const map: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) {
        map[normalizeKey(k)] = v;
      }

      // Estrutura real: Data, ID_Transacao, Produto, Categoria, Região, Quantidade, Preco_Unitario, Receita_Total
      const data = map["data"] ?? map["date"];
      const id_transacao = String(map["idtransacao"] ?? map["id_transacao"] ?? "").trim();
      const produto = String(map["produto"] ?? map["product"] ?? "").trim();
      const categoria = String(map["categoria"] ?? map["category"] ?? "").trim();
      const regiao = String(map["regiao"] ?? map["region"] ?? "").trim();
      
      const quantidadeVal = map["quantidade"] ?? map["qtd"] ?? map["quantity"];
      const quantidade = Number(quantidadeVal ?? 0);
      
      const precoUnitarioVal = map["precounitario"] ?? map["preco_unitario"] ?? map["precunitario"] ?? map["price"];
      const preco_unitario = precoUnitarioVal !== undefined && precoUnitarioVal !== null && precoUnitarioVal !== "" 
        ? Number(String(precoUnitarioVal).replace(",", ".")) 
        : null;
      
      const receitaTotalVal = map["receitatotal"] ?? map["receita_total"] ?? map["revenue"];
      const receita_total = receitaTotalVal !== undefined && receitaTotalVal !== null && receitaTotalVal !== "" 
        ? Number(String(receitaTotalVal).replace(",", ".")) 
        : null;

      // Validação mínima: produto e quantidade são obrigatórios
      if (!produto || !Number.isFinite(quantidade) || quantidade < 0) {
        console.warn(`⚠️ Linha ${i+1} ignorada: produto="${produto}", quantidade=${quantidade}`);
        continue;
      }

      produtosUnicos.add(produto);
      totalQuantidade += quantidade;
      if (receita_total) totalReceita += receita_total;

      rows.push({ 
        produto, 
        quantidade: Number(quantidade), 
        valor: preco_unitario, // compatibilidade com coluna antiga
        mes, 
        ano,
        data,
        id_transacao,
        categoria,
        regiao,
        preco_unitario,
        receita_total
      });
    } catch (err) {
      console.error(`❌ Erro ao processar linha ${i+1}:`, raw[i], err);
      warnings.push(`Erro na linha ${i+1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const sample = rows.slice(0, 5);

  if (rows.length === 0) {
    warnings.push("Nenhuma linha válida encontrada. Verifique colunas: Produto, Quantidade");
  }

  console.log(`📊 Planilha ${mes}-${ano}:`, {
    total_registros: rows.length,
    produtos_unicos: Array.from(produtosUnicos),
    total_quantidade: totalQuantidade,
    total_receita: totalReceita.toFixed(2)
  });

  console.log("✅ Parsing concluído com sucesso");
  
  return {
    rows,
    read: raw.length,
    sample,
    warnings,
  };
  } catch (error) {
    console.error("❌ ERRO CRÍTICO no parseSpreadsheet:", error);
    console.error("Stack trace:", error instanceof Error ? error.stack : String(error));
    throw new Error(`Falha ao processar planilha "${filename}": ${error instanceof Error ? error.message : String(error)}`);
  }
}