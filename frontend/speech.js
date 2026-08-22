/* Medhā — audio narration with read-along highlighting.
 *
 * Voices: prefers Indian English (en-IN — e.g. Rishi/Veena/Lekha on macOS,
 * Google/Microsoft en-IN elsewhere) at a medium, comfortable pace. All
 * synthesis happens on-device; no audio leaves the browser.
 *
 * Read-along: the lesson is narrated block by block. The block being spoken
 * is highlighted and scrolled into view; within it, the current word is
 * highlighted via the CSS Custom Highlight API (word boundaries from the
 * utterance's `onboundary` events). Both layers degrade gracefully — no
 * boundary events → block highlight only; no Highlight API → same.
 */
"use strict";

(function () {
  const synth = window.speechSynthesis;
  const playBtn = document.getElementById("tts-play");
  const stopBtn = document.getElementById("tts-stop");
  const voiceSelect = document.getElementById("tts-voice");

  if (!synth || !playBtn) {
    if (playBtn) playBtn.hidden = true;
    return;
  }

  const FEMALE_HINTS = ["veena", "lekha", "heera", "isha", "kalpana", "priya", "female", "neerja", "swara"];
  const MALE_HINTS = ["rishi", "neel", "prabhat", "male", "madhur", "arjun"];
  const RATE = 0.95; // medium pace — easy to follow, not sluggish

  const highlightSupported = "highlights" in CSS && typeof Highlight === "function";

  let voices = [];
  let speaking = false;
  let blockQueue = [];
  let currentBlock = null;

  /* ------------------------------- voices ------------------------------- */

  function guessGender(voice) {
    const name = voice.name.toLowerCase();
    if (FEMALE_HINTS.some((hint) => name.includes(hint))) return "female";
    if (MALE_HINTS.some((hint) => name.includes(hint))) return "male";
    return "";
  }

  function loadVoices() {
    const all = synth.getVoices();
    if (!all.length) return;
    const indian = all.filter((voice) => voice.lang === "en-IN" || voice.lang.startsWith("hi"));
    const english = all.filter((voice) => voice.lang.startsWith("en") && voice.lang !== "en-IN");
    voices = [...indian, ...english];
    voiceSelect.textContent = "";
    voices.forEach((voice, index) => {
      const option = document.createElement("option");
      const gender = guessGender(voice);
      option.value = String(index);
      option.textContent =
        `${voice.name}${gender ? ` (${gender})` : ""}${voice.lang === "en-IN" ? " · 🇮🇳" : ""}`;
      voiceSelect.appendChild(option);
    });
    const saved = localStorage.getItem("medha-voice");
    if (saved && voices[Number(saved)]) voiceSelect.value = saved;
  }

  loadVoices();
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

  voiceSelect.addEventListener("change", () => {
    try { localStorage.setItem("medha-voice", voiceSelect.value); } catch (_) { /* ignore */ }
  });

  function currentVoice() {
    return voices[Number(voiceSelect.value)] || voices[0] || null;
  }

  /* --------------------------- highlighting ----------------------------- */

  function setBlockHighlight(element) {
    clearBlockHighlight();
    currentBlock = element;
    if (element) {
      element.classList.add("speaking-block");
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearBlockHighlight() {
    if (currentBlock) currentBlock.classList.remove("speaking-block");
    currentBlock = null;
    clearWordHighlight();
  }

  function clearWordHighlight() {
    if (highlightSupported) CSS.highlights.delete("medha-word");
  }

  /** Highlight the word at [charIndex, charIndex+length) of element's text. */
  function highlightWord(element, charIndex, length) {
    if (!highlightSupported || !element) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remainingStart = charIndex;
    let node;
    while ((node = walker.nextNode())) {
      const textLength = node.textContent.length;
      if (remainingStart < textLength) {
        const end = Math.min(remainingStart + length, textLength);
        try {
          const range = new Range();
          range.setStart(node, remainingStart);
          range.setEnd(node, end);
          CSS.highlights.set("medha-word", new Highlight(range));
        } catch (_) { /* boundary landed on a node seam — skip this word */ }
        return;
      }
      remainingStart -= textLength;
    }
  }

  /* ------------------------------ narration ----------------------------- */

  function setSpeakingUI(active) {
    speaking = active;
    stopBtn.hidden = !active;
    playBtn.textContent = active ? "🔊 Speaking…" : "🔊 Listen";
    playBtn.disabled = active;
    if (!active) clearBlockHighlight();
  }

  /** Collect the lesson's narratable blocks, skipping charts/code. */
  function collectBlocks(container) {
    const selector = "h2, h3, h4, p, li, blockquote, figcaption, .flow-step";
    return [...container.querySelectorAll(selector)].filter((element) => {
      if (element.closest("svg, pre")) return false;
      // A block counts only if it directly holds text (li inside ul is fine;
      // skip wrappers whose text lives in child blocks we already collect).
      return element.innerText.trim().length > 0 &&
        !element.querySelector(selector);
    });
  }

  function speakBlocks(blocks, index = 0) {
    if (index >= blocks.length || !speaking) {
      setSpeakingUI(false);
      return;
    }
    const element = blocks[index];
    const text = element.innerText.replace(/\s+/g, " ").trim();
    if (!text) {
      speakBlocks(blocks, index + 1);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = currentVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = RATE;
    utterance.pitch = 1.0;
    utterance.onstart = () => setBlockHighlight(element);
    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      const rest = text.slice(event.charIndex);
      const word = rest.match(/^\S+/);
      highlightWord(element, event.charIndex, event.charLength || (word ? word[0].length : 1));
    };
    utterance.onend = () => {
      clearWordHighlight();
      speakBlocks(blocks, index + 1);
    };
    utterance.onerror = () => setSpeakingUI(false);
    synth.speak(utterance);
  }

  /** Narrate the whole lesson with read-along highlighting. */
  function speakLesson() {
    stop();
    const container = document.getElementById("lesson-content");
    if (!container) return;
    blockQueue = collectBlocks(container);
    if (!blockQueue.length) return;
    setSpeakingUI(true);
    speakBlocks(blockQueue, 0);
  }

  /** Plain narration for arbitrary markdown (tutor replies). */
  function speak(markdown) {
    stop();
    const text = markdown
      .replace(/```(?:chart|flow)[\s\S]*?```/g, " A diagram appears here. Have a look at the screen. ")
      .replace(/```[\s\S]*?```/g, " Code example omitted from narration. ")
      .replace(/^\s*\|.*\|\s*$/gm, " ")
      .replace(/[#*_`>|]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      if ((current + sentence).length > 220) {
        if (current) chunks.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) chunks.push(current);

    const voice = currentVoice();
    setSpeakingUI(true);
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voice) utterance.voice = voice;
      utterance.rate = RATE;
      utterance.pitch = 1.0;
      if (index === chunks.length - 1) utterance.onend = () => setSpeakingUI(false);
      utterance.onerror = () => setSpeakingUI(false);
      synth.speak(utterance);
    });
  }

  function stop() {
    speaking = false;
    synth.cancel();
    setSpeakingUI(false);
  }

  playBtn.addEventListener("click", speakLesson);
  stopBtn.addEventListener("click", stop);
  window.addEventListener("beforeunload", stop);

  window.MedhaSpeech = { speak, speakLesson, stop, isSpeaking: () => speaking };
})();
