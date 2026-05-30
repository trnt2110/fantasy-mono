import { useState, useRef, useEffect } from 'react'

interface EditableCellProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  className?: string
}

export function EditableCell({ value, onSave, placeholder = '—', className = '' }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        className={`bg-white/10 border border-game-neon/50 rounded px-2 py-0.5 text-sm
          text-white outline-none w-full min-w-0 ${className}`}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`cursor-pointer hover:text-game-neon transition-colors truncate block ${
        value ? 'text-slate-200' : 'text-slate-600 italic'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}
