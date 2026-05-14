import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { del } from '@vercel/blob'
import { QuizConfig, QuizQuestion } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type UploadedFile = {
  data: string // base64
  type: string // 'application/pdf' | 'image/jpeg' | 'image/png' | ...
  name: string
}

type BlobRef = {
  url: string
  type: string
  name: string
}

export const maxDuration = 120

async function fetchBlobAsBase64(ref: BlobRef): Promise<UploadedFile> {
  const res = await fetch(ref.url)
  if (!res.ok) {
    throw new Error(`Failed to fetch uploaded file "${ref.name}" (status ${res.status})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return { data: buf.toString('base64'), type: ref.type, name: ref.name }
}

export async function POST(req: NextRequest) {
  let blobUrlsToCleanup: string[] = []

  try {
    const body = await req.json()
    const {
      config,
      contextText,
      fileRefs = [],
      pastQuestionsFileRefs = [],
    } = body as {
      config: QuizConfig
      contextText?: string
      fileRefs?: BlobRef[]
      pastQuestionsFileRefs?: BlobRef[]
    }

    blobUrlsToCleanup = [...fileRefs, ...pastQuestionsFileRefs].map(r => r.url)

    const [files, pastQuestionsFiles] = await Promise.all([
      Promise.all(fileRefs.map(fetchBlobAsBase64)),
      Promise.all(pastQuestionsFileRefs.map(fetchBlobAsBase64)),
    ])

    const typeDescriptions: Record<string, string> = {
      single: 'single best answer MCQ (one correct option)',
      multiple: 'multiple correct answer MCQ (two or more correct options)',
      'true-false': 'true or false question',
      vignette: 'clinical scenario vignette style (short patient case followed by a question)',
    }

    const selectedTypes = config.questionTypes.map(t => typeDescriptions[t]).join(', ')

    const courseFiles = (files ?? []).filter(f => f && f.data && f.type)
    const pastFiles = (pastQuestionsFiles ?? []).filter(f => f && f.data && f.type)
    const hasPastQuestions = pastFiles.length > 0

    const courseFileList = courseFiles.map(f => f.name).join(', ') || 'none'
    const pastFileList = pastFiles.map(f => f.name).join(', ') || 'none'

    const modes = Array.isArray(config.mode) ? config.mode : [config.mode]
    const wantsTheory = modes.includes('theory')
    const wantsDiagram = modes.includes('diagram')
    const isMixed = wantsTheory && wantsDiagram

    const theoryDescription = 'THEORY questions: focus on concepts, mechanisms, pathophysiology, pharmacology, anatomy. Standard text-only stems.'

    const diagramDescription = [
      'DIAGRAM questions: the student will be shown the actual page from the source PDF (when available) next to the question. Build the question around a specific diagram, illustration, photo, or labeled figure.',
      '',
      'When you anchor a diagram question to a real PDF page, the student sees the ENTIRE page including all text printed on it. The answer must NOT be obtainable by reading the surrounding text — only by looking at the figure itself:',
      '- Read every word of text on the chosen page. If your candidate answer (or its synonym, or its definition) appears anywhere in that text, that question is INVALID — pick a different detail or page.',
      '- Prefer: small labels inside the figure that the slide text does NOT discuss; spatial relationships between two labeled structures; what a labeled arrow/number/letter points to when the slide text doesn\'t restate it; the function or clinical relevance of a labeled structure when only the name is on the slide; identifying an unlabeled structure shown in the figure.',
      '- Avoid: any term that appears in the slide\'s bullet points, headings, or captions; "what is structure X" when X\'s name is printed adjacent to it.',
      '',
      'Fallback when no usable figure exists: if no provided PDF page contains a figure suitable for the topic (or no PDFs were uploaded at all), you MAY write a text-described diagram question — describe the diagram clearly in the question stem (e.g. "Consider a coronal section of the kidney showing the renal cortex, medulla, and collecting system. Which structure …"). The described diagram and topic must still fit the course subject. Set pageReference and sourceFile to null in that case.',
    ].join('\n')

    const modeBlock = isMixed
      ? `Mode: MIXED — produce a mix of theory and diagram questions. For EACH question, set the "mode" field to either "theory" or "diagram" so we know which it is. Aim for a roughly balanced mix unless one type fits the source material much better.\n\n${theoryDescription}\n\n${diagramDescription}`
      : wantsDiagram
        ? `Mode: DIAGRAM — every question must be a diagram question. Set "mode": "diagram" on every question.\n\n${diagramDescription}`
        : `Mode: THEORY — every question is theory-style. Set "mode": "theory" on every question.\n\n${theoryDescription}`

    const systemPrompt = `You are an expert medical educator creating exam questions for a medical student.
Generate exactly ${config.questionCount} questions about "${config.subject}".
Difficulty: ${config.difficulty} (${config.difficulty === 'easy' ? 'foundational concepts and direct recall' : config.difficulty === 'medium' ? 'applied understanding — go beyond rote recall to test whether the student can use the concept, but keep the framing academic, not a patient-presentation case' : 'complex reasoning and edge cases'}).
Question types to include (mix them): ${selectedTypes}.
${modeBlock}

Course materials provided: ${courseFileList}
Past papers provided: ${pastFileList}

CRITICAL: Return ONLY a valid JSON array. No markdown, no backticks, no preamble.
Each question object must have this exact shape:
{
  "type": "single" | "multiple" | "true-false" | "vignette",
  "mode": "theory" | "diagram",
  "question": "Question text here",
  "options": [
    { "id": "a", "text": "Option text" },
    { "id": "b", "text": "Option text" },
    { "id": "c", "text": "Option text" },
    { "id": "d", "text": "Option text" }
  ],
  "correctAnswers": ["a"],
  "explanation": "Brief clear explanation of why the answer is correct and why distractors are wrong",
  "pageReference": "12" | "12-13" | null,
  "sourceFile": "<filename of the source PDF for the page reference>" | null,
  "fromPastPaper": true | false
}

Rules for question shape:
- true-false questions have exactly 2 options: { id: "a", text: "True" } and { id: "b", text: "False" }
- single questions have 4 options, one correct
- multiple questions have 4-5 options with exactly 2 correct (never more, never fewer)
- vignette questions begin with a patient scenario paragraph
- All explanations must be educational and specific
- Do not number the questions, the id field handles ordering

Rules for pageReference / sourceFile:
- ONLY when course material is provided as a PDF and you can identify the page that supports the correct answer.
- For diagram-mode questions backed by a real figure, give a SINGLE page number (not a range) — the page that actually contains the figure.
- "sourceFile" must exactly match one of the provided course PDF filenames listed above.
- If the answer is from your general knowledge, from non-PDF content, or you wrote a text-described diagram question, set both pageReference and sourceFile to null.
- Never invent a page number.

Rules for past papers (ONLY if past papers are provided):
- Include 2-3 questions taken DIRECTLY (or with minimal adaptation) from the past papers — set "fromPastPaper": true on those.
- For all other questions, mimic the linguistic style, length, phrasing, and difficulty of the past papers — but mark "fromPastPaper": false.
- The 2-3 past-paper questions count toward the total of ${config.questionCount}.
- If past papers contain image-based questions you cannot replicate, skip those and pick text-based ones instead.
${hasPastQuestions ? '' : '- No past papers were provided in this run, so set "fromPastPaper": false on every question.'}
`

    // SDK 0.27 typings don't include the document content block, but the API accepts it.
    const userContent: Array<Record<string, unknown>> = []

    if (contextText && contextText.trim()) {
      userContent.push({
        type: 'text',
        text: `=== COURSE CONTENT (pasted notes) ===\n${contextText}`,
      })
    }

    courseFiles.forEach((f) => {
      userContent.push({
        type: 'text',
        text: `=== COURSE MATERIAL: ${f.name} ===`,
      })
      if (f.type === 'application/pdf') {
        userContent.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: f.data,
          },
          title: f.name,
        })
      } else if (f.type.startsWith('image/')) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: f.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: f.data,
          },
        })
      }
    })

    if (hasPastQuestions) {
      userContent.push({
        type: 'text',
        text: `=== PAST EXAM PAPERS (use these to: (a) reuse 2-3 questions in the output, marked fromPastPaper: true; (b) match style/tone for the rest) ===`,
      })
      pastFiles.forEach((f) => {
        userContent.push({
          type: 'text',
          text: `--- Past paper: ${f.name} ---`,
        })
        if (f.type === 'application/pdf') {
          userContent.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: f.data,
            },
            title: f.name,
          })
        } else if (f.type.startsWith('image/')) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: f.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: f.data,
            },
          })
        }
      })
    }

    if (userContent.length === 0) {
      userContent.push({
        type: 'text',
        text: `Generate questions based on your knowledge of "${config.subject}" as a medical subject.`,
      })
    }

    userContent.push({
      type: 'text',
      text: `Now generate exactly ${config.questionCount} quiz questions as a JSON array. Return only the JSON array.`,
    })

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent as unknown as Anthropic.MessageParam['content'] }],
    })

    const rawText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')

    const cleaned = extractJsonArray(rawText)
    const parsed = JSON.parse(cleaned) as Array<Omit<QuizQuestion, 'id'>>

    const courseFileNames = new Set(courseFiles.map(f => f.name))

    const questions: QuizQuestion[] = parsed.map((q) => {
      const pageReference = typeof q.pageReference === 'string' && q.pageReference.trim()
        ? q.pageReference.trim()
        : undefined
      const sourceFile = typeof q.sourceFile === 'string' && courseFileNames.has(q.sourceFile)
        ? q.sourceFile
        : undefined
      const { options, correctAnswers } = shuffleOptions(q.type, q.options, q.correctAnswers)
      // For single-mode quizzes, default the per-question mode tag to that mode so the
      // UI/render pipeline doesn't have to special-case missing tags.
      const claudeMode = q.mode === 'theory' || q.mode === 'diagram' ? q.mode : undefined
      const mode = claudeMode ?? (isMixed ? undefined : (wantsDiagram ? 'diagram' : 'theory'))
      return {
        ...q,
        options,
        correctAnswers,
        mode,
        id: uuidv4(),
        pageReference: sourceFile ? pageReference : undefined,
        sourceFile,
        fromPastPaper: q.fromPastPaper === true,
      }
    })

    return NextResponse.json({ questions })
  } catch (err) {
    console.error('Generate error:', err)
    const { message, status } = explainGenerateError(err)
    return NextResponse.json({ error: message }, { status })
  } finally {
    if (blobUrlsToCleanup.length > 0) {
      // Best-effort cleanup — these blobs were only needed for this single
      // generation request. Failure to delete shouldn't block the response.
      del(blobUrlsToCleanup).catch(err => console.warn('Blob cleanup failed:', err))
    }
  }
}

function explainGenerateError(err: unknown): { message: string; status: number } {
  if (err instanceof Anthropic.APIError) {
    const raw = (err.message || '').toLowerCase()
    const apiStatus = typeof err.status === 'number' ? err.status : 500

    if (apiStatus === 413 || raw.includes('request too large') || raw.includes('payload too large')) {
      return {
        message: 'Your upload is too large for Claude to process in one go. The total of all uploaded PDFs and images must be under 32 MB. Try removing some files, or split a long PDF into smaller parts.',
        status: 413,
      }
    }

    if (raw.includes('page')) {
      return {
        message: 'One of your PDFs has too many pages for Claude to process. The current limit is 100 pages per PDF. Please split it into smaller PDFs (e.g. by chapter) and upload those instead.',
        status: 400,
      }
    }

    if (raw.includes('size') || raw.includes('too large') || raw.includes('32 mb') || raw.includes('32mb')) {
      return {
        message: 'One of your uploaded files is over the 32 MB size limit. Please compress it or split it into smaller files and try again.',
        status: 400,
      }
    }

    if (apiStatus === 429) {
      return {
        message: 'Claude is rate-limiting requests right now. Please wait a moment and try again.',
        status: 429,
      }
    }

    if (apiStatus === 401 || apiStatus === 403) {
      return {
        message: 'The Anthropic API key is missing or not authorized. Please check your server configuration.',
        status: apiStatus,
      }
    }

    return {
      message: `Claude couldn't process your request: ${err.message}`,
      status: apiStatus,
    }
  }

  if (err instanceof SyntaxError) {
    return {
      message: 'Claude returned an unexpected response format. Please try again — sometimes a retry is enough.',
      status: 502,
    }
  }

  const message = err instanceof Error ? err.message : 'Failed to generate questions'
  return { message, status: 500 }
}

