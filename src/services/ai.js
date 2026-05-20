const { getDb } = require('../db/database');

function buildSystemPrompt(knowledgeItems) {
  const base = `Você é um assistente técnico especializado em impressoras de grande formato.
Responda sempre em português brasileiro.
Seja direto, prático e técnico. Quando der checklists, use listas numeradas.
Se não souber algo com certeza, diga claramente.`;

  if (!knowledgeItems || knowledgeItems.length === 0) return base;

  const knowledge = knowledgeItems
    .map(k => `### ${k.title}\n${k.content}`)
    .join('\n\n');

  return `${base}

---
BASE DE CONHECIMENTO TÉCNICO (use como referência prioritária):

${knowledge}
---`;
}

async function getAIResponse(sessionId, userMessage) {
  const db = getDb();

  // Load knowledge base
  const knowledge = db.prepare(
    'SELECT title, content FROM knowledge ORDER BY updated_at DESC'
  ).all();

  // Load conversation history (last 20 messages for context)
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(sessionId).reverse();

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
  const hasRealKey = CLAUDE_API_KEY.startsWith('sk-ant-');

  console.log(`[AI] key present: ${!!CLAUDE_API_KEY}, hasRealKey: ${hasRealKey}`);

  if (hasRealKey) {
    return callClaude(CLAUDE_API_KEY, knowledge, history, userMessage);
  }

  // Mock responses when no valid API key
  return Promise.resolve(mockResponse(userMessage, knowledge));
}

async function callClaude(apiKey, knowledge, history, userMessage) {
  const systemPrompt = buildSystemPrompt(knowledge);

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

function mockResponse(message, knowledge) {
  const low = message.toLowerCase();
  const hasKnowledge = knowledge.length > 0;
  const knowledgeSuffix = hasKnowledge
    ? `\n\nBase de conhecimento ativa com ${knowledge.length} item(s).`
    : '\n\n*(Modo demonstração — conecte a Claude API para respostas reais)*';

  if (/nozzle|magenta|amarelo|ciano|preto|banding/.test(low)) {
    return `Entendido — falha de nozzle. Preciso saber:\n\n1. A linha faltante é **contínua** ou **intermitente** ao longo do test bar?\n2. Apareceu de repente ou foi piorando gradualmente?\n3. Quanto tempo a máquina ficou parada?${knowledgeSuffix}`;
  }
  if (/converter|conversão|solvente|sublimática|uv/.test(low)) {
    return `Conversão é viável. Para montar o checklist preciso de:\n\n1. Modelo e marca da impressora\n2. Tinta atual (fabricante e código)\n3. Tinta de destino\n4. Idade dos cabeçotes${knowledgeSuffix}`;
  }
  if (/setup|instala|primeira|nova|comec/.test(low)) {
    return `Máquina nova — sequência de instalação:\n\n1. Verificação física\n2. Energização e nivelamento\n3. Carga de tinta\n4. Nozzle check\n5. Calibração de cabeçotes\n6. Calibração de avanço\n\nMe diz o modelo que detalho cada passo.${knowledgeSuffix}`;
  }
  if (/voltagem|waveform|dx5|dx7|epson/.test(low)) {
    return `Epson **DX5**: voltagem típica 22–28V, waveform padrão de fábrica.\nEpson **DX7**: faixa 30–36V.\n\nMe diz qual cabeça e tinta exatos para refinar o valor.${knowledgeSuffix}`;
  }

  return `Recebi sua mensagem. ${hasKnowledge ? 'Consultei a base de conhecimento técnico.' : 'Adicione conteúdo na base de conhecimento para respostas mais precisas.'}\n\nPara ativar a IA real, configure a variável \`CLAUDE_API_KEY\` no servidor.`;
}

module.exports = { getAIResponse };
