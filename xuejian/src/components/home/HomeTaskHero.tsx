import { Button, Panel, RoughCircleNumber, RoughUnderline } from '@/components/ui'
import { SketchBorder } from '@/components/ui/SketchBorder'

interface HomeTaskHeroProps {
  totalDue: number
  reviewCards: number
  newCards: number
  todayPoints: number
  onStartLearning: () => void
}

export function HomeTaskHero({
  totalDue,
  reviewCards,
  newCards,
  todayPoints,
  onStartLearning,
}: HomeTaskHeroProps) {
  const hasTasks = totalDue > 0

  return (
    <Panel
      variant="paperCard"
      className="relative overflow-hidden border-line-soft/90 px-5 py-6 md:px-8 md:py-8 xl:px-10 xl:py-10"
    >
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-x-[38%] top-0 h-48 rounded-full bg-highlight-yellow/12 blur-3xl" />
        <div className="absolute -left-10 top-8 h-36 w-36 rounded-full bg-paper-muted/80 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-highlight-blue/8 blur-3xl" />
      </div>

      <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-end">
        <div>
          <div className="inline-block">
            <p className="font-ui text-[11px] uppercase tracking-[0.32em] text-ink-soft">
              Study Center
            </p>
            <RoughUnderline width={110} color="rgb(var(--ink-soft))" strokeWidth={1.1} className="mt-1" />
          </div>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:gap-6">
            <div className="shrink-0">
              <RoughCircleNumber
                color="rgb(var(--ink))"
                strokeWidth={1.9}
                roughness={0.55}
                padding={18}
              >
                <span className="font-display text-[3.4rem] leading-none text-ink md:text-[4.2rem]">
                  {totalDue}
                </span>
              </RoughCircleNumber>
            </div>

            <div className="min-w-0 max-w-2xl">
              <h2 className="font-display text-[2.2rem] leading-[0.95] text-ink md:text-[3rem] xl:text-[3.45rem]">
                今日学习中心
              </h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted md:text-base">
                {hasTasks
                  ? '先收束待复习，再接入新知识。桌面首页会把今天最关键的学习动作压缩到这一屏里。'
                  : '今日复习已经清空。现在更适合回到文档库整理输入，或者去卡片工坊检查下一轮候选。'}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <SketchBorder variant="card" roughness={0.45} className="shrink-0">
                  <Button
                    variant="default"
                    size="lg"
                    className="min-w-[156px] gap-2 rounded-full px-7"
                    onClick={onStartLearning}
                    disabled={!hasTasks}
                  >
                    <span>{hasTasks ? '开始学习' : '今日已完成'}</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </Button>
                </SketchBorder>

                <div className="rounded-full border border-line-soft bg-paper-base/90 px-4 py-2 text-sm text-ink-muted shadow-paper">
                  <span className="font-ui text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    Session
                  </span>
                  <span className="ml-2">
                    {hasTasks ? `${reviewCards} 待复习 · ${newCards} 新知识` : '建议整理文档或卡片'}
                  </span>
                </div>

                {todayPoints > 0 ? (
                  <div className="rounded-full border border-highlight-yellow/40 bg-highlight-yellow/14 px-4 py-2 text-sm text-ink-muted shadow-paper">
                    今日积分 <span className="font-display text-base text-ink">+{todayPoints}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          <HeroCircleMetric label="待复习" value={reviewCards} tone="yellow" />
          <HeroCircleMetric label="新知识" value={newCards} tone="blue" />
          <div className="sm:col-span-2 rounded-[24px] border border-line-soft bg-paper-base/88 p-5 shadow-paper">
            <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">Rhythm Note</p>
            <p className="mt-3 font-ui text-lg text-ink">
              {hasTasks ? '先整理复习，再吸收新知识。' : '今天适合归档与轻量回顾。'}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              这一块承接了示例中手机首页的进度提示，但改成更适合桌面宽屏的摘要卡，不再挤在单列长页面里。
            </p>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function HeroCircleMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'yellow' | 'blue'
}) {
  return (
    <div className="rounded-[24px] border border-line-soft bg-paper-base/88 px-4 py-4 text-center shadow-paper">
      <p className="font-ui text-[10px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <div className="mt-3 flex justify-center">
        <RoughCircleNumber
          color={tone === 'yellow' ? 'rgb(var(--highlight-yellow))' : 'rgb(var(--highlight-blue))'}
          strokeWidth={1.4}
          roughness={0.5}
          padding={12}
        >
          <span className="font-display text-3xl leading-none text-ink">{value}</span>
        </RoughCircleNumber>
      </div>
    </div>
  )
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}