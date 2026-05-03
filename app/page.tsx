'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSessions, deleteSession, getScorePercent } from '@/lib/storage'
import { QuizSession } from '@/types'

const SUBJECT_ICONS: Record<string, string> = {
  anatomy: '🦴', physiology: '❤️', pharmacology: '💊', pathology: '🔬',
  biochemistry: '⚗️', microbiology: '🦠', immunology: '🛡️', neurology: '🧠',
  cardiology: '🫀', surgery: '🩺', default: '📚'
}

function getIcon(subject: string): string {
  const lower = subject.toLowerCase()
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return SUBJECT_ICONS.default
}

function ScoreBadge({ pct }: { pct: number }) {
  const color = pct >= 70 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-warm'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
      {pct}%
    </span>
  )
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSessions(getSessions())
    setMounted(true)
  }, [])

  const handleDelete = (id: string) => {
    deleteSession(id)
    setSessions(getSessions())
  }

  const completedSessions = sessions.filter(s => s.status === 'completed')
  const inProgressSessions = sessions.filter(s => s.status === 'paused' || s.status === 'in-progress')
  const avgScore = completedSessions.length
    ? Math.round(completedSessions.reduce((acc, s) => acc + getScorePercent(s), 0) / completedSessions.length)
    : null

  if (!mounted) return null

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-warm/90 via-rose-warm to-amber-dark/80" />
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 70% 50%, rgba(255,255,255,0.08) 0%, transparent 60%),
                            radial-gradient(circle at 20% 80%, rgba(0,0,0,0.1) 0%, transparent 40%)`
        }} />

        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full border border-white/10" />
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full border border-white/8" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full border border-white/10" />

        <div className="relative max-w-4xl mx-auto px-6 py-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-rose-light/80 font-body text-sm tracking-widest uppercase mb-2">Welcome back</p>
              <h1 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
                MedQuiz 🩺
              </h1>
              <p className="text-white/70 font-body mt-3 text-lg">
                Your AI-powered exam preparation companion
              </p>
            </div>

            {avgScore !== null && (
              <div className="flex gap-4">
                <div className="card px-5 py-4 text-center min-w-[90px]">
                  <div className="font-display text-3xl font-bold text-rose-warm">{avgScore}%</div>
                  <div className="text-xs text-charcoal-light font-body mt-1">Avg Score</div>
                </div>
                <div className="card px-5 py-4 text-center min-w-[90px]">
                  <div className="font-display text-3xl font-bold text-amber-warm">{completedSessions.length}</div>
                  <div className="text-xs text-charcoal-light font-body mt-1">Quizzes Done</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Start New Quiz CTA */}
        <div className="animate-fade-slide-up stagger-1">
          <Link href="/setup">
            <div className="group relative overflow-hidden card p-8 border-2 border-dashed border-amber-warm/40 hover:border-rose-warm/60 transition-all duration-300 cursor-pointer hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-warm/0 to-rose-warm/5 group-hover:from-rose-warm/5 group-hover:to-rose-warm/10 transition-all duration-300" />
              <div className="relative flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-rose-warm/10 group-hover:bg-rose-warm/20 flex items-center justify-center text-2xl transition-all duration-300 group-hover:scale-110">
                  ✨
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-charcoal-warm group-hover:text-rose-warm transition-colors duration-200">
                    Start a New Quiz
                  </h2>
                  <p className="text-charcoal-light font-body text-sm mt-1">
                    Paste notes, upload a PDF or image, and let AI generate your questions
                  </p>
                </div>
                <div className="ml-auto text-rose-warm/40 group-hover:text-rose-warm transition-all duration-200 group-hover:translate-x-1">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* In Progress */}
        {inProgressSessions.length > 0 && (
          <section className="animate-fade-slide-up stagger-2">
            <h2 className="heading-display text-xl mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-warm inline-block animate-pulse-warm" />
              Continue Where You Left Off
            </h2>
            <div className="space-y-3">
              {inProgressSessions.map((session) => {
                const progress = Math.round((session.currentQuestionIndex / session.questions.length) * 100)
                return (
                  <div key={session.id} className="card p-5 flex items-center gap-4 group">
                    <span className="text-3xl">{getIcon(session.config.subject)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-charcoal-warm truncate">
                          {session.config.subject}
                        </h3>
                        <span className="text-xs text-charcoal-light whitespace-nowrap font-body">
                          Q{session.currentQuestionIndex + 1} / {session.questions.length}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-warm rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <Link href={`/quiz/${session.id}`}>
                      <button className="btn-primary text-sm py-2 px-4 whitespace-nowrap">Resume</button>
                    </Link>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="text-charcoal-light/40 hover:text-rose-warm transition-colors p-1"
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Completed Sessions */}
        {completedSessions.length > 0 && (
          <section className="animate-fade-slide-up stagger-3">
            <h2 className="heading-display text-xl mb-4">Quiz History</h2>
            <div className="space-y-3">
              {completedSessions.map((session) => {
                const pct = getScorePercent(session)
                const date = new Date(session.completedAt || session.updatedAt)
                return (
                  <div key={session.id} className="card p-5 flex items-center gap-4 hover:shadow-md transition-all duration-200">
                    <span className="text-3xl">{getIcon(session.config.subject)}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-charcoal-warm truncate">
                        {session.config.subject}
                      </h3>
                      <p className="text-xs text-charcoal-light font-body mt-0.5">
                        {session.questions.length} questions · {session.config.difficulty} · {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <ScoreBadge pct={pct} />
                    <div className="flex items-center gap-2">
                      <Link href={`/results/${session.id}`}>
                        <button className="btn-ghost text-sm py-1.5">Review</button>
                      </Link>
                      <button
                        onClick={() => handleDelete(session.id)}
                        className="text-charcoal-light/40 hover:text-rose-warm transition-colors p-1"
                        title="Delete"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <div className="animate-fade-slide-up stagger-2 text-center py-16">
            <div className="text-6xl mb-4">🎓</div>
            <h2 className="font-display text-2xl font-bold text-charcoal-warm mb-2">No quizzes yet</h2>
            <p className="text-charcoal-light font-body">Start your first quiz above and let AI help you ace your exams!</p>
          </div>
        )}
      </div>
    </div>
  )
}
