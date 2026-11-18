function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function calculateBirthdayDetails(birthDate: string, now = new Date()) {
  const original = parseLocalDate(birthDate)
  const month = original.getMonth()
  const birthdayDay = (year: number) => {
    if (month === 1 && original.getDate() === 29) {
      return new Date(year, 2, 0).getDate() === 29 ? 29 : 28
    }
    return original.getDate()
  }
  let next = new Date(now.getFullYear(), month, birthdayDay(now.getFullYear()))
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear() + 1, month, birthdayDay(now.getFullYear() + 1))
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return {
    nextBirthday: localDateKey(next),
    daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000),
    ageOnNextBirthday: next.getFullYear() - original.getFullYear(),
  }
}
