import { createTask } from './task-repository.js'

createTask({
  title: 'Revisar planejamento da semana',
  description: 'Dados demonstrativos opcionais.',
  dueDate: new Date().toISOString().slice(0, 10),
  priority: 'medium',
  recurrence: 'weekly',
})

console.log('Dados demonstrativos inseridos.')
