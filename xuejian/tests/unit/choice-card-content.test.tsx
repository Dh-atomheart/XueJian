import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceCardContent } from '@/components/cards/ChoiceCardContent'

const content = `?> 以下哪个选项是正确答案？
- 错误项
- [x] 正确项
- 干扰项`

describe('ChoiceCardContent', () => {
  it('parses options and reports the correct answer after a wrong selection', () => {
    render(<ChoiceCardContent content={content} />)

    fireEvent.click(screen.getByText('错误项').closest('button') as HTMLButtonElement)

    expect(screen.getByText('✗ 正确答案是 B')).toBeInTheDocument()
  })

  it('falls back to direct reveal mode when revealed is true', () => {
    render(<ChoiceCardContent content={content} revealed />)

    expect(screen.getByText('✗ 正确答案是 B')).toBeInTheDocument()
    expect(screen.getByText('正确项')).toBeInTheDocument()
  })
})
