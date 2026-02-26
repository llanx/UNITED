/**
 * Memoized markdown renderer for chat messages.
 *
 * Uses react-markdown with remark-gfm (tables, strikethrough, etc.)
 * and rehype-highlight (syntax highlighting for fenced code blocks).
 *
 * Parses @mention tokens (@[name](user:id) and @[name](role:id))
 * and renders them as highlighted pills before passing to markdown.
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

/** Regex to match mention tokens: @[display_name](user:id) or @[display_name](role:id) */
const MENTION_REGEX = /@\[([^\]]+)\]\((user|role):([^)]+)\)/g

/**
 * Pre-process content to replace mention tokens with visible markdown-safe spans.
 * We replace them with a format that react-markdown will leave alone.
 */
function preprocessMentions(content: string): { processed: string; mentions: MentionInfo[] } {
  const mentions: MentionInfo[] = []
  let match: RegExpExecArray | null

  // Collect all mention positions
  const regex = new RegExp(MENTION_REGEX)
  while ((match = regex.exec(content)) !== null) {
    mentions.push({
      fullMatch: match[0],
      displayName: match[1],
      type: match[2] as 'user' | 'role',
      id: match[3],
      index: match.index,
    })
  }

  return { processed: content, mentions }
}

interface MentionInfo {
  fullMatch: string
  displayName: string
  type: 'user' | 'role'
  id: string
  index: number
}

/**
 * Split content into segments of plain text and mention tokens.
 * Returns an array of React elements with mentions rendered as styled spans.
 */
function renderWithMentions(content: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = new RegExp(MENTION_REGEX)
  while ((match = regex.exec(content)) !== null) {
    // Text before this mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const displayName = match[1]
    const type = match[2]

    parts.push(
      <span
        key={`mention-${match.index}`}
        className="inline-block cursor-pointer rounded bg-blue-500/20 px-1 font-medium text-blue-300 hover:bg-blue-500/30"
        title={`${type === 'user' ? 'User' : 'Role'}: ${displayName}`}
      >
        @{displayName}
      </span>
    )

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

/**
 * Check if content contains any mention tokens.
 */
export function hasMentions(content: string): boolean {
  return MENTION_REGEX.test(content)
}

/**
 * Extract all mentioned user/role IDs from content.
 */
export function extractMentionIds(content: string): { userIds: string[]; roleIds: string[] } {
  const userIds: string[] = []
  const roleIds: string[] = []
  let match: RegExpExecArray | null

  const regex = new RegExp(MENTION_REGEX)
  while ((match = regex.exec(content)) !== null) {
    if (match[2] === 'user') userIds.push(match[3])
    else if (match[2] === 'role') roleIds.push(match[3])
  }

  return { userIds, roleIds }
}

const MarkdownContent = React.memo(function MarkdownContent({ content }: MarkdownContentProps) {
  // Check if content has mentions -- if so, render with special handling
  const hasMentionTokens = MENTION_REGEX.test(content)

  if (hasMentionTokens) {
    // For content with mentions, we split into segments and render mentions as styled spans
    // while still processing non-mention text through markdown
    return <MentionAwareMarkdown content={content} />
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
})

/** Markdown components shared across renderers */
const markdownComponents = {
  a: ({ href, children }: any) => (
    <a
      href={href}
      className="text-blue-400 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e: React.MouseEvent) => {
        e.preventDefault()
        if (href) window.open(href, '_blank')
      }}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: any) => {
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
  pre: ({ children }: any) => (
    <pre className="my-1 overflow-x-auto">{children}</pre>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-white/20 pl-3 italic text-[var(--color-text-muted)]">
      {children}
    </blockquote>
  ),
  p: ({ children }: any) => (
    <p className="leading-relaxed">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="ml-4 list-disc">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="ml-4 list-decimal">{children}</ol>
  ),
}

/**
 * Renders content that contains @mention tokens.
 * Splits content into lines, processes mentions inline,
 * and renders remaining text through markdown.
 */
function MentionAwareMarkdown({ content }: { content: string }) {
  // Strip mention tokens for markdown processing, replace with placeholder text
  const strippedContent = content.replace(MENTION_REGEX, '@$1')

  // For simple messages with mentions, render directly with mention spans
  // For complex markdown (code blocks, etc), use a simpler approach
  const isSimple = !content.includes('```') && !content.includes('|')

  if (isSimple) {
    return <p className="leading-relaxed">{renderWithMentions(content)}</p>
  }

  // Complex content: render markdown with stripped mentions
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents}
    >
      {strippedContent}
    </ReactMarkdown>
  )
}

export default MarkdownContent
