import {describe, it, expect} from 'vitest'
import {moveBlockByLine} from '../blockReorder'

// 行号 0 基。下面用一个三段落 slide 验证。
const doc = ['# 标题', '', '段落 A', '', '段落 B', '', '段落 C'].join('\n')
// 行： 0:# 标题 1:'' 2:A 3:'' 4:B 5:'' 6:C

describe('moveBlockByLine', () => {
    it('把 A 下移到 C 的位置（A 在 C 之后）', () => {
        const out = moveBlockByLine(doc, 2, 6)
        expect(out).toBe(['# 标题', '', '段落 B', '', '段落 C', '', '段落 A'].join('\n'))
    })

    it('把 C 上移到 A 的位置（C 在 A 之前）', () => {
        const out = moveBlockByLine(doc, 6, 2)
        expect(out).toBe(['# 标题', '', '段落 C', '', '段落 A', '', '段落 B'].join('\n'))
    })

    it('相邻交换：B 上移到 A', () => {
        const out = moveBlockByLine(doc, 4, 2)
        expect(out).toBe(['# 标题', '', '段落 B', '', '段落 A', '', '段落 C'].join('\n'))
    })

    it('目标落在自身块内 → 原样返回', () => {
        expect(moveBlockByLine(doc, 2, 2)).toBe(doc)
    })

    it('多行块（表格）整体移动', () => {
        const md = ['段落 A', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '段落 B'].join('\n')
        // 把表格(起始行2)下移到 段落B(行6)
        const out = moveBlockByLine(md, 2, 6)
        expect(out).toBe(['段落 A', '', '段落 B', '', '| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n'))
    })

    it('placeAfter 显式插到目标块之前（向下移但放前面）', () => {
        // 把 A(2) 移到 C(6) 之前
        const out = moveBlockByLine(doc, 2, 6, false)
        expect(out).toBe(['# 标题', '', '段落 B', '', '段落 A', '', '段落 C'].join('\n'))
    })

    it('placeAfter 显式插到目标块之后（向上移但放后面）', () => {
        // 把 C(6) 移到 A(2) 之后
        const out = moveBlockByLine(doc, 6, 2, true)
        expect(out).toBe(['# 标题', '', '段落 A', '', '段落 C', '', '段落 B'].join('\n'))
    })

    it('非法行号 → 原样返回', () => {
        expect(moveBlockByLine(doc, -1, 2)).toBe(doc)
        expect(moveBlockByLine(doc, 2, 99)).toBe(doc)
    })
})
