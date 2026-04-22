import { useState, useEffect } from 'react'
import { SketchButton, SketchCircle, SketchDivider, SketchProgress } from '@/components/ui/Sketch'
import { useAppStore, generateMockData } from '@/lib/store'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const [isHovered, setIsHovered] = useState(false)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { flashcards, documents } = useAppStore()

  // Initialize mock data if empty
  useEffect(() => {
    if (documents.length === 0) {
      const mock = generateMockData()
      useAppStore.setState(mock)
    }
  }, [documents.length])

  const todayCards = flashcards.filter((c) => c.status !== 'mastered').length
  const reviewCards = flashcards.filter((c) => c.status === 'review').length
  const newCards = flashcards.filter((c) => c.status === 'new').length
  const masteredCards = flashcards.filter((c) => c.status === 'mastered').length
  const memoryProgress =
    flashcards.length > 0 ? Math.round((masteredCards / flashcards.length) * 100) : 0

  return (
    <div className="flex flex-col items-center px-6 py-8 max-w-md mx-auto animate-fade-in">
      {/* 头部 */}
      <header className="w-full flex items-center justify-between mb-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center">
            <span className="text-base font-display font-semibold">笺</span>
          </div>
          <span className="text-lg font-display font-semibold tracking-tight">学笺</span>
        </div>
        <div className="text-sm text-ink-muted tracking-wider uppercase font-ui">Study Desk</div>
      </header>

      {/* Study Center 标题 */}
      <div className="text-center mb-12">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-3 font-ui">
          Study Center
        </p>
        <h1 className="text-2xl font-display font-semibold mb-2">今日学习中心</h1>
        <p className="text-sm text-ink-muted">欢迎回来，今日宜格物致知。</p>
      </div>

      {/* Task Overview */}
      <div className="text-center mb-10">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-3 font-ui">
          Task Overview
        </p>
        <h2 className="text-3xl font-display font-semibold mb-1">今日任务</h2>
        <p className="text-sm text-ink-muted tracking-wide">{todayCards} Cards Total</p>
      </div>

      {/* 统计圆圈 */}
      <div className="flex items-center justify-center gap-8 mb-12">
        <div className="flex flex-col items-center">
          <p className="text-xs text-ink-muted mb-2">待复习</p>
          <SketchCircle size={72} className="text-ink/70">
            <span className="text-xl font-semibold">{reviewCards}</span>
          </SketchCircle>
        </div>

        <div className="h-16 w-px bg-line-soft" />

        <div className="flex flex-col items-center">
          <p className="text-xs text-ink-muted mb-2">新知识</p>
          <SketchCircle size={72} className="text-ink/70">
            <span className="text-xl font-semibold">{newCards}</span>
          </SketchCircle>
        </div>
      </div>

      {/* 开始学习按钮 */}
      <div className="mb-16">
        <SketchButton
          variant="outline"
          className="group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setActiveNavItem('learning')}
        >
          <span>开始学习</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform duration-300', isHovered && 'translate-x-1')}
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </SketchButton>
      </div>

      {/* 继续上次会话 */}
      <div className="w-full mb-8">
        <p className="text-xs text-ink-muted mb-4 sketch-underline inline-block">继续上次会话</p>
        <SketchDivider className="mt-2" />
      </div>

      {/* 记忆存储进度 */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium">学习进度 (Learning Progress)</h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveNavItem('settings')}
            title="前往设置"
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17l9.2-9.2M17 17V7H7" />
            </svg>
          </button>
        </div>
        <SketchProgress value={memoryProgress} />
        <p className="text-xs text-ink-muted mt-2 text-right">{memoryProgress}%</p>
      </div>

      {/* 快捷入口 */}
      <div className="w-full mt-12 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setActiveNavItem('library')}
          className="flex items-center gap-3 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/50 transition-colors text-left"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-muted"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="m9 15 3-3 3 3" />
          </svg>
          <span className="text-sm font-medium">上传文档</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNavItem('knowledge')}
          className="flex items-center gap-3 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/50 transition-colors text-left"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-muted"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-sm font-medium">AI 问答</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNavItem('podcast')}
          className="flex items-center gap-3 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/50 transition-colors text-left"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-muted"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="23" />
            <line x1="8" x2="16" y1="23" y2="23" />
          </svg>
          <span className="text-sm font-medium">AI 播客</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveNavItem('graph')}
          className="flex items-center gap-3 p-4 rounded-lg border border-line-soft/60 hover:bg-paper-muted/50 transition-colors text-left"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-muted"
          >
            <circle cx="12" cy="12" r="2" />
            <circle cx="6" cy="6" r="2" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="6" cy="18" r="2" />
            <circle cx="18" cy="18" r="2" />
            <line x1="12" y1="10" x2="12" y2="8" />
            <line x1="6" y1="8" x2="6" y2="16" />
            <line x1="18" y1="8" x2="18" y2="16" />
            <line x1="10" y1="12" x2="8" y2="12" />
            <line x1="14" y1="12" x2="16" y2="12" />
          </svg>
          <span className="text-sm font-medium">知识图谱</span>
        </button>
      </div>
    </div>
  )
}
