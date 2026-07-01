import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { diagnosticRange, type WorkspaceDiagnostic } from '../workspace/diagnostics'

function buildDecorations(
  view: EditorView,
  getDiagnostics: () => readonly WorkspaceDiagnostic[],
  getMessage: (diagnostic: WorkspaceDiagnostic) => string,
): DecorationSet {
  const markdown = view.state.doc.toString()
  const ranges = getDiagnostics()
    .map((diagnostic) => ({ diagnostic, range: diagnosticRange(markdown, diagnostic) }))
    .filter((item): item is { diagnostic: WorkspaceDiagnostic; range: { from: number; to: number } } =>
      Boolean(item.range && item.range.from < item.range.to),
    )
    .sort((a, b) => a.range.from - b.range.from)
    .map(({ diagnostic, range }) =>
      Decoration.mark({
        class: `cm-link-diagnostic cm-link-diagnostic-${diagnostic.severity}`,
        attributes: { title: getMessage(diagnostic) },
      }).range(range.from, range.to),
    )
  return Decoration.set(ranges)
}

export function linkDiagnosticsExtension(
  getDiagnostics: () => readonly WorkspaceDiagnostic[],
  getMessage: (diagnostic: WorkspaceDiagnostic) => string,
) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, getDiagnostics, getMessage)
    }

    update(update: ViewUpdate) {
      this.decorations = buildDecorations(update.view, getDiagnostics, getMessage)
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  })
}
