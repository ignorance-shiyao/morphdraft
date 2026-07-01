import { describe, it, expect, beforeEach } from 'vitest'
import { getString, getBool, getNumber, getEnum, setString, setBool, setNumber, remove } from '../localStore'

// node 环境无 localStorage，挂一个最小内存 shim
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

beforeEach(() => {
  ;(globalThis as any).localStorage = new MemStorage()
})

describe('getString', () => {
  it('未设置 → 默认值；空串视为未设置', () => {
    expect(getString('k', 'def')).toBe('def')
    setString('k', '')
    expect(getString('k', 'def')).toBe('def')
  })
  it('有值 → 返回该值', () => {
    setString('k', 'hello')
    expect(getString('k', 'def')).toBe('hello')
  })
})

describe('getBool', () => {
  it("'1'/'0' → true/false，其余 → 默认", () => {
    expect(getBool('k', true)).toBe(true) // 未设置
    setBool('k', false)
    expect(getBool('k', true)).toBe(false)
    setBool('k', true)
    expect(getBool('k', false)).toBe(true)
    setString('k', 'junk')
    expect(getBool('k', true)).toBe(true)
  })
})

describe('getNumber', () => {
  it('夹在 [min,max]，非法 → 默认', () => {
    setNumber('k', 5)
    expect(getNumber('k', 0, 1, 10)).toBe(5)
    setNumber('k', 99)
    expect(getNumber('k', 0, 1, 10)).toBe(10) // 上夹
    setNumber('k', -3)
    expect(getNumber('k', 0, 1, 10)).toBe(1) // 下夹
    setString('k', 'abc')
    expect(getNumber('k', 7, 1, 10)).toBe(7) // 非数 → 默认
  })
})

describe('getEnum', () => {
  const valid = { a: true, b: true }
  it('值须在 valid 内，否则默认', () => {
    expect(getEnum('k', valid, 'a')).toBe('a')
    setString('k', 'b')
    expect(getEnum('k', valid, 'a')).toBe('b')
    setString('k', 'z')
    expect(getEnum('k', valid, 'a')).toBe('a')
  })
})

describe('remove', () => {
  it('删除后回落默认', () => {
    setString('k', 'v')
    remove('k')
    expect(getString('k', 'def')).toBe('def')
  })
})
