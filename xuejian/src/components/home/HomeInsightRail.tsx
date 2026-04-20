import { Button, Panel, RoughUnderline } from '@/components/ui'
import { cn } from '@/lib/utils'

interface HomeInsightRailProps {
  className?: string
  hasApiConfig: boolean
  totalDue: number
  recentDocumentsCount: number
  activeDays: number
  weekMinutes: number | null
  streakDays: number | null
  todayPoints: number
  onGoSettings: () => void
}

export function HomeInsightRail({
  className,
  hasApiConfig,
  totalDue,
  recentDocumentsCount,
  activeDays,
  weekMinutes,
  streakDays,
  todayPoints,
  onGoSettings,
}: HomeInsightRailProps) {
  const note =
    totalDue > 0
      ? '今天先收束待复习，再进入新知识输入。桌面模式下，右侧栏专门承担这类轻量提醒。'
      : '主任务已经清空，可以把注意力转回导入、整理与生成质量检查。'

  return (
    <div className={cn('hidden flex-col gap-5 xl:flex', className)}>
      <Panel variant="paperCard" className="space-y-4 p-5">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Desk Note</p>
          <h2 className="mt-2 font-ui text-lg text-ink">今日建议</h2>
          <RoughUnderline width={64} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        </div>
        <p className="text-sm leading-7 text-ink-muted">{note}</p>
        {!hasApiConfig ? (
          <Button variant="outline" size="sm" className="w-full rounded-full" onClick={onGoSettings}>
            前往设置，补齐模型配置
          </Button>
        ) : null}
      </Panel>

      <Panel variant="paperCard" className="space-y-4 p-5">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Weekly Signal</p>
          <h2 className="mt-2 font-ui text-lg text-ink">本周节律</h2>
        </div>
        <RailMetric label="活跃日" value={`${activeDays}`} unit="天" />
        <RailMetric label="本周学习" value={weekMinutes != null ? `${weekMinutes}` : '--'} unit="分钟" />
        <RailMetric label="连续天数" value={streakDays != null ? `${streakDays}` : '--'} unit="天" />
      </Panel>

      <Panel variant="paperCard" className="space-y-4 p-5">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Workbench State</p>
          <h2 className="mt-2 font-ui text-lg text-ink">工作台状态</h2>
        </div>
        <StateRow label="最近文档" value={`${recentDocumentsCount} 份`} />
        <StateRow label="模型状态" value={hasApiConfig ? '已就绪' : '待配置'} />
        <StateRow label="今日积分" value={todayPoints > 0 ? `+${todayPoints}` : '--'} />
      </Panel>
    </div>
  )
}

function RailMetric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-[20px] border border-line-soft bg-paper-base/72 px-4 py-4">
      <p className="font-ui text-[10px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-2xl text-ink">{value}</span>
        <span className="font-ui text-[11px] text-ink-muted">{unit}</span>
      </div>
    </div>
  )
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft/70 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-ui text-sm text-ink">{value}</span>
    </div>
  )
}