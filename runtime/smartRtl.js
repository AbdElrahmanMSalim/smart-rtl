// Runtime half of the Smart RTL extension.
//
// Custom UI Style injects this file into Cursor's workbench, where, unlike the
// extension host, it can see the chat DOM. It can also be pasted into the
// DevTools console on its own, or injected by launcher/smart-rtl.mjs.
//
// Direction comes from the share of Arabic, Persian or Hebrew letters in the
// prose, with code left out, rather than from the first letter the way
// `dir="auto"` decides. "React هو مكتبة…" is Arabic even though it opens with
// an English word. A message with no RTL letters at all is never touched.
//
// Two modes:
//   - paragraph (default): every paragraph and heading is judged and aligned
//     on its own, so an Arabic paragraph in an English reply goes right and an
//     English one in an Arabic reply goes left. List items and table cells read
//     in their own direction but stay aligned with their list or table, so
//     bullets never jump from side to side.
//   - message: the whole reply turns RTL once it is mostly RTL. Paragraphs
//     still read in their own direction, but all of them align right.
//
// The extension writes a `window.__smartRtlConfig` assignment above this code.
// Everything lives inside an IIFE because Custom UI Style concatenates every
// injected `.js` import into one shared module scope, where top-level names
// would collide. That is also why this file opens and closes with a semicolon:
// an unterminated statement in a neighbouring import would otherwise swallow
// the IIFE as a function call.

