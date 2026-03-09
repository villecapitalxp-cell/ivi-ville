// ============================================================
//  IVI – Servidor Webhook para integração Wizo + Groq API
//  Ville Capital | Agente de Atendimento a Assessores
// ============================================================
// Variáveis de ambiente:
//   GROQ_API_KEY = chave Groq (grátis em console.groq.com)
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;
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
  res.json({ status: 'IVI online ✅', version: '2.0.0', model: 'llama-3.3-70b-versatile', apiKey: GROQ_API_KEY ? 'SIM' : 'NÃO' });
});

app.post('/webhook/ivi', async (req, res) => {
  try {
    const { message, lastMessage, contactId, firstName } = req.body;
    const userMessage = message || lastMessage || 'Olá';
    const safeContactId = contactId || 'teste';

    if (!conversations[safeContactId]) conversations[safeContactId] = [];

    conversations[safeContactId].push({ role: 'user', content: userMessage });

    if (conversations[safeContactId].length > 20) {
      conversations[safeContactId] = conversations[safeContactId].slice(-20);
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: IVI_SYSTEM_PROMPT },
          ...conversations[safeContactId]
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro Groq:', JSON.stringify(data));
      return res.status(500).json({ reply: 'Problema técnico. Tente novamente.', action: 'none' });
    }

    const assistantText = data.choices?.[0]?.message?.content || 'Não consegui processar.';
    conversations[safeContactId].push({ role: 'assistant', content: assistantText });

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
  console.log(`🔑 Groq API Key: ${GROQ_API_KEY ? 'SIM' : 'NÃO CONFIGURADA'}`);
});
