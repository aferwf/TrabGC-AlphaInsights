import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

app.post("/api/chat-analysis", async (req, res) => {
  try {
    const { message, data } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `
Você é um assistente de análise de vendas. 
Analise os dados abaixo e responda de forma útil.

Mensagem do usuário: "${message}"
Dados das planilhas: ${JSON.stringify(data)}
    `;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    res.json({ response });
  } catch (error) {
    console.error("Erro na API:", error);
    res.status(500).json({ error: "Erro ao processar a solicitação." });
  }
});

app.listen(3001, () => console.log("🚀 Servidor API rodando na porta 3001"));
