import { useState, useRef, useCallback } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { documents, setDocuments } = useAppStore()

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      const newDocs = files.map((file, i) => ({
        id: `doc-${Date.now()}-${i}`,
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' as const : 'txt' as const,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
        pageCount: Math.floor(Math.random() * 100) + 10,
        cardsGenerated: 0,
      }))
      setDocuments([...documents, ...newDocs])
    },
    [documents, setDocuments]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const newDocs = files.map((file, i) => ({
        id: `doc-${Date.now()}-${i}`,
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' as const : 'txt' as const,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
        pageCount: Math.floor(Math.random() * 100) + 10,
        cardsGenerated: 0,
      }))
      setDocuments([...documents, ...newDocs])
    },
    [documents, setDocuments]
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
      <div className="mb-8">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2 font-ui">Documents</p>
        <h1 className="text-2xl font-display font-semibold mb-2">资源库</h1>
        <p className="text-sm text-ink-muted">管理学习材料 · {documents.length} 个文档</p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
          isDragging ? 'border-ink/40 bg-paper-muted/50 scale-[1.01]' : 'border-line-soft/60 hover:border-line-soft'
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.epub" onChange={handleFileSelect} className="hidden" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-ink-muted">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" />
        </svg>
        <p className="text-sm font-medium mb-1">{isDragging ? '松开以上传文件' : '拖拽文件到此处'}</p>
        <p className="text-xs text-ink-muted">支持 PDF、TXT、Markdown、EPUB</p>
      </div>

      {documents.length > 0 && (
        <div className="mb-6">
          <input type="text" placeholder="搜索文档..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all" />
        </div>
      )}

      {filteredDocs.length > 0 ? (
        <div className="space-y-3">
          {filteredDocs.map((doc, index) => (
            <SketchCard key={doc.id} className="p-4 hover:bg-paper-muted/30 transition-colors cursor-pointer animate-slide-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-paper-muted flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{doc.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-ink-muted">{doc.size}</span>
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">{doc.pageCount} 页</span>
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">{doc.uploadedAt}</span>
                  </div>
                  {doc.cardsGenerated > 0 && (
                    <p className="text-xs text-ink-muted mt-1">已生成 {doc.cardsGenerated} 张卡片</p>
                  )}
                </div>
                <span className="px-2 py-1 text-xs bg-paper-muted rounded-md text-ink-muted uppercase">{doc.type}</span>
              </div>
            </SketchCard>
          ))}
        </div>
      ) : documents.length > 0 ? (
        <div className="text-center py-12 text-ink-muted"><p className="text-sm">没有找到匹配的文档</p></div>
      ) : (
        <div className="text-center py-12 text-ink-muted">
          <p className="text-sm mb-2">还没有上传任何文档</p>
          <p className="text-xs">上传学习材料以开始生成知识卡片</p>
        </div>
      )}
    </div>
  )
}
