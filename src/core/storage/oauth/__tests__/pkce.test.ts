// PKCE 测试：S256 challenge 用 RFC 7636 附录 B 官方向量校验；verifier/state 熵与字符集。
import { describe, it, expect } from 'vitest'
import { generateVerifier, challengeFromVerifier, randomState, base64UrlEncode } from '../pkce'

describe('PKCE', () => {
  it('challengeFromVerifier 匹配 RFC 7636 官方向量', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await challengeFromVerifier(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('generateVerifier 长度钳在 43–128、字符集为 unreserved', () => {
    expect(generateVerifier(10).length).toBe(43)
    expect(generateVerifier(200).length).toBe(128)
    const v = generateVerifier(64)
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{64}$/)
  })

  it('generateVerifier 每次不同（高熵）', () => {
    expect(generateVerifier()).not.toBe(generateVerifier())
  })

  it('randomState 非空且每次不同', () => {
    const a = randomState(), b = randomState()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })

  it('base64UrlEncode 无 +/= 字符', () => {
    const s = base64UrlEncode(new Uint8Array([251, 255, 191, 0]))
    expect(s).not.toMatch(/[+/=]/)
  })
})
