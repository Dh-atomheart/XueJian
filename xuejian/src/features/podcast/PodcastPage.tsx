import { useState } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function PodcastPage() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<string | null>(null)
  const { documents } = useAppStore()

  const handleGenerate = () => {
    if (!selectedDocId) return
    setIsGenerating(true)
    setGeneratedScript(null)

    setTimeout(() => {
      setGeneratedScript(
        '🎙️ 欢迎来到今天的知识播客！\n\n' +
        '今天我们要探讨的话题来自你上传的学习材料。' +
        '让我们从核心概念开始...\n\n' +
        '【主持人A】：首先，我们来看看这个主题的基本框架。知识的结构化是高效学习的基础。' +
        '通过将零散的信息组织成有层次的知识网络，我们可以更好地理解和记忆。\n\n' +
        '【主持人B】：没错！这也是为什么间隔重复学习法如此有效的原因。' +
        '研究表明，定期复习可以将知识的长期保持率提高 200% 以上。\n\n' +
        '【主持人A】：接下来我们深入探讨几个具体的学习策略...'
      )
      setIsGenerating(false)
    }, 2000)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">AI Podcast</p>
        <h1 className="text-2xl font-display font-semibold mb-2">AI 播客</h1>
        <p className="text-sm text-ink-muted">将学习材料转化为对话式播客脚本</p>
      </div>

      {/* Document selection */}
      <SketchCard className="mb-6">
        <h3 className="font-medium mb-4">选择源文档</h3>
        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                  selectedDocId === doc.id ? 'border-ink/30 bg-paper-muted/50' : 'border-line-soft/60 hover:border-line-soft'
                )}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted flex-shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-ink-muted">{doc.pageCount} 页</p>
                </div>
                {selectedDocId === doc.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 flex-shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted text-center py-4">请先上传学习文档</p>
        )}
      </SketchCard>

      {/* Generate button */}
      <div className="flex justify-center mb-8">
        <SketchButton
          onClick={handleGenerate}
          disabled={!selectedDocId || isGenerating}
          className={cn(!selectedDocId && 'opacity-50 cursor-not-allowed')}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              生成中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
              生成播客脚本
            </span>
          )}
        </SketchButton>
      </div>

      {/* Generated script */}
      {generatedScript && (
        <SketchCard className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">播客脚本</h3>
            <button className="text-xs text-ink-muted hover:text-ink transition-colors px-2 py-1 rounded border border-line-soft/60">
              复制
            </button>
          </div>
          <div className="prose prose-sm max-w-none">
            {generatedScript.split('\n').map((line, i) => (
              <p key={i} className={cn('text-sm leading-relaxed mb-2', line.startsWith('【') && 'font-medium')}>
                {line || <br />}
              </p>
            ))}
          </div>
        </SketchCard>
      )}
    </div>
  )
}
