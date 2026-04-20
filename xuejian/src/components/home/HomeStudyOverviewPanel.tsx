import { StudyTotalsCard } from '@/components/stats'
import { Panel, RoughUnderline } from '@/components/ui'

interface HomeStudyOverviewPanelProps {
  todayMinutes: number | null
  weekMinutes: number | null
  totalMinutes: number | null
  streakDays: number | null
}

export function HomeStudyOverviewPanel({
  todayMinutes,
  weekMinutes,
  totalMinutes,
  streakDays,
}: HomeStudyOverviewPanelProps) {
  return (
    <Panel variant="paperCard" className="space-y-5 p-6">
      <div>
        <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Study Snapshot</p>
        <h2 className="mt-2 font-ui text-xl text-ink">学习概览</h2>
        <RoughUnderline width={72} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
      </div>

      <StudyTotalsCard
        todayMinutes={todayMinutes}
        weekMinutes={weekMinutes}
        totalMinutes={totalMinutes}
        streakDays={streakDays}
        className="grid-cols-2"
      />
    </Panel>
  )
}