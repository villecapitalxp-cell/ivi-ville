// ============================================================
//  IVI – Servidor Webhook para integração Wizo + Gemini API
//  Ville Capital | Agente de Atendimento a Assessores
// ============================================================
// Variáveis de ambiente:
//   GEMINI_API_KEY = chave Google Gemini (grátis em aistudio.google.com)
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

const IVI_SYSTEM_PROMPT = `Você é a IVI (Inteligência Virtual de Atendimento) da Ville Capital.
Atende exclusivamente assessores de investimentos da Ville Capital.

IDENTIDADE: Nome IVI, tom cordial e profissional, português brasileiro.

CONHECIMENTO:
- Manual do Assessor: https://gamma.app/docs/Manual-do-Assessor-de-Investimentos-Ville-Capital-btmllczo6e7wkeg?mode=doc
- Docs PJ: Contrato Social, Cartão CNPJ, Comprovante de endereço, CPF/RG dos sócios
- Link pasta PJ: https://agenteinvest-my.sharepoint.com/:f:/g/personal/ricardo_301178_agenteinvest_com_br/EuweN_yUBbVBhTCjc2kapXkBBitL8XVstkeCLHqgsYEQPA?e=WN1q6a
- Fichas KYC/Suitability: https://agenteinvest-my.sharepoint.com/:f:/g/personal/ricardo_301178_agenteinvest_com_br/IgDsHjf8lAW1QYUwo3NpGqV5AQYrS_F1bLZHgix6oLGBEDw?e=lV1gNa
- Menor de idade: responsável (RG/CNH+CPF) + menor (certidão ou RG/CPF). Responsável presente obrigatório.
- Suporte: operacional@villecapital.com.br

REGRAS:
1. NUNCA diga "consulte o manual" - dê a resposta completa
2. Finalize sempre com: "Posso te ajudar com mais alguma coisa? 😊"
3. Para transferir para humano use exatamente: ##TRANSFERIR_HUMANO##`;

const conversations = {};

app.get('/health', (req, res) => {
  res.json({ status: 'IVI online ✅', version: '2.0.0', model: 'gemini-1.5-flash', apiKey: GEMINI_API_KEY ? 'SIM' : 'NÃO' });
});

app.post('/webhook/ivi', async (req, res) => {
  try {
    const { message, lastMessage, contactId, firstName } = req.body;
    const userMessage = message || lastMessage || 'Olá';
    const safeContactId = contactId || 'teste';

    if (!conversations[safeContactId]) conversations[safeContactId] = [];

    conversations[safeContactId].push({ role: 'user', parts: [{ text: userMessage }] });

    if (conversations[safeContactId].length > 20) {
      conversations[safeContactId] = conversations[safeContactId].slice(-20);
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: IVI_SYSTEM_PROMPT }] },
        contents: conversations[safeContactId],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Gemini:', JSON.stringify(data));
      return res.status(500).json({ reply: 'Problema técnico. Tente novamente.', action: 'none' });
    }

    const assistantText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Não consegui processar.';
    conversations[safeContactId].push({ role: 'model', parts: [{ text: assistantText }] });

    const shouldTransfer = assistantText.includes('##TRANSFERIR_HUMANO##');
    const cleanReply = assistantText.replace('##TRANSFERIR_HUMANO##', '').trim();

    console.log(`[OK] ${safeContactId}: ${userMessage.substring(0, 50)}`);

    res.json({ reply: cleanReply, action: shouldTransfer ? 'transfer' : 'none' });

  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ reply: 'Problema técnico. Tente novamente.', action: 'none' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ IVI Server rodando na porta ${PORT}`);
  console.log(`🔑 Gemini API Key: ${GEMINI_API_KEY ? 'SIM' : 'NÃO CONFIGURADA'}`);
});
