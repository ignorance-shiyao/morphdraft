export type ImportProgressStage =
  | 'idle'
  | 'queued'
  | 'reading'
  | 'converting'
  | 'saving'
  | 'opening'
  | 'done'
  | 'error'

export interface ImportProgressInfo {
  stage: ImportProgressStage
  detail?: string
}
