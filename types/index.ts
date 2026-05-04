export type QuestionType = 'single' | 'multiple' | 'true-false' | 'vignette'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuizMode = 'theory' | 'diagram'
export type QuizStatus = 'not-started' | 'in-progress' | 'paused' | 'completed'

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  type: QuestionType
  question: string
  options: QuizOption[]
  correctAnswers: string[] // option ids
  explanation: string
  mode?: QuizMode // 'theory' or 'diagram' — set by the model in mixed-mode quizzes so we know which questions deserve a rendered figure
  imageDescription?: string // for diagram questions
  imageData?: string // data: URL of the rendered source PDF page, used for diagram-mode questions
  pageReference?: string // e.g., "12" or "12-13" — page in source PDF
  sourceFile?: string // filename of the source PDF the page reference belongs to
  fromPastPaper?: boolean // true if this question was lifted/adapted from uploaded past papers
}

export interface QuizConfig {
  subject: string
  questionCount: number
  difficulty: Difficulty
  questionTypes: QuestionType[]
  mode: QuizMode[]
  contextText?: string
  contextFileNames?: string[]
  pastQuestionsFileNames?: string[]
}

export interface QuizAnswer {
  questionId: string
  selectedAnswers: string[] // option ids
  isCorrect: boolean
  timeSpent?: number
}

export interface QuizSession {
  id: string
  config: QuizConfig
  questions: QuizQuestion[]
  answers: QuizAnswer[]
  currentQuestionIndex: number
  status: QuizStatus
  score?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}
