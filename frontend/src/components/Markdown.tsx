import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// ── LaTeX preprocessor (shared logic) ────────────────────────────────────────

const LATEX_COMMANDS: Record<string, string> = {
  wedge: '\\wedge', vee: '\\vee', neg: '\\neg', lnot: '\\lnot',
  land: '\\land', lor: '\\lor', implies: '\\implies', iff: '\\iff',
  Rightarrow: '\\Rightarrow', Leftarrow: '\\Leftarrow',
  Leftrightarrow: '\\Leftrightarrow', rightarrow: '\\rightarrow',
  leftarrow: '\\leftarrow', leftrightarrow: '\\leftrightarrow',
  forall: '\\forall', exists: '\\exists',
  times: '\\times', cdot: '\\cdot', leq: '\\leq', geq: '\\geq',
  neq: '\\neq', approx: '\\approx', equiv: '\\equiv',
  infty: '\\infty', therefore: '\\therefore', because: '\\because',
}

const LATEX_CMD_NAMES = Object.keys(LATEX_COMMANDS).sort((a, b) => b.length - a.length)

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

function fixNakedLatexCommands(text: string): string {
  const segments: string[] = []
  let lastIndex = 0
  const mathRegex = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g
  let match: RegExpExecArray | null
  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push(fixSegment(text.slice(lastIndex, match.index)))
    segments.push(match[0])
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push(fixSegment(text.slice(lastIndex)))
  return segments.join('')
}

function preprocessLaTeX(content: string): string {
  let processed = fixCompactLatex(content)
  processed = processed.replace(/\\\[([\\s\\S]*?)\\\]/g, '\n$$\n$1\n$$\n')
  processed = processed.replace(/\\\(([\\s\\S]*?)\\\)/g, '$$$1$$')
  processed = processed.replace(/\$\$/g, '\n$$\n')
  processed = processed.replace(/\n{3,}/g, '\n\n')
  processed = processed.replace(/\\begin\{([a-z*]+)\}([\s\S]*?)\\end\{\1\}/g, (_match, env, inner) => {
    const fixedInner = inner.replace(/ \\ /g, ' \\\\ ')
    return `\\begin{${env}}${fixedInner}\\end{${env}}`
  })
  processed = fixNakedLatexCommands(processed)
  return processed
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Full-featured Markdown renderer with GFM (tables, strikethrough, etc.)
 * and KaTeX math support ($...$ inline, $$...$$ display).
 *
 * Replaces the previous hand-rolled parser to eliminate the need for a
 * custom tokenizer and to gain proper LaTeX rendering.
 */
export function Markdown({ content }: { content: string }) {
  const processedContent = preprocessLaTeX(content)
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children }) {
            const isBlock = className?.startsWith('language-')
            if (isBlock) {
              return (
                <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-[13px] ring-1 ring-white/10">
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
            return <p className="mb-2 last:mb-0">{children}</p>
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
          h1({ children }) {
            return <h1 className="text-xl font-semibold">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold">{children}</h3>
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