// Claude tends to anchor on the example schema and make "a" the correct answer
// disproportionately often. We shuffle option positions server-side so the
// correct answer is uniformly distributed across slots, regardless of the order
// Claude returned them in.
function shuffleOptions(
  type: QuizQuestion['type'],
  options: QuizQuestion['options'],
  correctAnswers: string[],
): { options: QuizQuestion['options']; correctAnswers: string[] } {
  if (!Array.isArray(options) || options.length === 0) {
    return { options: options ?? [], correctAnswers: correctAnswers ?? [] }
  }
  // True/false has fixed semantics ("a" = True, "b" = False); shuffling would
  // make the labels nonsensical.
  if (type === 'true-false') {
    return { options, correctAnswers }
  }

  const correctSet = new Set(correctAnswers ?? [])
  const correctTexts = new Set(
    options.filter(o => correctSet.has(o.id)).map(o => o.text),
  )

  const shuffled = [...options]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const letters = ['a', 'b', 'c', 'd', 'e', 'f']
  const newOptions = shuffled.map((o, i) => ({ id: letters[i] ?? o.id, text: o.text }))
  const newCorrectAnswers = newOptions.filter(o => correctTexts.has(o.text)).map(o => o.id)

  return { options: newOptions, correctAnswers: newCorrectAnswers }
}

function extractJsonArray(raw: string): string {
  const stripped = raw.replace(/```json|```/g, '').trim()
  const first = stripped.indexOf('[')
  const last = stripped.lastIndexOf(']')
  if (first >= 0 && last > first) {
    return stripped.slice(first, last + 1)
  }
  return stripped
}
