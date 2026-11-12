// Exercises runtime/smartRtl.js against a DOM built from jsdom.
//
// Unlike a keyboard-only runtime, this one walks text nodes and watches
// mutations, so a hand-written stub would end up re-implementing half a DOM.
// jsdom is a dev dependency only; nothing from it ships in the extension.
//
// Run with: npm run test:runtime

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'smartRtl.js'), 'utf-8')

// The generated file is the prelude and the runtime concatenated, so the seam
// between them is exercised by running exactly that.
const { buildConfigPrelude } = require('../out/runtime')

const createEnv = (html, { config = null, prefix = '' } = {}) => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  const prelude = config ? buildConfigPrelude(config) : ''
  window.eval(`${prefix}${prelude}${SOURCE}`)

  const $ = (selector) => window.document.querySelector(selector)
  const dir = (selector) => $(selector).getAttribute('data-srtl')
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

  return { window, $, dir, frame }
}

const ENGLISH = `
  <div id="m" class="markdown-root">
    <p id="p">Here is how to install it. Run the command below.</p>
    <pre><code>npm install react</code></pre>
    <ul id="ul"><li>First</li><li>Second</li></ul>
  </div>`

const ARABIC = `
  <div id="m" class="markdown-root">
    <h3 id="h">طريقة التثبيت</h3>
    <p id="p1">React هو مكتبة لبناء الواجهات. شغّل الأمر <code id="ic">npm install react</code> في الترمنال.</p>
    <pre id="pre"><code>const greeting = "hello world from the code block";</code></pre>
    <ul id="ul"><li id="li1">أول عنصر</li><li id="li2">Second item in English.</li></ul>
    <p id="p2">This English paragraph lives inside an Arabic answer.</p>
    <p id="p3">👍 2026</p>
  </div>`

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const MESSAGE_MODE = { config: { mode: 'message' } }

// Both modes

test('an English reply is left untouched, in either mode', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { window } = createEnv(ENGLISH, options)
    assert.equal(window.document.querySelectorAll('[data-srtl]').length, 0)
  }
})

test('an English reply with a stray Arabic phrase is left untouched, in either mode', () => {
  const html = `
    <div id="m" class="markdown-root">
      <p>The function returns a promise that resolves once the file is written to disk, so remember to await it (يعني استنى).</p>
      <p>Second paragraph, still English.</p>
    </div>`
  for (const options of [{}, MESSAGE_MODE]) {
    const { window } = createEnv(html, options)
    assert.equal(window.document.querySelectorAll('[data-srtl]').length, 0)
  }
})

test('code is never marked, inline or block', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { dir } = createEnv(ARABIC, options)
    assert.equal(dir('#ic'), null)
    assert.equal(dir('#pre'), null)
  }
})

test('a paragraph without letters inherits instead of being guessed', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { dir } = createEnv(ARABIC, options)
    assert.equal(dir('#p3'), null)
  }
})

test('code does not count toward the decision', () => {
  // Far more Latin letters than Arabic overall, but all of them are in code.
  const { dir } = createEnv(`
    <div id="m" class="markdown-root">
      <p id="p">عدّل الملف ده:</p>
      <pre><code>export function handleRequest(request, response) { return response.json({ ok: true, message: "done" }) }</code></pre>
    </div>`, MESSAGE_MODE)
  assert.equal(dir('#m'), 'msg')
})

test('a paragraph opening with an English word is still judged Arabic', () => {
  // Where dir="auto" would pick LTR from the first letter.
  const { dir } = createEnv(`<div id="m" class="markdown-root"><p id="p">React هو مكتبة لبناء الواجهات بسهولة</p></div>`)
  assert.equal(dir('#p'), 'rtl')
})

test('a plain-text user bubble is judged as one block', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { dir } = createEnv(`<div id="m" class="ui-agent-transcript-human-bubble">اشرح بالعربي مش فاهم برضو</div>`, options)
    assert.equal(dir('#m'), 'msg')
  }
})

test('an editor only gets its root marked, never its own child nodes', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { dir } = createEnv(`
      <div id="m" class="ProseMirror" contenteditable="true"><p id="p">عايز اعمل function بتعمل sort</p><p>للـ array</p></div>`, options)
    assert.equal(dir('#m'), 'msg')
    assert.equal(dir('#p'), null)
  }
})

