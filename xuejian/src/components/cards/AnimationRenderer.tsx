import { motion, AnimatePresence } from 'framer-motion'
import type { AnimationScript, AnimationStep, AnimPalette } from '@/types'

// ───── Palette colours ─────

const PALETTES: Record<AnimPalette, { bg: string; text: string; accent: string; reveal: string }> =
  {
    default: { bg: '#fbfbf9', text: '#2c2c2c', accent: '#4a7c59', reveal: '#3b5f8a' },
    warm: { bg: '#fdf8f2', text: '#3d2b1f', accent: '#c0623d', reveal: '#b8860b' },
    cool: { bg: '#f2f5fb', text: '#1e2b3d', accent: '#3b5f8a', reveal: '#4a7c59' },
  }

// ───── Shared step variants ─────

// Custom variant - function form supported at runtime; cast to satisfy framer-motion v12 strict Variants type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay_ms = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut', delay: delay_ms / 1000 },
  }),
}

// ───── Flash-card reveal renderer ─────

function FlashcardRevealRenderer({
  script,
  palette,
}: {
  script: AnimationScript
  palette: (typeof PALETTES)[AnimPalette]
}) {
  return (
    <div
      className="flex flex-col gap-4 p-6 rounded-xl min-h-[200px]"
      style={{ backgroundColor: palette.bg }}
    >
      <AnimatePresence>
        {script.steps.map((step) => (
          <motion.div
            key={step.id}
            custom={step.delay_ms}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            {step.type === 'reveal' ? (
              <RevealCard step={step} color={palette.reveal} />
            ) : (
              <p className="text-base leading-relaxed" style={{ color: palette.text }}>
                {step.content}
              </p>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function RevealCard({ step, color }: { step: AnimationStep; color: string }) {
  return (
    <motion.div
      className="rounded-lg p-4 border-l-4"
      style={{ borderColor: color, backgroundColor: `${color}15` }}
      initial={{ scaleX: 0, originX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <p className="text-base font-medium leading-relaxed" style={{ color }}>
        {step.content}
      </p>
    </motion.div>
  )
}

// ───── Keyword emphasis renderer ─────

function KeywordEmphasisRenderer({
  script,
  palette,
}: {
  script: AnimationScript
  palette: (typeof PALETTES)[AnimPalette]
}) {
  return (
    <div
      className="flex flex-col gap-4 p-6 rounded-xl min-h-[200px]"
      style={{ backgroundColor: palette.bg }}
    >
      {script.steps.map((step) => (
        <motion.div
          key={step.id}
          custom={step.delay_ms}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          <EmphasisParagraph step={step} accent={palette.accent} textColor={palette.text} />
        </motion.div>
      ))}
    </div>
  )
}

function EmphasisParagraph({
  step,
  accent,
  textColor,
}: {
  step: AnimationStep
  accent: string
  textColor: string
}) {
  const emphasis = new Set(step.emphasis ?? [])
  if (emphasis.size === 0) {
    return (
      <p className="text-base leading-relaxed" style={{ color: textColor }}>
        {step.content}
      </p>
    )
  }

  // Split content by emphasis words and wrap them
  const parts: Array<{ text: string; highlight: boolean }> = []
  let remaining = step.content
  for (const word of emphasis) {
    const idx = remaining.indexOf(word)
    if (idx >= 0) {
      if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false })
      parts.push({ text: word, highlight: true })
      remaining = remaining.slice(idx + word.length)
    }
  }
  if (remaining) parts.push({ text: remaining, highlight: false })

  return (
    <p className="text-base leading-relaxed" style={{ color: textColor }}>
      {parts.map((part, i) =>
        part.highlight ? (
          <motion.mark
            key={i}
            className="px-0.5 rounded"
            style={{
              backgroundColor: `${accent}30`,
              color: accent,
              fontWeight: 600,
            }}
            initial={{ backgroundColor: 'transparent' }}
            animate={{ backgroundColor: `${accent}30` }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {part.text}
          </motion.mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  )
}

// ───── Main export ─────

export interface AnimationRendererProps {
  scriptJson: string
  className?: string
}

export function AnimationRenderer({ scriptJson, className }: AnimationRendererProps) {
  let script: AnimationScript
  try {
    script = JSON.parse(scriptJson) as AnimationScript
  } catch {
    return <div className="p-4 text-sm text-red-500">动画脚本解析失败</div>
  }

  const palette = PALETTES[script.palette ?? 'default']

  return (
    <div className={className}>
      <p className="text-xs font-medium mb-3 opacity-60" style={{ color: palette.text }}>
        {script.title}
      </p>
      {script.type === 'keyword_emphasis' ? (
        <KeywordEmphasisRenderer script={script} palette={palette} />
      ) : (
        <FlashcardRevealRenderer script={script} palette={palette} />
      )}
    </div>
  )
}
