'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getSession, saveSession } from '@/lib/storage'
import { QuizSession, QuizAnswer, QuizQuestion } from '@/types'

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current) / total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-charcoal-light font-body">
        <span>Question {current + 1} of {total}</span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rose-warm to-amber-warm rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function OptionButton({
  text, selected, onClick, revealed, isCorrect, letter
}: {
  text: string; selected: boolean; onClick: () => void;
  revealed: boolean; isCorrect: boolean; letter: string
}) {
  let style = 'border-amber-light/40 bg-white/60 hover:border-amber-warm/60 hover:bg-amber-warm/5'

  if (revealed) {
    if (isCorrect) style = 'border-green-400 bg-green-50 text-green-800'
    else if (selected && !isCorrect) style = 'border-rose-warm bg-rose-50 text-rose-warm'
    else style = 'border-amber-light/30 bg-white/40 opacity-60'
  } else if (selected) {
    style = 'border-rose-warm bg-rose-warm/8 shadow-sm'
  }

  return (
    <button
      onClick={revealed ? undefined : onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3 ${style}
        ${!revealed ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'}`}
    >
      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-body
        ${revealed && isCorrect ? 'bg-green-500 text-white' :
          revealed && selected && !isCorrect ? 'bg-rose-warm text-white' :
          selected ? 'bg-rose-warm text-white' : 'bg-cream-200 text-charcoal-mid'}`}>
        {revealed && isCorrect ? '✓' : revealed && selected && !isCorrect ? '✗' : letter}
      </span>
      <span className="font-body text-sm leading-relaxed pt-0.5">{text}</span>
    </button>
  )
}

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const s = getSession(id)
    if (!s) { router.push('/'); return }
    if (s.status === 'completed') { router.push(`/results/${id}`); return }
    setSession(s)
    setMounted(true)
  }, [id, router])

  const currentQ: QuizQuestion | undefined = session?.questions[session.currentQuestionIndex]
  const isMultiple = currentQ?.type === 'multiple'
  const isLast = session ? session.currentQuestionIndex >= session.questions.length - 1 : false

  const toggleAnswer = (optId: string) => {
    if (revealed) return
    if (isMultiple) {
      setSelectedAnswers(prev => prev.includes(optId) ? prev.filter(a => a !== optId) : [...prev, optId])
    } else {
      setSelectedAnswers([optId])
    }
  }

  const handleReveal = () => {
    if (!currentQ || selectedAnswers.length === 0) return
    setRevealed(true)
  }

  const handleNext = useCallback(() => {
    if (!session || !currentQ) return

    const isCorrect = currentQ.type === 'multiple'
      ? selectedAnswers.length === currentQ.correctAnswers.length &&
        selectedAnswers.every(a => currentQ.correctAnswers.includes(a))
      : selectedAnswers.length === 1 && currentQ.correctAnswers.includes(selectedAnswers[0])

    const answer: QuizAnswer = {
      questionId: currentQ.id,
      selectedAnswers,
      isCorrect,
    }

    const existingAnswerIdx = session.answers.findIndex(a => a.questionId === currentQ.id)
    const newAnswers = existingAnswerIdx >= 0
      ? session.answers.map((a, i) => i === existingAnswerIdx ? answer : a)
      : [...session.answers, answer]

    const nextIndex = session.currentQuestionIndex + 1
    const isComplete = nextIndex >= session.questions.length

    const correct = newAnswers.filter(a => a.isCorrect).length
    const score = Math.round((correct / session.questions.length) * 100)

    const updated: QuizSession = {
      ...session,
      answers: newAnswers,
      currentQuestionIndex: isComplete ? session.currentQuestionIndex : nextIndex,
      status: isComplete ? 'completed' : 'in-progress',
      score: isComplete ? score : undefined,
      updatedAt: new Date().toISOString(),
      completedAt: isComplete ? new Date().toISOString() : undefined,
    }

    saveSession(updated)
    setSession(updated)

    if (isComplete) {
      router.push(`/results/${session.id}`)
    } else {
      setSelectedAnswers([])
      setRevealed(false)
    }
  }, [session, currentQ, selectedAnswers, router])

  const handlePause = () => {
    if (!session) return
    const updated = { ...session, status: 'paused' as const, updatedAt: new Date().toISOString() }
    saveSession(updated)
    router.push('/')
  }

  if (!mounted || !session || !currentQ) return null

  const letters = ['A', 'B', 'C', 'D', 'E']

  const isCurrentCorrect = revealed && (
    currentQ.type === 'multiple'
      ? selectedAnswers.length === currentQ.correctAnswers.length &&
        selectedAnswers.every(a => currentQ.correctAnswers.includes(a))
      : selectedAnswers.length === 1 && currentQ.correctAnswers.includes(selectedAnswers[0])
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-cream-50 border-b border-amber-light/30 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">🩺</span>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-charcoal-warm text-sm truncate">{session.config.subject}</h1>
              <p className="text-xs text-charcoal-light font-body capitalize">{session.config.difficulty} · {(Array.isArray(session.config.mode) ? session.config.mode : [session.config.mode]).join(' + ')}</p>
            </div>
          </div>
          <button onClick={handlePause} className="btn-ghost text-sm py-1.5 flex-shrink-0">
            ⏸ Pause
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

        {/* Progress */}
        <ProgressBar current={session.currentQuestionIndex} total={session.questions.length} />

        {/* Question card */}
        <div className="card p-6 animate-fade-slide-up" key={currentQ.id}>
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-warm/10 text-rose-warm font-body capitalize">
              {currentQ.type === 'true-false' ? 'True / False' :
               currentQ.type === 'vignette' ? 'Clinical Vignette' :
               currentQ.type === 'single' ? 'Single Choice' : 'Multiple Choice'}
            </span>
            {isMultiple && (
              <span className="text-xs text-charcoal-light font-body">Select all that apply</span>
            )}
          </div>

          {/* Diagram (rendered from the source PDF page) */}
          {currentQ.imageData && (
            <figure className="mb-5 rounded-xl overflow-hidden border border-amber-light/40 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentQ.imageData}
                alt={currentQ.imageDescription || 'Source page from your course material'}
                className="w-full h-auto block"
              />
              {currentQ.sourceFile && currentQ.pageReference && (
                <figcaption className="text-xs text-charcoal-light font-body px-3 py-2 bg-cream-50 border-t border-amber-light/30">
                  From <em className="not-italic font-semibold">{currentQ.sourceFile}</em>, page {currentQ.pageReference}
                </figcaption>
              )}
            </figure>
          )}

          {/* Question text */}
          <h2 className="font-body text-base md:text-lg leading-relaxed text-charcoal-warm mb-6">
            {currentQ.question}
          </h2>

          {/* Options */}
          <div className="space-y-3">
            {currentQ.options.map((opt, idx) => (
              <OptionButton
                key={opt.id}
                letter={letters[idx]}
                text={opt.text}
                selected={selectedAnswers.includes(opt.id)}
                revealed={revealed}
                isCorrect={currentQ.correctAnswers.includes(opt.id)}
                onClick={() => toggleAnswer(opt.id)}
              />
            ))}
          </div>

          {/* Explanation */}
          {revealed && currentQ.explanation && (
            <div className="mt-5 p-4 rounded-xl bg-amber-warm/10 border border-amber-warm/30 animate-fade-in">
              <p className="text-xs font-bold text-amber-dark font-body mb-1">💡 Explanation</p>
              <p className="text-sm text-charcoal-warm font-body leading-relaxed">{currentQ.explanation}</p>
              {!isCurrentCorrect && currentQ.pageReference && (
                <p className="mt-3 text-sm font-body text-rose-warm flex items-center gap-1.5">
                  <span>📖</span>
                  <span>
                    Review <strong>page {currentQ.pageReference}</strong>
                    {currentQ.sourceFile ? <> of <em className="font-semibold not-italic">{currentQ.sourceFile}</em></> : null}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pb-8">
          {!revealed ? (
            <button
              onClick={handleReveal}
              disabled={selectedAnswers.length === 0}
              className="flex-1 btn-primary py-4 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Check Answer
            </button>
          ) : (
            <button onClick={handleNext} className="flex-1 btn-primary py-4">
              {isLast ? 'See Results 🎉' : 'Next Question →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
