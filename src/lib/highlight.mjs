// A small tokenizer for the code shown on living-code.dev. It runs at build time and wraps each token in
// <span class="t-ROLE">, where ROLE is a Living Code role (keyword, string, comment…). src/styles/site.css colors
// those classes with the CSS port's role variables, so every snippet follows the flavor the page is in.
// It covers the snippets this site shows (its own JS, the install commands of every port), not every grammar.

export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const span = (role, text) => (role ? `<span class="t-${role}">${escapeHtml(text)}</span>` : escapeHtml(text));

const words = (s) => new Set(s.split(" "));
const JS_KEYWORDS = words("const let var function return if else for while do of in new throw try catch finally import export from default class extends await async typeof instanceof delete void yield switch case break continue with as");
const JS_CONSTANTS = words("true false null undefined NaN Infinity");
const JS_BUILTINS = words("this super document window localStorage console globalThis navigator location history");
const LUA_KEYWORDS = words("local function end return if then else elseif for in do while repeat until and or not break goto");
const SH_KEYWORDS = words("if then else elif fi for do done in case esac while until function export local set end");
const NIX_KEYWORDS = words("let in with rec inherit import if then else assert");

const STRING = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)(?![\w$])/y;

// Looks at the source after `i`, skipping spaces: the next character, or a regex test.
const ahead = (src, i, re) => re.test(src.slice(i).replace(/^[ \t]+/, ""));

// Splits a double-quoted shell or Nix string into string parts and the variables interpolated into it.
function interpolated(text, varRe) {
  let out = "", last = 0;
  for (const m of text.matchAll(varRe)) {
    out += span("string", text.slice(last, m.index)) + span("variable", m[0]);
    last = m.index + m[0].length;
  }
  return out + span("string", text.slice(last));
}

