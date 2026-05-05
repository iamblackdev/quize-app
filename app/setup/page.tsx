'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { QuizConfig, QuestionType, Difficulty, QuizMode, QuizQuestion } from '@/types';
import { saveSession } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { renderPdfPageToDataUrl } from '@/lib/pdfRender';

const QUESTION_TYPES: { id: QuestionType; label: string; desc: string; icon: string }[] = [
	{ id: 'single', label: 'Single Choice', desc: 'One correct answer', icon: '◎' },
	{ id: 'multiple', label: 'Multiple Choice', desc: 'Two or more correct', icon: '☑' },
	{ id: 'true-false', label: 'True / False', desc: 'Binary judgment', icon: '⚖' },
	{ id: 'vignette', label: 'Clinical Vignette', desc: 'Patient scenario', icon: '🏥' },
];

const DIFFICULTIES: { id: Difficulty; label: string; desc: string; color: string }[] = [
	{ id: 'easy', label: 'Easy', desc: 'Foundational concepts', color: 'border-green-300 bg-green-50 text-green-700' },
	{ id: 'medium', label: 'Medium', desc: 'Clinical application', color: 'border-amber-300 bg-amber-50 text-amber-700' },
	{ id: 'hard', label: 'Hard', desc: 'Complex reasoning', color: 'border-rose-300 bg-rose-50 text-rose-warm' },
];

const ACCEPT = '.pdf,image/jpeg,image/png,image/webp';

// Files go to Vercel Blob first, so the only ceiling that matters is Anthropic's
// 32 MB per-file / 32 MB per-request input limit.
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function formatMB(bytes: number) {
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// In diagram mode, render the referenced PDF page for each question into a JPEG
// data URL and attach it so the quiz UI can display the actual figure alongside
// the question. PDFs without a usable page reference quietly fall through.
async function attachPageImages(questions: QuizQuestion[], courseFiles: File[], onProgress: (msg: string) => void): Promise<QuizQuestion[]> {
	const filesByName = new Map(courseFiles.map((f) => [f.name, f]));
	const out: QuizQuestion[] = [];

	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		// Mixed mode: Claude tags each question as 'theory' or 'diagram'. Skip theory ones so
		// we don't attach a figure to a question that wasn't meant to need one. Untagged
		// questions still get the image (single-mode diagram quizzes don't need the tag).
		if (q.mode === 'theory') {
			out.push(q);
			continue;
		}
		const file = q.sourceFile ? filesByName.get(q.sourceFile) : undefined;
		if (file && q.pageReference && file.type === 'application/pdf') {
			onProgress(`Rendering diagram ${i + 1} of ${questions.length}… 🖼️`);
			try {
				const imageData = await renderPdfPageToDataUrl(file, q.pageReference);
				out.push(imageData ? { ...q, imageData } : q);
				continue;
			} catch (err) {
				console.warn('PDF page render failed for', q.sourceFile, q.pageReference, err);
			}
		}
		out.push(q);
	}

	return out;
}

function validateUploads(courseFiles: File[], pastFiles: File[]): string | null {
	const all = [...courseFiles, ...pastFiles];

	const oversized = all.find((f) => f.size > MAX_FILE_BYTES);
	if (oversized) {
		return `"${oversized.name}" is ${formatMB(oversized.size)}, which is over Claude's 32 MB per-file limit. Please compress it or split it into smaller PDFs.`;
	}

	const totalBytes = all.reduce((sum, f) => sum + f.size, 0);
	if (totalBytes > MAX_TOTAL_BYTES) {
		return `Your uploads total ${formatMB(totalBytes)}, which is over Claude's 32 MB per-request limit. Try removing some files or splitting long PDFs.`;
	}

	return null;
}

