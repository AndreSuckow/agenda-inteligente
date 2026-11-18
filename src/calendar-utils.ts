export function splitTitleIntoLines(title: string, maximumCharacters = 20) {
  const lines: string[] = []
  let remainingTitle = title.trim()

  while (remainingTitle.length > maximumCharacters) {
    let breakAt = remainingTitle.lastIndexOf(' ', maximumCharacters)
    if (breakAt <= 0) {
      const hyphenBreak = remainingTitle.lastIndexOf('-', maximumCharacters - 1)
      breakAt = hyphenBreak > 0 ? hyphenBreak + 1 : maximumCharacters
    }
    lines.push(remainingTitle.slice(0, breakAt).trimEnd())
    remainingTitle = remainingTitle.slice(breakAt).trimStart()
  }
  if (remainingTitle) lines.push(remainingTitle)
  return lines
}

export function getAvailableCalendarSpan(
  weekDateKeys: readonly string[],
  dayIndex: number,
  datesWithTasks: ReadonlySet<string>,
) {
  for (let nextIndex = dayIndex + 1; nextIndex < weekDateKeys.length; nextIndex += 1) {
    if (datesWithTasks.has(weekDateKeys[nextIndex])) {
      return nextIndex - dayIndex
    }
  }
  return weekDateKeys.length - dayIndex
}

export function getBirthdayDateKey(birthDate: string, calendarYear: number) {
  const [, monthText, dayText] = birthDate.split('-')
  const month = Number(monthText)
  const day = Number(dayText)
  if (!month || !day) return null

  const isLeapYear = calendarYear % 4 === 0 && (calendarYear % 100 !== 0 || calendarYear % 400 === 0)
  const birthdayDay = month === 2 && day === 29 && !isLeapYear ? 28 : day
  return `${calendarYear}-${String(month).padStart(2, '0')}-${String(birthdayDay).padStart(2, '0')}`
}
