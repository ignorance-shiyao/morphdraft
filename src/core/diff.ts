// 行级 diff：自写 LCS（最长公共子序列），返回新增/删除行的红绿高亮。
// 不依赖第三方库，<200 行。

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

// LCS 计算
function lcs(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

// 回溯生成 diff
function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = []
  let i = a.length
  let j = b.length
  const stack: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ type: 'same', text: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'add', text: b[j - 1] })
      j--
    } else {
      stack.push({ type: 'del', text: a[i - 1] })
      i--
    }
  }

  while (stack.length) result.push(stack.pop()!)
  return result
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const dp = lcs(a, b)
  return backtrack(dp, a, b)
}