;(function () {
  'use strict'

  // One match is one message. When matches nest, the outermost wins, so the
  // sections of a single answer are judged together rather than one by one.
  const DEFAULTS = {
    threshold: 0.3,
    mode: 'paragraph',
    messageSelector: [
      // Cursor: replies, the user's own bubbles, and the prompt input
      '.anysphere-markdown-container-root',
      '.markdown-root',
      '.ui-agent-transcript-human-bubble',
      '.composer-human-message',
      '.aislash-editor-input-readonly',
      '.aislash-editor-input',
      '.ProseMirror',
      // VS Code and Antigravity chat
      '.interactive-item-container .rendered-markdown',
      '.chat-markdown-part',
      // Claude Desktop
      '.font-claude-response .standard-markdown',
      '.font-claude-response .progressive-markdown',
      '[data-testid="user-message"]',
    ].join(', '),
  }

  // For chats nothing above names. Innermost wins here instead, so a wrapper
  // around the whole conversation can never become a single "message" and
  // flip every reply because one of them is Arabic.
  const GENERIC_SELECTOR = '[class*="markdown"], [class*="prose"], [contenteditable="true"]'

  const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, summary, figcaption'
  const MODES = ['paragraph', 'message']
  const CONTAINER_SELECTOR = 'ul, ol, table'
  const CODE_SELECTOR =
    'pre, code, kbd, samp, .monaco-editor, .cm-editor, .composer-message-codeblock, [class*="code-block"], [class*="codeblock"]'
  // The editor and terminal mutate constantly and never hold chat prose.
  const NEVER_SELECTOR = '.monaco-editor, .xterm, pre, code'

  // Cursor's ask-question card. Not markdown: a question is a flex column of
  // divs and spans, its label a flex row of number and text, each option a flex
  // row of letter button and label. A question is judged as one unit by its
  // label, the way a reader would, so an Arabic question with English options
  // like "React" and "Vue" still lays out right-to-left.
  const QUESTION_SELECTOR = '.composer-questionnaire-toolbar-question'
  const QUESTION_LABEL_SELECTOR = '.composer-questionnaire-toolbar-question-label'
  const OPTION_LABEL_SELECTOR = '.composer-questionnaire-toolbar-option-label'

  const EDITABLE_SELECTOR = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

  const STYLE_ELEMENT_ID = 'smart-rtl-style'
  const ATTR = 'data-srtl'

  const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/gu
  const ANY_LETTER = /\p{L}/gu

  const readConfig = () => {
    const raw = window.__smartRtlConfig || {}
    const threshold =
      typeof raw.threshold === 'number' && raw.threshold > 0 && raw.threshold <= 1
        ? raw.threshold
        : DEFAULTS.threshold
    const messageSelector =
      typeof raw.messageSelector === 'string' && raw.messageSelector.trim()
        ? raw.messageSelector.trim()
        : DEFAULTS.messageSelector
    const mode = MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode
    return { threshold, mode, messageSelector }
  }

  // Attributes, not inline styles, so one stylesheet does the work and removing
  // it plus the attributes restores Cursor exactly as it was.
  //
  // "msg" marks a whole message RTL; "para" marks a message whose blocks decide
  // for themselves. Blocks carry "rtl" or "ltr" either way.
  const CODE_LTR = ':is(pre, pre *, .composer-message-codeblock, [class*="code-block"], [class*="codeblock"], .monaco-editor, .cm-editor)'
  const ITEM_BLOCK = ':is(p, h1, h2, h3, h4, h5, h6, blockquote)'
  const CSS = `
    [${ATTR}="msg"] { direction: rtl !important; text-align: right !important; }
    [${ATTR}="msg"] [${ATTR}="rtl"] { direction: rtl !important; text-align: right !important; }
    [${ATTR}="msg"] [${ATTR}="ltr"] { direction: ltr !important; text-align: right !important; }
    /* An English item in an RTL list keeps its bullet on the right with the rest. */
    [${ATTR}="msg"] li[${ATTR}="ltr"] { direction: rtl !important; unicode-bidi: plaintext !important; }
    [${ATTR}="msg"] :is(ul, ol)[${ATTR}="rtl"] { padding-right: 1.5em !important; padding-left: 0 !important; }

    [${ATTR}="para"] [${ATTR}="rtl"] { direction: rtl !important; text-align: right !important; }
    [${ATTR}="para"] [${ATTR}="ltr"] { direction: ltr !important; text-align: left !important; }
    [${ATTR}="para"] :is(ul, ol)[${ATTR}="rtl"] { padding-right: 1.5em !important; padding-left: 0 !important; }
    /*
      An item, or a paragraph inside one, that disagrees with its list keeps the
      list's side for its bullet and alignment, and takes its reading order from
      its own first strong letter.
    */
    [${ATTR}="para"] :is(ul, ol)[${ATTR}="rtl"] > :is(li[${ATTR}="ltr"], li > ${ITEM_BLOCK}[${ATTR}="ltr"]) {
      direction: rtl !important; text-align: right !important; unicode-bidi: plaintext !important;
    }
    [${ATTR}="para"] :is(ul, ol)[${ATTR}="ltr"] > :is(li[${ATTR}="rtl"], li > ${ITEM_BLOCK}[${ATTR}="rtl"]) {
      direction: ltr !important; text-align: left !important; unicode-bidi: plaintext !important;
    }

    :is([${ATTR}="msg"], [${ATTR}="para"]) ${CODE_LTR} { direction: ltr !important; text-align: left !important; }
    :is([${ATTR}="msg"], [${ATTR}="para"]) code { direction: ltr !important; unicode-bidi: isolate !important; }
    textarea[${ATTR}="rtl"] { direction: rtl !important; text-align: right !important; }

    /* Cursor spaces the question card with left-side margins, mirrored here. */
    ${QUESTION_SELECTOR}[${ATTR}="msg"] { margin-left: 0 !important; margin-right: 4px !important; }
    ${QUESTION_SELECTOR}[${ATTR}="msg"] ${QUESTION_LABEL_SELECTOR} { margin-left: 0 !important; margin-right: 6px !important; }
    ${QUESTION_SELECTOR}[${ATTR}="msg"] .composer-questionnaire-toolbar-options { margin-left: 0 !important; margin-right: -4px !important; }
    ${QUESTION_SELECTOR}[${ATTR}="msg"] .composer-questionnaire-toolbar-question-number { text-align: right !important; }
    /* The "Other..." box reads in whatever direction is typed into it, starting from the right. */
    ${QUESTION_SELECTOR}[${ATTR}="msg"] textarea { unicode-bidi: plaintext !important; text-align: right !important; }
    /* Cursor's placeholder is English; RTL would print it as "...Other". */
    ${QUESTION_SELECTOR}[${ATTR}="msg"] textarea:placeholder-shown { direction: ltr !important; }
  `

  const proseText = (element) => {
    if (element.tagName === 'TEXTAREA') return element.value
    let text = ''
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement && node.parentElement.closest(CODE_SELECTOR)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    })
    while (walker.nextNode()) text += walker.currentNode.nodeValue
    return text
  }

  // Null when there are no letters at all (emoji, numbers, a code-only reply),
  // which leaves the element to inherit instead of guessing.
  const rtlShare = (element) => {
    const text = proseText(element)
    const letters = (text.match(ANY_LETTER) || []).length
    if (!letters) return null
    return (text.match(RTL_LETTER) || []).length / letters
  }

  const install = () => {
    if (window.__smartRtl) window.__smartRtl.stop()

    const config = readConfig()

    const setDirection = (element, share) => {
      if (share === null) element.removeAttribute(ATTR)
      else element.setAttribute(ATTR, share >= config.threshold ? 'rtl' : 'ltr')
    }

    const clear = (root) => {
      root.removeAttribute(ATTR)
      root.querySelectorAll(`[${ATTR}]`).forEach((element) => element.removeAttribute(ATTR))
    }

    const proseElements = (root, selector) =>
      [...root.querySelectorAll(selector)].filter((element) => !element.closest(CODE_SELECTOR))

    const markWholeMessage = (root, share, isEditor) => {
      if (share === null || share < config.threshold) {
        clear(root)
        return
      }
      root.setAttribute(ATTR, 'msg')
      if (isEditor) return

      // Lists and tables follow the message so bullets and columns line up on
      // one side; their items and cells still get their own reading direction.
      proseElements(root, CONTAINER_SELECTOR).forEach((element) => element.setAttribute(ATTR, 'rtl'))
      proseElements(root, BLOCK_SELECTOR).forEach((element) => setDirection(element, rtlShare(element)))
    }

    const markEachParagraph = (root, blocks) => {
      // An English reply quoting a few Arabic words has no RTL paragraph, and
      // is left exactly as drawn rather than re-marked LTR block by block.
      const shares = blocks.map(rtlShare)
      if (!shares.some((share) => share !== null && share >= config.threshold)) {
        clear(root)
        return
      }

      root.setAttribute(ATTR, 'para')
      // A list or table goes with most of its items, which is where its bullets
      // and first column end up. Items are counted, not letters: an Arabic item
      // full of English terms like `await` is still one Arabic item.
      proseElements(root, CONTAINER_SELECTOR).forEach((element) => {
        const items = [...element.querySelectorAll(element.tagName === 'TABLE' ? 'td, th' : ':scope > li')]
        const votes = items.map(rtlShare).filter((share) => share !== null)
        if (votes.length === 0) return element.removeAttribute(ATTR)
        const rtlVotes = votes.filter((share) => share >= config.threshold).length
        element.setAttribute(ATTR, rtlVotes * 2 >= votes.length ? 'rtl' : 'ltr')
      })
      blocks.forEach((element, index) => setDirection(element, shares[index]))
    }

    const markQuestion = (question) => {
      const label = question.querySelector(QUESTION_LABEL_SELECTOR)
      const labelShare = label ? rtlShare(label) : null
      const share = labelShare === null ? rtlShare(question) : labelShare
      if (share === null || share < config.threshold) {
        clear(question)
        return
      }
      question.setAttribute(ATTR, 'msg')
      // Each option keeps its own reading order, right-aligned with the rest.
      question.querySelectorAll(OPTION_LABEL_SELECTOR).forEach((option) => setDirection(option, rtlShare(option)))
    }

    const processMessage = (root) => {
      if (!root.isConnected) return
      if (root.matches(QUESTION_SELECTOR)) return markQuestion(root)
      const share = rtlShare(root)

      // Nothing right-to-left anywhere: leave the message exactly as drawn.
      if (!share) {
        if (root.hasAttribute(ATTR)) clear(root)
        return
      }

      // ProseMirror and Lexical own their child nodes and may redraw any they
      // see changed, so an editor is judged and marked as a whole.
      const isEditor = root.matches(EDITABLE_SELECTOR)
      const blocks = isEditor ? [] : proseElements(root, BLOCK_SELECTOR)

      // Plain text with no paragraphs, like a short user bubble, is one block.
      if (config.mode === 'message' || blocks.length === 0) markWholeMessage(root, share, isEditor)
      else markEachParagraph(root, blocks)
    }

    const messageFor = (node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      if (!element || element.closest(NEVER_SELECTOR)) return null

      // A question owns everything inside it, markdown included.
      const question = element.closest(QUESTION_SELECTOR)
      if (question) return question

      let root = element.closest(config.messageSelector)
      if (root) {
        let outer
        while ((outer = root.parentElement && root.parentElement.closest(config.messageSelector))) root = outer
        return root
      }
      // A generic match holding another one is a wrapper, not a message.
      const generic = element.closest(GENERIC_SELECTOR)
      return generic && !generic.querySelector(GENERIC_SELECTOR) ? generic : null
    }

    const messagesIn = (element) => {
      const found = new Set()
      const selector = `${QUESTION_SELECTOR}, ${config.messageSelector}, ${GENERIC_SELECTOR}`
      // querySelectorAll skips the element itself, which is often the message
      // when a reply is mounted in one piece.
      const matches = [...element.querySelectorAll(selector)]
      if (element.matches(selector)) matches.push(element)
      matches.forEach((match) => {
        const root = messageFor(match)
        if (root) found.add(root)
      })
      return found
    }

    // Streaming replies mutate many times a second, so work is batched per
    // frame and each message is judged once per frame at most.
    const pending = new Set()
    let isScheduled = false
    const schedule = (root) => {
      pending.add(root)
      if (isScheduled) return
      isScheduled = true
      requestAnimationFrame(() => {
        isScheduled = false
        const batch = [...pending]
        pending.clear()
        batch.forEach(processMessage)
      })
    }

    // Attributes are not observed: the ones written here would otherwise feed
    // straight back into the observer.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const root = messageFor(mutation.target)
        if (root) schedule(root)
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) messagesIn(node).forEach(schedule)
          })
        }
      }
    })

    const onInput = (event) => {
      const target = event.target
      if (target && target.tagName === 'TEXTAREA' && !target.closest('.monaco-editor')) {
        setDirection(target, rtlShare(target))
      }
    }

    let style = document.getElementById(STYLE_ELEMENT_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ELEMENT_ID
      ;(document.head || document.documentElement).appendChild(style)
    }
    style.textContent = CSS

    messagesIn(document.body).forEach(processMessage)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    document.addEventListener('input', onInput, true)

    const stop = () => {
      observer.disconnect()
      document.removeEventListener('input', onInput, true)
      const ownStyle = document.getElementById(STYLE_ELEMENT_ID)
      if (ownStyle) ownStyle.remove()
      document.querySelectorAll(`[${ATTR}]`).forEach((element) => element.removeAttribute(ATTR))
      delete window.__smartRtl
    }

    window.__smartRtl = { stop, config }
  }

  if (document.body) install()
  else document.addEventListener('DOMContentLoaded', install, { once: true })
})()
;