export default function SetupPage() {
	const router = useRouter();
	const courseFileRef = useRef<HTMLInputElement>(null);
	const pastFileRef = useRef<HTMLInputElement>(null);

	const [subject, setSubject] = useState('');
	const [questionCount, setQuestionCount] = useState(10);
	const [difficulty, setDifficulty] = useState<Difficulty>('medium');
	const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(['single']);
	const [modes, setModes] = useState<QuizMode[]>(['theory']);
	const [contextText, setContextText] = useState('');
	const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
	const [pastQuestionsFiles, setPastQuestionsFiles] = useState<File[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [loadingMsg, setLoadingMsg] = useState('');

	const addFiles = (setter: (updater: (prev: File[]) => File[]) => void, selected: FileList | null) => {
		if (!selected || selected.length === 0) return;
		const incoming = Array.from(selected);
		setter((prev) => {
			const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
			return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
		});
	};

	const removeFile = (setter: (updater: (prev: File[]) => File[]) => void, idx: number) => {
		setter((prev) => prev.filter((_, i) => i !== idx));
	};

	const toggleType = (type: QuestionType) => {
		setSelectedTypes((prev) => (prev.includes(type) ? (prev.length > 1 ? prev.filter((t) => t !== type) : prev) : [...prev, type]));
	};

	const toggleMode = (m: QuizMode) => {
		setModes((prev) => (prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m]));
	};

	const loadingMessages = ['Consulting the medical textbooks… 📚', 'Crafting your questions… ✍️', 'Double-checking the anatomy… 🦴', 'Almost ready… 🩺'];

	const handleSubmit = async () => {
		if (!subject.trim()) {
			setError('Please enter a subject or course name');
			return;
		}
		if (selectedTypes.length === 0) {
			setError('Select at least one question type');
			return;
		}

		const sizeError = validateUploads(uploadedFiles, pastQuestionsFiles);
		if (sizeError) {
			setError(sizeError);
			return;
		}

		setLoading(true);
		setError('');

		let msgIdx = 0;
		setLoadingMsg(loadingMessages[0]);
		const interval = setInterval(() => {
			msgIdx = (msgIdx + 1) % loadingMessages.length;
			setLoadingMsg(loadingMessages[msgIdx]);
		}, 2500);

		try {
			const config: QuizConfig = {
				subject: subject.trim(),
				questionCount,
				difficulty,
				questionTypes: selectedTypes,
				mode: modes,
				contextText: contextText.trim() || undefined,
				contextFileNames: uploadedFiles.map((f) => f.name),
				pastQuestionsFileNames: pastQuestionsFiles.map((f) => f.name),
			};

			const totalToUpload = uploadedFiles.length + pastQuestionsFiles.length;
			let uploaded = 0;
			const uploadOne = async (f: File) => {
				if (totalToUpload > 0) {
					setLoadingMsg(`Uploading ${++uploaded} of ${totalToUpload}… 📤`);
				}
				const blob = await upload(f.name, f, {
					access: 'public',
					handleUploadUrl: '/api/blob-upload',
					contentType: f.type,
				});
				return { url: blob.url, type: f.type, name: f.name };
			};

			const fileRefs = [];
			for (const f of uploadedFiles) fileRefs.push(await uploadOne(f));
			const pastQuestionsFileRefs = [];
			for (const f of pastQuestionsFiles) pastQuestionsFileRefs.push(await uploadOne(f));

			setLoadingMsg(loadingMessages[0]);

			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					config,
					contextText: contextText.trim(),
					fileRefs,
					pastQuestionsFileRefs,
				}),
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error || 'Something went wrong generating your quiz. Please try again.');
			}
			const { questions } = (await res.json()) as { questions: QuizQuestion[] };

			const enrichedQuestions = modes.includes('diagram') ? await attachPageImages(questions, uploadedFiles, setLoadingMsg) : questions;

			const sessionId = uuidv4();
			const now = new Date().toISOString();

			saveSession({
				id: sessionId,
				config,
				questions: enrichedQuestions,
				answers: [],
				currentQuestionIndex: 0,
				status: 'in-progress',
				createdAt: now,
				updatedAt: now,
			});

			router.push(`/quiz/${sessionId}`);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Something went wrong generating your quiz. Please try again.');
		} finally {
			clearInterval(interval);
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen">
			{/* Header */}
			<div className="bg-cream-50 border-b border-amber-light/30">
				<div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-4">
					<Link href="/" className="btn-ghost py-1.5 px-3 text-sm">
						← Back
					</Link>
					<div>
						<h1 className="font-display text-2xl font-bold text-charcoal-warm">New Quiz</h1>
						<p className="text-charcoal-light text-xs font-body">Configure your study session</p>
					</div>
				</div>
			</div>

			<div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
				{/* Subject */}
				<div className="animate-fade-slide-up stagger-1">
					<label className="label">Subject / Course Name *</label>
					<input
						type="text"
						className="input-field text-base"
						placeholder="e.g. Anatomy, Pharmacology, Pathology..."
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
					/>
				</div>

				{/* Context */}
				<div className="animate-fade-slide-up stagger-2 space-y-4">
					<div>
						<label className="label">
							Course Content / Notes <span className="font-normal text-charcoal-light">(optional)</span>
						</label>
						<textarea
							className="input-field resize-none text-sm leading-relaxed"
							rows={6}
							placeholder="Paste your lecture notes, study material, or course content here. The more specific, the better your questions will be..."
							value={contextText}
							onChange={(e) => setContextText(e.target.value)}
						/>
					</div>

					<div>
						<label className="label">
							Upload PDFs or Images <span className="font-normal text-charcoal-light">(optional, multiple allowed)</span>
						</label>
						<div
							onClick={() => courseFileRef.current?.click()}
							className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200
                ${uploadedFiles.length > 0 ? 'border-rose-warm/60 bg-rose-warm/5' : 'border-amber-light/50 hover:border-rose-warm/40 hover:bg-rose-warm/3'}`}
						>
							<input
								ref={courseFileRef}
								type="file"
								accept={ACCEPT}
								multiple
								className="hidden"
								onChange={(e) => {
									addFiles(setUploadedFiles, e.target.files);
									if (courseFileRef.current) courseFileRef.current.value = '';
								}}
							/>
							<div className="text-3xl mb-2">📎</div>
							<p className="font-body text-sm text-charcoal-mid">{uploadedFiles.length > 0 ? 'Add more files' : 'Drop PDFs or images here, or click to browse'}</p>
							<p className="text-xs text-charcoal-light mt-1">Supports PDF, JPG, PNG, WebP</p>
						</div>

						{uploadedFiles.length > 0 && (
							<div className="mt-3 space-y-2">
								{uploadedFiles.map((f, idx) => (
									<div key={`${f.name}-${idx}`} className="flex items-center gap-3 bg-rose-warm/5 border border-rose-warm/20 rounded-lg px-3 py-2">
										<span className="text-xl">{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
										<div className="flex-1 min-w-0">
											<p className="font-body font-semibold text-charcoal-warm text-sm truncate">{f.name}</p>
											<p className="text-xs text-charcoal-light">{(f.size / 1024).toFixed(0)} KB</p>
										</div>
										<button
											onClick={() => removeFile(setUploadedFiles, idx)}
											className="text-charcoal-light/50 hover:text-rose-warm transition-colors text-sm"
											aria-label={`Remove ${f.name}`}
										>
											✕
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Past Questions */}
				<div className="animate-fade-slide-up stagger-2 space-y-4">
					<div>
						<label className="label flex items-center gap-2">
							<span>📝</span> Past Exam Questions <span className="font-normal text-charcoal-light">(optional)</span>
						</label>
						<p className="text-xs text-charcoal-light font-body -mt-1 mb-2">The AI will reuse 2–3 of these in your quiz and match the style of the rest.</p>

						<div
							onClick={() => pastFileRef.current?.click()}
							className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200
                ${pastQuestionsFiles.length > 0 ? 'border-amber-warm/60 bg-amber-warm/5' : 'border-amber-light/50 hover:border-amber-warm/40 hover:bg-amber-warm/5'}`}
						>
							<input
								ref={pastFileRef}
								type="file"
								accept={ACCEPT}
								multiple
								className="hidden"
								onChange={(e) => {
									addFiles(setPastQuestionsFiles, e.target.files);
									if (pastFileRef.current) pastFileRef.current.value = '';
								}}
							/>
							<div className="text-2xl mb-1">📚</div>
							<p className="font-body text-sm text-charcoal-mid">{pastQuestionsFiles.length > 0 ? 'Add more past papers' : 'Upload past exam papers (PDFs or images)'}</p>
						</div>

						{pastQuestionsFiles.length > 0 && (
							<div className="mt-3 space-y-2">
								{pastQuestionsFiles.map((f, idx) => (
									<div key={`${f.name}-${idx}`} className="flex items-center gap-3 bg-amber-warm/5 border border-amber-warm/20 rounded-lg px-3 py-2">
										<span className="text-xl">{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
										<div className="flex-1 min-w-0">
											<p className="font-body font-semibold text-charcoal-warm text-sm truncate">{f.name}</p>
											<p className="text-xs text-charcoal-light">{(f.size / 1024).toFixed(0)} KB</p>
										</div>
										<button
											onClick={() => removeFile(setPastQuestionsFiles, idx)}
											className="text-charcoal-light/50 hover:text-rose-warm transition-colors text-sm"
											aria-label={`Remove ${f.name}`}
										>
											✕
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Question Count */}
				<div className="animate-fade-slide-up stagger-3">
					<label className="label">
						Number of Questions: <span className="text-rose-warm font-bold">{questionCount}</span>
					</label>
					<div className="flex items-center gap-4">
						<span className="text-xs text-charcoal-light font-body">5</span>
						<input type="range" min={5} max={40} step={5} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="flex-1 accent-rose-warm" />
						<span className="text-xs text-charcoal-light font-body">40</span>
					</div>
					<div className="flex justify-between mt-1">
						{[5, 10, 15, 20, 25, 30, 35, 40].map((n) => (
							<button
								key={n}
								onClick={() => setQuestionCount(n)}
								className={`text-xs px-2 py-1 rounded-lg transition-all duration-150 font-body
                  ${questionCount === n ? 'bg-rose-warm text-white' : 'text-charcoal-light hover:text-rose-warm'}`}
							>
								{n}
							</button>
						))}
					</div>
				</div>

				{/* Difficulty */}
				<div className="animate-fade-slide-up stagger-3">
					<label className="label">Difficulty Level</label>
					<div className="grid grid-cols-3 gap-3">
						{DIFFICULTIES.map((d) => (
							<button
								key={d.id}
								onClick={() => setDifficulty(d.id)}
								className={`p-4 rounded-xl border-2 text-center transition-all duration-200
                  ${difficulty === d.id ? d.color + ' border-opacity-100 shadow-sm' : 'border-amber-light/30 bg-white/50 text-charcoal-mid hover:border-amber-warm/40'}`}
							>
								<div className="font-display font-bold text-sm">{d.label}</div>
								<div className="text-xs mt-0.5 opacity-75 font-body">{d.desc}</div>
							</button>
						))}
					</div>
				</div>

				{/* Question Types */}
				<div className="animate-fade-slide-up stagger-4">
					<label className="label">
						Question Types <span className="font-normal text-charcoal-light">(select all that apply)</span>
					</label>
					<div className="grid grid-cols-2 gap-3">
						{QUESTION_TYPES.map((t) => {
							const selected = selectedTypes.includes(t.id);
							return (
								<button
									key={t.id}
									onClick={() => toggleType(t.id)}
									className={`p-4 rounded-xl border-2 text-left transition-all duration-200
                    ${selected ? 'border-rose-warm bg-rose-warm/8 shadow-sm' : 'border-amber-light/30 bg-white/50 hover:border-amber-warm/40'}`}
								>
									<div className="flex items-center gap-2 mb-1">
										<span className="text-lg">{t.icon}</span>
										<span className={`font-display font-bold text-sm ${selected ? 'text-rose-warm' : 'text-charcoal-warm'}`}>{t.label}</span>
									</div>
									<p className="text-xs text-charcoal-light font-body">{t.desc}</p>
								</button>
							);
						})}
					</div>
				</div>

				{/* Mode */}
				<div className="animate-fade-slide-up stagger-4">
					<label className="label">
						Question Mode <span className="font-normal text-charcoal-light">(pick one or both)</span>
					</label>
					<div className="grid grid-cols-2 gap-3">
						{(
							[
								{ id: 'theory' as QuizMode, label: 'Theory', desc: 'Concepts, mechanisms & pharmacology', icon: '📖' },
								{ id: 'diagram' as QuizMode, label: 'Diagram', desc: 'Identify structures & interpret findings', icon: '🫀' },
							] as const
						).map((m) => {
							const selected = modes.includes(m.id);
							return (
								<button
									key={m.id}
									onClick={() => toggleMode(m.id)}
									className={`p-4 rounded-xl border-2 text-left transition-all duration-200
                    ${selected ? 'border-amber-warm bg-amber-warm/10 shadow-sm' : 'border-amber-light/30 bg-white/50 hover:border-amber-warm/40'}`}
								>
									<div className="flex items-center gap-2 mb-1">
										<span className="text-xl">{m.icon}</span>
										<span className={`font-display font-bold text-sm ${selected ? 'text-amber-dark' : 'text-charcoal-warm'}`}>{m.label}</span>
									</div>
									<p className="text-xs text-charcoal-light font-body">{m.desc}</p>
								</button>
							);
						})}
					</div>
				</div>

				{/* Error */}
				{error && <div className="bg-rose-50 border border-rose-warm/30 text-rose-warm rounded-xl p-4 text-sm font-body">{error}</div>}

				{/* Submit */}
				<div className="animate-fade-slide-up stagger-5 pb-8">
					<button onClick={handleSubmit} disabled={loading} className="w-full btn-primary py-4 text-base relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed">
						{loading ? (
							<div className="flex flex-col items-center gap-1">
								<div className="flex items-center gap-2">
									<div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
									<span>Generating your quiz…</span>
								</div>
								<span className="text-xs text-white/70 font-normal animate-fade-in">{loadingMsg}</span>
							</div>
						) : (
							<span>Generate Quiz ✨</span>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
