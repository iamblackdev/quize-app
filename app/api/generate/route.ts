import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { QuizConfig, QuizQuestion } from '@/types'
import { v4 as uuidv4 } from 'uuid'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type UploadedFile = {
  data: string // base64
  type: string // 'application/pdf' | 'image/jpeg' | 'image/png' | ...
  name: string
}

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      config,
      contextText,
      files,
      pastQuestionsFiles,
    } = body as {
      config: QuizConfig
      contextText?: string
      files?: UploadedFile[]
      pastQuestionsFiles?: UploadedFile[]
    }

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

    const systemPrompt = `You are an expert medical educator creating exam questions for a medical student.
Generate exactly ${config.questionCount} questions about "${config.subject}".
Difficulty: ${config.difficulty} (${config.difficulty === 'easy' ? 'foundational concepts' : config.difficulty === 'medium' ? 'clinical application' : 'complex reasoning and edge cases'}).
Question types to include (mix them): ${selectedTypes}.
Mode: ${config.mode === 'theory' ? 'Theory — focus on concepts, mechanisms, pathophysiology, pharmacology, anatomy' : 'Diagram — describe anatomical or clinical diagrams and ask the student to identify labeled structures or interpret findings'}.

Course materials provided: ${courseFileList}
Past papers provided: ${pastFileList}

CRITICAL: Return ONLY a valid JSON array. No markdown, no backticks, no preamble.
Each question object must have this exact shape:
{
  "type": "single" | "multiple" | "true-false" | "vignette",
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
- diagram mode questions should describe a diagram or structure in the question stem
- All explanations must be educational and specific
- Do not number the questions, the id field handles ordering

Rules for pageReference / sourceFile:
- ONLY when course material is provided as a PDF and you can identify the page that supports the correct answer.
- Use the page number you see in the PDF (1-indexed). A range "12-13" is allowed.
- "sourceFile" must exactly match one of the provided course PDF filenames listed above.
- If the answer is from your general knowledge or from non-PDF content, set pageReference and sourceFile to null.
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
      max_tokens: 8192,
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
      return {
        ...q,
        options,
        correctAnswers,
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
