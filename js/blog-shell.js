(function (root) {
    'use strict'
    function fail(message) { throw new Error(message) }
    function rows(text) {
        if (!text) return []
        var lines = text.split('\n')
        if (lines[lines.length - 1] === '') lines.pop()
        return lines
    }
    function stream(lines) { return lines.length ? lines.join('\n') + '\n' : '' }
    function escapeRegex(text) { return text.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&') }
    function glob(text) { return new RegExp('^' + text.split('*').map(function (part) { return part.split('?').map(escapeRegex).join('.') }).join('.*') + '$') }
    function decode(text) {
        return text.replace(/\\([ntr\\])/g, function (_, c) { return { n: '\n', t: '\t', r: '\r', '\\': '\\' }[c] })
    }
    function parse(command) {
        var stages = [], tokens = [], token = '', quote = '', active = false
        function push() { if (active) tokens.push(token); token = ''; active = false }
        for (var i = 0; i < command.length; i += 1) {
            var c = command[i]
            if (c === '\\' && quote !== "'") {
                var next = command[i + 1]
                if (next === undefined) fail('shell: 转义符后缺少字符')
                if (quote === '"' && !/["\\$\x60]/.test(next)) token += '\\'
                token += next; i += 1; active = true
            } else if (quote) {
                if (c === quote) quote = ''
                else token += c
            } else if (c === '"' || c === "'") {
                quote = c; active = true
            } else if (c === '|') {
                push()
                if (!tokens.length) fail('shell: 管道缺少命令')
                stages.push(tokens); tokens = []
            } else if (/\s/.test(c)) push()
            else if (/[;<>&\x60]/.test(c)) fail('shell: 未支持的运算符 ' + c)
            else { token += c; active = true }
        }
        if (quote) fail('shell: 引号未闭合')
        push()
        if (stages.length && !tokens.length) fail('shell: 管道缺少命令')
        if (tokens.length) stages.push(tokens)
        return stages
    }
    function options(args, flags, valued) {
        var opts = {}, files = [], stop = false
        for (var i = 0; i < args.length; i += 1) {
            var arg = args[i]
            if (!stop && arg === '--') { stop = true; continue }
            if (!stop && arg.length > 1 && arg[0] === '-') {
                for (var j = 1; j < arg.length; j += 1) {
                    var key = arg[j]
                    if (valued.indexOf(key) !== -1) {
                        var value = arg.slice(j + 1) || args[++i]
                        if (value === undefined) fail('选项 -' + key + ' 缺少参数')
                        if (key === 'e') (opts.e || (opts.e = [])).push(value)
                        else opts[key] = value
                        break
                    }
                    if (flags.indexOf(key) === -1) fail('未支持的选项 -' + key)
                    opts[key] = true
                }
            } else { files.push(arg); stop = true }
        }
        return { opts: opts, files: files }
    }
    var names = 'basename cat cd clear cut date dirname du echo env exit false find grep head help history hostname id ls open printf ps pwd sort tail tr tree true uname uniq uptime wc which whoami'.split(' ')
    var help = [
        'ls [-1alF] [目录] · cd [目录|-] · pwd · tree [目录]',
        'cat [-n] 文件… · open 文件 · find [目录] [-name 模式] [-type f|d]',
        'grep [-EFivnclqx] [-e 模式] [模式] [文件…]',
        'wc [-lwmc] [文件…] · head/tail [-n N] [文件…]',
        'sort [-rnfub] [文件…] · uniq [-cdu] [文件]',
        'cut -c 范围 | -f 范围 [-d 分隔符] [-s] [文件…]',
        'tr [-ds] 集合1 [集合2] · printf 格式 [参数…] · echo [文本…]',
        'basename 路径 [后缀] · dirname 路径 · du [-a] [路径]',
        'whoami · hostname · id · uname [-a] · env · date · uptime · ps',
        'which 命令… · history · true · false · clear · exit', '',
        '示例：find / -type f | grep -i linux | head -n 5',
        '      grep -in Agent README.md | wc -l',
        "      printf '%s\\n' 10 2 2 | sort -n | uniq -c",
        "      printf 'name:linyuww\\n' | cut -d : -f 2", '',
        '↑/↓ 历史 · Tab 补全 · Ctrl+C 取消输入 · Ctrl+L 提示符移到顶部',
        '历史保留，可滚动查看；clear 清空输出；Esc 返回博客。',
        '只读博客文件系统。命令实现 POSIX 常用子集，支持引号、转义和 |。',
        'grep 支持常用基础/扩展正则；未实现完整 POSIX shell、重定向和脚本。',
        'tr 支持字符、范围、[:lower:] / [:upper:] / [:digit:] / [:space:]。',
        'printf 支持 %s、%d、%b、%%、\\n、\\t、\\r、\\\\，不支持宽度和精度。'
    ].join('\n') + '\n'
    function BlogShell(data, contents) {
        this.data = data; this.cwd = '/'; this.previousDirectory = '/'
        this.history = []; this.status = 0; this.started = Date.now()
        this.nodes = { '/': { type: 'd' }, '/README.md': { type: 'f', text: data.profile.join('\n') + '\n' } }
        var shell = this
        data.categories.forEach(function (category) {
            shell.nodes['/' + category.name] = { type: 'd' }
            category.posts.forEach(function (post) {
                var name = String(post.title).replace(/[\\/]/g, '／') + '.md'
                shell.nodes['/' + category.name + '/' + name] = { type: 'f', text: contents[post.url], url: post.url }
            })
        })
    }
    BlogShell.prototype.commands = names
    BlogShell.prototype.path = function (value) {
        value = value === '~' ? '/' : (value || '.')
        var normalized = []
        ;(value[0] === '/' ? value : this.cwd + '/' + value).split('/').forEach(function (part) {
            if (part === '..') normalized.pop()
            else if (part && part !== '.') normalized.push(part)
        })
        return '/' + normalized.join('/')
    }
    BlogShell.prototype.node = function (value, type) {
        var node = this.nodes[this.path(value)]
        if (!node) fail(value + ': 没有那个文件或目录')
        if (type && node.type !== type) fail(value + (type === 'f' ? ': 是目录' : ': 不是目录'))
        if (node.type === 'f' && typeof node.text !== 'string') fail(value + ': 文章正文未加载')
        return node
    }
    BlogShell.prototype.sources = function (files, stdin) {
        var shell = this
        if (!files.length) {
            if (stdin === null) fail('请指定文件，或使用管道传入文本')
            return [{ name: '', text: stdin }]
        }
        return files.map(function (file) { return { name: file, text: file === '-' ? stdin || '' : shell.node(file, 'f').text } })
    }
    BlogShell.prototype.children = function (path) {
        var prefix = path === '/' ? '/' : path + '/'
        return Object.keys(this.nodes).filter(function (name) {
            return name !== path && name.indexOf(prefix) === 0 && name.slice(prefix.length).indexOf('/') === -1
        }).sort()
    }
    function printf(args) {
        if (!args.length) fail('缺少格式字符串')
        var format = decode(args[0]), values = args.slice(1), index = 0, output = ''
        if (/%(?![%sdb])/.test(format)) fail('支持的格式：%s %d %b %%')
        do {
            var before = index
            output += format.replace(/%([%sdb])/g, function (_, kind) {
                if (kind === '%') return '%'
                var value = index < values.length ? values[index] : ''
                index += 1
                if (kind === 's') return value
                if (kind === 'b') return decode(value)
                if (value && !/^[+-]?\d+$/.test(value)) fail('无效的整数 ' + value)
                return value ? String(Number(value)) : '0'
            })
            if (index === before) break
        } while (index < values.length)
        return output
    }
    function regexPattern(pattern, extended) {
        if (!extended) pattern = pattern.replace(/\\([(){}+?|])|[(){}+?|]/g, function (match, escaped) { return escaped || '\\' + match })
        return pattern.replace(/\[:(digit|lower|upper|alpha|alnum|space):\]/g, function (_, key) {
            return { digit: '0-9', lower: 'a-z', upper: 'A-Z', alpha: 'a-zA-Z', alnum: 'a-zA-Z0-9', space: '\\s' }[key]
        })
    }
    function characterSet(value) {
        var classes = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', space: ' \t\n\r\f\v' }
        var chars = Array.from(decode(value).replace(/\[:(lower|upper|digit|space):\]/g, function (_, key) { return classes[key] })), result = []
        for (var i = 0; i < chars.length; i += 1) {
            if (i + 2 < chars.length && chars[i + 1] === '-') {
                var start = chars[i].codePointAt(0), end = chars[i + 2].codePointAt(0)
                if (end < start || end - start > 65536) fail('无效的字符范围')
                for (var code = start; code <= end; code += 1) result.push(String.fromCodePoint(code))
                i += 2
            } else result.push(chars[i])
        }
        return result
    }
    BlogShell.prototype.command = function (tokens, stdin) {
        var name = tokens[0], args = tokens.slice(1), shell = this
        var parsed, opts, sources, text, items, result
        function parseOptions(flags, valued) { parsed = options(args, flags, valued || ''); opts = parsed.opts }
        function read() {
            sources = shell.sources(parsed.files, stdin)
            text = sources.map(function (source) { return source.text }).join('')
            items = rows(text)
        }
        switch (name) {
            case 'help': return { stdout: help }
            case 'echo': return { stdout: args.join(' ') + '\n' }
            case 'printf': return { stdout: printf(args) }
            case 'true': return { stdout: '', status: 0 }
            case 'false': return { stdout: '', status: 1 }
            case 'pwd': return { stdout: this.cwd + '\n' }
            case 'cd':
                if (args.length > 1) fail('参数过多')
                var dest = args[0] === '-' ? this.previousDirectory : this.path(args[0] || '/')
                this.node(dest, 'd'); this.previousDirectory = this.cwd; this.cwd = dest
                return { stdout: args[0] === '-' ? dest + '\n' : '' }
            case 'ls':
                parseOptions('1alF'); result = []
                ;(parsed.files.length ? parsed.files : [this.cwd]).forEach(function (file) {
                    var path = shell.path(file), node = shell.node(path)
                    var entries = node.type === 'd' ? shell.children(path) : [path]
                    if (opts.a && node.type === 'd') entries = [path + '/.', path + '/..'].concat(entries)
                    if (parsed.files.length > 1) result.push(file + ':')
                    entries.forEach(function (entry) {
                        var entryNode = shell.node(entry), label = entry.split('/').pop()
                        if (opts.F && entryNode.type === 'd') label += '/'
                        if (opts.l) label = (entryNode.type === 'd' ? 'dr-xr-xr-x' : '-r--r--r--') + '  linyuww  ' +
                            String(entryNode.type === 'f' ? new TextEncoder().encode(entryNode.text).length : 0).padStart(7) + '  ' + label
                        result.push(label)
                    })
                })
                return { stdout: stream(result) }
            case 'cat':
                parseOptions('n'); read()
                return { stdout: opts.n ? stream(items.map(function (line, i) { return String(i + 1).padStart(6) + '\t' + line })) : text }
            case 'open':
                if (args.length !== 1) fail('请指定一个文章文件')
                var article = this.node(args[0], 'f')
                if (!article.url) fail('此文件没有文章页面')
                return { stdout: '', action: 'open', url: article.url }
            case 'grep':
                parseOptions('EFivnclqx', 'e')
                var patterns = opts.e || [parsed.files.shift()]
                if (patterns[0] === undefined) fail('缺少搜索模式')
                if (opts.E && opts.F) fail('-E 和 -F 不能同时使用')
                var expressions = patterns.join('\n').split('\n').map(function (pattern) {
                    pattern = opts.F ? escapeRegex(pattern) : regexPattern(pattern, opts.E)
                    if (opts.x) pattern = '^(?:' + pattern + ')$'
                    try { return new RegExp(pattern, opts.i ? 'i' : '') }
                    catch (error) { fail('无效的正则表达式') }
                })
                sources = this.sources(parsed.files, stdin); result = []; var found = false
                sources.forEach(function (source) {
                    var selected = rows(source.text).map(function (line, i) { return { line: line, number: i + 1 } }).filter(function (entry) {
                        var match = expressions.some(function (regex) { return regex.test(entry.line) })
                        return opts.v ? !match : match
                    })
                    found = found || selected.length > 0
                    var prefix = sources.length > 1 ? (source.name || '(standard input)') + ':' : ''
                    if (opts.q) return
                    if (opts.l) { if (selected.length) result.push(source.name || '(standard input)'); return }
                    if (opts.c) { result.push(prefix + selected.length); return }
                    selected.forEach(function (entry) { result.push(prefix + (opts.n ? entry.number + ':' : '') + entry.line) })
                })
                return { stdout: stream(result), status: found ? 0 : 1 }
            case 'wc':
                parseOptions('lwmc'); read()
                if (opts.c && opts.m) fail('-c 和 -m 不能同时使用')
                var counts = function (value) {
                    return { l: (value.match(/\n/g) || []).length, w: (value.match(/\S+/gu) || []).length,
                        m: Array.from(value).length, c: new TextEncoder().encode(value).length }
                }
                var selected = 'lwmc'.split('').filter(function (key) { return opts[key] })
                if (!selected.length) selected = ['l', 'w', 'c']
                function formatCount(value, label, total) {
                    var count = total || counts(value)
                    return selected.map(function (key) { return String(count[key]).padStart(7) }).join(' ') + (label ? ' ' + label : '')
                }
                result = sources.map(function (source) { return formatCount(source.text, source.name) })
                if (sources.length > 1) {
                    var total = sources.reduce(function (sum, source) {
                        var count = counts(source.text)
                        Object.keys(sum).forEach(function (key) { sum[key] += count[key] })
                        return sum
                    }, { l: 0, w: 0, m: 0, c: 0 })
                    result.push(formatCount('', 'total', total))
                }
                return { stdout: stream(result) }
            case 'head':
            case 'tail':
                parseOptions('', 'n'); read()
                var countValue = opts.n === undefined ? '10' : opts.n
                if (!/^\+?\d+$/.test(countValue)) fail('行数必须是非负整数，tail 也支持 +N')
                var count = Number(countValue)
                if (!Number.isSafeInteger(count)) fail('行数过大')
                if (name === 'head' && countValue[0] === '+') fail('head 不支持 +N')
                result = sources.map(function (source) {
                    var lines = rows(source.text)
                    var chosen = name === 'head' ? lines.slice(0, count) : countValue[0] === '+' ?
                        lines.slice(Math.max(0, count - 1)) : lines.slice(Math.max(0, lines.length - count))
                    var output = stream(chosen)
                    if (chosen.length && !source.text.endsWith('\n') &&
                        (name === 'tail' || count >= lines.length)) output = output.slice(0, -1)
                    return (sources.length > 1 ? '==> ' + source.name + ' <==\n' : '') + output
                })
                return { stdout: result.join(sources.length > 1 ? '\n' : '') }
            case 'sort':
                parseOptions('rnfub'); read()
                var compare = function (a, b) {
                    if (opts.b) { a = a.replace(/^\s+/, ''); b = b.replace(/^\s+/, '') }
                    if (opts.f) { a = a.toUpperCase(); b = b.toUpperCase() }
                    if (opts.n) return (parseFloat(a) || 0) - (parseFloat(b) || 0)
                    return a < b ? -1 : a > b ? 1 : 0
                }
                items.sort(function (a, b) { return (opts.r ? -1 : 1) * compare(a, b) })
                if (opts.u) items = items.filter(function (line, i) { return i === 0 || compare(line, items[i - 1]) !== 0 })
                return { stdout: stream(items) }
            case 'uniq':
                parseOptions('cdu'); read()
                if (parsed.files.length > 1) fail('只支持一个输入文件')
                if (['c', 'd', 'u'].filter(function (key) { return opts[key] }).length > 1) fail('-c、-d、-u 只能选择一个')
                var groups = []
                items.forEach(function (line) {
                    var last = groups[groups.length - 1]
                    if (last && last.line === line) last.count += 1
                    else groups.push({ line: line, count: 1 })
                })
                return { stdout: stream(groups.filter(function (entry) {
                    return (!opts.d || entry.count > 1) && (!opts.u || entry.count === 1)
                }).map(function (entry) { return (opts.c ? String(entry.count).padStart(7) + ' ' : '') + entry.line })) }
            case 'cut':
                parseOptions('s', 'cfd'); read()
                if ((!opts.c && !opts.f) || (opts.c && opts.f)) fail('请指定 -c 或 -f')
                if ((opts.d !== undefined || opts.s) && !opts.f) fail('-d、-s 只能用于 -f')
                var delimiter = opts.d === undefined ? '\t' : opts.d
                if (Array.from(delimiter).length !== 1) fail('分隔符必须是一个字符')
                var ranges = (opts.c || opts.f).split(/[,\s]+/).map(function (range) {
                    var match = /^(\d+)?(-)?(\d+)?$/.exec(range)
                    if (!match || (!match[1] && !match[3]) || (!match[2] && match[3])) fail('无效的范围 ' + range)
                    var low = Number(match[1] || 1), high = match[2] ? Number(match[3] || Infinity) : low
                    if (low < 1 || high < low) fail('无效的范围 ' + range)
                    return [low, high]
                })
                return { stdout: stream(items.filter(function (line) {
                    return !opts.f || !opts.s || line.indexOf(delimiter) !== -1
                }).map(function (line) {
                    if (opts.f && line.indexOf(delimiter) === -1) return line
                    var parts = opts.f ? line.split(delimiter) : Array.from(line)
                    return parts.filter(function (_, i) { return ranges.some(function (range) { return i + 1 >= range[0] && i + 1 <= range[1] }) }).join(opts.f ? delimiter : '')
                })) }
            case 'tr':
                parseOptions('ds')
                if (stdin === null) fail('请使用管道传入文本')
                if (!parsed.files.length || parsed.files.length > 2) fail('请指定一个或两个字符集合')
                var set1 = characterSet(parsed.files[0]), set2 = characterSet(parsed.files[1] || '')
                if (opts.d && opts.s && parsed.files.length !== 2) fail('-ds 需要两个字符集合')
                if ((!opts.d && !opts.s && !set2.length) || (!opts.d && parsed.files.length === 2 && !set2.length)) fail('缺少目标字符集合')
                var squeeze = parsed.files.length === 2 ? set2 : set1
                var translated = Array.from(stdin).filter(function (c) { return !opts.d || set1.indexOf(c) === -1 }).map(function (c) {
                    var index = set1.indexOf(c)
                    return !opts.d && set2.length && index !== -1 ? set2[Math.min(index, set2.length - 1)] : c
                })
                if (opts.s) translated = translated.filter(function (c, i, all) { return i === 0 || all[i - 1] !== c || squeeze.indexOf(c) === -1 })
                return { stdout: translated.join('') }
            case 'find':
                var base = args[0] && args[0][0] !== '-' ? args.shift() : '.'
                var basePath = this.path(base); this.node(basePath)
                var namePattern = null, type = null
                while (args.length) {
                    var option = args.shift()
                    if (option === '-name' && args.length) namePattern = glob(args.shift())
                    else if (option === '-type' && args.length) { type = args.shift(); if (type !== 'f' && type !== 'd') fail('-type 仅支持 f、d') }
                    else if (option !== '-print') fail('未支持的参数 ' + option)
                }
                return { stdout: stream(Object.keys(this.nodes).sort().filter(function (path) {
                    return (path === basePath || path.indexOf(basePath === '/' ? '/' : basePath + '/') === 0) &&
                        (!type || shell.nodes[path].type === type) && (!namePattern || namePattern.test(path.split('/').pop()))
                })) }
            case 'tree':
                if (args.length > 1) fail('参数过多')
                var baseDir = this.path(args[0]); this.node(baseDir, 'd'); result = [baseDir]
                function branch(dir, prefix) {
                    var children = shell.children(dir)
                    children.forEach(function (path, i) {
                        var last = i === children.length - 1
                        result.push(prefix + (last ? '└── ' : '├── ') + path.split('/').pop())
                        if (shell.nodes[path].type === 'd') branch(path, prefix + (last ? '    ' : '│   '))
                    })
                }
                branch(baseDir, ''); return { stdout: stream(result) }
            case 'basename':
                if (!args.length || args.length > 2) fail('用法：basename 路径 [后缀]')
                var trimmed = args[0].replace(/\/+$/, '') || '/', leaf = trimmed === '/' ? '/' : trimmed.split('/').pop()
                if (args[1] && leaf !== args[1] && leaf.endsWith(args[1])) leaf = leaf.slice(0, -args[1].length)
                return { stdout: leaf + '\n' }
            case 'dirname':
                if (args.length !== 1) fail('用法：dirname 路径')
                var value = args[0].replace(/\/+$/, '')
                return { stdout: (value.indexOf('/') === -1 ? '.' : value.replace(/\/[^/]*$/, '').replace(/\/+$/, '') || '/') + '\n' }
            case 'du':
                parseOptions('a'); result = []
                function size(path) {
                    var node = shell.node(path), bytes = node.type === 'f' ? new TextEncoder().encode(node.text).length :
                        shell.children(path).reduce(function (total, child) { return total + size(child) }, 0)
                    if (node.type === 'd' || opts.a) result.push(Math.ceil(bytes / 512) + '\t' + path)
                    return bytes
                }
                ;(parsed.files.length ? parsed.files : [this.cwd]).forEach(function (file) { size(shell.path(file)) })
                return { stdout: stream(result) }
            case 'history': return { stdout: stream(this.history.map(function (entry, i) { return String(i + 1).padStart(4) + '  ' + entry })) }
            case 'whoami': return { stdout: this.data.owner + '\n' }
            case 'hostname': return { stdout: this.data.host + '\n' }
            case 'id': return { stdout: 'uid=1000(' + this.data.owner + ') gid=1000(readers)\n' }
            case 'env': return { stdout: 'USER=' + this.data.owner + '\nHOME=/\nSHELL=blog-shell\nLANG=C.UTF-8\nPWD=' + this.cwd + '\n' }
            case 'uname': return { stdout: args[0] === '-a' ? 'BlogShell blog browser JavaScript\n' : 'BlogShell\n' }
            case 'ps': return { stdout: '  PID  CMD\n    1  blog-shell\n' }
            case 'uptime': return { stdout: 'up ' + Math.floor((Date.now() - this.started) / 1000) + ' seconds\n' }
            case 'date': return { stdout: new Date().toLocaleString('zh-CN', { hour12: false }) + '\n' }
            case 'which':
                if (!args.length) fail('缺少命令名')
                result = args.filter(function (command) { return names.indexOf(command) !== -1 })
                return { stdout: stream(result), status: result.length === args.length ? 0 : 1 }
            case 'clear': return { stdout: '', action: 'clear' }
            case 'exit': return { stdout: '', action: 'exit' }
            default: return { stdout: '', stderr: name + ': command not found\n', status: 127 }
        }
    }
    BlogShell.prototype.execute = function (commandLine) {
        var stdout = null, stderr = '', status = 0, action, url, stages
        try { stages = parse(commandLine) }
        catch (error) { this.status = 2; return { stdout: '', stderr: error.message + '\n', status: 2 } }
        if (stages.length > 1 && stages.some(function (tokens) { return ['cd', 'clear', 'exit', 'open'].indexOf(tokens[0]) !== -1 })) {
            this.status = 2; return { stdout: '', stderr: 'shell: 管道只能组合文本命令\n', status: 2 }
        }
        for (var i = 0; i < stages.length; i += 1) {
            var result
            try { result = this.command(stages[i], stdout) }
            catch (error) { result = { stdout: '', stderr: stages[i][0] + ': ' + error.message + '\n', status: 2 } }
            stdout = result.stdout; stderr += result.stderr || ''; status = result.status || 0
            action = result.action; url = result.url
        }
        this.status = status
        return { stdout: stdout || '', stderr: stderr, status: status, action: action, url: url }
    }
    BlogShell.prototype.complete = function (value) {
        var match = /^(\S+)\s+(.*)$/.exec(value), shell = this
        if (!match) return names.filter(function (name) { return name.indexOf(value) === 0 })
        var fragment = match[2].replace(/^['"]/, ''), prefix = this.path(fragment)
        return Object.keys(this.nodes).filter(function (path) {
            return path !== '/' && (match[1] !== 'cd' || shell.nodes[path].type === 'd') && path.indexOf(prefix) === 0
        }).map(function (path) { return match[1] + ' ' + '"' + path.replace(/["\\]/g, '\\$&') + '"' })
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = BlogShell
    else root.BlogShell = BlogShell
})(typeof window === 'undefined' ? globalThis : window)
