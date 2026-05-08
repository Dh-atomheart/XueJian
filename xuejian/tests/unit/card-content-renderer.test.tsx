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
})
