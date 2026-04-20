import { ImportDocumentButton } from '@/components/documents'
import { Panel, RoughUnderline } from '@/components/ui'
import { cn } from '@/lib/utils'

interface HomeQuickActionsPanelProps {
  onGoLearning: () => void
  onGoLibrary: () => void
  onGoCards: () => void
  onGoKnowledge: () => void
  onImported: () => void
}

export function HomeQuickActionsPanel({
  onGoLearning,
  onGoLibrary,
  onGoCards,
  onGoKnowledge,
  onImported,
}: HomeQuickActionsPanelProps) {
  return (
    <Panel variant="paperCard" className="space-y-5 p-6">
      <div>
        <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Quick Start</p>
        <h2 className="mt-2 font-ui text-xl text-ink">快速开始</h2>
        <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <ActionTile
          title="进入学习"
          description="直接开始今日复习或新知识输入。"
          icon={<LearnIcon className="h-5 w-5" />}
          onClick={onGoLearning}
          tone="yellow"
        />
        <ActionTile
          title="文档库"
          description="查看原始文档、预览解析与进入阅读。"
          icon={<LibraryIcon className="h-5 w-5" />}
          onClick={onGoLibrary}
        />
        <ActionTile
          title="卡片工坊"
          description="整理候选卡、检查生成质量与发布状态。"
          icon={<CardsIcon className="h-5 w-5" />}
          onClick={onGoCards}
        />
        <ActionTile
          title="知识问答"
          description="基于文档锚点继续提问与串联知识。"
          icon={<KnowledgeIcon className="h-5 w-5" />}
          onClick={onGoKnowledge}
        />
      </div>

      <div className="rounded-[24px] border border-dashed border-line-soft bg-paper-base/74 p-4">
        <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">Add Material</p>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          从示例首页延续“上传文档”这一核心动作，但把它提升为桌面工作流入口，而不是四宫格里的普通按钮。
        </p>
        <div className="mt-4">
          <ImportDocumentButton
            onImported={onImported}
            idleLabel="导入文档"
            buttonProps={{
              variant: 'outline',
              className: 'w-full justify-center rounded-full bg-paper-card',
            }}
          />
        </div>
      </div>
    </Panel>
  )
}

function ActionTile({
  title,
  description,
  icon,
  onClick,
  tone = 'default',
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'yellow'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-[22px] border bg-paper-base/82 p-4 text-left shadow-paper transition hover:-translate-y-[1px] hover:bg-paper-card',
        tone === 'yellow'
          ? 'border-highlight-yellow/40 bg-highlight-yellow/10 hover:border-highlight-yellow/60'
          : 'border-line-soft/75 hover:border-ink/16'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-line-soft bg-paper-card text-ink-muted transition group-hover:text-ink">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-ui text-sm text-ink">{title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
        </div>
      </div>
    </button>
  )
}

function LearnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4" width="19" height="15" rx="3" />
      <path d="M12 8v7M8.5 11.5h7" />
    </svg>
  )
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 5.5h10.5a2 2 0 0 1 2 2V17" />
      <path d="M6.5 3H17a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6.5a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 6.5 3z" />
      <path d="M8 8h7" />
      <path d="M8 12h5" />
    </svg>
  )
}

function KnowledgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a3 3 0 0 1 5.8 1c0 2-3 2.8-3 2.8" />
      <path d="M12 17h.01" />
    </svg>
  )
}