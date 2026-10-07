(function () {
    'use strict'
    var terminal = document.getElementById('blog-terminal')
    var toggle = document.getElementById('blog-terminal-toggle')
    if (!terminal || !toggle) return
    var closeButton = document.getElementById('blog-terminal-close')
    var screen = document.getElementById('blog-terminal-screen')
    var output = document.getElementById('blog-terminal-output')
    var form = document.getElementById('blog-terminal-form')
    var input = document.getElementById('blog-terminal-input')
    var prompt = document.getElementById('blog-terminal-prompt')
    var before = document.getElementById('blog-terminal-before')
    var after = document.getElementById('blog-terminal-after')
    var data = JSON.parse(document.getElementById('blog-terminal-data').textContent)
    var shell, loading, previousFocus, historyIndex = 0, draft = '', clearStart = null
    var following = true, introGeneration = 0, composing = false

    function formPosition() {
        return form.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop
    }
    function syncScreen() {
        var topPadding = parseFloat(window.getComputedStyle(screen).paddingTop)
        screen.style.paddingBottom = clearStart === null ? '' :
            Math.max(topPadding, screen.clientHeight - (formPosition() - clearStart) - form.offsetHeight) + 'px'
        if (following) screen.scrollTop = screen.scrollHeight
    }
    function syncInput() {
        before.textContent = input.value.slice(0, input.selectionStart)
        after.textContent = input.value.slice(input.selectionStart) || '\u200b'
        input.parentNode.classList.toggle('is-selecting', composing || input.selectionStart !== input.selectionEnd)
        input.style.height = '0px'
        input.style.height = input.scrollHeight + 'px'
        syncScreen()
    }
    function append(text, className) {
        var line = document.createElement('div')
        line.className = 'blog-terminal-line' + (className ? ' ' + className : '')
        line.textContent = text || '\u00a0'
        output.appendChild(line)
        return line
    }
    function render(text, className) {
        if (!text) return
        var lines = text.split('\n')
        if (lines[lines.length - 1] === '') lines.pop()
        lines.forEach(function (line) {
            var node = append(line, className)
            // File paths printed by find remain selectable and also open articles.
            if (shell && shell.nodes[line] && shell.nodes[line].url) {
                node.textContent = ''
                var link = document.createElement('a')
                link.className = 'blog-terminal-link'
                link.href = shell.nodes[line].url
                link.textContent = line
                node.appendChild(link)
            }
        })
    }
    function updatePrompt() { prompt.textContent = data.owner + '@' + data.host + ':' + shell.cwd + '$' }
    function focusInput() { if (!terminal.hidden && !input.disabled) input.focus({ preventScroll: true }) }
    function setInput(value) {
        input.value = value
        input.setSelectionRange(value.length, value.length)
        following = true
        syncInput()
    }
    function clearViewport() {
        following = true
        clearStart = formPosition() - parseFloat(window.getComputedStyle(screen).paddingTop)
        syncScreen()
    }
    async function typeIntro() {
        var generation = ++introGeneration
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        var lines = ['linyuww@blog — welcome', ''].concat(data.profile, [
            '', '分类已挂载。输入 help 查看命令，ls 浏览博客。'
        ])
        for (var i = 0; i < lines.length; i += 1) {
            var line = append('', i === 0 ? 'blog-terminal-line--accent' : '')
            line.textContent = ''
            for (var c = 0; c < lines[i].length; c += 1) {
                if (generation !== introGeneration) return
                line.textContent += lines[i][c]
                syncScreen()
                if (!reduced) await new Promise(function (resolve) { window.setTimeout(resolve, 16) })
            }
            if (!line.textContent) line.textContent = '\u00a0'
        }
    }
    function openTerminal() {
        previousFocus = document.activeElement
        terminal.hidden = false
        terminal.setAttribute('aria-hidden', 'false')
        toggle.setAttribute('aria-expanded', 'true')
        document.body.classList.add('blog-terminal-open')
        if (!loading) {
            input.disabled = true
            closeButton.focus()
            loading = fetch(data.filesUrl).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status)
                return response.json()
            }).then(async function (contents) {
                shell = new window.BlogShell(data, contents)
                updatePrompt()
                await typeIntro()
                input.disabled = false
                syncInput()
                focusInput()
            }).catch(function (error) {
                append('文章文件系统加载失败：' + error.message + '。请刷新页面重试。', 'blog-terminal-line--error')
                syncScreen()
            })
        } else { focusInput(); syncInput() }
    }
    function closeTerminal() {
        terminal.hidden = true
        terminal.setAttribute('aria-hidden', 'true')
        toggle.setAttribute('aria-expanded', 'false')
        document.body.classList.remove('blog-terminal-open')
        if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
    function submit() {
        if (input.disabled || composing) return
        following = true
        var command = input.value.trim()
        append(prompt.textContent + ' ' + command, 'blog-terminal-line--command')
        input.value = ''
        if (command) {
            shell.history.push(command)
            historyIndex = shell.history.length
            draft = ''
            var result = shell.execute(command)
            render(result.stdout)
            render(result.stderr, 'blog-terminal-line--error')
            if (result.action === 'clear') { output.textContent = ''; clearStart = null }
            if (result.action === 'exit') closeTerminal()
            if (result.action === 'open') window.location.href = result.url
            updatePrompt()
        }
        syncInput()
    }
    toggle.addEventListener('click', openTerminal)
    closeButton.addEventListener('click', closeTerminal)
    form.addEventListener('submit', function (event) { event.preventDefault(); submit() })
    input.addEventListener('input', function () { following = true; syncInput() })
    input.addEventListener('select', syncInput)
    input.addEventListener('click', syncInput)
    input.addEventListener('compositionstart', function () { composing = true; syncInput() })
    input.addEventListener('compositionend', function () { composing = false; syncInput() })
    input.addEventListener('keyup', syncInput)
    input.addEventListener('keydown', function (event) {
        if (composing || event.isComposing) return
        if (event.ctrlKey && event.key.toLowerCase() === 'l') {
            event.preventDefault(); clearViewport()
        } else if (event.ctrlKey && event.key.toLowerCase() === 'c' && !window.getSelection().toString() && input.selectionStart === input.selectionEnd) {
            event.preventDefault()
            append(prompt.textContent + ' ' + input.value + '^C', 'blog-terminal-line--command')
            historyIndex = shell.history.length
            setInput('')
        } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); submit()
        } else if (event.key === 'ArrowUp' && shell.history.length) {
            event.preventDefault()
            if (historyIndex === shell.history.length) draft = input.value
            historyIndex = Math.max(0, historyIndex - 1)
            setInput(shell.history[historyIndex])
        } else if (event.key === 'ArrowDown' && shell.history.length) {
            event.preventDefault()
            historyIndex = Math.min(shell.history.length, historyIndex + 1)
            setInput(historyIndex === shell.history.length ? draft : shell.history[historyIndex])
        } else if (event.key === 'Tab') {
            event.preventDefault()
            if (event.shiftKey || !input.value) { closeButton.focus(); return }
            var matches = shell.complete(input.value)
            if (matches.length === 1) setInput(matches[0])
            else if (matches.length) {
                append(prompt.textContent + ' ' + input.value, 'blog-terminal-line--command')
                render(matches.join('\n') + '\n')
                following = true; syncScreen()
            }
        }
    })
    screen.addEventListener('scroll', function () {
        following = screen.scrollHeight - screen.clientHeight - screen.scrollTop < 3
    })
    screen.addEventListener('click', function (event) {
        if (event.target.closest('a, button, textarea') || window.getSelection().toString()) return
        focusInput()
    })
    document.addEventListener('keydown', function (event) {
        if (terminal.hidden) return
        if (event.key === 'Escape') { event.preventDefault(); closeTerminal() }
        else if (event.key === 'Tab' && document.activeElement !== input) {
            event.preventDefault()
            if (input.disabled) closeButton.focus()
            else focusInput()
        }
    })
    window.addEventListener('resize', function () { if (!terminal.hidden) syncInput() })
})()
