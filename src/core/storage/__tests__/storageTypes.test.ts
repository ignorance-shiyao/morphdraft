import { describe, it, expect } from 'vitest'
import { ConflictError, NotFoundError } from '../types'

describe('storage 类型与错误', () => {
  it('ConflictError 是 Error，携带 path/remote', () => {
    const e = new ConflictError('documents/a.md', { path: 'documents/a.md', etag: 'x' })
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ConflictError')
    expect(e.path).toBe('documents/a.md')
    expect(e.remote?.etag).toBe('x')
  })

  it('NotFoundError 是 Error，携带 path', () => {
    const e = new NotFoundError('documents/missing.md')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('NotFoundError')
    expect(e.path).toBe('documents/missing.md')
  })
})
