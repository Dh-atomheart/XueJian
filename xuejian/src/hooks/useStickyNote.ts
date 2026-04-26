import { useState, useCallback } from 'react'

const STORAGE_KEY = 'xuejian-sticky-note'
const DEFAULT_NOTE = '把今天收束成一轮清晰的学习闭环，\n比做很多事更重要。'

export function useStickyNote() {
  const [note, setNote] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_NOTE
    } catch {
      return DEFAULT_NOTE
    }
  })

  const saveNote = useCallback((content: string) => {
    const trimmed = content.trim()
    setNote(trimmed || DEFAULT_NOTE)
    try {
      localStorage.setItem(STORAGE_KEY, trimmed || DEFAULT_NOTE)
    } catch {
      // localStorage unavailable
    }
  }, [])

  return { note, saveNote }
}
