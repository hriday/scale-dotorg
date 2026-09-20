/**
 * Renders a stored free-text answer. React escapes the content, and splitting
 * on blank lines keeps the writer's paragraphing without accepting markup.
 */
export function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 whitespace-pre-wrap text-scale-muted">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}
