// Rule-based detectors for the deClaude pattern catalogue (docs/research/patterns.md).
// Runs in the browser (to highlight and score) and on the server (to check the rewrite).
// Pattern IDs here must match the IDs in skill/SKILL.md.

export const PATTERNS = {
  "em-dash":                { family: "Punctuation", label: "Em dash" },
  "bold-labels":            { family: "Punctuation", label: "Bold labels" },
  "heading-style":          { family: "Punctuation", label: "Headings & decoration" },
  "ai-vocab":               { family: "Words", label: "AI vocabulary" },
  "stacked-adjectives":     { family: "Words", label: "Stacked adjectives" },
  "intensifiers":           { family: "Words", label: "Empty intensifier" },
  "copula-avoidance":       { family: "Words", label: "Copula avoidance" },
  "promo-language":         { family: "Words", label: "Promo language" },
  "hedge-stack":            { family: "Words", label: "Stacked hedge" },
  "rule-of-three":          { family: "Templates", label: "Rule of three" },
  "not-x-but-y":            { family: "Templates", label: "Not X but Y" },
  "stock-openers":          { family: "Templates", label: "Stock opener" },
  "template-phrases":       { family: "Templates", label: "Template phrase" },
  "transition-overuse":     { family: "Templates", label: "Transition word" },
  "ing-tail":               { family: "Templates", label: "-ing tail" },
  "self-answer":            { family: "Templates", label: "Self-answered question" },
  "significance-inflation": { family: "Claims", label: "Inflated significance" },
  "vague-attribution":      { family: "Claims", label: "Vague attribution" },
  "chatbot-residue":        { family: "Claims", label: "Chatbot residue" },
  "generic-closer":         { family: "Claims", label: "Generic closer" },
  "punchy-closer":          { family: "Claims", label: "Punchy closer" },
  "uniform-rhythm":         { family: "Rhythm", label: "Uniform rhythm" },
  "repeated-openers":       { family: "Rhythm", label: "Repeated openers" },
  "generic-filler":         { family: "Rhythm", label: "Generic filler" },
};

export const FAMILIES = ["Punctuation", "Words", "Templates", "Claims", "Rhythm"];

const alt = (words) => words.join("|");

const STOCK_ADJ = [
  "sleek", "intuitive", "powerful", "seamless", "robust", "innovative", "comprehensive",
  "dynamic", "vibrant", "stunning", "elegant", "versatile", "effortless", "premium", "modern",
  "exceptional", "unparalleled", "remarkable", "meaningful", "impactful", "thoughtful",
  "cutting-edge", "state-of-the-art", "user-friendly", "high-quality", "world-class",
  "best-in-class", "lightweight", "durable", "reliable", "scalable", "flexible", "engaging",
  "compelling", "holistic", "transformative", "actionable", "curated", "bespoke", "unique",
  "exciting", "incredible", "amazing", "beautiful", "rich", "nuanced", "crucial", "essential",
  "vital", "timeless", "luxurious", "delightful", "immersive", "authentic", "sustainable",
  "eco-friendly", "ergonomic", "responsive", "smart", "fresh", "bold", "perfect", "passionate",
  "dedicated", "innovative", "collaborative", "fast-paced", "ever-evolving", "groundbreaking",
];

