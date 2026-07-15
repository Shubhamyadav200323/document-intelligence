import { useState, useRef, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const C = {
  bg: '#0f0f13',
  panel: '#1a1a24',
  border: '#2a2a3a',
  accent: '#7c3aed',
  accentLight: '#8b5cf6',
  text: '#e2e8f0',
  muted: '#64748b',
  up: '#10b981',
  down: '#ef4444',
  warn: '#f59e0b',
  user: '#1e3a5f',
  ai: '#1a1a24'
}

function FileUpload({ onUpload, loading }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFile = (file) => {
    if (!file) return
    const allowed = ['.pdf', '.docx', '.txt']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      alert('Only PDF, DOCX, and TXT files are supported')
      return
    }
    onUpload(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? C.accentLight : C.border}`,
        borderRadius: 16,
        padding: '48px 24px',
        textAlign: 'center',
        cursor: loading ? 'not-allowed' : 'pointer',
        background: dragging ? 'rgba(124,58,237,0.05)' : 'transparent',
        transition: 'all 0.2s',
        opacity: loading ? 0.6 : 1
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}
        disabled={loading}
      />
      <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
      <div style={{ color: C.text, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        {loading ? 'Processing document...' : 'Upload your document'}
      </div>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>
        Drag & drop or click to browse
      </div>
      <div style={{ color: C.muted, fontSize: 12 }}>
        Supports PDF, DOCX, TXT
      </div>
      {loading && (
        <div style={{ marginTop: 24 }}>
          <div style={{ width: '60%', margin: '0 auto', height: 4, background: C.border, borderRadius: 2 }}>
            <div style={{ width: '60%', height: '100%', background: C.accent, borderRadius: 2, animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Extracting text and creating embeddings...</div>
        </div>
      )}
    </div>
  )
}

function SourceCard({ source }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        background: 'rgba(124,58,237,0.08)',
        border: `1px solid rgba(124,58,237,0.3)`,
        borderRadius: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        marginBottom: 6,
        fontSize: 12
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: C.accentLight, fontWeight: 500 }}>📌 {source.source}</span>
        <span style={{ color: C.up, fontSize: 11 }}>{source.relevance}% match</span>
      </div>
      {expanded && (
        <div style={{ color: C.muted, marginTop: 6, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          {source.text.substring(0, 300)}{source.text.length > 300 ? '...' : ''}
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 12, marginBottom: 20 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: isUser ? C.accent : '#1e3a5f',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16
      }}>
        {isUser ? '👤' : '🤖'}
      </div>
      <div style={{ maxWidth: '75%' }}>
        <div style={{
          background: isUser ? C.accent : C.panel,
          border: `1px solid ${isUser ? C.accent : C.border}`,
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          padding: '12px 16px',
          color: C.text,
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap'
        }}>
          {msg.content}
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Sources (click to expand):</div>
            {msg.sources.map((s, i) => <SourceCard key={i} source={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [docInfo, setDocInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [askLoading, setAskLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleUpload = async (file) => {
    setUploadLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')

      setSessionId(data.session_id)
      setDocInfo({
        filename: data.filename,
        chunks: data.chunks_processed,
        summary: data.summary
      })

      setMessages([{
        role: 'ai',
        content: `✅ Document uploaded successfully!\n\n**${data.filename}**\n${data.chunks_processed} sections processed\n\n**Summary:**\n${data.summary}\n\nAsk me anything about this document!`
      }])
    } catch (e) {
      setError(e.message)
    } finally {
      setUploadLoading(false)
    }
  }

  const handleAsk = async () => {
    if (!input.trim() || !sessionId || askLoading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setAskLoading(true)

    try {
      const res = await fetch(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, question })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to get answer')

      setMessages(prev => [...prev, {
        role: 'ai',
        content: data.answer,
        sources: data.sources
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `❌ Error: ${e.message}`
      }])
    } finally {
      setAskLoading(false)
    }
  }

  const handleReset = async () => {
    if (sessionId) {
      try {
        await fetch(`${API}/session/${sessionId}`, { method: 'DELETE' })
      } catch (_) {}
    }
    setSessionId(null)
    setDocInfo(null)
    setMessages([])
    setInput('')
    setError(null)
  }

  const suggestedQuestions = [
    'Summarize the main points',
    'What are the key findings?',
    'What conclusions are drawn?',
    'List all important dates mentioned',
    'What are the recommendations?'
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column'
    }}>

      {/* Header */}
      <div style={{
        background: C.panel,
        borderBottom: `1px solid ${C.border}`,
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 24 }}>🧠</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: C.accentLight }}>DocuMind</div>
            <div style={{ fontSize: 11, color: C.muted }}>AI Document Intelligence</div>
          </div>
        </div>
        {docInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>📄 {docInfo.filename}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{docInfo.chunks} sections indexed</div>
            </div>
            <button
              onClick={handleReset}
              style={{
                background: 'transparent',
                color: C.down,
                border: `1px solid ${C.down}`,
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12
              }}
            >
              New Document
            </button>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {!sessionId ? (
          /* Upload Screen */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}>
            <div style={{ width: '100%', maxWidth: 560 }}>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🧠</div>
                <h1 style={{ fontSize: 32, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>
                  Chat with your documents
                </h1>
                <p style={{ color: C.muted, fontSize: 16, margin: 0 }}>
                  Upload any PDF, Word, or text file and ask questions in plain English
                </p>
              </div>

              <FileUpload onUpload={handleUpload} loading={uploadLoading} />

              {error && (
                <div style={{
                  marginTop: 16,
                  background: 'rgba(239,68,68,0.1)',
                  border: `1px solid ${C.down}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: C.down,
                  fontSize: 13
                }}>
                  ❌ {error}
                </div>
              )}

              {/* Features */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12,
                marginTop: 32
              }}>
                {[
                  { icon: '⚡', title: 'Instant answers', desc: 'Get answers in seconds' },
                  { icon: '📌', title: 'Source citations', desc: 'Know where info comes from' },
                  { icon: '🔒', title: 'Private', desc: 'Your docs stay local' }
                ].map((f, i) => (
                  <div key={i} style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '14px 12px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Chat Screen */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {askLoading && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: '#1e3a5f',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>🤖</div>
                  <div style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px 16px 16px 16px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <div style={{ color: C.muted, fontSize: 14 }}>Thinking</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: C.accentLight,
                          animation: `bounce 1s ${i * 0.2}s infinite`
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Questions */}
            {messages.length === 1 && (
              <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); }}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${C.border}`,
                      borderRadius: 20,
                      padding: '6px 12px',
                      color: C.muted,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      transition: 'all 0.2s'
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${C.border}`,
              background: C.panel,
              display: 'flex',
              gap: 12
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                placeholder="Ask anything about your document..."
                style={{
                  flex: 1,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
              <button
                onClick={handleAsk}
                disabled={!input.trim() || askLoading}
                style={{
                  background: input.trim() && !askLoading ? C.accent : C.border,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 20px',
                  cursor: input.trim() && !askLoading ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                {askLoading ? '...' : 'Ask →'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
      `}</style>
    </div>
  )
}
