(function () {
  'use strict'

  var toggle = document.getElementById('blog-terminal-toggle')
  var terminal = document.getElementById('blog-terminal')
  var closeButton = document.getElementById('blog-terminal-close')
  var output = document.getElementById('blog-terminal-output')
  var form = document.getElementById('blog-terminal-form')
  var input = document.getElementById('blog-terminal-input')
  var prompt = document.getElementById('blog-terminal-prompt')
  var dataNode = document.getElementById('blog-terminal-data')

  if (!toggle || !terminal || !closeButton || !output || !form || !input || !prompt || !dataNode) {
    return
  }

  var data = JSON.parse(dataNode.textContent)
  var categories = data.categories || []
  var cwd = '/'
  var history = []
  var historyIndex = 0
  var introStarted = false
  var previousFocus = null
  var pipeBuffer = null
  var bootTime = Date.now()
  var commandNames = [
    'cat', 'cd', 'clear', 'date', 'echo', 'env', 'exit', 'find', 'grep',
    'head', 'help', 'history', 'hostname', 'id', 'ls', 'open', 'ps', 'pwd',
    'sort', 'tail', 'tree', 'uname', 'uniq', 'uptime', 'wc', 'which', 'whoami'
  ]

  function filename(post) {
    return String(post.title).replace(/[\\/]/g, '／') + '.md'
  }

  function categoryByName(name) {
    var normalized = String(name || '').replace(/^\/+|\/+$/g, '')
    return categories.find(function (category) {
      return category.name === normalized
    })
  }

  function currentCategory() {
    return cwd === '/' ? null : categoryByName(cwd)
  }

  function scrollToBottom() {
    output.scrollTop = output.scrollHeight
  }

  function addLine(text, className) {
    if (pipeBuffer) {
      pipeBuffer.push({ text: text || '', className: className || '' })
      return null
    }
    var line = document.createElement('div')
    line.className = 'blog-terminal-line' + (className ? ' ' + className : '')
    line.textContent = text || '\u00a0'
    output.appendChild(line)
    scrollToBottom()
    return line
  }

  function addEntries(entries, isDirectory) {
    if (pipeBuffer) {
      entries.forEach(function (entry) {
        pipeBuffer.push({
          text: entry + (isDirectory ? '/' : ''),
          className: isDirectory ? 'blog-terminal-entry' : 'blog-terminal-entry blog-terminal-entry--file'
        })
      })
      return
    }
    var line = document.createElement('div')
    line.className = 'blog-terminal-line'
    entries.forEach(function (entry) {
      var item = document.createElement('span')
      item.className = 'blog-terminal-entry' + (isDirectory ? '' : ' blog-terminal-entry--file')
      item.textContent = entry + (isDirectory ? '/' : '')
      line.appendChild(item)
    })
    output.appendChild(line)
    scrollToBottom()
  }

  function addLink(label, url) {
    if (pipeBuffer) {
      pipeBuffer.push({ text: label, url: url, className: 'blog-terminal-link' })
      return
    }
    var line = document.createElement('div')
    line.className = 'blog-terminal-line'
    var link = document.createElement('a')
    link.className = 'blog-terminal-link'
    link.href = url
    link.textContent = label
    line.appendChild(link)
    output.appendChild(line)
    scrollToBottom()
  }

  function updatePrompt() {
    prompt.textContent = data.owner + '@' + data.host + ':' + cwd + '$'
  }

  function tokenize(command) {
    var tokens = []
    var pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g
    var match
    while ((match = pattern.exec(command))) {
      tokens.push(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3])
    }
    return tokens
  }

  function splitPipeline(commandLine) {
    var stages = []
    var current = ''
    var quote = ''
    for (var index = 0; index < commandLine.length; index += 1) {
      var character = commandLine.charAt(index)
      if ((character === '"' || character === "'") && (!quote || quote === character)) {
        quote = quote ? '' : character
        current += character
      } else if (character === '|' && !quote) {
        stages.push(current.trim())
        current = ''
      } else {
        current += character
      }
    }
    stages.push(current.trim())
    return stages
  }

  function resolveDirectory(target) {
    var value = String(target || '/').trim()
    if (!value || value === '/' || value === '~' || value === '..') {
      return '/'
    }
    value = value.replace(/^\/+|\/+$/g, '')
    return categoryByName(value) ? '/' + value : null
  }

  function resolvePost(target) {
    var value = String(target || '').replace(/^\/+/, '')
    var category = currentCategory()
    if (value.indexOf('/') !== -1) {
      var separator = value.indexOf('/')
      category = categoryByName(value.slice(0, separator))
      value = value.slice(separator + 1)
    }
    if (!category) {
      return null
    }
    return category.posts.find(function (post) {
      return filename(post) === value || post.title === value
    }) || null
  }

  function printHelp() {
    addLine('可用命令：', 'blog-terminal-line--accent')
    addLine('  help                 显示命令帮助')
    addLine('  ls [分类]            列出分类或文章')
    addLine('  cd <分类|..|/>       切换目录')
    addLine('  pwd                  显示当前目录')
    addLine('  cat <文件>           查看简介或文章信息')
    addLine('  open <文章文件>      打开对应博客文章')
    addLine('  find <关键词>        搜索文章标题')
    addLine('  tree [分类]          以目录树显示博客内容')
    addLine('  grep [-i] <正则>     过滤管道文本')
    addLine('  wc [-l|-w|-c|-m]    统计行、词、字节或字符')
    addLine('  head/tail [-n N]     获取开头或结尾 N 行')
    addLine('  sort [-r] / uniq [-c] 排序与去重')
    addLine('  uname / hostname / id / env / ps / uptime')
    addLine('  whoami / which / date / echo')
    addLine('  history / clear      历史记录与清屏')
    addLine('  exit                 返回博客页面')
    addLine('提示：过滤命令支持多级管道；方向键浏览历史，Tab 补全名称。', 'blog-terminal-line--muted')
  }

  function list(target) {
    var directory = target ? resolveDirectory(target) : cwd
    if (directory === null) {
      addLine('ls: 无法访问 ' + target + ': 没有那个分类', 'blog-terminal-line--error')
      return
    }
    if (directory === '/') {
      addEntries(['README.md'], false)
      addEntries(categories.map(function (category) { return category.name }), true)
      return
    }
    var category = categoryByName(directory)
    if (!category.posts.length) {
      addLine('(空目录)', 'blog-terminal-line--muted')
      return
    }
    addEntries(category.posts.map(filename), false)
  }

  function cat(target) {
    if (!target) {
      addLine('cat: 缺少文件名', 'blog-terminal-line--error')
      return
    }
    if ((cwd === '/' && target === 'README.md') || target === '/README.md') {
      data.profile.forEach(function (line) { addLine(line) })
      return
    }
    var post = resolvePost(target)
    if (!post) {
      addLine('cat: ' + target + ': 没有那个文件', 'blog-terminal-line--error')
      return
    }
    addLine('# ' + post.title, 'blog-terminal-line--accent')
    addLine('published: ' + post.date, 'blog-terminal-line--muted')
    addLink('阅读文章 → ' + post.url, post.url)
  }

  function openPost(target) {
    var post = resolvePost(target)
    if (!post) {
      addLine('open: ' + (target || '') + ': 没有那个文章文件', 'blog-terminal-line--error')
      return
    }
    window.location.href = post.url
  }

  function findPosts(keyword) {
    if (!keyword) {
      addLine('find: 缺少搜索关键词', 'blog-terminal-line--error')
      return
    }
    var query = keyword.toLowerCase()
    var results = []
    categories.forEach(function (category) {
      category.posts.forEach(function (post) {
        if (post.title.toLowerCase().indexOf(query) !== -1 || category.name.toLowerCase().indexOf(query) !== -1) {
          results.push({ category: category, post: post })
        }
      })
    })
    if (!results.length) {
      addLine('find: 未找到匹配文章', 'blog-terminal-line--muted')
      return
    }
    results.slice(0, 20).forEach(function (result) {
      addLink('/' + result.category.name + '/' + filename(result.post), result.post.url)
    })
    if (results.length > 20) {
      addLine('仅显示前 20 条，共 ' + results.length + ' 条。', 'blog-terminal-line--muted')
    }
  }

  function showTree(target) {
    var directory = target ? resolveDirectory(target) : cwd
    if (directory === null) {
      addLine('tree: ' + target + ': 没有那个分类', 'blog-terminal-line--error')
      return
    }
    if (directory !== '/') {
      var category = categoryByName(directory)
      addLine(category.name + '/')
      category.posts.forEach(function (post, index) {
        addLine((index === category.posts.length - 1 ? '└── ' : '├── ') + filename(post))
      })
      addLine(category.posts.length + ' files', 'blog-terminal-line--muted')
      return
    }

    addLine('/')
    addLine('├── README.md')
    categories.forEach(function (category, categoryIndex) {
      var lastCategory = categoryIndex === categories.length - 1
      addLine((lastCategory ? '└── ' : '├── ') + category.name + '/')
      category.posts.forEach(function (post, postIndex) {
        var branch = lastCategory ? '    ' : '│   '
        addLine(branch + (postIndex === category.posts.length - 1 ? '└── ' : '├── ') + filename(post))
      })
    })
    var postCount = categories.reduce(function (count, category) { return count + category.posts.length }, 0)
    addLine(categories.length + ' directories, ' + (postCount + 1) + ' files', 'blog-terminal-line--muted')
  }

  function filterWithGrep(items, argument) {
    var tokens = tokenize(argument)
    var ignoreCase = tokens[0] === '-i'
    if (ignoreCase) {
      tokens.shift()
    }
    var pattern = tokens.join(' ')
    if (!pattern) {
      return { error: 'grep: 缺少搜索模式' }
    }
    try {
      var expression = new RegExp(pattern, ignoreCase ? 'i' : '')
      return { items: items.filter(function (item) { return expression.test(item.text) }) }
    } catch (error) {
      return { error: 'grep: 无效的正则表达式: ' + pattern }
    }
  }

  function lineCountArgument(argument, commandName) {
    var tokens = tokenize(argument)
    var count = 10
    if (tokens.length && /^-\d+$/.test(tokens[0])) {
      count = Number(tokens[0].slice(1))
    } else if (tokens[0] === '-n') {
      count = Number(tokens[1])
    } else if (tokens.length) {
      return { error: commandName + ': 不支持的参数: ' + tokens.join(' ') }
    }
    if (!Number.isFinite(count) || count < 0) {
      return { error: commandName + ': 行数必须是非负整数' }
    }
    return { count: Math.floor(count) }
  }

  function countWithWc(items, argument) {
    var option = argument.trim()
    if (option && ['-l', '-w', '-c', '-m'].indexOf(option) === -1) {
      return { error: 'wc: 不支持的参数: ' + option }
    }
    var text = items.map(function (item) { return item.text }).join('\n')
    var lines = items.length
    var words = text.trim() ? text.trim().split(/\s+/).length : 0
    var characters = Array.from(text).length
    var bytes = new TextEncoder().encode(text).length
    var result
    if (option === '-l') result = String(lines)
    else if (option === '-w') result = String(words)
    else if (option === '-c') result = String(bytes)
    else if (option === '-m') result = String(characters)
    else result = [lines, words, bytes].map(function (value) { return String(value).padStart(7, ' ') }).join('')
    return { items: [{ text: result, className: 'blog-terminal-line--accent' }] }
  }

  function sortItems(items, argument) {
    var tokens = tokenize(argument)
    var reverse = tokens.indexOf('-r') !== -1
    var ignoreCase = tokens.indexOf('-f') !== -1
    var invalid = tokens.filter(function (token) { return token !== '-r' && token !== '-f' })
    if (invalid.length) {
      return { error: 'sort: 不支持的参数: ' + invalid.join(' ') }
    }
    var sorted = items.slice().sort(function (left, right) {
      var a = ignoreCase ? left.text.toLowerCase() : left.text
      var b = ignoreCase ? right.text.toLowerCase() : right.text
      return a.localeCompare(b, 'zh-CN', { numeric: true })
    })
    if (reverse) sorted.reverse()
    return { items: sorted }
  }

  function uniqueItems(items, argument) {
    var tokens = tokenize(argument)
    var showCount = tokens[0] === '-c'
    if (tokens.length && !showCount) {
      return { error: 'uniq: 不支持的参数: ' + tokens.join(' ') }
    }
    var unique = []
    items.forEach(function (item) {
      var previous = unique[unique.length - 1]
      if (previous && previous.item.text === item.text) {
        previous.count += 1
      } else {
        unique.push({ item: item, count: 1 })
      }
    })
    return {
      items: unique.map(function (entry) {
        if (!showCount) return entry.item
        return {
          text: String(entry.count).padStart(7, ' ') + ' ' + entry.item.text,
          className: entry.item.className,
          url: entry.item.url
        }
      })
    }
  }

  function applyPipeCommand(command, argument, items) {
    if (command === 'grep') return filterWithGrep(items, argument)
    if (command === 'wc') return countWithWc(items, argument)
    if (command === 'sort') return sortItems(items, argument)
    if (command === 'uniq') return uniqueItems(items, argument)
    if (command === 'head' || command === 'tail') {
      var parsed = lineCountArgument(argument, command)
      if (parsed.error) return parsed
      return {
        items: command === 'head'
          ? items.slice(0, parsed.count)
          : items.slice(Math.max(0, items.length - parsed.count))
      }
    }
    return { error: 'shell: 管道不支持命令: ' + (command || '(空)') }
  }

  function renderPipe(items) {
    items.forEach(function (item) {
      if (item.url) {
        addLink(item.text, item.url)
      } else {
        addLine(item.text, item.className)
      }
    })
  }

  function runSingle(commandLine) {
    var tokens = tokenize(commandLine.trim())
    if (!tokens.length) {
      return
    }
    var command = tokens.shift().toLowerCase()
    var argument = tokens.join(' ')

    switch (command) {
      case 'help':
        printHelp()
        break
      case 'ls':
      case 'dir':
        list(argument)
        break
      case 'cd':
        var destination = resolveDirectory(argument || '/')
        if (destination === null) {
          addLine('cd: ' + argument + ': 没有那个分类', 'blog-terminal-line--error')
        } else {
          cwd = destination
          updatePrompt()
        }
        break
      case 'pwd':
        addLine(cwd)
        break
      case 'cat':
        cat(argument)
        break
      case 'open':
        openPost(argument)
        break
      case 'find':
        findPosts(argument)
        break
      case 'tree':
        showTree(argument)
        break
      case 'grep':
      case 'wc':
      case 'head':
      case 'tail':
      case 'sort':
      case 'uniq':
        addLine(command + ': 请通过管道传入文本，例如 ls | ' + command, 'blog-terminal-line--error')
        break
      case 'whoami':
        addLine('guest@linyuww.blog')
        break
      case 'hostname':
        addLine(data.host)
        break
      case 'uname':
        addLine(argument === '-a' ? 'Linux blog 6.8.0-blog #1 SMP x86_64 GNU/Linux' : 'Linux')
        break
      case 'id':
        addLine('uid=1000(guest) gid=1000(guest) groups=1000(guest)')
        break
      case 'env':
        addLine('USER=guest')
        addLine('HOME=/home/guest')
        addLine('SHELL=/bin/bash')
        addLine('HOSTNAME=' + data.host)
        addLine('PWD=' + cwd)
        break
      case 'which':
        if (!argument) {
          addLine('which: 缺少命令名', 'blog-terminal-line--error')
        } else if (commandNames.indexOf(argument) !== -1) {
          addLine('/usr/bin/' + argument)
        } else {
          addLine('which: no ' + argument + ' in (/usr/local/bin:/usr/bin:/bin)', 'blog-terminal-line--error')
        }
        break
      case 'ps':
        addLine('  PID TTY          TIME CMD')
        addLine('    1 pts/0    00:00:00 blog-shell')
        addLine('   12 pts/0    00:00:00 ps')
        break
      case 'uptime':
        var seconds = Math.floor((Date.now() - bootTime) / 1000)
        addLine('up ' + seconds + ' seconds, 1 user, load average: 0.00, 0.00, 0.00')
        break
      case 'date':
        addLine(new Date().toLocaleString('zh-CN', { hour12: false }))
        break
      case 'echo':
        addLine(argument)
        break
      case 'history':
        history.forEach(function (entry, index) {
          addLine(String(index + 1).padStart(3, ' ') + '  ' + entry)
        })
        break
      case 'clear':
        output.textContent = ''
        break
      case 'exit':
      case 'logout':
        closeTerminal()
        break
      default:
        addLine(command + ': command not found。输入 help 查看可用命令。', 'blog-terminal-line--error')
    }
  }

  function run(commandLine) {
    var stages = splitPipeline(commandLine)
    if (stages.length === 1) {
      runSingle(stages[0])
      return
    }
    if (!stages[0]) {
      addLine('shell: 管道左侧缺少命令', 'blog-terminal-line--error')
      return
    }

    pipeBuffer = []
    runSingle(stages[0])
    var items = pipeBuffer
    pipeBuffer = null

    for (var index = 1; index < stages.length; index += 1) {
      var tokens = tokenize(stages[index])
      var command = (tokens.shift() || '').toLowerCase()
      var result = applyPipeCommand(command, tokens.join(' '), items)
      if (result.error) {
        addLine(result.error, 'blog-terminal-line--error')
        return
      }
      items = result.items
    }
    renderPipe(items)
  }

  function typeIntro() {
    if (introStarted) {
      return Promise.resolve()
    }
    introStarted = true
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    var lines = [
      'LINYUWW BLOG TERMINAL v1.0.0',
      '正在挂载博客分类文件系统... 完成',
      '欢迎，我是 linyuww，一名计算机专业学生。',
      '这里记录 Agent、AI 后端、C / C++、Linux 与计算机系统。',
      '输入 help 查看命令，输入 cat README.md 阅读完整简介。'
    ]

    return lines.reduce(function (sequence, text, lineIndex) {
      return sequence.then(function () {
        var line = addLine('', lineIndex === 0 ? 'blog-terminal-line--accent' : '')
        if (reducedMotion) {
          line.textContent = text
          return Promise.resolve()
        }
        return new Promise(function (resolve) {
          var character = 0
          var timer = window.setInterval(function () {
            line.textContent += text.charAt(character)
            character += 1
            scrollToBottom()
            if (character >= text.length) {
              window.clearInterval(timer)
              window.setTimeout(resolve, 110)
            }
          }, 22)
        })
      })
    }, Promise.resolve())
  }

  function openTerminal() {
    previousFocus = document.activeElement
    terminal.hidden = false
    terminal.setAttribute('aria-hidden', 'false')
    toggle.setAttribute('aria-expanded', 'true')
    document.body.classList.add('blog-terminal-open')
    typeIntro().then(function () { input.focus() })
  }

  function closeTerminal() {
    terminal.hidden = true
    terminal.setAttribute('aria-hidden', 'true')
    toggle.setAttribute('aria-expanded', 'false')
    document.body.classList.remove('blog-terminal-open')
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus()
    }
  }

  function completions(value) {
    var tokens = value.split(/\s+/)
    var command = tokens[0].toLowerCase()
    var fragment = tokens.slice(1).join(' ')
    if (command === 'cd' || command === 'ls') {
      return categories.map(function (category) { return category.name }).filter(function (name) {
        return name.indexOf(fragment) === 0
      })
    }
    if ((command === 'cat' || command === 'open') && currentCategory()) {
      return currentCategory().posts.map(filename).filter(function (name) {
        return name.indexOf(fragment) === 0
      })
    }
    return []
  }

  toggle.addEventListener('click', openTerminal)
  closeButton.addEventListener('click', closeTerminal)

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var command = input.value.trim()
    addLine(prompt.textContent + ' ' + command, 'blog-terminal-line--command')
    if (command) {
      history.push(command)
      historyIndex = history.length
      run(command)
    }
    input.value = ''
  })

  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault()
      historyIndex = Math.max(0, historyIndex - 1)
      input.value = history[historyIndex]
    } else if (event.key === 'ArrowDown' && history.length) {
      event.preventDefault()
      historyIndex = Math.min(history.length, historyIndex + 1)
      input.value = historyIndex === history.length ? '' : history[historyIndex]
    } else if (event.key === 'Tab') {
      var matches = completions(input.value)
      if (matches.length === 1) {
        event.preventDefault()
        input.value = input.value.split(/\s+/)[0] + ' ' + matches[0]
      } else if (matches.length > 1) {
        event.preventDefault()
        addEntries(matches, false)
      }
    }
  })

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !terminal.hidden) {
      closeTerminal()
    }
  })

  terminal.addEventListener('click', function (event) {
    if (event.target === terminal) {
      input.focus()
    }
  })

  updatePrompt()
})()
