import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// ── Block type matching the backend schema ───────────────────────────────────

export interface ContentBlock {
  type: 'explanation' | 'definition' | 'formal_solution'
  content: string
}

// ── Shared Markdown + KaTeX renderer ─────────────────────────────────────────

/**
 * Map of common LaTeX command names (without backslash) to their proper form.
 * Used to fix unescaped commands that appear as naked words in the text.
 */
const LATEX_COMMANDS: Record<string, string> = {
  // Logic operators
  wedge: '\\wedge',
  vee: '\\vee',
  neg: '\\neg',
  lnot: '\\lnot',
  land: '\\land',
  lor: '\\lor',
  implies: '\\implies',
  iff: '\\iff',
  // Arrows
  Rightarrow: '\\Rightarrow',
  Leftarrow: '\\Leftarrow',
  Leftrightarrow: '\\Leftrightarrow',
  rightarrow: '\\rightarrow',
  leftarrow: '\\leftarrow',
  leftrightarrow: '\\leftrightarrow',
  // Quantifiers
  forall: '\\forall',
  exists: '\\exists',
  nexists: '\\nexists',
  // Set theory
  in: '\\in',
  notin: '\\notin',
  subset: '\\subset',
  subseteq: '\\subseteq',
  supset: '\\supset',
  supseteq: '\\supseteq',
  cup: '\\cup',
  cap: '\\cap',
  emptyset: '\\emptyset',
  varnothing: '\\varnothing',
  // Arithmetic
  times: '\\times',
  div: '\\div',
  cdot: '\\cdot',
  pm: '\\pm',
  mp: '\\mp',
  leq: '\\leq',
  geq: '\\geq',
  neq: '\\neq',
  approx: '\\approx',
  equiv: '\\equiv',
  // Greek
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  theta: '\\theta',
  lambda: '\\lambda',
  mu: '\\mu',
  pi: '\\pi',
  sigma: '\\sigma',
  phi: '\\phi',
  omega: '\\omega',
  // Misc
  infty: '\\infty',
  therefore: '\\therefore',
  because: '\\because',
}

/**
 * Build a regex that matches any of the LaTeX command names as whole words.
 * We look for patterns like: letter(s) + commandName + letter(s)
 * e.g. "PwedgeR" → "$P \\wedge R$"
 * or standalone: "wedge" → "$\\wedge$"
 */
const LATEX_CMD_NAMES = Object.keys(LATEX_COMMANDS)
  // Sort longest-first so "Leftrightarrow" is tried before "Leftarrow"
  .sort((a, b) => b.length - a.length)

/**
 * Pattern to match:
 * - Optional leading uppercase letter(s) or digit (a math variable like P, Q, A, etc.)
 * - A known LaTeX command name
 * - Optional trailing uppercase letter(s) or digit
 * Only matches when not already inside $...$ delimiters or preceded by backslash.
 */
const NAKED_LATEX_RE = new RegExp(
  `(?<!\\\\)(?<!\\$)\\b([A-Z]?)(${LATEX_CMD_NAMES.join('|')})([A-Z]?)\\b(?!\\$)`,
  'g'
)

const TEXT_COMMAND_PHRASES: Record<string, string> = {
  legusta: 'le gusta',
  pertenecea: 'pertenece a',
}

function humanizeTextCommand(raw: string): string {
  const lower = raw.toLowerCase()
  return TEXT_COMMAND_PHRASES[lower] ?? raw.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function fixCompactLatex(content: string): string {
  return content
    .replace(
      /\(([^)]+)\)in([A-Z])times([A-Z])\s*\/\s*([a-zA-Z])text([a-zA-Z]+)([a-zA-Z])\b/g,
      (_match, tuple, leftSet, rightSet, variable, phrase, lastVariable) =>
        `$(${tuple}) \\in ${leftSet} \\times ${rightSet} \\mid ${variable} \\text{${humanizeTextCommand(phrase)}} ${lastVariable}$`,
    )
    .replace(
      /\b([a-zA-Z])text([a-zA-Z]+)([a-zA-Z])\b/g,
      (_match, variable, phrase, lastVariable) =>
        `$${variable} \\text{${humanizeTextCommand(phrase)}} ${lastVariable}$`,
    )
    .replace(
      /\b([a-zA-Z])?in([A-Z])times([A-Z])\b/g,
      (_match, variable = '', leftSet, rightSet) =>
        `$${variable ? `${variable} ` : ''}\\in ${leftSet} \\times ${rightSet}$`,
    )
    .replace(/\b([A-Z])times([A-Z])\b/g, (_match, left, right) => `$${left} \\times ${right}$`)
    .replace(
      /\b([a-zA-Z])?in([A-Z])\b/g,
      (_match, variable = '', setName) =>
        `$${variable ? `${variable} ` : ''}\\in ${setName}$`,
    )
}

