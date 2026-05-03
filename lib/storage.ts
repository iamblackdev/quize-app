import { QuizSession } from '@/types'

const STORAGE_KEY = 'medquiz_sessions'

export function getSessions(): QuizSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function getSession(id: string): QuizSession | null {
  const sessions = getSessions()
  return sessions.find(s => s.id === id) ?? null
}

export function saveSession(session: QuizSession): void {
  if (typeof window === 'undefined') return
  const sessions = getSessions()
  const idx = sessions.findIndex(s => s.id === session.id)
  if (idx >= 0) {
    sessions[idx] = session
  } else {
    sessions.unshift(session)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function deleteSession(id: string): void {
  if (typeof window === 'undefined') return
  const sessions = getSessions().filter(s => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function getScorePercent(session: QuizSession): number {
  if (!session.questions.length) return 0
  const correct = session.answers.filter(a => a.isCorrect).length
  return Math.round((correct / session.questions.length) * 100)
}
