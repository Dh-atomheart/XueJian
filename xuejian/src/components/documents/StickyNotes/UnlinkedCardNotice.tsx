import { Button } from '@/components/ui'

interface UnlinkedCardNoticeProps {
  onLink: () => void
  onOpenCandidates: () => void
}

export function UnlinkedCardNotice({ onLink, onOpenCandidates }: UnlinkedCardNoticeProps) {
  return (
    <div className="rounded-[18px] border border-dashed border-amber-300 bg-amber-50/70 px-3 py-3">
      <p className="text-sm text-ink">这张卡片还没有正文高亮。</p>
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        你可以回到正文里手动圈定原句，或者去卡片工坊检查 AI 候选是否缺失定位信息。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onLink}>
          手动关联
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenCandidates}>
          去卡片工坊
        </Button>
      </div>
    </div>
  )
}