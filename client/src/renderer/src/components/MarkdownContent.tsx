/**
 * Memoized markdown renderer for chat messages.
 *
 * Uses react-markdown with remark-gfm (tables, strikethrough, etc.)
 * and rehype-highlight (syntax highlighting for fenced code blocks).
 *
 * Security: rehype-raw is intentionally NOT enabled to prevent XSS.
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/atom-one-dark.css'

interface MarkdownContentProps {
  content: string
}

const MarkdownContent = React.memo(function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-blue-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault()
              if (href) window.open(href, '_blank')
            }}
          >
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          const isFenced = className?.startsWith('language-')
          if (isFenced) {
            return (
              <code className={`${className} block rounded bg-black/30 p-3 text-sm`} {...props}>
                {children}
              </code>
            )
          }
          return (
            <code
              className="rounded bg-white/10 px-1 py-0.5 font-mono text-sm"
              {...props}
            >
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-1 overflow-x-auto">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-white/20 pl-3 italic text-[var(--color-text-muted)]">
            {children}
          </blockquote>
        ),
        p: ({ children }) => (
          <p className="leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="ml-4 list-disc">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-4 list-decimal">{children}</ol>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

export default MarkdownContent
