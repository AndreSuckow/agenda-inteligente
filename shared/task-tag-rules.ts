export const MAX_TASK_TAGS = 10
export const MAX_TASK_TAG_LENGTH = 30

export function normalizeTaskTags(tags: readonly string[]) {
  const seen = new Set<string>()
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (!tag || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
