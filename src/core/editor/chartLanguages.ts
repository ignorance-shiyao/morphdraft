import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from '@codemirror/language'

type MermaidState = Record<string, never>

const DIAGRAM_KEYWORDS =
  /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart)\b/
const CONTROL_KEYWORDS =
  /^(?:subgraph|end|participant|actor|class|state|section|title|dateFormat|axisFormat|commit|branch|checkout|merge|direction|note|loop|alt|else|opt|par|and|rect|activate|deactivate|style|classDef|linkStyle)\b/i
const RELATION_OPERATOR =
  /^(?:<\|--|--\|>|o--o|x--x|--x|--o|<-->|-\.-?>|={1,3}>|-{1,3}>>?|-->|---|--|-\)|-\])/

const mermaidParser: StreamParser<MermaidState> = {
  name: 'mermaid',
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match('%%')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'
    if (stream.match(DIAGRAM_KEYWORDS)) return 'keyword'
    if (stream.match(CONTROL_KEYWORDS)) return 'controlKeyword'
    if (stream.match(RELATION_OPERATOR)) return 'operator'
    if (stream.match(/^(?:\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?%?)/)) return 'number'
    if (stream.match(/^[A-Za-z_][\w-]*(?=\s*[\[({:])/)) return 'variableName'
    stream.next()
    return null
  },
}

export const CHART_LANGUAGES = [
  LanguageDescription.of({
    name: 'Mermaid',
    alias: ['mermaid'],
    support: new LanguageSupport(StreamLanguage.define(mermaidParser)),
  }),
  LanguageDescription.of({
    name: 'ECharts',
    alias: ['echarts'],
    load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript()),
  }),
]
