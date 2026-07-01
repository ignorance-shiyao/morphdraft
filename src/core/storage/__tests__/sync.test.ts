import { describe, it, expect } from 'vitest'
import { decideSync } from '../sync'

describe('decideSync 同步决策', () => {
  it('远端无对象：本地脏 → push', () => {
    expect(decideSync(undefined, true, undefined)).toBe('push')
  })

  it('远端无对象：本地不脏 → in-sync', () => {
    expect(decideSync(undefined, false, undefined)).toBe('in-sync')
  })

  it('本地不脏 且 远端 === base → in-sync', () => {
    expect(decideSync('v1', false, 'v1')).toBe('in-sync')
  })

  it('本地不脏 且 远端 !== base → pull', () => {
    expect(decideSync('v1', false, 'v2')).toBe('pull')
  })

  it('本地脏 且 远端 === base → push', () => {
    expect(decideSync('v1', true, 'v1')).toBe('push')
  })

  it('本地脏 且 远端 !== base → conflict', () => {
    expect(decideSync('v1', true, 'v2')).toBe('conflict')
  })

  it('首次本地无 base、远端已存在、本地不脏 → pull（远端领先）', () => {
    expect(decideSync(undefined, false, 'v9')).toBe('pull')
  })

  it('首次本地无 base、远端已存在、本地脏 → conflict（双方都有内容）', () => {
    expect(decideSync(undefined, true, 'v9')).toBe('conflict')
  })
})
