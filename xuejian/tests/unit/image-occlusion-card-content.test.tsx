import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImageOcclusionCardContent } from '@/components/cards/ImageOcclusionCardContent'

const payload = JSON.stringify({
  image: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
  prompt: '指出被遮挡的器官',
  zones: [{ x: 0.1, y: 0.2, width: 0.25, height: 0.2, label: '心脏' }],
})

describe('ImageOcclusionCardContent', () => {
  it('renders image payload and prompt', () => {
    render(<ImageOcclusionCardContent content={payload} />)

    expect(screen.getByText('指出被遮挡的器官')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Image occlusion card' })).toBeInTheDocument()
    expect(screen.getByTestId('image-occlusion-hint')).toHaveTextContent('翻面后显示遮挡区域答案。')
  })

  it('reveals labels when the card is flipped', () => {
    render(<ImageOcclusionCardContent content={payload} revealed />)

    expect(screen.getByText('心脏')).toBeInTheDocument()
    expect(screen.getByTestId('image-occlusion-hint')).toHaveTextContent('已显示遮挡区域答案。')
  })
})