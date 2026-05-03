'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getSession, getScorePercent } from '@/lib/storage'
import { QuizSession, QuizQuestion, QuizAnswer } from '@/types'

function ScoreRing({ pct }: { pct: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 70 ? '#4a9966' : pct >= 50 ? '#E8A87C' : '#C9736A'

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#FAE8D0" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold text-charcoal-warm">{pct}%</span>
        <span className="text-xs text-charcoal-light font-body">Score</span>
      </div>
    </div>
  )
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [mounted, setMounted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expandedQ, setExpandedQ] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession(id)
    if (!s) { router.push('/'); return }
    setSession(s)
    setMounted(true)
  }, [id, router])

  const handleExportPDF = async () => {
    if (!session) return
    setExporting(true)
    try {
      const { exportQuizToPDF } = await import('@/lib/pdfExport')
      await exportQuizToPDF(session)
    } catch (e) {
      alert('PDF export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  if (!mounted || !session) return null

  const pct = getScorePercent(session)
  const correctCount = session.answers.filter(a => a.isCorrect).length
  const total = session.questions.length
  const wrongCount = total - correctCount

  const grade = pct >= 90 ? { label: 'Outstanding! 🌟', color: 'text-green-600' } :
                pct >= 70 ? { label: 'Great work! 🎉', color: 'text-green-600' } :
                pct >= 50 ? { label: 'Keep studying! 📚', color: 'text-amber-600' } :
                { label: 'Needs review 💪', color: 'text-rose-warm' }

  const letters = ['A', 'B', 'C', 'D', 'E']

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-warm/80 via-rose-warm to-amber-dark/70" />
        <div className="relative max-w-2xl mx-auto px-6 py-10 text-center">
          <p className="text-white/70 font-body text-sm mb-2">Quiz Complete</p>
          <h1 className="font-display text-3xl font-bold text-white">{session.config.subject}</h1>
          <p className={`font-display text-xl font-bold mt-2 ${grade.color} drop-shadow`}>{grade.label}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Score card */}
        <div className="card p-8 text-center animate-fade-slide-up stagger-1">
          <ScoreRing pct={pct} />
          <div className="flex justify-center gap-8 mt-6">
            <div>
              <div className="font-display text-2xl font-bold text-green-600">{correctCount}</div>
              <div className="text-xs text-charcoal-light font-body mt-0.5">Correct</div>
            </div>
            <div className="w-px bg-cream-200" />
            <div>
              <div className="font-display text-2xl font-bold text-rose-warm">{wrongCount}</div>
              <div className="text-xs text-charcoal-light font-body mt-0.5">Incorrect</div>
            </div>
            <div className="w-px bg-cream-200" />
            <div>
              <div className="font-display text-2xl font-bold text-charcoal-warm">{total}</div>
              <div className="text-xs text-charcoal-light font-body mt-0.5">Total</div>
            </div>
          </div>
          <p className="text-xs text-charcoal-light font-body mt-4 capitalize">
            {session.config.difficulty} difficulty · {session.config.mode} mode
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 animate-fade-slide-up stagger-2">
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="btn-primary py-3.5 text-sm disabled:opacity-60"
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Exporting…
              </span>
            ) : '📄 Download PDF'}
          </button>
          <Link href="/setup">
            <button className="w-full btn-secondary py-3.5 text-sm">✨ New Quiz</button>
          </Link>
        </div>
        <div className="text-center animate-fade-slide-up stagger-2">
          <Link href="/" className="btn-ghost text-sm">← Back to Dashboard</Link>
        </div>

        {/* Question Review */}
        <div className="animate-fade-slide-up stagger-3">
          <h2 className="heading-display text-xl mb-4">Question Review</h2>
          <div className="space-y-3">
            {session.questions.map((q: QuizQuestion, idx: number) => {
              const answer = session.answers.find((a: QuizAnswer) => a.questionId === q.id)
              const isCorrect = answer?.isCorrect ?? false
              const isExpanded = expandedQ === q.id

              return (
                <div
                  key={q.id}
                  className={`card overflow-hidden transition-all duration-200 ${isCorrect ? 'border-green-200' : 'border-rose-warm/20'}`}
                >
                  <button
                    onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                    className="w-full p-4 text-left flex items-start gap-3"
                  >
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                      ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-warm'}`}>
                      {isCorrect ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-charcoal-light font-body mb-1">Q{idx + 1}</p>
                      <p className="font-body text-sm text-charcoal-warm leading-relaxed line-clamp-2">{q.question}</p>
                    </div>
                    <span className="text-charcoal-light/40 flex-shrink-0 mt-1 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                      ▾
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-5 space-y-2 border-t border-cream-200 pt-4 animate-fade-in">
                      {q.options.map((opt, oi) => {
                        const isSelected = answer?.selectedAnswers.includes(opt.id)
                        const isCorrectOpt = q.correctAnswers.includes(opt.id)
                        let style = 'bg-cream-100/50 border-cream-200 text-charcoal-light'
                        if (isCorrectOpt) style = 'bg-green-50 border-green-300 text-green-800'
                        if (isSelected && !isCorrectOpt) style = 'bg-rose-50 border-rose-warm/50 text-rose-warm'

                        return (
                          <div key={opt.id} className={`flex items-center gap-3 p-3 rounded-xl border ${style} text-sm font-body`}>
                            <span className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold
                              ${isCorrectOpt ? 'bg-green-500 text-white' :
                                isSelected ? 'bg-rose-warm text-white' : 'bg-cream-200 text-charcoal-light'}`}>
                              {isCorrectOpt ? '✓' : isSelected ? '✗' : letters[oi]}
                            </span>
                            {opt.text}
                          </div>
                        )
                      })}

                      {q.explanation && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-warm/10 border border-amber-warm/30">
                          <p className="text-xs font-bold text-amber-dark font-body mb-1">💡 Explanation</p>
                          <p className="text-sm text-charcoal-warm font-body leading-relaxed">{q.explanation}</p>
                          {!isCorrect && q.pageReference && (
                            <p className="mt-2 text-sm font-body text-rose-warm flex items-center gap-1.5">
                              <span>📖</span>
                              <span>
                                Review <strong>page {q.pageReference}</strong>
                                {q.sourceFile ? <> of <em className="font-semibold not-italic">{q.sourceFile}</em></> : null}
                              </span>
                            </p>
                          )}
                          {q.fromPastPaper && (
                            <p className="mt-2 text-xs font-body text-amber-dark/80 italic">
                              📝 From past papers
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
