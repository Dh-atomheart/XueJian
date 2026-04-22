import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CardContentRenderer } from '@/components/cards/CardContentRenderer'

describe('CardContentRenderer', () => {
  it('renders markdown and inline math content', () => {
    const { container } = render(
      <CardContentRenderer content={'# 标题\n这是一段 **加粗** 内容，含有公式 $E=mc^2$。'} />
    )

    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument()
    expect(screen.getByText('加粗')).toBeInTheDocument()
    expect(container.querySelector('.katex')).toBeTruthy()
  })

  it('applies compact styling when requested', () => {
    const { container } = render(<CardContentRenderer content={'普通文本'} compact />)

    expect(container.firstElementChild?.className).toContain('line-clamp-4')
  })
})