// Paragraph mode, the default

test('paragraph mode: each paragraph and heading picks its own side', () => {
  const { dir } = createEnv(ARABIC)
  assert.equal(dir('#m'), 'para')
  assert.equal(dir('#h'), 'rtl')
  assert.equal(dir('#p1'), 'rtl')
  assert.equal(dir('#p2'), 'ltr')
})

test('paragraph mode: an Arabic paragraph inside an English reply goes right', () => {
  const { dir } = createEnv(`
    <div id="m" class="markdown-root">
      <p id="en1">Here is the fix for the upload flow, with the reasoning below.</p>
      <p id="ar">بالعربي: الـ link بيفضل شغال ساعة، إلا لو اتعمل share فبيبقى ربع ساعة بس.</p>
      <p id="en2">Let me know if you want tests for this.</p>
    </div>`)
  assert.equal(dir('#m'), 'para')
  assert.equal(dir('#en1'), 'ltr')
  assert.equal(dir('#ar'), 'rtl')
  assert.equal(dir('#en2'), 'ltr')
})

test('paragraph mode: a list goes with most of its items', () => {
  const { dir } = createEnv(`
    <div id="m" class="markdown-root">
      <!-- More Latin letters than Arabic overall, but two of the three items are Arabic. -->
      <ul id="ar-list"><li>ضيف await قبل الـ request</li><li id="en-item">Handle errors.</li><li>اكتب test للحالة دي</li></ul>
      <ul id="en-list"><li>First step in English</li><li>Second step in English</li><li id="ar-item">خطوة تالتة بالعربي</li></ul>
    </div>`)
  assert.equal(dir('#ar-list'), 'rtl')
  assert.equal(dir('#en-list'), 'ltr')
  // Items keep their own reading direction; the stylesheet aligns them with the list.
  assert.equal(dir('#en-item'), 'ltr')
  assert.equal(dir('#ar-item'), 'rtl')
})

// Message mode

test('message mode: an Arabic reply turns RTL with every paragraph aligned right', () => {
  const { dir } = createEnv(ARABIC, MESSAGE_MODE)
  assert.equal(dir('#m'), 'msg')
  assert.equal(dir('#h'), 'rtl')
  assert.equal(dir('#p1'), 'rtl')
  assert.equal(dir('#li1'), 'rtl')
  assert.equal(dir('#li2'), 'ltr')
  assert.equal(dir('#p2'), 'ltr')
})

test('message mode: lists follow the message so every bullet sits on the same side', () => {
  const { dir } = createEnv(ARABIC, MESSAGE_MODE)
  assert.equal(dir('#ul'), 'rtl')
})

test('message mode: an Arabic paragraph in a mostly English reply is left alone', () => {
  const { dir } = createEnv(`
    <div id="m" class="markdown-root">
      <p>Here is the fix for the upload flow, with the full reasoning written out below in detail.</p>
      <p id="ar">ملخص سريع</p>
    </div>`, MESSAGE_MODE)
  assert.equal(dir('#m'), null)
  assert.equal(dir('#ar'), null)
})

// Cursor's ask-question card, built with the same markup Cursor's bundle uses

