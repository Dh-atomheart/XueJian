import { HeatmapCalendar, type HeatmapEntry } from '@/components/stats'
import { Panel, RoughUnderline } from '@/components/ui'

interface HomeHeatmapPanelProps {
  entries: HeatmapEntry[]
}

export function HomeHeatmapPanel({ entries }: HomeHeatmapPanelProps) {
  return (
    <Panel
      variant="paperCard"
      className="space-y-5 p-6 md:p-7"
      data-testid="home-heatmap-panel"
    >
      <div>
        <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Learning Rhythm</p>
        <h2 className="mt-2 font-ui text-xl text-ink">学习热力图</h2>
        <RoughUnderline width={84} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          桌面首页保留热力图，但把它放在更宽松的主工作区里，避免像手机首页那样只能挤在底部。
        </p>
      </div>

      <HeatmapCalendar entries={entries} weeks={16} />
    </Panel>
  )
}
