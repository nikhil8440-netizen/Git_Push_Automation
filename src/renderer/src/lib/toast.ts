export type ToastType = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  type: ToastType
  message: string
}

let toasts: ToastItem[] = []
let listeners: ((t: ToastItem[]) => void)[] = []
let nextId = 1

function emit(): void {
  for (const l of listeners) l(toasts)
}

export function toast(message: string, type: ToastType = 'info'): void {
  const item: ToastItem = { id: nextId++, type, message }
  toasts = [...toasts, item]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id)
    emit()
  }, 4200)
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(fn: (t: ToastItem[]) => void): () => void {
  listeners.push(fn)
  fn(toasts)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