const question = (id, label, options) => `
  <div id="${id}" class="composer-questionnaire-toolbar-question">
    <div class="composer-questionnaire-toolbar-question-label"><div class="composer-questionnaire-toolbar-question-number">1.</div>${label}</div>
    <div class="composer-questionnaire-toolbar-options">
      ${options.map((option, index) => `<div class="composer-questionnaire-toolbar-option" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">${'ABCD'[index]}</button><span id="${id}-${index}" class="composer-questionnaire-toolbar-option-label">${option}</span></div>`).join('')}
      <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-freeform" role="button"><button class="composer-questionnaire-toolbar-option-letter" type="button">E</button><textarea id="${id}-other" class="composer-questionnaire-toolbar-freeform-input" placeholder="Other..." rows="1"></textarea></div>
    </div>
  </div>`

const QUESTIONS = `
  <div class="composer-questionnaire-toolbar"><div class="composer-questionnaire-toolbar-questions">
    ${question('ar', 'تحب نستخدم أنهي framework للواجهة؟', ['React', 'Vue', 'مش فارقة معايا'])}
    ${question('en', 'Which database should we use?', ['PostgreSQL', 'SQLite'])}
  </div></div>`

test('an Arabic question turns RTL as one unit, even with English options', () => {
  for (const options of [{}, MESSAGE_MODE]) {
    const { dir } = createEnv(QUESTIONS, options)
    assert.equal(dir('#ar'), 'msg')
    assert.equal(dir('#ar-0'), 'ltr')
    assert.equal(dir('#ar-2'), 'rtl')
  }
})

test('an English question is left untouched', () => {
  const { window, dir } = createEnv(QUESTIONS)
  assert.equal(dir('#en'), null)
  assert.equal(window.document.querySelectorAll('#en [data-srtl]').length, 0)
})

test('a question is judged by its label, not outvoted by its options', () => {
  const { dir } = createEnv(question('q', 'Pick one of these', ['واحد', 'اتنين', 'تلاتة']))
  assert.equal(dir('#q'), null)
})

test('a question card added after load is picked up', async () => {
  const { window, dir, frame } = createEnv(`<div id="toolbar"></div>`)
  const host = window.document.getElementById('toolbar')
  const template = window.document.createElement('template')
  template.innerHTML = question('late', 'نبدأ بأنهي خطوة؟', ['التصميم', 'الكود'])
  host.appendChild(template.content)
  await frame()
  await frame()
  assert.equal(dir('#late'), 'msg')
})

// Finding messages

test('nested matches are judged as one message, from the outermost', () => {
  const { dir } = createEnv(`
    <div id="outer" class="anysphere-markdown-container-root">
      <div id="inner" class="markdown-root"><p>الرد ده عربي بالكامل تقريبا</p></div>
    </div>`)
  assert.equal(dir('#outer'), 'para')
  assert.equal(dir('#inner'), null)
})

test('unknown chats fall back to the innermost generic match', () => {
  const { dir } = createEnv(`
    <div id="wrap" class="chat-markdown-list">
      <div id="en" class="prose"><p>An English reply that should stay exactly where it is.</p></div>
      <div id="ar" class="prose"><p>رد عربي لازم يتقلب يمين</p></div>
    </div>`)
  assert.equal(dir('#wrap'), null)
  assert.equal(dir('#en'), null)
  assert.equal(dir('#ar'), 'para')
})

test('the editor and terminal are ignored even when they contain Arabic', () => {
  const { dir } = createEnv(`
    <div class="monaco-editor"><div id="m" class="markdown-root"><p>تعليق عربي جوه الكود</p></div></div>`)
  assert.equal(dir('#m'), null)
})

test('a streaming reply is re-judged as it grows, in both directions', async () => {
  const { $, dir, frame } = createEnv(`<div id="m" class="markdown-root"><p id="p">OK</p></div>`)
  assert.equal(dir('#p'), null)

  $('#p').textContent = 'OK، دلوقتي هنشرح الخطوات بالتفصيل'
  await frame()
  assert.equal(dir('#p'), 'rtl')

  $('#p').textContent = 'Now all English again'
  await frame()
  assert.equal(dir('#m'), null)
  assert.equal(dir('#p'), null)
})

test('a message added after load is picked up', async () => {
  const { window, dir, frame } = createEnv(`<div id="chat"></div>`)
  const message = window.document.createElement('div')
  message.id = 'm'
  message.className = 'markdown-root'
  message.textContent = 'رسالة جديدة وصلت بعد التحميل'
  window.document.getElementById('chat').appendChild(message)
  await frame()
  await frame()
  assert.equal(dir('#m'), 'msg')
})

test('a textarea follows what is typed into it', () => {
  const { window, $, dir } = createEnv(`<textarea id="t"></textarea>`)
  $('#t').value = 'مرحبا بيك'
  $('#t').dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(dir('#t'), 'rtl')
  $('#t').value = 'hello there'
  $('#t').dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(dir('#t'), 'ltr')
})

// Settings

test('the threshold setting is honoured through the generated prelude', () => {
  // About 40% Arabic letters: RTL by default, LTR once the bar is raised to 60%.
  const html = `<div id="m" class="markdown-root"><p id="p">Install the package then شغل السيرفر</p></div>`
  assert.equal(createEnv(html).dir('#p'), 'rtl')
  assert.equal(createEnv(html, { config: { threshold: 0.6 } }).dir('#p'), null)
})

test('an out-of-range threshold falls back to the default', () => {
  const html = `<div id="m" class="markdown-root"><p id="p">Install the package then شغل السيرفر</p></div>`
  assert.equal(createEnv(html, { config: { threshold: 7 } }).dir('#p'), 'rtl')
})

test('an unknown mode falls back to paragraph mode', () => {
  assert.equal(createEnv(ARABIC, { config: { mode: 'sideways' } }).dir('#m'), 'para')
})

test('a custom message selector replaces the default one', () => {
  const html = `<div id="m" class="my-reply"><p>رد عربي في واجهة مختلفة</p></div><div id="d" class="markdown-root"><p>رد عربي</p></div>`
  const { dir } = createEnv(html, { config: { messageSelector: '.my-reply' } })
  assert.equal(dir('#m'), 'para')
  // Still found, but through the generic fallback rather than the named list.
  assert.equal(dir('#d'), 'para')
})

// Injection

test('a neighbouring import without a trailing semicolon cannot break it', () => {
  const { dir } = createEnv(ARABIC, { prefix: 'window.__other = 1\n' })
  assert.equal(dir('#m'), 'para')
})

test('injecting twice replaces the first install instead of stacking', () => {
  const { window, dir } = createEnv(ARABIC)
  window.eval(SOURCE)
  assert.equal(window.document.querySelectorAll('#smart-rtl-style').length, 1)
  assert.equal(dir('#m'), 'para')
})

test('stop() removes the stylesheet and every marker', () => {
  const { window, $ } = createEnv(ARABIC)
  window.__smartRtl.stop()
  assert.equal($('#smart-rtl-style'), null)
  assert.equal(window.document.querySelectorAll('[data-srtl]').length, 0)
  assert.equal(window.__smartRtl, undefined)
})

// Registering with Custom UI Style

const { withOwnImport, withoutOwnImport } = require('../out/imports')

const OWN = 'file:///storage/abdelrahmanmsalim.smart-rtl/smart-rtl.js'
const ZOOM = 'file:///storage/abdelrahmanmsalim.composer-zoom/composer-zoom.js'

test('registering keeps our entry where it already is', () => {
  assert.deepEqual(withOwnImport([OWN, ZOOM], OWN), [OWN, ZOOM])
  assert.deepEqual(withOwnImport([ZOOM, OWN], OWN), [ZOOM, OWN])
})

test('registering appends when absent, and replaces a stale location in place', () => {
  assert.deepEqual(withOwnImport([ZOOM], OWN), [ZOOM, OWN])
  assert.deepEqual(withOwnImport(['file:///old/src/smart-rtl.js', ZOOM], OWN), [OWN, ZOOM])
  assert.deepEqual(withOwnImport(['file:///a/smart-rtl.js', ZOOM, 'file:///b/smart-rtl.js'], OWN), [OWN, ZOOM])
})

test('starting alongside Composer Zoom settles instead of rewriting the setting forever', () => {
  // Composer Zoom 0.1.3 always moves its own entry to the end.
  const zoomRegister = (list) => [...list.filter((entry) => !entry.endsWith('/composer-zoom.js')), ZOOM]
  let list = [ZOOM, OWN]
  const writes = []
  for (let start = 0; start < 3; start++) {
    for (const register of [zoomRegister, (current) => withOwnImport(current, OWN)]) {
      const next = register(list)
      if (JSON.stringify(next) !== JSON.stringify(list)) writes.push(start)
      list = next
    }
  }
  // One write on the first start while Composer Zoom moves itself, then none.
  assert.deepEqual(writes, [0])
})

test('unregistering removes only our entries', () => {
  assert.deepEqual(withoutOwnImport([OWN, ZOOM, { url: 'x' }]), [ZOOM, { url: 'x' }])
})

const run = async () => {
  let failed = 0
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`  ok  ${name}`)
    } catch (error) {
      failed++
      console.log(`  FAIL  ${name}\n        ${error.message.split('\n').join('\n        ')}`)
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`)
  process.exitCode = failed ? 1 : 0
}

run()
