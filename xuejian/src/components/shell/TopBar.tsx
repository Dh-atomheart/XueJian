import { Divider } from '@/components/ui'

export function TopBar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-line-soft bg-paper-muted px-4">
      {/* 左侧标题区域 */}
      <div className="flex items-center gap-3">
        <h1 className="font-ui text-base text-ink">学笺</h1>
        <Divider orientation="vertical" className="h-5" />
        <span className="font-body text-sm text-ink-muted">本地优先学习助手</span>
      </div>

      {/* 右侧状态区域 */}
      <div className="flex items-center gap-3">
        <div className="text-xs text-ink-soft">
          待复习: <span className="text-ink">0</span> 张
        </div>
      </div>
    </header>
  )
}
