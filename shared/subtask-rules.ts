export const MAX_SUBTASKS = 50
export const MAX_SUBTASK_TITLE_LENGTH = 120

export function parseDescription(description: string | undefined) {
  const remainingLines: string[] = []
  const subtaskTitles: string[] = []

  for (const line of (description ?? '').split(/\r?\n/)) {
    const subtaskMatch = line.match(/^\s*-\s+(.+?)\s*$/)
    if (subtaskMatch) {
      subtaskTitles.push(subtaskMatch[1].trim())
    } else {
      remainingLines.push(line)
    }
  }

  return {
    description: remainingLines.join('\n').trim() || undefined,
    subtaskTitles,
  }
}
