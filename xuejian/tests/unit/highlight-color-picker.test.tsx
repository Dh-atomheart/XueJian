import { fireEvent, render, screen } from '@testing-library/react'
import { HighlightColorPicker, HIGHLIGHT_COLORS } from '@/components/documents/HighlightColorPicker'

describe('HighlightColorPicker', () => {
  it('renders all preset highlight colors', () => {
    const onChange = vi.fn()
    render(<HighlightColorPicker value="#F8E16C" onChange={onChange} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(HIGHLIGHT_COLORS.length)
  })

  it('calls onChange with the selected color value', () => {
    const onChange = vi.fn()
    render(<HighlightColorPicker value="#F8E16C" onChange={onChange} />)

    const greenButton = screen.getByLabelText('高亮颜色：绿色')
    fireEvent.click(greenButton)
    expect(onChange).toHaveBeenCalledWith('#C8E6C9')
  })

  it('highlights the currently active color with a visible border', () => {
    const onChange = vi.fn()
    render(<HighlightColorPicker value="#BBDEFB" onChange={onChange} />)

    const blueButton = screen.getByLabelText('高亮颜色：蓝色')
    expect(blueButton.className).toContain('border-ink')
  })

  it('has accessible labels for each color option', () => {
    const onChange = vi.fn()
    render(<HighlightColorPicker value="#F8E16C" onChange={onChange} />)

    for (const color of HIGHLIGHT_COLORS) {
      expect(screen.getByLabelText(`高亮颜色：${color.name}`)).toBeInTheDocument()
    }
  })
})
