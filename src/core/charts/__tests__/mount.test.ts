import {describe, expect, it} from 'vitest'
import {chartThemeStamp, needsChartMountHeight} from '../mount'

describe('chart mount sizing', () => {
    it('把只有内边距高度的图表容器视为尚未完成布局', () => {
        expect(needsChartMountHeight(0)).toBe(true)
        expect(needsChartMountHeight(16)).toBe(true)
        expect(needsChartMountHeight(79)).toBe(true)
        expect(needsChartMountHeight(80)).toBe(false)
        expect(needsChartMountHeight(320)).toBe(false)
    })
})

describe('chart theme stamp', () => {
    it('主色或明暗态变化时生成不同指纹', () => {
        expect(chartThemeStamp({primaryColor: '#0ea5e9', dark: false})).toBe('#0ea5e9|l')
        expect(chartThemeStamp({primaryColor: '#0ea5e9', dark: true})).toBe('#0ea5e9|d')
        expect(chartThemeStamp({primaryColor: '#0ea5e9', dark: false}))
            .not.toBe(chartThemeStamp({primaryColor: '#c0392b', dark: false}))
    })
})
