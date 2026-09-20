import http from 'node:http'

const port = Number(process.env.PORT || 8787)
const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions'
const apiKey = process.env.AI_API_KEY
const model = process.env.AI_MODEL || 'gpt-4o-mini'

const systemPrompt = `Voce e a Agenda, uma assistente pessoal em portugues do Brasil.
Sua funcao e transformar mensagens em compromissos, sem inventar data ou horario.
Responda SOMENTE JSON valido neste formato:
{
  "reply": "resposta curta para a pessoa",
  "action": "ask" | "confirm" | "create",
  "event": { "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM" } | null
}
Regras:
- Se faltar data ou horario, use action ask e pergunte somente o campo que falta.
- Quando tiver titulo, data e horario, use action confirm e mostre a data exata, sem salvar ainda.
- Use action create somente quando a ultima mensagem confirmar claramente o evento pendente.
- Nunca crie duplicata: compare com existingEvents.
- Interprete datas relativas usando referenceDate e timezone America/Sao_Paulo.
- Nao trate uma frase negativa como confirmacao.`

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
  response.end(JSON.stringify(body))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk; if (body.length > 100_000) reject(new Error('payload too large')) })
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('invalid json')) } })
    request.on('error', reject)
  })
}

async function chat(request, response) {
  if (!apiKey) return send(response, 503, { error: 'AI_API_KEY ausente', configured: false })
  const input = await readBody(request)
  const messages = Array.isArray(input.messages) ? input.messages.slice(-12) : []
  const context = JSON.stringify({ referenceDate: input.referenceDate, pendingEvent: input.pendingEvent || null, existingEvents: input.existingEvents || [] })
  const upstream = await fetch(apiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'system', content: `Contexto atual: ${context}` }, ...messages.map((message) => ({ role: message.role, content: message.text }))] }),
  })
  if (!upstream.ok) return send(response, 502, { error: `AI provider returned ${upstream.status}` })
  const result = await upstream.json()
  const content = result.choices?.[0]?.message?.content
  if (!content) return send(response, 502, { error: 'AI provider returned an empty response' })
  try { return send(response, 200, { ...JSON.parse(content), configured: true }) } catch { return send(response, 502, { error: 'AI provider returned invalid JSON' }) }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {})
  if (request.method === 'GET' && request.url === '/api/health') return send(response, 200, { ok: true, aiConfigured: Boolean(apiKey), model })
  if (request.method === 'POST' && request.url === '/api/chat') {
    try { return await chat(request, response) } catch (error) { return send(response, 500, { error: error.message }) }
  }
  return send(response, 404, { error: 'not found' })
})

server.listen(port, () => console.log(`agenda API listening on http://localhost:${port}`))
