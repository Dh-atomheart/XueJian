import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function KnowledgeQaPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { documents, aiConfig } = useAppStore()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Simulate AI response
    setTimeout(
      () => {
        const aiMsg: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: generateResponse(userMsg.content),
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, aiMsg])
        setIsLoading(false)
      },
      800 + Math.random() * 1200
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-line-soft">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-1 font-ui">AI Chat</p>
        <h1 className="text-xl font-display font-semibold">知识问答</h1>

        {/* Document selector */}
        {documents.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedDocIds([])}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap',
                selectedDocIds.length === 0
                  ? 'border-ink/30 bg-paper-muted/80'
                  : 'border-line-soft/60 text-ink-muted'
              )}
            >
              全部文档
            </button>
            {documents.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id)
              return (
                <button
                  key={doc.id}
                  onClick={() => {
                    setSelectedDocIds((prev) =>
                      isSelected ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                    )
                  }}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap',
                    isSelected
                      ? 'border-ink/30 bg-paper-muted/80'
                      : 'border-line-soft/60 text-ink-muted'
                  )}
                >
                  {isSelected && '✓ '}
                  {doc.name.replace('.pdf', '')}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-ink-muted/40 mb-4"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-ink-muted mb-2">向 AI 提问关于学习材料的问题</p>
            <p className="text-xs text-ink-muted/70">支持基于文档的上下文问答</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-ink text-paper-base rounded-br-sm'
                  : 'bg-paper-muted/60 border border-line-soft/60 rounded-bl-sm'
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-paper-muted/60 border border-line-soft/60 rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-ink-muted/40 rounded-full animate-pulse" />
                <div
                  className="w-2 h-2 bg-ink-muted/40 rounded-full animate-pulse"
                  style={{ animationDelay: '0.2s' }}
                />
                <div
                  className="w-2 h-2 bg-ink-muted/40 rounded-full animate-pulse"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-line-soft">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            rows={1}
            className="flex-1 px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'px-4 py-3 rounded-lg transition-all',
              input.trim() && !isLoading
                ? 'bg-ink text-paper-base hover:bg-ink/90'
                : 'bg-paper-muted text-ink-muted cursor-not-allowed'
            )}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {!aiConfig?.apiKey && (
          <p className="text-xs text-ink-muted/60 text-center mt-2">
            未配置 API Key，当前为模拟模式
          </p>
        )}
      </div>
    </div>
  )
}

function generateResponse(_question: string): string {
  const responses = [
    '根据你上传的学习材料，这个问题可以从以下几个方面来理解...\n\n首先，核心概念是关于知识结构化和记忆强化的。通过间隔重复（Spaced Repetition）的方法，可以有效提高长期记忆的保持率。',
    '这是一个很好的问题。基于文档中的内容，我来为你解答：\n\n关键要点在于理解概念之间的关联性。建议你重点关注以下几个方面的学习...',
    '让我帮你分析一下这个问题。\n\n从知识结构的角度来看，这涉及到几个重要的概念层次。首先需要建立基础理解，然后通过练习来巩固记忆。',
    '根据学习材料中的信息，这个主题有以下几个关键点需要掌握：\n\n1. 基础概念的理解\n2. 概念间的关联\n3. 实际应用场景\n\n建议你创建相关的知识卡片来加强记忆。',
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}
