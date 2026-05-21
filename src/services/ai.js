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

  const knowledge = db.prepare(
    'SELECT title, content FROM knowledge ORDER BY updated_at DESC'
  ).all();

  const history = db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(sessionId).reverse();

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
  const hasRealKey = CLAUDE_API_KEY.startsWith('sk-ant-');

  if (hasRealKey) {
    return callClaude(CLAUDE_API_KEY, knowledge, history, userMessage);
  }

  // IA própria — usa base de conhecimento + regras técnicas
  return Promise.resolve(localAI(userMessage, knowledge, history));
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

// ============================================================
// IA LOCAL — responde com base no conhecimento cadastrado
// ============================================================
function localAI(message, knowledge, history) {
  const low = message.toLowerCase();

  // 1. Busca na base de conhecimento por termos relevantes
  const relevantItems = searchKnowledge(low, knowledge);
  if (relevantItems.length > 0) {
    return buildKnowledgeResponse(message, relevantItems);
  }

  // 2. Respostas técnicas embutidas para impressoras
  if (/damper/.test(low)) {
    return `**Problema de Damper — diagnóstico:**

1. **Damper vertical** → melhor quando a máquina roda com tanque de tinta **acima do nível** do cabeçote
2. **Damper de bolsa** → melhor quando o nível de tinta está **abaixo** do cabeçote

**Sintomas de damper com problema:**
- Linha branca intermitente em cores específicas
- Variação de densidade ao longo da impressão
- Nozzle check com falhas em canal único

**Checklist de verificação:**
1. Inspecionar visualmente — bolhas de ar no damper?
2. Verificar se há tinta ressequida na entrada
3. Testar pressão manual do damper
4. Substituir se houver deformação ou vazamento

Me diz o modelo da impressora para detalhar mais.`;
  }

  if (/nozzle|bico|falha|linha branca|banding/.test(low)) {
    return `**Diagnóstico de falha de nozzle:**

**Perguntas para identificar a causa:**
1. A falha é **contínua** ou **intermitente** no test bar?
2. Afeta uma cor só ou várias?
3. A máquina ficou parada por quanto tempo?

**Procedimento padrão:**
1. Rodar nozzle check e fotografar
2. Limpeza automática (1-2 ciclos)
3. Se persistir → limpeza manual com kit e bastão
4. Verificar damper da cor afetada
5. Verificar temperatura da cabeça (fora da faixa = falha física)

Qual modelo e marca da impressora?`;
  }

  if (/converter|conversão|solvente|sublimática|uv|tinta/.test(low)) {
    return `**Conversão de tinta — checklist inicial:**

1. Modelo e marca da impressora
2. Tinta atual (fabricante + código)
3. Tinta de destino
4. Idade e condição dos cabeçotes
5. Última manutenção realizada

**Atenção:** conversões mal planejadas podem danificar cabeçotes permanentemente. Me passe os dados acima para montar o procedimento correto.`;
  }

  if (/setup|instala|primeira|nova máquina|comec/.test(low)) {
    return `**Setup de máquina nova — sequência:**

1. Verificação física (transporte, embalagem)
2. Posicionamento e nivelamento
3. Energização e teste elétrico
4. Carga de tinta (purgação completa)
5. Nozzle check inicial
6. Calibração de cabeçotes (alinhamento bidirecional)
7. Calibração de avanço de mídia
8. Impressão de teste em mídia definitiva

Qual o modelo? Posso detalhar cada etapa.`;
  }

  if (/voltagem|waveform|volt|tensão/.test(low)) {
    return `**Voltagem de cabeçotes — referência:**

| Cabeçote | Faixa típica |
|----------|-------------|
| Epson DX5 | 22–28V |
| Epson DX7 | 30–36V |
| Epson i3200 | 26–32V |
| Ricoh Gen5 | 28–34V |
| Konica KM512 | 32–38V |

Informe o cabeçote e tipo de tinta para refinar o valor exato.`;
  }

  if (/cabeçote|cabeça|printhead/.test(low)) {
    return `**Diagnóstico de cabeçote:**

**Sintomas que indicam problema no cabeçote:**
- Falhas mesmo após limpeza intensiva
- Nozzle check com mais de 30% de bicos entupidos
- Derramamento de tinta (selagem danificada)
- Erro de temperatura persistente

**Antes de concluir que o cabeçote está morto:**
1. Verificar dampers e tubulação
2. Testar com flush de limpeza profunda
3. Verificar voltagem e waveform
4. Checar temperatura ambiente (abaixo de 18°C = cristalização)

Descreva os sintomas exatos para diagnóstico mais preciso.`;
  }

  if (/manutenção|limpeza|preventiva/.test(low)) {
    return `**Manutenção preventiva — rotina recomendada:**

**Diária:**
- Nozzle check antes de iniciar produção
- Limpeza da estação de serviço
- Verificar nível de tinta

**Semanal:**
- Limpeza dos trilhos e carro de impressão
- Verificar tensão da correia
- Inspecionar tampões e limpador

**Mensal:**
- Limpeza profunda do sistema de tinta
- Verificar e lubrificar partes móveis
- Checar encoders e sensores

Qual modelo para detalhar a rotina específica?`;
  }

  // 3. Resposta genérica útil (sem mencionar API)
  const contextHint = knowledge.length > 0
    ? `Tenho **${knowledge.length} item(s)** na base de conhecimento disponíveis para consulta.`
    : `A base de conhecimento ainda está vazia. Use o painel **"Conhecimento"** no topo para adicionar informações técnicas, ou digite **"aprender: [informação]"** no chat.`;

  return `Entendido! Para te ajudar melhor, me conte mais detalhes:

- Qual é o **modelo e marca** da impressora?
- Qual é o **sintoma exato** que está observando?
- Quando começou o problema?

${contextHint}`;
}

// Busca itens relevantes na base de conhecimento
function searchKnowledge(query, knowledge) {
  if (!knowledge.length) return [];

  const words = query
    .replace(/[^\w\sáéíóúãõâêîôûàèìòùç]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  if (!words.length) return [];

  return knowledge
    .map(item => {
      const text = (item.title + ' ' + item.content).toLowerCase();
      const score = words.reduce((acc, w) => {
        const count = (text.match(new RegExp(w, 'g')) || []).length;
        return acc + count;
      }, 0);
      return { ...item, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildKnowledgeResponse(message, items) {
  if (items.length === 1) {
    const item = items[0];
    return `**${item.title}**\n\n${item.content}`;
  }

  const sections = items.map(item =>
    `**${item.title}**\n${item.content.slice(0, 400)}${item.content.length > 400 ? '…' : ''}`
  ).join('\n\n---\n\n');

  return `Encontrei ${items.length} informações relevantes na base de conhecimento:\n\n${sections}`;
}

module.exports = { getAIResponse };