function preprocessLaTeX(content: string) {
  let processed = fixCompactLatex(content)

  // 1. Convert display math \[ ... \] to $$ ... $$
  processed = processed.replace(/\\\[([\\s\\S]*?)\\\]/g, '\n$$\n$1\n$$\n')

  // 2. Convert inline math \( ... \) to $ ... $
  processed = processed.replace(/\\\(([\\s\\S]*?)\\\)/g, '$$$1$$')

  // 3. Fix display $$ ... $$ by ensuring they are on their own lines.
  // remark-math requires $$ to start and end on a new line to be parsed as display math.
  processed = processed.replace(/\$\$/g, '\n$$\n')
  processed = processed.replace(/\n{3,}/g, '\n\n')

  // 4. Fix single backslashes in matrix/cases environments (e.g. ` \ ` instead of ` \\ `)
  // LLMs often output `\\` in JSON which becomes `\` in the Python string.
  processed = processed.replace(/\\begin\{([a-z*]+)\}([\s\S]*?)\\end\{\1\}/g, (_match, env, inner) => {
    // Replace ` \ ` with ` \\ ` to fix matrix row breaks
    const fixedInner = inner.replace(/ \\ /g, ' \\\\ ')
    return `\\begin{${env}}${fixedInner}\\end{${env}}`
  })

  // 5. Fix naked LaTeX commands that appear as plain text (the LLM forgot $ delimiters).
  // Handle patterns like "PwedgeR" → "$P \wedge R$" or "wedge" → "$\wedge$"
  // We must be careful not to touch text that's already inside $ delimiters.
  processed = fixNakedLatexCommands(processed)

  return processed
}

/**
 * Finds LaTeX commands that appear as plain text (without $ delimiters)
 * and wraps them properly. Skips content already inside $...$ or $$...$$.
 */
function fixNakedLatexCommands(text: string): string {
  // Split text into segments: inside-math and outside-math
  const segments: string[] = []
  let lastIndex = 0
  // Match $$ ... $$ or $ ... $ (non-greedy)
  const mathRegex = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g
  let match: RegExpExecArray | null

  while ((match = mathRegex.exec(text)) !== null) {
    // Add text before this math segment
    if (match.index > lastIndex) {
      segments.push(fixSegment(text.slice(lastIndex, match.index)))
    }
    // Add math segment unchanged
    segments.push(match[0])
    lastIndex = match.index + match[0].length
  }
  // Add remaining text after last math segment
  if (lastIndex < text.length) {
    segments.push(fixSegment(text.slice(lastIndex)))
  }

  return segments.join('')
}

/**
 * Fix naked LaTeX commands in a segment of text that is NOT inside math delimiters.
 */
function fixSegment(segment: string): string {
  return segment.replace(NAKED_LATEX_RE, (_match, pre, cmd, post) => {
    const latexCmd = LATEX_COMMANDS[cmd]
    if (!latexCmd) return _match

    const parts: string[] = []
    if (pre) parts.push(pre)
    parts.push(latexCmd)
    if (post) parts.push(post)

    return `$${parts.join(' ')}$`
  })
}

function MathMarkdown({ content }: { content: string }) {
  const processedContent = preprocessLaTeX(content)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Fenced code blocks
        code({ className, children }) {
          const isBlock = className?.startsWith('language-')
          if (isBlock) {
            return (
              <pre className="my-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-[13px] ring-1 ring-white/10">
                <code className={className}>{children}</code>
              </pre>
            )
          }
          return (
            <code className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
        },
        ol({ children }) {
          return <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>
        },
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>
        },
        em({ children }) {
          return <em className="italic">{children}</em>
        },
        a({ children, href }) {
          return (
            <a
              href={href}
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          )
        },
      }}
    >
      {processedContent}
    </ReactMarkdown>
  )
}

// ── Individual block renderers ────────────────────────────────────────────────

function ExplanationBlock({ content }: { content: string }) {
  return (
    <div className="text-[15px] text-foreground/90">
      <MathMarkdown content={content} />
    </div>
  )
}

function DefinitionBlock({ content }: { content: string }) {
  return (
    <section className="text-[15px] text-foreground/90">
      <p className="mb-2 font-semibold text-foreground">
        Definición
      </p>
      <MathMarkdown content={content} />
    </section>
  )
}

function FormalSolutionBlock({ content }: { content: string }) {
  return (
    <section className="text-[15px] text-foreground/90">
      <p className="mb-2 font-semibold text-foreground">
        Desarrollo formal
      </p>
      <MathMarkdown content={content} />
    </section>
  )
}

// ── Root TutorBlocks component ────────────────────────────────────────────────

/**
 * Renders an array of ContentBlocks from the TutorMath backend.
 * Blocks form one continuous answer; formal sections use restrained headings
 * instead of cards so the explanation reads as a coherent lesson.
 * All block content supports Markdown (bold, lists, code) and KaTeX math ($...$).
 */
export function TutorBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'definition':
            return <DefinitionBlock key={i} content={block.content} />
          case 'formal_solution':
            return <FormalSolutionBlock key={i} content={block.content} />
          default:
            return <ExplanationBlock key={i} content={block.content} />
        }
      })}
    </div>
  )
}