const RULES = [
  ["em-dash", /—|(?<!\d)–(?!\d)|\s--\s/g],

  ["bold-labels", /\*\*[^*\n]{1,40}:\*\*|\*\*[^*\n]{1,40}\*\*\s*:/g],
  ["bold-labels", /^[ \t]*(?:[-*•]|\d+\.)[ \t]+[A-Z][^:\n]{1,30}:[ \t]/gm],
  // Bold lead-in sentence at the start of a paragraph: "**The skill is the trap.** As an..."
  ["bold-labels", /^[ \t]*\*\*[^*\n]{3,140}\*\*(?=[ \t]*\S)/gm],

  ["ai-vocab", new RegExp(`\\b(?:${alt([
    "delv(?:e|es|ed|ing)", "tapestr(?:y|ies)", "testament", "pivotal", "robust", "seamless(?:ly)?",
    "leverag(?:e|es|ed|ing)", "landscape", "realm", "foster(?:s|ed|ing)?", "underscor(?:e|es|ed|ing)",
    "showcas(?:e|es|ed|ing)", "meticulous(?:ly)?", "intricat(?:e|ely)", "intricacies", "multifaceted",
    "paramount", "beacon", "embark(?:s|ed|ing)?", "holistic", "synerg(?:y|ies)", "paradigm",
    "transformative", "ever-evolving", "harness(?:es|ed|ing)?", "streamlin(?:e|es|ed|ing)",
    "empower(?:s|ed|ing|ment)?", "unleash(?:es|ed|ing)?", "crucial(?:ly)?", "comprehensive",
    "interplay", "garner(?:s|ed|ing)?", "bolster(?:s|ed|ing)?", "enhanc(?:e|es|ed|ing)", "navigat(?:e|es|ing) the",
    "myriad", "plethora", "nuanced", "cornerstone", "elevat(?:e|es|ed|ing)",
  ])})\\b`, "gi")],

  ["intensifiers", /\b(?:truly|really|deeply|genuinely|incredibly|absolutely|simply|actually|fundamentally|literally|honestly|undeniably|profoundly|remarkably|exceptionally)\b/gi],

  ["copula-avoidance", /\b(?:serv(?:es|ed|e|ing)|stand(?:s|ing)?|stood|act(?:s|ed)?|function(?:s|ed)?) as (?:a|an|the)\b|\bboast(?:s|ed|ing)?\b|\b(?:features|represents) (?:a|an)\b/gi],

  ["promo-language", /\b(?:nestled|in the heart of|breathtaking|world-class|game[- ]chang(?:er|ers|ing)|unlock(?:s|ed|ing)?|must-(?:have|visit|see|try)|stunning|unparalleled|best-in-class|state-of-the-art|next[- ]level|effortless(?:ly)?|hidden gem|revolutioni[sz](?:e|es|ed|ing)|supercharg(?:e|es|ed|ing)|elevate your|cutting-edge|groundbreaking)\b/gi],

  ["hedge-stack", /\b(?:could|may|might|can) (?:potentially|possibly|perhaps)\b|\bperhaps (?:might|could|may)\b|\bit (?:could|may|might) be argued\b/gi],

  ["not-x-but-y", /\bnot (?:just|only|merely|simply)\b[^.!?\n]{0,80}?\b(?:but|it'?s|it is|they'?re)\b/gi],
  ["not-x-but-y", /\b(?:it'?s|this is|that'?s|it is) not (?:about )?[^.!?,\n]{1,50}[,;:]\s*(?:it'?s|but|it is)\b/gi],
  ["not-x-but-y", /\bisn'?t (?:just )?[^.!?\n]{1,40}[.;]\s*(?:it'?s|they'?re|it is)\b/gi],
  ["not-x-but-y", /\bnot because\b[^.!?\n]{1,80}[.!?]\s*because\b/gi],
  // "Frameworks are a starting point, not the answer."
  ["not-x-but-y", /\b(?:is|are|was|were|feels?|becomes?)\s+(?:a|an|the)?\s*[^,.!?\n]{1,40},\s+not\s+(?:a|an|the|just)?\s*[^,.!?\n]{1,30}[.!?]/gi],
  // "Your job is no longer to X. It's to Y." / "doesn't make you X, it just makes Y"
  ["not-x-but-y", /\bno longer\b[^.!?\n]{1,60}\.\s*it'?s\b/gi],
  ["not-x-but-y", /\bno longer\b[^.!?\n]{1,60},\s*but\b/gi],
  ["not-x-but-y", /\b(?:doesn'?t|don'?t|isn'?t)\b[^.!?\n]{1,50},\s*it (?:just|only|simply)\b/gi],

  ["stock-openers", /\bin today'?s\b|\bhere'?s the (?:thing|truth|kicker|deal)\b|\blet'?s (?:dive|delve|jump) in(?:to)?\b|\blet'?s break (?:it|this|that) down\b|\bwhen it comes to\b|\bit'?s (?:worth|important to) not(?:e|ing)\b|\bin a world where\b|\bat the end of the day\b|\bimagine (?:a|an) \w+ where\b|\bthe (?:truth|reality) is\b|\bin the (?:ever-evolving|fast-paced|rapidly changing|digital) \w+\b|\bbuckle up\b|\bpicture this\b/gi],

  ["template-phrases", /\bwhether you'?re\b[^.!?\n]{0,50}\bor\b|\bmore than just\b|\bsay goodbye to\b|\blook no further\b|\b(?:that'?s|this is) where\b[^.!?\n]{0,30}\bcomes? in\b|\bto the next level\b|\bdesigned with you in mind\b|\b(?:unlock|unleash|reach) (?:the|your) (?:full )?potential\b|\bthe (?:perfect|ideal|ultimate) (?:choice|companion|solution|partner)\b|\bi(?:'m| am) (?:thrilled|excited|delighted|eager) to\b|\bi(?:'m| am) excited (?:by|about) the (?:idea|opportunity|chance|prospect)\b|\bi'?d love the (?:chance|opportunity)\b|\b(?:sits?|lies|lie) at the intersection of\b|\bwherever (?:the day|life|your day|the road) takes you\b/gi],

  ["transition-overuse", /(?:^|[.!?]\s+)(?:Moreover|Furthermore|Additionally|In addition|Notably|Importantly|Crucially|Consequently|Nevertheless)\b/gm],

  ["ing-tail", /,\s+(?:highlighting|underscoring|emphasi[sz]ing|showcasing|reflecting|symboli[sz]ing|demonstrating|ensuring|fostering|paving the way|reinforcing|solidifying|signaling|contributing to|cementing|marking|enabling)\b[^.!?\n]*/gi],

  ["self-answer", /\b(?:the|and the|so the) (?:result|answer|catch|kicker|upshot|best part|secret|twist|difference|outcome|truth|problem|solution)\?|\bthe (?:best part|bottom line|result|secret|answer|kicker|catch|truth)\s*:|\bwhy (?:does|should) (?:this|it|that|you) (?:matter|care)\??/gi],

  ["significance-inflation", /\b(?:pivotal|watershed|defining|landmark) moment\b|\btestament to\b|\bplays? an? (?:crucial|key|vital|pivotal|significant|critical|important|central) role\b|\benduring legacy\b|\bunderscores? the importance\b|\bmarks? an? (?:significant|major|new|pivotal|important) (?:milestone|step|chapter|shift)\b|\bstands? as an? (?:symbol|reminder|beacon)\b|\b(?:rich|vibrant) (?:history|heritage|tapestry)\b|\b(?:deeply|profoundly) (?:rooted|ingrained)\b|\bshap(?:e|es|ed|ing) the future\b|\blasting (?:impact|impression|legacy)\b|\bindelible mark\b/gi],

  ["vague-attribution", /\b(?:experts|studies|research|analysts|critics|observers|scientists|industry leaders) (?:say|says|suggest|suggests|show|shows|believe|argue|agree|note|indicate|indicates|predict)\b|\bit is widely (?:believed|recognized|recognised|acknowledged|accepted)\b|\baccording to (?:experts|many)\b/gi],

  ["chatbot-residue", /\bgreat question\b|\bi hope this (?:helps|email finds you well|message finds you well)\b|\bcertainly!|\babsolutely!|\bfeel free to (?:reach out|contact|let me know)\b|\b(?:please )?do(?:n'?t| not) hesitate to (?:reach out|contact)\b|\bi'?d be (?:happy|glad|delighted) to\b|\blet me know if you (?:have|need) any\b|\bas an ai\b|\bi hope you'?re (?:doing )?well\b/gi],

  ["generic-closer", /(?:^|[.!?]\s+)(?:In conclusion|In summary|To sum up|Ultimately|All in all|In the end)\b|\bthe future (?:looks|is) bright\b|\bonly time will tell\b|\bcontinues? to (?:evolve|thrive)\b|\bremains to be seen\b|\bthe possibilities are endless\b|\bexciting times ahead\b|\bpoised for (?:growth|success)\b|\blooking forward to what\b[^.!?\n]{0,30}\bbrings\b|(?:^|[.!?]\s+)(?:agree|thoughts)\?|\bwhat(?:'s| is) one thing you\b|\bwhat do you think\?/gim],

  ["punchy-closer", /\blet that sink in\b|(?:^|[.!?]\s+)(?:full stop|period)\.|\band that'?s (?:the point|okay|everything|what matters|the magic|the secret)\b|\bthis changes everything\b|\bread that again\b|\bit'?s (?:that|as) simple(?: as that)?\b|\bmake no mistake\b|\bthe rest is history\b/gim],
];

// Slide decks arrive with one marker line per slide. Text with markers is judged as slides:
// fragments and labels are normal there, so rhythm checks and list triads on labels are skipped.
export const SLIDE_MARK = /^[ \t]*--- Slide \d+ ---[ \t]*$/gm;
export const isSlides = (text) => new RegExp(SLIDE_MARK.source, "m").test(text || "");

// Replace code, URLs, emails and slide markers with spaces so offsets stay aligned but they never match.
function mask(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/\S+@\S+\.\S+/g, blank)
    .replace(SLIDE_MARK, blank);
}

// A line with no sentence ending: a heading, label or slide bullet.
const ENDS_SENTENCE = /[.!?:;]["')\]’”]*$/;
function lineAt(text, i) {
  const start = text.lastIndexOf("\n", i - 1) + 1;
  const end = text.indexOf("\n", i);
  return text.slice(start, end < 0 ? text.length : end).trim();
}

// Every place a "keep as is" passage occurs. Findings inside these are quotes or examples, not tells.
export function keepSpans(text, keep = []) {
  const spans = [];
  for (const k of keep) {
    const needle = typeof k === "string" ? k.trim() : "";
    if (!needle) continue;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
      spans.push({ start: i, end: i + needle.length });
    }
  }
  return spans;
}

function stackedAdjectives(text) {
  const lex = new Set(STOCK_ADJ);
  const adj = `(?:${STOCK_ADJ.map((w) => w.replace(/-/g, "\\-")).join("|")}|[a-z]+(?:ive|ful|ous|able|ible|less))`;
  const re = new RegExp(`\\b${adj}(?:(?:,\\s*(?:and\\s+)?|\\s+and\\s+|\\s+)${adj})+(?=\\s+[a-z]{3,})`, "gi");
  const out = [];
  for (const m of text.matchAll(re)) {
    const words = m[0].toLowerCase().split(/[\s,]+/).filter((w) => w && w !== "and");
    const stock = words.filter((w) => lex.has(w)).length;
    if (words.length >= 2 && stock >= 1 && (stock >= 2 || words.length >= 3)) {
      out.push({ id: "stacked-adjectives", start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

// "X, Y, and Z" with short items. Skips clause chains like "we stopped, I listened, and...",
// lists of names ("Groq, Gemini and OpenRouter"), lists with numbers, and labels on slides.
function ruleOfThree(text, slides) {
  const out = [];
  const item = "\\w+(?:[ -]\\w+){0,2}";
  const re = new RegExp(`\\b(${item}),\\s+(${item}),?\\s+(?:and|or)\\s+(${item})\\b`, "g");
  const subject = /^(?:i|we|you|he|she|they|it|there)\b/i;
  for (const m of text.matchAll(re)) {
    if ([m[2], m[3]].some((s) => subject.test(s))) continue;
    if ([m[2], m[3]].every((s) => /^[A-Z]/.test(s))) continue; // names, not a rhetorical triad
    if (/\d/.test(m[0])) continue; // data
    if (slides && !ENDS_SENTENCE.test(lineAt(text, m.index))) continue;
    out.push({ id: "rule-of-three", start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function headingStyle(text) {
  const out = [];
  const small = new Set(["a", "an", "the", "and", "or", "but", "of", "in", "on", "to", "for", "with", "at", "by", "vs"]);
  for (const m of text.matchAll(/^(#{1,6})[ \t]+(.+)$/gm)) {
    const body = m[2];
    const words = body.split(/\s+/).filter((w) => /[a-z]/i.test(w));
    const big = words.filter((w) => !small.has(w.toLowerCase()));
    const titleCase = big.length >= 3 && big.every((w) => /^[^a-z]*[A-Z]/.test(w));
    const decor = /\p{Extended_Pictographic}|[→➡️⇒]/u.test(body);
    if (titleCase || decor) out.push({ id: "heading-style", start: m.index, end: m.index + m[0].length });
  }
  // A whole line in bold used as a heading, judged the same way as a # heading.
  for (const m of text.matchAll(/^[ \t]*\*\*([^*\n]{3,80})\*\*[ \t]*$/gm)) {
    const big = m[1].split(/\s+/).filter((w) => /[a-z]/i.test(w) && !small.has(w.toLowerCase()));
    if (big.length >= 3 && big.every((w) => /^[^a-z]*[A-Z]/.test(w))) {
      out.push({ id: "heading-style", start: m.index, end: m.index + m[0].length });
    }
  }
  for (const m of text.matchAll(/^[ \t]*(?:\p{Extended_Pictographic}|[→✅✨🚀])/gmu)) {
    out.push({ id: "heading-style", start: m.index, end: m.index + m[0].length });
  }
  // Hashtag stuffing: four or more on one line.
  for (const m of text.matchAll(/^.*(?:#\w+\b.*){4,}$/gm)) {
    out.push({ id: "heading-style", start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// A plain first line used as a Title Case title, e.g. "Why First-Time Managers Struggle to Delegate".
function titleLine(text) {
  const m = text.match(/^\s*([^\n]{3,90})\n/);
  if (!m || /[.!?:,]$/.test(m[1].trim()) || /^#|\*\*/.test(m[1].trim())) return [];
  const small = new Set(["a", "an", "the", "and", "or", "but", "of", "in", "on", "to", "for", "with", "at", "by", "vs"]);
  const words = m[1].trim().split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const big = words.filter((w) => !small.has(w.toLowerCase()));
  if (words.length > 12 || big.length < 3 || !big.every((w) => /^[^a-z]*[A-Z]/.test(w))) return [];
  if (/^(?:subject|re|fwd|dear|hi|hello)\b/i.test(m[1].trim())) return [];
  const start = m.index + m[0].indexOf(m[1]);
  return [{ id: "heading-style", start, end: start + m[1].length }];
}

// A closing question that asks readers to comment: "If you've been through X, what's one thing...?"
function engagementQuestion(text) {
  const paras = [...text.matchAll(/[^\n]+/g)].filter((p) => p[0].trim() && !/^\s*#\w/.test(p[0]));
  if (paras.length < 3) return [];
  const last = paras[paras.length - 1];
  const t = last[0].trim();
  const words = t.split(/\s+/).length;
  if (!t.endsWith("?") || words < 6 || !/\byou(?:r|'ve|'d|'re)?\b/i.test(t)) return [];
  if (/^(?:best|thanks|regards|sincerely|cheers)\b/i.test(t)) return [];
  const start = last.index + last[0].indexOf(t);
  return [{ id: "generic-closer", start, end: start + t.length }];
}

// Sentences with their offsets. Headings and bullet lines count as their own sentence.
export function sentences(text) {
  const out = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|(?=\n)|$)/g;
  for (const m of text.matchAll(re)) {
    const s = m[0];
    const lead = s.length - s.trimStart().length;
    const trimmed = s.trim();
    if (!trimmed || /^#/.test(trimmed)) continue;
    const words = trimmed.split(/\s+/).filter((w) => /\w/.test(w));
    if (!words.length) continue;
    // A fragment is a whole line with no sentence ending: a heading, label or bullet.
    const fragment = !/[.!?]["')\]’”]*$/.test(trimmed);
    out.push({ start: m.index + lead, end: m.index + lead + trimmed.length, text: trimmed, words: words.length, fragment });
  }
  return out;
}

// Headings and labels ("The brief", "The app") aren't sentences, so they don't count towards rhythm.
// Slides are all fragments by nature, so their sentence-length spread isn't judged.
function rhythm(text, slides) {
  const out = [];
  const sents = sentences(text).filter((s) => s.words >= 3 && !s.fragment);
  if (sents.length >= 6 && !slides) {
    const n = sents.map((s) => s.words);
    const mean = n.reduce((a, b) => a + b, 0) / n.length;
    const sd = Math.sqrt(n.reduce((a, b) => a + (b - mean) ** 2, 0) / n.length);
    const cv = sd / mean;
    if (cv < 0.45) out.push({ id: "uniform-rhythm", start: 0, end: 0, doc: true, note: `sentence-length variation ${cv.toFixed(2)} (human prose is usually above 0.45)` });
  }
  // "The..." three times is ordinary English; for articles, compare the first two words.
  const first = sents.map((s) => {
    const w = s.text.toLowerCase().split(/\s+/).map((x) => x.replace(/[^a-z']/g, ""));
    return ["the", "a", "an"].includes(w[0]) ? `${w[0]} ${w[1] || ""}` : w[0];
  });
  for (let i = 2; i < first.length; i++) {
    if (first[i] && first[i] === first[i - 1] && first[i] === first[i - 2]) {
      for (const j of [i - 2, i - 1, i]) {
        const s = sents[j];
        const w = s.text.split(/\s+/)[0];
        out.push({ id: "repeated-openers", start: s.start, end: s.start + w.length });
      }
    }
  }
  return out;
}

// Returns [{id, start, end, text, doc?, note?}] sorted by position, deduplicated.
// opts.keep: passages the writer marked "keep as is" (quotes, examples); nothing inside them is flagged.
export function detect(text, opts = {}) {
  const slides = isSlides(text);
  const src = mask(text || "");
  const found = [];
  for (const [id, re] of RULES) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      let start = m.index;
      let str = m[0];
      // Drop the sentence-boundary prefix some rules use as an anchor.
      const lead = str.match(/^(?:[.!?]\s+|\s+)/);
      if (lead) { start += lead[0].length; str = str.slice(lead[0].length); }
      if (str.trim()) found.push({ id, start, end: start + str.length });
    }
  }
  found.push(...ruleOfThree(src, slides), ...stackedAdjectives(src), ...headingStyle(src), ...titleLine(src),
    ...engagementQuestion(src), ...rhythm(src, slides));
  // Longest first, then drop any match that overlaps an earlier one for the same pattern.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const quoted = keepSpans(text || "", opts.keep);
  const kept = [];
  for (const f of found) {
    if (!f.doc && quoted.some((q) => f.start < q.end && q.start < f.end)) continue;
    const clash = kept.some((k) => k.id === f.id && !f.doc && !k.doc && f.start < k.end && k.start < f.end);
    if (!clash) kept.push(f);
  }
  return kept.map((f) => ({ ...f, text: f.doc ? "" : text.slice(f.start, f.end) }));
}

const STOP = new Set(("that this with from have been were will would could should their there about into than then them they what when which while your yours also just more most some such very only over much many make made each other being does doing done here where these those because after before same well even still back like").split(" "));
const contentWords = (t) => (t.toLowerCase().match(/[a-z][a-z'’]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5));

// Sentences of the source whose content doesn't appear anywhere in the rewrite, e.g. a reason
// ("the client sent new requirements yesterday") or an instruction ("Hand wash recommended").
// Sentences that contain an AI tell are skipped, because cutting those is often the point.
export function droppedSentences(original, rewrite, opts = {}) {
  const have = new Set(contentWords(rewrite));
  const tells = detect(original, opts).filter((f) => !f.doc);
  const out = [];
  for (const s of sentences(original)) {
    const text = s.text.replace(/\*\*/g, "").trim();
    if (/^(?:subject|dear|hi|hello|best|thanks|regards|sincerely|cheers)\b/i.test(text) || /^#/.test(text)) continue;
    if (tells.some((f) => f.start < s.end && s.start < f.end)) continue;
    const words = [...new Set(contentWords(text))];
    if (words.length < 3) continue;
    const kept = words.filter((w) => have.has(w)).length / words.length;
    if (kept < 0.4) out.push(text);
  }
  return out;
}

// Checks a rewrite against its source for lost facts and a shifted register.
// Not AI tells, so they don't count in the score; the server uses them to trigger the repair pass.
export function preservationIssues(original, rewrite) {
  const issues = [];
  const nums = (t) => new Set((t.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, "")));
  const after = nums(rewrite);
  const lost = [...nums(original)].filter((n) => !after.has(n));
  if (lost.length) issues.push(`numbers from the source are missing: ${lost.join(", ")}`);
  const contractions = (t) => (t.match(/\b[a-z]+['’](?:m|re|s|ve|ll|d|t)\b/gi) || []).length;
  const words = (t) => (t.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length || 1;
  const cBefore = contractions(original), cAfter = contractions(rewrite);
  const expected = cBefore * (words(rewrite) / words(original));
  if (cBefore >= 3 && cAfter < expected * 0.5) {
    issues.push(`the source uses contractions (${cBefore}) but the rewrite has only ${cAfter}; keep the writer's register`);
  }
  return issues;
}

// Summary for the score panel.
export function score(text, opts = {}) {
  const findings = detect(text, opts);
  const words = (text.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length; // any script, not just Latin
  const byFamily = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  const byPattern = {};
  for (const f of findings) {
    byFamily[PATTERNS[f.id].family]++;
    byPattern[f.id] = (byPattern[f.id] || 0) + 1;
  }
  return {
    total: findings.length,
    words,
    per100: words ? +((findings.length / words) * 100).toFixed(1) : 0,
    byFamily,
    byPattern,
    findings,
  };
}
