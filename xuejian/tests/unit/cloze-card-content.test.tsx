import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClozeCardContent } from '@/components/cards/ClozeCardContent'

describe('ClozeCardContent', () => {
  it('reveals individual cloze indices independently', async () => {
    render(
      <ClozeCardContent
        content={'牛顿第二定律：$F = {{c1::ma::质量乘速度}}$，单位是 {{c2::kg::单位}}。'}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'c1' }))

    expect(await screen.findByText('ma', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'c2' })).toBeInTheDocument()
  })

  it('reveals all clozes when revealed is true', async () => {
    render(<ClozeCardContent content={'{{c1::答案一}} 和 {{c2::答案二}}'} revealed />)

    expect(await screen.findByText('答案一', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('答案二')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'c1' })).not.toBeInTheDocument()
  })
})
