import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Mensagem não encontrada no corpo da requisição." }),
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada." }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(message);
    const response = result.response.text();

    return new Response(JSON.stringify({ response }), { status: 200 });
  } catch (error: any) {
    console.error("Erro na API:", error);
    return new Response(JSON.stringify({ error: "Falha ao processar a mensagem." }), { status: 500 });
  }
}
