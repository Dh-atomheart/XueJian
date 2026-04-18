export interface ReaderViewport {
  width: number
  height: number
}

export interface ReaderRect {
  x: number
  y: number
  width: number
  height: number
}

function isNormalizedRect(rect: ReaderRect): boolean {
  return rect.x <= 1 && rect.y <= 1 && rect.width <= 1 && rect.height <= 1
}

export function resolveReaderRect(rect: ReaderRect, viewport: ReaderViewport): ReaderRect {
  if (!isNormalizedRect(rect)) {
    return rect
  }

  return {
    x: rect.x * viewport.width,
    y: rect.y * viewport.height,
    width: rect.width * viewport.width,
    height: rect.height * viewport.height,
  }
}