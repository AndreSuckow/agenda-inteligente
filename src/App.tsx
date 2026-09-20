import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

type ViewMode = 'day' | 'week' | 'month'
type Message = { id: number; role: 'assistant' | 'user'; text: string; time: string }
type EventItem = { id: number; title: string; date: string; time: string; color: 'coral' | 'teal' | 'yellow' }

const initialEvents: EventItem[] = [
  { id: 1, title: 'Revisar proposta do projeto', date: '2026-09-20', time: '09:00', color: 'coral' },
  { id: 2, title: 'Almoço com a Marina', date: '2026-09-20', time: '12:30', color: 'teal' },
  { id: 3, title: 'Dentista', date: '2026-09-22', time: '15:00', color: 'yellow' },
]

const initialMessages: Message[] = [
  { id: 1, role: 'assistant', text: 'Bom dia, Andre. O que vamos organizar hoje?', time: '09:41' },
  { id: 2, role: 'user', text: 'Tenho uma consulta com o dentista.', time: '09:42' },
  { id: 3, role: 'assistant', text: 'Claro. Em que dia e horário devo marcar?', time: '09:42' },
]

const today = new Date(2026, 8, 20)
const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

function formatDate(date: Date) { return date.toISOString().slice(0, 10) }

function App() {
  const [view, setView] = useState<ViewMode>('week')
  const [selectedDate, setSelectedDate] = useState(today)
  const [events, setEvents] = useState<EventItem[]>(() => { const saved = localStorage.getItem('agenda-events'); return saved ? JSON.parse(saved) : initialEvents })
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [keyword, setKeyword] = useState('Oi, Agenda')
  const [keywordEnabled, setKeywordEnabled] = useState(false)
  const [voiceFile, setVoiceFile] = useState('')
  const [activePanel, setActivePanel] = useState<'none' | 'voice' | 'settings'>('none')
  const [notice, setNotice] = useState('')
  const recognitionRef = useRef<{ start: () => void; stop: () => void; onresult: ((event: any) => void) | null; onend: (() => void) | null } | null>(null)

  useEffect(() => localStorage.setItem('agenda-events', JSON.stringify(events)), [events])

  const calendarDays = useMemo(() => {
    const start = new Date(selectedDate); start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day })
  }, [selectedDate])

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'pt-BR'
    utterance.onstart = () => setIsSpeaking(true); utterance.onend = () => setIsSpeaking(false); window.speechSynthesis.speak(utterance)
  }

  const sendMessage = (text = draft) => {
    const cleanText = text.trim(); if (!cleanText) return
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const nextMessages: Message[] = [...messages, { id: Date.now(), role: 'user', text: cleanText, time: now }]
    let response = 'Entendi. Qual dia e horário devo considerar?'
    if (/terça|22|dentista/i.test(cleanText)) response = 'Posso marcar Dentista na terça-feira, 22 de setembro, às 15:00. Confirma?'
    if (/confirma|confirmo|sim|pode marcar/i.test(cleanText)) {
      const alreadyExists = events.some((item) => item.title === 'Dentista' && item.date === '2026-09-22' && item.time === '15:00')
      if (alreadyExists) response = 'Esse compromisso já está na sua agenda. Não criei uma duplicata.'
      else { setEvents((current) => [...current, { id: Date.now(), title: 'Dentista', date: '2026-09-22', time: '15:00', color: 'yellow' }]); response = 'Pronto. Dentista foi adicionado à sua agenda.' }
    }
    const assistantMessage = { id: Date.now() + 1, role: 'assistant' as const, text: response, time: now }
    setMessages([...nextMessages, assistantMessage]); setDraft(''); if (isListening) speak(response)
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setNotice('O reconhecimento de voz não está disponível neste navegador. Você pode continuar por texto.'); return }
    const recognition = new SpeechRecognition(); recognition.lang = 'pt-BR'; recognition.continuous = false; recognition.interimResults = false
    recognition.onresult = (event: any) => { const transcript = event.results[0][0].transcript; setDraft(transcript); sendMessage(transcript) }
    recognition.onend = () => setIsListening(false); recognitionRef.current = recognition; recognition.start(); setIsListening(true); setNotice('Estou ouvindo. Fale naturalmente.')
  }

  const toggleKeyword = () => {
    if (keywordEnabled) { recognitionRef.current?.stop(); setKeywordEnabled(false); setNotice('Palavra de comando pausada.'); return }
    startListening(); setKeywordEnabled(true); setNotice(`Palavra “${keyword}” ativa enquanto esta página estiver aberta.`)
  }

  const handleVoiceUpload = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setVoiceFile(file.name); setNotice('A amostra foi anexada. A clonagem real precisa ser processada por um provedor TTS com consentimento.') }
  const addEvent = () => { const title = window.prompt('Nome do compromisso'); if (!title?.trim()) return; setEvents((current) => [...current, { id: Date.now(), title: title.trim(), date: formatDate(selectedDate), time: '10:00', color: 'coral' }]) }
  const submitMessage = (event: FormEvent) => { event.preventDefault(); sendMessage() }

  return (
    <div className="app-shell">
      <aside className="sidebar"><div className="brand"><span className="brand-mark">a</span><span>agenda<span className="brand-accent">.</span></span></div><nav aria-label="Navegação principal"><button className="nav-item active"><span>▦</span> Minha agenda</button><button className="nav-item" onClick={() => setActivePanel('settings')}><span>◌</span> Histórico</button><button className="nav-item" onClick={() => setActivePanel('voice')}><span>◒</span> Voz e comando</button></nav><div className="sidebar-bottom"><button className="nav-item" onClick={() => setActivePanel('settings')}><span>⚙</span> Configurações</button><div className="profile"><div className="avatar">AS</div><div><strong>Andre S.</strong><small>Conta pessoal</small></div><span>•••</span></div></div></aside>
      <main className="main-content"><header className="topbar"><div><span className="eyebrow">SÁBADO, 20 DE SETEMBRO</span><h1>Olá, Andre <span className="wave">✦</span></h1></div><div className="top-actions"><button className="icon-button" aria-label="Buscar">⌕</button><button className="notification" aria-label="Notificações">♢<i /></button><div className="avatar">AS</div></div></header><div className="content-grid"><section className="calendar-section"><div className="section-heading"><div><h2>Minha semana</h2><p>Uma visão clara do que vem pela frente.</p></div><button className="primary-button" onClick={addEvent}>＋ Adicionar</button></div><div className="calendar-toolbar"><button className="month-button" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}>‹</button><strong>{monthNames[selectedDate.getMonth()]} <span>{selectedDate.getFullYear()}</span></strong><button className="month-button" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}>›</button><div className="view-switcher">{(['day', 'week', 'month'] as ViewMode[]).map((item) => <button key={item} className={view === item ? 'selected' : ''} onClick={() => setView(item)}>{item === 'day' ? 'Dia' : item === 'week' ? 'Semana' : 'Mês'}</button>)}</div></div><div className="week-strip">{calendarDays.map((day) => <button key={day.toISOString()} className={`day-cell ${formatDate(day) === formatDate(selectedDate) ? 'today' : ''}`} onClick={() => setSelectedDate(day)}><span>{weekDays[day.getDay()]}</span><strong>{day.getDate()}</strong><i>{events.filter((item) => item.date === formatDate(day)).length || ''}</i></button>)}</div><div className={`schedule ${view}`}><div className="schedule-head"><span>HORÁRIO</span><span>ATIVIDADES DO DIA</span><span>STATUS</span></div>{['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((hour) => { const item = events.find((event) => event.date === formatDate(selectedDate) && event.time === hour); return <div className="schedule-row" key={hour}><span className="hour">{hour}</span><div className="activity-slot">{item && <div className={`event-card ${item.color}`}><span className="event-dot" /><strong>{item.title}</strong><small>{item.time} · 45 min</small></div>}</div><span className="status">{item ? '● Confirmado' : ''}</span></div> })}</div><div className="calendar-footer"><span><i className="legend-dot coral" /> Compromissos</span><span><i className="legend-dot teal" /> Pessoal</span><span><i className="legend-dot yellow" /> Saúde</span></div></section>
      <section className="assistant-panel"><div className="assistant-header"><div><span className="assistant-kicker"><i /> ASSISTENTE ONLINE</span><h2>Organize por conversa</h2></div><button className="more-button" aria-label="Mais opções">•••</button></div><div className="chat-messages">{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? 'a' : 'AS'}</div><div><p>{message.text}</p><time>{message.time}</time></div></div>)}</div>{notice && <div className="notice">{notice}</div>}<form className="composer" onSubmit={submitMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva ou fale comigo..." aria-label="Mensagem para a agenda" /><button type="button" className={`mic-button ${isListening ? 'listening' : ''}`} onClick={isListening ? () => recognitionRef.current?.stop() : startListening} aria-label="Falar com o assistente">{isListening ? '■' : '♩'}</button><button type="submit" className="send-button" aria-label="Enviar mensagem">↑</button></form><div className="assistant-tools"><button onClick={toggleKeyword}><span>⌁</span> {keywordEnabled ? 'Pausar palavra' : 'Adicionar palavra de comando'}</button><button onClick={() => setActivePanel('voice')}><span>◉</span> Personalizar voz</button></div>{isSpeaking && <button className="stop-speaking" onClick={() => window.speechSynthesis.cancel()}>Parar áudio</button>}</section></div></main>
      {activePanel !== 'none' && <div className="panel-overlay" onClick={() => setActivePanel('none')}><section className="settings-panel" onClick={(event) => event.stopPropagation()}><button className="close-panel" onClick={() => setActivePanel('none')} aria-label="Fechar">×</button>{activePanel === 'voice' ? <><span className="eyebrow">PERSONALIZAÇÃO</span><h2>Sua voz, do seu jeito</h2><p className="panel-lead">Adicione uma amostra da sua voz para preparar uma voz personalizada para as respostas da agenda.</p><label className="upload-box"><span>＋</span><strong>{voiceFile || 'Adicionar arquivo de áudio'}</strong><small>MP3, WAV ou M4A · até 10 MB</small><input type="file" accept="audio/*" onChange={handleVoiceUpload} /></label><label className="field-label">Palavra de comando<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Ex.: Oi, Agenda" /></label><div className="consent"><input type="checkbox" id="consent" /><label htmlFor="consent">Confirmo que tenho autorização para usar esta voz.</label></div><button className="primary-button wide" onClick={() => { setActivePanel('none'); setNotice('Preferências de voz salvas neste dispositivo.') }}>Salvar preferências</button><small className="panel-footnote">O arquivo não é enviado nesta versão local. A clonagem de voz deve usar um provedor compatível, consentimento e armazenamento seguro.</small></> : <><span className="eyebrow">CONFIGURAÇÕES</span><h2>Conexões da agenda</h2><p className="panel-lead">Mantenha seus dados sob controle e conecte serviços quando estiverem configurados.</p><div className="integration-row"><div><strong>Google Agenda</strong><small>Sincronização de eventos e conflitos</small></div><button className="outline-button" onClick={() => setNotice('A conexão OAuth do Google precisa de um Client ID e backend seguro.')}>Conectar</button></div><div className="integration-row muted"><div><strong>WhatsApp</strong><small>Disponível na versão 2</small></div><span className="coming-soon">Em breve</span></div><div className="privacy-note">⌁ Seus eventos locais ficam salvos no navegador. Para sincronizar entre dispositivos, configure autenticação e banco no backend.</div></>}</section></div>}
    </div>
  )
}

export default App
