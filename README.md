# MedQuiz 🩺

AI-powered medical quiz app for exam preparation. Built with Next.js 14, Tailwind CSS, and the Anthropic Claude API.

## Features

- 🤖 **AI Question Generation** — Claude reads your notes, PDFs, or images and generates tailored exam questions
- 📝 **Multiple Question Types** — Single choice, multiple choice, True/False, and Clinical Vignettes
- 🎯 **Adaptive Difficulty** — Easy, Medium, and Hard levels
- ⏸ **Pause & Resume** — Pick up where you left off
- 📊 **Quiz History** — Track your performance over time
- 📄 **PDF Export** — Download a full review sheet with your answers, correct answers, and explanations

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo>
cd medquiz
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get your key at: https://console.anthropic.com

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy ✓

## Project Structure

```
app/
  page.tsx              # Dashboard with history
  setup/page.tsx        # Quiz configuration
  quiz/[id]/page.tsx    # Active quiz
  results/[id]/page.tsx # Results + PDF export
  api/
    generate/route.ts   # Claude API (server-side)
lib/
  storage.ts            # localStorage session manager
  pdfExport.ts          # jsPDF results export
types/
  index.ts              # TypeScript types
```

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Anthropic Claude API** (claude-opus-4-5)
- **jsPDF** (client-side PDF generation)
- **localStorage** (session persistence, no database needed)
