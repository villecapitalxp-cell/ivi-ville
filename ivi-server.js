// ============================================================
//  IVI – Servidor Webhook para integração Wizo + Claude API
//  Ville Capital | Agente de Atendimento a Assessores
// ============================================================
// DEPLOY GRATUITO RECOMENDADO: https://railway.app
// Variáveis de ambiente necessárias:
//   ANTHROPIC_API_KEY = sua chave da API Anthropic
//   PORT = 3000 (Railway define automaticamente)
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// ── System Prompt da IVI ──────────────────────────────────
const IVI_SYSTEM_PROMPT = `
Você é a IVI (Inteligência Virtual de Atendimento) da Ville Capital.
Atende exclusivamente assessores de investimentos da Ville Capital.

## IDENTIDADE
- Nome: IVI
- Empresa: Ville Capital
- Tom: Cordial, profissional e resolutiva
- Idioma: Português brasileiro

## FONTES DE CONHECIMENTO OFICIAIS

### 1. Manual do Assessor Ville Capital
URL: https://gamma.app/docs/Manual-do-Assessor-de-Investimentos-Ville-Capital-btmllczo6e7wkeg?mode=doc
Temas cobertos: Abertura de contas, Menor de idade, Acesso a sistemas, Processos internos
REGRA: NUNCA diga "consulte o manual". Traga a resposta completa baseada nele.

### 2. Documentos para Abertura de PJ
Pasta: https://agenteinvest-my.sharepoint.com/:f:/g/personal/ricardo_301178_agenteinvest_com_br/EuweN_yUBbVBhTCjc2kapXkBBitL8XVstkeCLHqgsYEQPA?e=WN1q6a
Documentos padrão PJ: Contrato Social, Cartão CNPJ, Comprovante de endereço da empresa, CPF/RG dos sócios
REGRA: Após listar os documentos, sempre finalizar com:
"Clique aqui para ver o PDF completo com os documentos exigidos para esse tipo de empresa: [link da pasta acima]"

### 3. Fichas e Formulários (KYC, Suitability)
Pasta: https://agenteinvest-my.sharepoint.com/:f:/g/personal/ricardo_301178_agenteinvest_com_br/IgDsHjf8lAW1QYUwo3NpGqV5AQYrS_F1bLZHgix6oLGBEDw?e=lV1gNa
REGRA: Envie o link direto ou mencione o arquivo quando solicitado.

## CASOS ESPECIAIS

### Abertura de Conta – Menor de Idade
Documentos do RESPONSÁVEL LEGAL: RG ou CNH + CPF
Documentos do MENOR: Certidão de Nascimento ou RG/CPF
Regra obrigatória: O responsável legal DEVE estar presente na abertura.

### Suporte Operacional (e-mail direto)
E-mail: operacional@villecapital.com.br

## REGRAS DE COMPORTAMENTO
1. Sempre responda de forma COMPLETA — nunca aponte só para fontes
2. NUNCA diga "consulte o manual" ou "acesse o link"
3. Finalize TODA resposta com: "Posso te ajudar com mais alguma coisa? 😊"
4. Se receber ÁUDIO: transcreva e interprete como texto normal
5. Seja breve e direto quando a pergunta for simples

## QUANDO TRANSFERIR PARA HUMANO
Transfira IMEDIATAMENTE se:
- O assessor pedir explicitamente ("falar com atendente", "humano", "pessoa real")
- A pergunta não tiver resposta clara na base de conhecimento
- O caso exigir validação manual ou exceção de processo

### PROTOCOLO DE TRANSFERÊNCIA
Quando for transferir, responda EXATAMENTE assim (sem alterar):
"Tudo certo! Estou transferindo seu atendimento para um de nossos especialistas humanos. Em instantes, alguém do time Ville Suporte continuará com você com toda a atenção e cordialidade. 😊
##TRANSFERIR_HUMANO##"

A tag ##TRANSFERIR_HUMANO## ao final é obrigatória para acionar o sistema de transferência.
`;

// ── Armazenamento de histórico em memória ────────────────
// Para produção: substitua por Redis ou banco de dados
const conversations = {};
const MAX_HISTORY = 20; // máximo de mensagens por conversa

// ── Endpoint principal ────────────────────────────────────
app.post('/webhook/ivi', async (req, res) => {
  try {
    const {
      message,
      contactId,
      firstName = 'Assessor',
      phoneNumber,
      lastMessage
    } = req.body;

    const userMessage = message || lastMessage;

    if (!userMessage || !contactId) {
      return res.status(400).json({ error: 'message e contactId são obrigatórios' });
    }

    // Inicializa histórico do contato
    if (!conversations[contactId]) {
      conversations[contactId] = [];
    }

    // Adiciona mensagem do usuário ao histórico
    conversations[contactId].push({
      role: 'user',
      content: `[Assessor: ${firstName}]\n${userMessage}`
    });

    // Limita histórico para não exceder contexto
    if (conversations[contactId].length > MAX_HISTORY) {
      conversations[contactId] = conversations[contactId].slice(-MAX_HISTORY);
    }

    // ── Chama a API do Claude ─────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: IVI_SYSTEM_PROMPT,
        messages: conversations[contactId]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Erro na API Claude:', err);
      return res.status(500).json({ error: 'Erro ao contatar IA', details: err });
    }

    const data = await response.json();
    const fullReply = data.content[0].text;

    // ── Detecta se deve transferir ────────────────────────
    const shouldTransfer = fullReply.includes('##TRANSFERIR_HUMANO##');
    const cleanReply = fullReply.replace('##TRANSFERIR_HUMANO##', '').trim();

    // Salva resposta no histórico
    conversations[contactId].push({
      role: 'assistant',
      content: cleanReply
    });

    // ── Retorno para o Wizo ───────────────────────────────
    return res.json({
      reply: cleanReply,
      action: shouldTransfer ? 'transfer' : 'respond',
      contactId
    });

  } catch (error) {
    console.error('Erro no servidor IVI:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      reply: 'Desculpe, tive um problema técnico. Por favor, tente novamente ou fale com nossa equipe em operacional@villecapital.com.br'
    });
  }
});

// ── Limpa históricos antigos a cada 2 horas ───────────────
setInterval(() => {
  const keys = Object.keys(conversations);
  if (keys.length > 500) {
    // Remove os 100 mais antigos
    keys.slice(0, 100).forEach(k => delete conversations[k]);
    console.log('Histórico limpo – conversas ativas:', Object.keys(conversations).length);
  }
}, 2 * 60 * 60 * 1000);

// ── Healthcheck ───────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'IVI online ✅', version: '1.0.0' }));

app.listen(PORT, () => {
  console.log(`\n✅ IVI Server rodando na porta ${PORT}`);
  console.log(`🔗 Endpoint: POST /webhook/ivi`);
  console.log(`🔑 API Key configurada: ${ANTHROPIC_API_KEY ? 'SIM' : 'NÃO ❌'}\n`);
});
