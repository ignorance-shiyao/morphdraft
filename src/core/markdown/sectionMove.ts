// 大纲拖拽重排：按标题层级切 section 区间，重组 markdown。
// h2 带其下所有 h3/h4/h5/h6 子内容一起移动。

export interface OutlineItem {
  level: number
  text: string
  line: number
}

// 计算每个标题对应的 section 行区间 [startLine, endLine)
// endLine = 下一个同级或更高级标题的行号，或文档末尾。
function computeSections(src: string, items: OutlineItem[]): { start: number; end: number }[] {
  const lines = src.split('\n')
  const sections: { start: number; end: number }[] = []
  for (let i = 0; i < items.length; i++) {
    const start = items[i].line
    let end = lines.length
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].level <= items[i].level) {
        end = items[j].line
        break
      }
    }
    sections.push({ start, end })
  }
  return sections
}

// 把 markdown 中 fromIndex 位置的 section 移到 toIndex 位置（大纲项索引）。
// 返回重组后的 markdown。
export function moveSection(
  src: string,
  items: OutlineItem[],
  fromIndex: number,
  toIndex: number,
): string {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return src
  if (fromIndex >= items.length || toIndex >= items.length) return src

  const lines = src.split('\n')
  const sections = computeSections(src, items)

  // 提取被移动的 section 的行范围
  const fromSection = sections[fromIndex]
  const movedLines = lines.slice(fromSection.start, fromSection.end)

  // 确定插入位置
  // 先删除原 section（从后往前删避免索引偏移）
  const deleteStart = fromSection.start
  const deleteEnd = fromSection.end

  // 计算删除后的 toIndex 对应的行号
  let insertLine: number
  if (toIndex < fromIndex) {
    // 向前移：插入到目标 section 之前
    insertLine = sections[toIndex].start
  } else {
    // 向后移：插入到目标 section 之后（删除前的位置）
    // 删除前，目标 section 的 end 就是插入点
    insertLine = sections[toIndex].end
    // 但如果目标在被删除区间之后，需要减去删除的行数
    if (toIndex > fromIndex) {
      insertLine = sections[toIndex].end - (deleteEnd - deleteStart)
    }
  }

  // 执行删除
  lines.splice(deleteStart, deleteEnd - deleteStart)

  // 计算插入位置（删除后可能需要调整）
  let adjustedInsert = insertLine
  if (toIndex > fromIndex) {
    // 向后移时，目标 section 的 end 在删除后前移了
    adjustedInsert = sections[toIndex].end - (deleteEnd - deleteStart)
  } else {
    // 向前移，目标 section 的 start 没变（如果目标在原位置之前）
    adjustedInsert = sections[toIndex].start
  }

  // 插入
  lines.splice(adjustedInsert, 0, ...movedLines)

  return lines.join('\n')
}
