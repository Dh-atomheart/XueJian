import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'

describe('CardContentRenderer', () => {
  it('renders markdown and inline math content', async () => {
    const { container } = render(
      <CardContentRenderer content={'# 标题\n这是一段 **加粗** 内容，含有公式 $E=mc^2$。'} />
    )

    expect(
      await screen.findByRole('heading', { name: '标题' }, { timeout: 5000 })
    ).toBeInTheDocument()
    expect(screen.getByText('加粗')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.katex')).toBeTruthy(), {
      timeout: 5000,
    })
  })

  it('normalizes escaped latex delimiters outside code blocks', async () => {
    const { container } = render(
      <CardContentRenderer content={'Inline \\(E=mc^2\\)\n\n\\[a^2+b^2=c^2\\]'} />
    )

    await waitFor(() => expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2), {
      timeout: 5000,
    })
  })

  it('does not normalize math delimiters inside fenced code blocks', async () => {
    const { container } = render(
      <CardContentRenderer content={'```text\nDo not render \\(E=mc^2\\)\n```'} />
    )

    await screen.findByText(/Do not render/)
    expect(container.querySelector('.katex')).toBeFalsy()
  })

  it('applies compact styling when requested', () => {
    const { container } = render(<CardContentRenderer content={'普通文本'} compact />)

    expect(container.firstElementChild?.className).toContain('line-clamp-4')
  })

  it('renders GFM tables', async () => {
    render(<CardContentRenderer content={'| A | B |\n| - | - |\n| 1 | 2 |'} />)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument()
  })

  it('keeps markdown readable after an unclosed display math delimiter', async () => {
    const answer = [
      'KL散度是一种用于衡量两个概率分布 P 和 Q 之间差异的非对称度量。',
      '',
      '$$',
      'H(P,Q) = H(P) + D_{KL}(P | Q)',
      '',
      '因此，降低交叉熵等价于降低 KL 散度。',
      '',
      '| 应用场景 | 作用 |',
      '| --- | --- |',
      '| 语言模型预训练 | 使模型分布逼近训练数据分布 |',
    ].join('\n')
    const { container } = render(<CardContentRenderer content={answer} />)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '应用场景' })).toBeInTheDocument()
    expect(screen.getByText('因此，降低交叉熵等价于降低 KL 散度。')).toBeInTheDocument()
    expect(container.querySelector('.katex-error')).toBeFalsy()
  })
})
