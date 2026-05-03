import { QuizSession, QuizQuestion, QuizAnswer } from '@/types'

export async function exportQuizToPDF(session: QuizSession): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PAGE_W = 210
  const PAGE_H = 297
  const MARGIN = 18
  const CONTENT_W = PAGE_W - MARGIN * 2
  let y = MARGIN

  const COLORS = {
    primary: [201, 115, 106] as [number, number, number],
    dark: [61, 44, 44] as [number, number, number],
    mid: [107, 79, 79] as [number, number, number],
    light: [155, 123, 123] as [number, number, number],
    cream: [253, 246, 236] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    correct: [76, 153, 102] as [number, number, number],
    wrong: [201, 115, 106] as [number, number, number],
    neutral: [232, 168, 124] as [number, number, number],
  }

  const correctCount = session.answers.filter(a => a.isCorrect).length
  const total = session.questions.length
  const pct = Math.round((correctCount / total) * 100)

  const checkPageBreak = (neededH: number) => {
    if (y + neededH > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { fontSize?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number } = {}
  ) => {
    const { fontSize = 10, bold = false, color = COLORS.dark, maxWidth } = opts
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    if (maxWidth) {
      doc.text(text, x, yPos, { maxWidth })
    } else {
      doc.text(text, x, yPos)
    }
  }

  // ── HEADER ──────────────────────────────────────────────
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, PAGE_W, 42, 'F')

  doc.setFillColor(255, 255, 255, 0.1)
  for (let i = 0; i < 5; i++) {
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.3)
    doc.circle(180 + i * 8, 8 + i * 6, 12 + i * 3, 'S')
  }

  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('MedQuiz', MARGIN, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 220, 210)
  doc.text('Quiz Results & Review Sheet', MARGIN, 26)

  doc.setFontSize(9)
  doc.setTextColor(255, 200, 195)
  doc.text(new Date(session.completedAt || session.updatedAt).toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }), MARGIN, 34)

  y = 52

  // ── SCORE CARD ──────────────────────────────────────────
  doc.setFillColor(...COLORS.cream)
  doc.roundedRect(MARGIN, y, CONTENT_W, 36, 4, 4, 'F')
  doc.setDrawColor(...COLORS.neutral)
  doc.setLineWidth(0.5)
  doc.roundedRect(MARGIN, y, CONTENT_W, 36, 4, 4, 'S')

  // Score circle
  const circleX = MARGIN + 26
  const circleY = y + 18
  const scoreColor: [number, number, number] = pct >= 70 ? COLORS.correct : pct >= 50 ? COLORS.neutral : COLORS.wrong
  doc.setFillColor(...scoreColor)
  doc.circle(circleX, circleY, 13, 'F')
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`${pct}%`, circleX, circleY + 1.5, { align: 'center' })

  const detailX = MARGIN + 46
  drawText(session.config.subject, detailX, y + 10, { fontSize: 13, bold: true, color: COLORS.dark })
  drawText(`${correctCount} correct out of ${total} questions`, detailX, y + 19, { fontSize: 10, color: COLORS.mid })

  const diffLabel = session.config.difficulty.charAt(0).toUpperCase() + session.config.difficulty.slice(1)
  const modeLabel = session.config.mode.charAt(0).toUpperCase() + session.config.mode.slice(1)
  drawText(`Difficulty: ${diffLabel}  •  Mode: ${modeLabel}  •  ${session.config.questionTypes.join(', ')}`, detailX, y + 27, {
    fontSize: 8, color: COLORS.light
  })

  // Pass/fail badge
  const badgeText = pct >= 70 ? 'PASSED ✓' : pct >= 50 ? 'BORDERLINE' : 'NEEDS REVIEW'
  const badgeColor: [number, number, number] = pct >= 70 ? COLORS.correct : pct >= 50 ? COLORS.neutral : COLORS.wrong
  doc.setFillColor(...badgeColor)
  doc.roundedRect(PAGE_W - MARGIN - 30, y + 10, 30, 10, 3, 3, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(badgeText, PAGE_W - MARGIN - 15, y + 16.5, { align: 'center' })

  y += 46

  // ── QUESTIONS ───────────────────────────────────────────
  session.questions.forEach((q: QuizQuestion, idx: number) => {
    const answer = session.answers.find((a: QuizAnswer) => a.questionId === q.id)
    const isCorrect = answer?.isCorrect ?? false

    checkPageBreak(52)

    // Question header bar
    const headerColor: [number, number, number] = isCorrect ? COLORS.correct : COLORS.wrong
    doc.setFillColor(...headerColor)
    doc.roundedRect(MARGIN, y, CONTENT_W, 9, 2, 2, 'F')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`Q${idx + 1}`, MARGIN + 3, y + 6)

    const typeLabel = q.type === 'single' ? 'Single Choice' : q.type === 'multiple' ? 'Multiple Choice' : q.type === 'true-false' ? 'True / False' : 'Clinical Vignette'
    doc.setFont('helvetica', 'normal')
    doc.text(typeLabel, MARGIN + 12, y + 6)
    doc.text(isCorrect ? '✓ Correct' : '✗ Incorrect', PAGE_W - MARGIN - 3, y + 6, { align: 'right' })

    y += 12

    // Question text
    const questionLines = doc.splitTextToSize(q.question, CONTENT_W - 4)
    const questionH = questionLines.length * 5.5
    checkPageBreak(questionH + 8)
    drawText(q.question, MARGIN + 2, y, { fontSize: 10, bold: true, color: COLORS.dark, maxWidth: CONTENT_W - 4 })
    y += questionH + 4

    // Options
    q.options.forEach((opt) => {
      const isSelected = answer?.selectedAnswers.includes(opt.id)
      const isCorrectOpt = q.correctAnswers.includes(opt.id)

      checkPageBreak(10)

      let bgColor: [number, number, number] = COLORS.white
      let borderColor: [number, number, number] = [220, 200, 200]
      let textColor: [number, number, number] = COLORS.mid
      let marker = '○'

      if (isCorrectOpt) {
        bgColor = [235, 248, 240]
        borderColor = COLORS.correct
        textColor = [40, 100, 60]
        marker = '✓'
      }
      if (isSelected && !isCorrectOpt) {
        bgColor = [255, 240, 238]
        borderColor = COLORS.wrong
        textColor = [140, 50, 50]
        marker = '✗'
      }
      if (isSelected && isCorrectOpt) {
        marker = '✓'
      }

      const optLines = doc.splitTextToSize(`${marker}  ${opt.text}`, CONTENT_W - 10)
      const optH = Math.max(8, optLines.length * 5 + 4)

      doc.setFillColor(...bgColor)
      doc.setDrawColor(...borderColor)
      doc.setLineWidth(0.4)
      doc.roundedRect(MARGIN + 2, y, CONTENT_W - 4, optH, 2, 2, 'FD')

      doc.setFontSize(9)
      doc.setFont('helvetica', isCorrectOpt || (isSelected && !isCorrectOpt) ? 'bold' : 'normal')
      doc.setTextColor(...textColor)
      doc.text(optLines, MARGIN + 6, y + 5.5)
      y += optH + 2
    })

    // Explanation
    if (q.explanation) {
      checkPageBreak(18)
      y += 2

      const refLine = !isCorrect && q.pageReference
        ? `Review page ${q.pageReference}${q.sourceFile ? ` of ${q.sourceFile}` : ''}`
        : null
      const pastLine = q.fromPastPaper ? 'From past papers' : null

      const expLines = doc.splitTextToSize(q.explanation, CONTENT_W - 12)
      const refLines = refLine ? doc.splitTextToSize(refLine, CONTENT_W - 12) : []
      const pastLines = pastLine ? doc.splitTextToSize(pastLine, CONTENT_W - 12) : []
      const totalLines = expLines.length + refLines.length + pastLines.length
      const expH = totalLines * 4.8 + 8 + (refLines.length ? 2 : 0) + (pastLines.length ? 2 : 0)
      checkPageBreak(expH + 4)

      doc.setFillColor(255, 248, 235)
      doc.setDrawColor(...COLORS.neutral)
      doc.setLineWidth(0.3)
      doc.roundedRect(MARGIN + 2, y, CONTENT_W - 4, expH, 2, 2, 'FD')

      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.neutral)
      doc.text('Explanation', MARGIN + 6, y + 6)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.mid)
      doc.text(expLines, MARGIN + 6, y + 12)

      let cursor = y + 12 + expLines.length * 4.8

      if (refLines.length) {
        cursor += 2
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...COLORS.wrong)
        doc.text(refLines, MARGIN + 6, cursor)
        cursor += refLines.length * 4.8
      }

      if (pastLines.length) {
        cursor += 2
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(...COLORS.neutral)
        doc.text(pastLines, MARGIN + 6, cursor)
      }

      y += expH + 6
    }

    y += 4
  })

  // ── FOOTER on last page ──────────────────────────────────
  checkPageBreak(16)
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, PAGE_H - 14, PAGE_W, 14, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 220, 210)
  doc.text('Generated by MedQuiz  •  Study hard, future doctor! 🩺', PAGE_W / 2, PAGE_H - 5.5, { align: 'center' })

  const subject = session.config.subject.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  doc.save(`medquiz_${subject}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