function js(src) {
  let out = "", i = 0, prev = "", depth = 0;
  // params: paren depth of the parameter list being read; inDefault: inside a parameter default value;
  // typeNext: the next identifier is a type annotation; declared: the last identifier was a let/const/var name.
  let params = -1, awaitParams = false, inDefault = false, typeNext = false, declared = false;
  const emit = (role, text) => { out += span(role, text); prev = text; };
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if ((m = /^\s+/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    if ((m = /^\/\/.*/.exec(rest)) || (m = /^\/\*[\s\S]*?(?:\*\/|$)/.exec(rest))) { emit("comment", m[0]); i += m[0].length; continue; }
    if (rest[0] === "`") {
      // Template literal: string parts, with each ${…} highlighted as code.
      let j = 1, part = "`";
      while (j < rest.length && rest[j] !== "`") {
        if (rest[j] === "\\") { part += rest.slice(j, j + 2); j += 2; continue; }
        if (rest.startsWith("${", j)) {
          let k = j + 2, d = 1;
          while (k < rest.length && d) { if (rest[k] === "{") d++; else if (rest[k] === "}") d--; k++; }
          out += span("string", part) + span("punctuation", "${") + js(rest.slice(j + 2, k - 1)) + span("punctuation", "}");
          part = ""; j = k; continue;
        }
        part += rest[j++];
      }
      emit("string", part + (rest[j] === "`" ? "`" : "")); i += j + 1; declared = false; continue;
    }
    STRING.lastIndex = i;
    if ((m = STRING.exec(src))) { emit(ahead(src, i + m[0].length, /^:/) && /[{,]/.test(prev) ? "property" : "string", m[0]); i += m[0].length; declared = false; continue; }
    NUMBER.lastIndex = i;
    if ((m = NUMBER.exec(src)) && !/[\w$]/.test(src[i - 1] || "")) { emit("number", m[0]); i += m[0].length; declared = false; continue; }
    if (rest.startsWith("=>")) { emit("keyword", "=>"); i += 2; continue; }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const w = m[0], end = i + w.length, call = ahead(src, end, /^\(/);
      let role;
      if (prev === "." || prev === "?.") role = call ? "function" : "property";
      else if (typeNext) role = "type";
      else if (params >= 0 && !inDefault) role = "parameter";
      else if (ahead(src, end, /^:(?!:)/) && /[{,]/.test(prev)) role = "property";
      else if (w === "type" && ahead(src, end, /^[A-Z]/)) role = "keyword";
      else if (JS_KEYWORDS.has(w)) role = "keyword";
      else if (JS_CONSTANTS.has(w)) role = "constant";
      else if (JS_BUILTINS.has(w)) role = "builtin";
      else if (ahead(src, end, /^=>/)) role = "parameter";
      else if (prev === "new") role = "type";
      else if (call) role = "function";
      else if (/^[A-Z][a-z]/.test(w)) role = "type";
      else role = "variable";
      declared = role === "variable" && (prev === "let" || prev === "const" || prev === "var");
      if (w === "function") awaitParams = true;
      typeNext = false;
      emit(role, w); i = end; continue;
    }
    if ((m = /^[{}()[\];,.]|^\?\./.exec(rest))) {
      const p = m[0];
      if (p === "(") {
        depth++;
        if (awaitParams || /^\([^()]*\)\s*=>/.test(rest)) { params = depth; awaitParams = false; inDefault = false; }
      } else if (p === ")") {
        if (depth === params) params = -1;
        depth--;
      }
      if (p === "," && depth === params) inDefault = false;
      typeNext = declared = false;
      emit("punctuation", p); i += p.length; continue;
    }
    if ((m = /^[=+\-*/%<>!&|?:^~]+/.exec(rest))) {
      // A ":" after a parameter or a declared name starts a type annotation; "=" in a parameter list starts its default.
      typeNext = m[0] === ":" && ((params >= 0 && !inDefault) || declared);
      if (m[0] === "=" && params >= 0) inDefault = true;
      declared = false;
      emit("operator", m[0]); i += m[0].length; continue;
    }
    out += escapeHtml(rest[0]); i++;
  }
  return out;
}

function css(src) {
  let out = "", i = 0, block = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m, role = null;
    if ((m = /^\s+/.exec(rest))) role = null;
    else if ((m = /^\/\*[\s\S]*?(?:\*\/|$)/.exec(rest))) role = "comment";
    else if ((m = /^"(?:[^"\\\n]|\\.)*"?|^'(?:[^'\\\n]|\\.)*'?/.exec(rest))) role = "string";
    else if ((m = /^@[\w-]+/.exec(rest))) role = "keyword";
    else if ((m = /^[{}]/.exec(rest))) { role = "punctuation"; block += m[0] === "{" ? 1 : -1; }
    else if (block > 0 && (m = /^--?[\w-]+(?=\s*:)/.exec(rest))) role = "property";
    else if ((m = /^[\w-]+(?=\()/.exec(rest))) role = "function";
    else if ((m = /^--[\w-]+/.exec(rest))) role = "variable";
    else if ((m = /^#[\da-fA-F]{3,8}\b/.exec(rest))) role = block > 0 ? "constant" : "type";
    else if ((m = /^-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/.exec(rest))) role = "number";
    else if ((m = /^!important/.exec(rest))) role = "keyword";
    else if (block === 0 && (m = /^\.[\w-]+/.exec(rest))) role = "type";
    else if (block === 0 && (m = /^::?[\w-]+/.exec(rest))) role = "keyword";
    else if (block === 0 && (m = /^(?<=\[)[\w-]+/.exec(rest))) role = "attribute";
    else if ((m = /^[\w-]+/.exec(rest))) role = block > 0 ? "variable" : "tag";
    else if ((m = /^[():;,[\]>+~*=]/.exec(rest))) role = "punctuation";
    else m = [rest[0]];
    out += role ? span(role, m[0]) : escapeHtml(m[0]);
    i += m[0].length;
  }
  return out;
}

function shell(src, { powershell = false } = {}) {
  let out = "", i = 0, cmd = true;
  const VAR = powershell ? /\$env:\w+|\$\w+/g : /\$\{[^}]*\}|\$[A-Za-z_]\w*|\$\d/g;
  while (i < src.length) {
    const rest = src.slice(i), before = src[i - 1] ?? "\n";
    let m;
    if ((m = /^\s+/.exec(rest))) { out += m[0]; if (m[0].includes("\n")) cmd = true; i += m[0].length; continue; }
    if (/\s/.test(before) && (m = /^#.*/.exec(rest))) { out += span("comment", m[0]); i += m[0].length; continue; }
    if ((m = /^"(?:[^"\\]|\\.)*"?/.exec(rest))) { out += interpolated(m[0], VAR); i += m[0].length; cmd = false; continue; }
    if ((m = /^'[^']*'?/.exec(rest))) { out += span("string", m[0]); i += m[0].length; cmd = false; continue; }
    if ((m = new RegExp(`^(?:${VAR.source})`).exec(rest))) { out += span("variable", m[0]); i += m[0].length; cmd = false; continue; }
    if ((m = /^(?:&&|\|\||[|;])/.exec(rest))) { out += span("operator", m[0]); i += m[0].length; cmd = true; continue; }
    if ((m = /^(?:>>?|<)/.exec(rest))) { out += span("operator", m[0]); i += m[0].length; continue; }
    if (cmd && (m = /^([A-Za-z_]\w*)=([^\s"';|&$]*)/.exec(rest))) {
      out += span("variable", m[1]) + span("operator", "=") + (m[2] ? span("string", m[2]) : "");
      i += m[0].length; continue;
    }
    if (/\s/.test(before) && (m = /^--?[A-Za-z][\w-]*/.exec(rest))) { out += span("attribute", m[0]); i += m[0].length; continue; }
    if ((m = /^[^\s"'|;&<>$]+/.exec(rest))) {
      const w = m[0];
      if (cmd) out += span(SH_KEYWORDS.has(w) ? "keyword" : powershell && !/^[A-Z]\w*-\w+$/.test(w) ? null : "function", w);
      else out += escapeHtml(w);
      cmd = false; i += w.length; continue;
    }
    out += escapeHtml(rest[0]); i++;
  }
  return out;
}

function lua(src) {
  let out = "", i = 0, prev = "";
  const emit = (role, text) => { out += span(role, text); prev = text; };
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if ((m = /^\s+/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    if ((m = /^--.*/.exec(rest))) { emit("comment", m[0]); i += m[0].length; continue; }
    STRING.lastIndex = i;
    if ((m = STRING.exec(src))) { emit("string", m[0]); i += m[0].length; continue; }
    NUMBER.lastIndex = i;
    if ((m = NUMBER.exec(src))) { emit("number", m[0]); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
      const w = m[0], end = i + w.length;
      let role;
      if (LUA_KEYWORDS.has(w)) role = "keyword";
      else if (w === "nil" || w === "true" || w === "false") role = "constant";
      else if (ahead(src, end, /^[("{]/)) role = "function";
      else if (prev === "." || prev === ":") role = "property";
      else if (ahead(src, end, /^=(?!=)/)) role = "property";
      else if (w === "vim") role = "builtin";
      else role = "variable";
      emit(role, w); i = end; continue;
    }
    if ((m = /^[{}()[\];,.:]/.exec(rest))) { emit("punctuation", m[0]); i += 1; continue; }
    if ((m = /^[=+\-*/%<>~#^]+/.exec(rest))) { emit("operator", m[0]); i += m[0].length; continue; }
    out += escapeHtml(rest[0]); i++;
  }
  return out;
}

// Line-based formats: `key = value`, `[section]`, `key: value`, `name value`.
function config(src, lang) {
  return src.split("\n").map((line) => {
    let m;
    if ((m = /^(\s*)([#;].*)$/.exec(line))) return m[1] + span("comment", m[2]);
    if ((m = /^(\s*)(\[[^\]]*\])(\s*)$/.exec(line))) return m[1] + span("type", m[2]) + m[3];
    if (lang === "yaml" && (m = /^(\s*)([\w-]+)(:)(\s*)(.*)$/.exec(line))) return m[1] + span("property", m[2]) + span("punctuation", m[3]) + m[4] + (m[5] ? span("string", m[5]) : "");
    if (lang === "json" && (m = /^(\s*)("[^"]*")(\s*:\s*)(.*)$/.exec(line))) return m[1] + span("property", m[2]) + span("punctuation", m[3]) + value(m[4]);
    if ((m = /^(\s*)([\w.-]+)(\s*=\s*)(.*)$/.exec(line))) return m[1] + span("property", m[2]) + span("operator", m[3]) + value(m[4], lang);
    if ((m = /^(\s*)([\w-]+)(\s+)(.*)$/.exec(line))) return m[1] + span(lang === "tmux" ? "function" : "property", m[2]) + m[3] + value(m[4], lang);
    return escapeHtml(line);
  }).join("\n");
}

// The value side of a config line: strings, numbers, booleans, arrays.
function value(v, lang) {
  if (lang === "ini" || lang === "conf" || lang === "tmux") return span("string", v);
  let out = "", m;
  while (v) {
    if ((m = /^\s+/.exec(v))) out += m[0];
    else if ((m = /^"(?:[^"\\]|\\.)*"?|^'[^']*'?/.exec(v))) out += span("string", m[0]);
    else if ((m = /^(?:true|false|null)\b/.exec(v))) out += span("constant", m[0]);
    else if ((m = /^-?\d[\d_.]*/.exec(v))) out += span("number", m[0]);
    else if ((m = /^[[\]{},:]/.exec(v))) out += span("punctuation", m[0]);
    else { m = /^[^\s[\]{},"']+/.exec(v) ?? [v[0]]; out += span("string", m[0]); }
    v = v.slice(m[0].length);
  }
  return out;
}

function nix(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if ((m = /^\s+/.exec(rest))) out += m[0];
    else if ((m = /^#.*/.exec(rest))) out += span("comment", m[0]);
    else if ((m = /^"(?:[^"\\]|\\.)*"?/.exec(rest))) out += interpolated(m[0], /\$\{[^}]*\}/g);
    else if ((m = /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*(?=\s*=)/.exec(rest))) out += span("property", m[0]);
    else if ((m = /^[A-Za-z_][\w-]*/.exec(rest))) out += span(NIX_KEYWORDS.has(m[0]) ? "keyword" : /^(?:true|false|null)$/.test(m[0]) ? "constant" : "variable", m[0]);
    else if ((m = /^=/.exec(rest))) out += span("operator", m[0]);
    else if ((m = /^[{}()[\];,.:]/.exec(rest))) out += span("punctuation", m[0]);
    else { m = [rest[0]]; out += escapeHtml(m[0]); }
    i += m[0].length;
  }
  return out;
}

function html(src) {
  let out = "", i = 0, inTag = false;
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if (!inTag && (m = /^(<\/?)([\w-]+)/.exec(rest))) { out += span("punctuation", m[1]) + span("tag", m[2]); inTag = true; }
    else if (!inTag) { m = /^[^<]+/.exec(rest) ?? [rest[0]]; out += escapeHtml(m[0]); }
    else if ((m = /^\s+/.exec(rest))) out += m[0];
    else if ((m = /^\/?>/.exec(rest))) { out += span("punctuation", m[0]); inTag = false; }
    else if ((m = /^[\w-]+/.exec(rest))) out += span("attribute", m[0]);
    else if ((m = /^"[^"]*"?|^'[^']*'?/.exec(rest))) out += span("string", m[0]);
    else if ((m = /^=/.exec(rest))) out += span("operator", m[0]);
    else { m = [rest[0]]; out += escapeHtml(m[0]); }
    i += m[0].length;
  }
  return out;
}

// The Python and Rust previews need a small lexical subset, not a browser-loaded grammar.
const PY_KEYWORDS = words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield");
const RUST_KEYWORDS = words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while");
const CODE_TYPES = words("str int float bool bytes list dict set tuple String Vec Option Result i32 i64 u32 u64 usize f32 f64");
function typedCode(src, lang) {
  const python = lang === "python", keywords = python ? PY_KEYWORDS : RUST_KEYWORDS;
  let out = "", i = 0, prev = "";
  while (i < src.length) {
    const rest = src.slice(i);
    let m, role = null;
    if ((m = /^\s+/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    if ((m = (python ? /^#.*/ : /^\/\/.*/).exec(rest))) role = "comment";
    else if (!python && (m = /^\/\*[\s\S]*?(?:\*\/|$)/.exec(rest))) role = "comment";
    else if (python && (m = /^@[\w.]+/.exec(rest))) role = "decorator";
    else if ((m = /^(?:"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)/.exec(rest))) role = "string";
    else if ((m = /^(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?)(?!\w)/.exec(rest))) role = "number";
    else if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
      const w = m[0], call = ahead(src, i + w.length, /^!?\(/);
      if (keywords.has(w)) role = "keyword";
      else if (/^(?:True|False|None|true|false)$/.test(w)) role = "constant";
      else if (prev === "class" || prev === "struct" || CODE_TYPES.has(w) || /^[A-Z]/.test(w)) role = "type";
      else if (call || prev === "def" || prev === "fn") role = "function";
      else if (prev === "." || ahead(src, i + w.length, /^:(?!:)/)) role = "property";
      else role = "variable";
    } else if ((m = /^[{}()[\];,.:]/.exec(rest))) role = "punctuation";
    else if ((m = /^[=+\-*/%<>!&|?^~]+/.exec(rest))) role = "operator";
    else m = [rest[0]];
    out += role ? span(role, m[0]) : escapeHtml(m[0]);
    prev = m[0];
    i += m[0].length;
  }
  return out;
}

const LANGS = {
  js, javascript: js, ts: js, typescript: js, mjs: js,
  css,
  sh: shell, bash: shell, shell, fish: shell, powershell: (s) => shell(s, { powershell: true }),
  lua,
  toml: (s) => config(s, "toml"), ini: (s) => config(s, "ini"), conf: (s) => config(s, "conf"),
  yaml: (s) => config(s, "yaml"), json: (s) => config(s, "json"), kdl: (s) => config(s, "kdl"), tmux: (s) => config(s, "tmux"),
  nix, html,
  python: (s) => typedCode(s, "python"), py: (s) => typedCode(s, "python"),
  rust: (s) => typedCode(s, "rust"), rs: (s) => typedCode(s, "rust"),
};

export const highlight = (code, lang) => (LANGS[lang] ?? escapeHtml)(code);
