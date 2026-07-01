import type { Panel, ViewUpdate } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search'
import { placeFloatingPanel } from './floatingPosition'

export interface SearchPanelLabels {
  find: string
  replace: string
  previous: string
  next: string
  all: string
  replaceNext: string
  replaceAll: string
  matchCase: string
  regexp: string
  wholeWord: string
  options: string
  close: string
}

export function createFloatingSearchPanel(getLabels: () => SearchPanelLabels) {
  return (view: EditorView): Panel => {
    const labels = getLabels()
    const dom = document.createElement('div')
    dom.className = 'floating-search-panel'

    const findRow = document.createElement('div')
    findRow.className = 'floating-search-row'
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.placeholder = labels.find
    searchInput.setAttribute('main-field', 'true')
    searchInput.className = 'floating-search-input'

    const iconButton = (text: string, title: string, run: () => void) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'floating-search-icon'
      button.textContent = text
      button.title = title
      button.setAttribute('aria-label', title)
      button.addEventListener('click', run)
      return button
    }

    const prevButton = iconButton('↑', labels.previous, () => findPrevious(view))
    const nextButton = iconButton('↓', labels.next, () => findNext(view))
    const allButton = iconButton('≡', labels.all, () => selectMatches(view))
    const optionsButton = iconButton('Aa', labels.options, () => {
      optionsRow.hidden = !optionsRow.hidden
      position()
    })
    const closeButton = iconButton('×', labels.close, () => closeSearchPanel(view))
    closeButton.classList.add('close')
    findRow.append(searchInput, prevButton, nextButton, allButton, optionsButton, closeButton)

    const replaceRow = document.createElement('div')
    replaceRow.className = 'floating-search-row replace'
    const replaceInput = document.createElement('input')
    replaceInput.type = 'text'
    replaceInput.placeholder = labels.replace
    replaceInput.className = 'floating-search-input'
    const replaceButton = document.createElement('button')
    replaceButton.type = 'button'
    replaceButton.className = 'floating-search-action'
    replaceButton.textContent = labels.replaceNext
    replaceButton.addEventListener('click', () => replaceNext(view))
    const replaceAllButton = document.createElement('button')
    replaceAllButton.type = 'button'
    replaceAllButton.className = 'floating-search-action'
    replaceAllButton.textContent = labels.replaceAll
    replaceAllButton.addEventListener('click', () => replaceAll(view))
    replaceRow.append(replaceInput, replaceButton, replaceAllButton)

    const optionsRow = document.createElement('div')
    optionsRow.className = 'floating-search-options'
    optionsRow.hidden = true
    const makeOption = (text: string, key: 'caseSensitive' | 'regexp' | 'wholeWord') => {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.dataset.queryKey = key
      label.append(input, document.createTextNode(text))
      optionsRow.append(label)
      return input
    }
    const caseInput = makeOption(labels.matchCase, 'caseSensitive')
    const regexpInput = makeOption(labels.regexp, 'regexp')
    const wordInput = makeOption(labels.wholeWord, 'wholeWord')

    dom.append(findRow, replaceRow, optionsRow)

    const readQuery = () => new SearchQuery({
      search: searchInput.value,
      replace: replaceInput.value,
      caseSensitive: caseInput.checked,
      regexp: regexpInput.checked,
      wholeWord: wordInput.checked,
    })
    const pushQuery = () => view.dispatch({ effects: setSearchQuery.of(readQuery()) })
    for (const input of [searchInput, replaceInput, caseInput, regexpInput, wordInput]) {
      input.addEventListener('input', pushQuery)
      input.addEventListener('change', pushQuery)
    }
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        ;(event.shiftKey ? findPrevious : findNext)(view)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        closeSearchPanel(view)
      }
    })
    replaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        replaceNext(view)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        closeSearchPanel(view)
      }
    })

    const syncQuery = () => {
      const query = getSearchQuery(view.state)
      if (searchInput.value !== query.search) searchInput.value = query.search
      if (replaceInput.value !== query.replace) replaceInput.value = query.replace
      caseInput.checked = query.caseSensitive
      regexpInput.checked = query.regexp
      wordInput.checked = query.wholeWord
    }
    let frame = 0
    const position = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const selection = view.state.selection.main
        const coords = view.coordsAtPos(selection.head)
        if (!coords) return
        const rect = dom.getBoundingClientRect()
        const placed = placeFloatingPanel(
          coords,
          { width: rect.width || 520, height: rect.height || 86 },
          { width: window.innerWidth, height: window.innerHeight },
        )
        dom.style.left = `${placed.left}px`
        dom.style.top = `${placed.top}px`
        dom.dataset.placement = placed.placement
      })
    }

    return {
      dom,
      mount() {
        syncQuery()
        position()
      },
      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) position()
        syncQuery()
      },
      destroy() {
        cancelAnimationFrame(frame)
      },
    }
  }
}
