import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Trash2 } from 'lucide-react'
import {
  BackgroundJobPanel,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@/shared/ui'
import { CardPreview, SourceQuoteBlock } from '@/components/cards'
import { ReviewFeedbackButtons } from '@/components/learning'

describe('UI-03 shared primitives', () => {
  it('disables Button while loading and shows loading label', () => {
    render(
      <Button isLoading loadingLabel="保存中">
        保存
      </Button>
    )

    const button = screen.getByRole('button', { name: '保存中' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('renders IconButton with an accessible name and optional tooltip', () => {
    render(<IconButton aria-label="删除卡片" tooltip="删除卡片" icon={Trash2} variant="ghost" />)

    expect(screen.getByRole('button', { name: '删除卡片' })).toBeInTheDocument()
  })

  it('opens Dialog with title and description', () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>打开</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>删除文档</DialogTitle>
          <DialogDescription>删除后会移除关联卡片来源。</DialogDescription>
        </DialogContent>
      </Dialog>
    )

    fireEvent.click(screen.getByRole('button', { name: '打开' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('删除文档')).toBeInTheDocument()
    expect(screen.getByText('删除后会移除关联卡片来源。')).toBeInTheDocument()
  })

  it('renders Tabs with Radix tab semantics', () => {
    render(
      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="general">通用</TabsTrigger>
        </TabsList>
        <TabsContent value="ai">模型配置</TabsContent>
        <TabsContent value="general">主题设置</TabsContent>
      </Tabs>
    )

    expect(screen.getByText('模型配置')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'false')
  })

  it('renders Tooltip content on hover', async () => {
    render(
      <Tooltip content="刷新队列" delayDuration={0}>
        <button type="button">刷新</button>
      </Tooltip>
    )

    fireEvent.pointerMove(screen.getByRole('button', { name: '刷新' }))
    fireEvent.pointerEnter(screen.getByRole('button', { name: '刷新' }))

    await waitFor(() => {
      expect(screen.getAllByText('刷新队列').length).toBeGreaterThan(0)
    })
  })
})

describe('UI-03 background job state', () => {
  it('renders running progress and cancellation action', () => {
    const onCancel = vi.fn()

    render(
      <BackgroundJobPanel
        job={{
          id: 'job-1',
          status: 'running',
          progressCurrent: 1,
          progressTotal: 4,
          progressMessage: '正在生成卡片',
        }}
        title="生成中"
        onCancel={onCancel}
        cancelButtonTestId="cancel-job"
      />
    )

    expect(screen.getAllByText('生成中').length).toBeGreaterThan(0)
    expect(screen.getByText('1/4')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cancel-job'))
    expect(onCancel).toHaveBeenCalledWith('job-1')
  })

  it('renders failed jobs with retry', () => {
    const onRetry = vi.fn()

    render(
      <BackgroundJobPanel
        job={{ id: 'job-2', status: 'failed', errorMessage: 'Provider timeout' }}
        onRetry={onRetry}
        retryButtonTestId="retry-job"
      />
    )

    expect(screen.getByText('Provider timeout')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('retry-job'))
    expect(onRetry).toHaveBeenCalledWith('job-2')
  })
})

describe('UI-03 domain components', () => {
  it('renders source quote with source action', () => {
    const onOpenSource = vi.fn()

    render(
      <SourceQuoteBlock
        quote="间隔重复能提高长期记忆。"
        documentTitle="学习科学"
        pageLabel="12"
        onOpenSource={onOpenSource}
      />
    )

    expect(screen.getByText('间隔重复能提高长期记忆。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /来源/ }))
    expect(onOpenSource).toHaveBeenCalledTimes(1)
  })

  it('renders card preview without receiving a full Card object', () => {
    render(
      <CardPreview
        front="什么是间隔重复？"
        back="按遗忘曲线安排复习。"
        tags={['memory']}
        documentTitle="学习科学"
        pageLabel={3}
        nextReviewLabel="明天复习"
        sourceQuote="复习间隔会随掌握程度变化。"
      />
    )

    expect(screen.getByText('什么是间隔重复？')).toBeInTheDocument()
    expect(screen.getByText('按遗忘曲线安排复习。')).toBeInTheDocument()
    expect(screen.getByText('#memory')).toBeInTheDocument()
  })

  it('renders four review feedback buttons and submits rating', () => {
    const onRate = vi.fn()

    render(<ReviewFeedbackButtons onRate={onRate} />)

    expect(screen.getByTestId('review-rate-again')).toHaveTextContent('忘记')
    expect(screen.getByTestId('review-rate-hard')).toHaveTextContent('模糊')
    expect(screen.getByTestId('review-rate-good')).toHaveTextContent('记得')
    expect(screen.getByTestId('review-rate-easy')).toHaveTextContent('熟练')
    fireEvent.click(screen.getByTestId('review-rate-good'))
    expect(onRate).toHaveBeenCalledWith('good')
  })
})
