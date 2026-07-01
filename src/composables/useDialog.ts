import { reactive } from 'vue'
import { translate } from '../i18n'

export interface SelectOption {
  label: string
  value: string
  hint?: string
}

interface DialogOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'danger'
  options?: SelectOption[] // select 模式的候选项
  inputValue?: string
  inputPlaceholder?: string
}

interface DialogState extends DialogOptions {
  open: boolean
  mode: 'alert' | 'confirm' | 'select' | 'prompt'
  resolve?: (value: boolean | string | null) => void
}

export const dialogState = reactive<DialogState>({
  open: false,
  mode: 'alert',
  title: '',
  message: '',
  confirmText: translate('common.confirm'),
  cancelText: translate('common.cancel'),
  tone: 'default',
  options: [],
  inputValue: '',
  inputPlaceholder: '',
})

function show(mode: DialogState['mode'], options: DialogOptions): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    Object.assign(dialogState, {
      open: true,
      mode,
      title: options.title,
      message: options.message ?? '',
      confirmText: options.confirmText ?? translate('common.confirm'),
      cancelText: options.cancelText ?? translate('common.cancel'),
      tone: options.tone ?? 'default',
      options: options.options ?? [],
      inputValue: options.inputValue ?? '',
      inputPlaceholder: options.inputPlaceholder ?? '',
      resolve,
    })
  })
}

export function settleDialog(value: boolean | string | null) {
  const resolve = dialogState.resolve
  dialogState.open = false
  dialogState.resolve = undefined
  resolve?.(value)
}

export function useDialog() {
  return {
    alert(options: DialogOptions) {
      return show('alert', options) as Promise<boolean>
    },
    confirm(options: DialogOptions) {
      return show('confirm', options) as Promise<boolean>
    },
    // 选择对话框：返回选中项的 value；取消/关闭返回 null
    select(options: DialogOptions) {
      return show('select', options) as Promise<string | null>
    },
    prompt(options: DialogOptions) {
      return show('prompt', options) as Promise<string | null>
    },
  }
}
