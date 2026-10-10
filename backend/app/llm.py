"""LLM layer. Uses Claude when ANTHROPIC_API_KEY is set; otherwise an extractive, fully offline answerer."""
import json
import re

from . import config

_client = None
_STOP = set(
    "a an the is are was were be to of in on for and or do does did i you my your it this that with can how "
    "what when where who why please at by from as if me we our have has will would should could about not".split()
)


def available() -> bool:
    return bool(config.ANTHROPIC_API_KEY)


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=30.0, max_retries=1)
    return _client


def tokens(text: str) -> set[str]:
    out = set()
    for t in re.findall(r"[A-Za-z0-9$%.]+", text.lower()):
        t = t.strip(".")
        if len(t) > 1 and t not in _STOP:
            out.add(t.rstrip("s") if len(t) > 3 else t)
    return out


def lexical_grounding(answer: str, chunks: list[dict]) -> float:
    """Share of the answer's content words that appear in the retrieved evidence."""
    at = tokens(answer)
    if not at:
        return 0.0
    st: set[str] = set()
    for c in chunks:
        st |= tokens(c["text"])
    return round(len(at & st) / len(at), 3)


def _complete(model: str, system: str, user: str, max_tokens: int = 700) -> str:
    resp = _get_client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()


def _parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no json")
    return json.loads(m.group(0))


ANSWER_SYSTEM = (
    "You are a customer-support assistant for a business. Answer ONLY using the numbered SOURCES provided. "
    "If the sources do not contain the answer, set answerable to false - never guess or use outside knowledge. "
    "Be concise, friendly and specific (include numbers, dates and conditions from the sources). "
    "Respond with a single JSON object: "
    '{"answerable": true|false, "answer": "<text>", "used_sources": [<source numbers you relied on>]}'
)


def _extractive(question: str, chunks: list[dict]) -> dict:
    qt = tokens(question)
    best = chunks[0]
    sents = re.split(r"(?<=[.!?])\s+", best["text"])
    scored = [(len(qt & tokens(s)), i, s) for i, s in enumerate(sents)]
    picked = sorted([x for x in sorted(scored, key=lambda x: (-x[0], x[1])) if x[0] > 0][:3], key=lambda x: x[1])
    body = " ".join(s for _, _, s in picked) if picked else " ".join(sents[:2])
    return {"answerable": True, "answer": body.strip(), "used_sources": [1], "mode": "extractive"}


def generate_answer(question: str, chunks: list[dict], history: list[dict] | None = None) -> dict:
    if not available():
        return _extractive(question, chunks)
    sources = "\n\n".join(
        f"[{i}] ({c['doc_name']}{', p.' + str(c['page']) if c.get('page') else ''}"
        f"{', section: ' + c['section'] if c.get('section') else ''})\n{c['text']}"
        for i, c in enumerate(chunks, start=1)
    )
    convo = ""
    if history:
        convo = "CONVERSATION SO FAR:\n" + "\n".join(f"{h['role']}: {h['content']}" for h in history[-4:]) + "\n\n"
    user = f"{convo}SOURCES:\n{sources}\n\nCUSTOMER QUESTION: {question}"
    try:
        data = _parse_json(_complete(config.ANSWER_MODEL, ANSWER_SYSTEM, user))
        used = [int(x) for x in data.get("used_sources", []) if str(x).isdigit() and 1 <= int(x) <= len(chunks)]
        return {
            "answerable": bool(data.get("answerable", True)),
            "answer": str(data.get("answer", "")).strip(),
            "used_sources": used or [1],
            "mode": "llm",
        }
    except Exception as e:  # network/model/parse failure -> degrade gracefully
        out = _extractive(question, chunks)
        out["llm_error"] = str(e)[:200]
        return out


def judge_grounded(answer: str, chunks: list[dict]) -> float:
    """LLM-judged groundedness in [0,1]; lexical fallback when no key."""
    if not available():
        return lexical_grounding(answer, chunks)
    ev = "\n\n".join(f"[{i}] {c['text']}" for i, c in enumerate(chunks, 1))
    try:
        out = _complete(
            config.FAST_MODEL,
            'You grade whether an ANSWER is fully supported by EVIDENCE. Reply with JSON only: {"score": <0.0-1.0>}',
            f"EVIDENCE:\n{ev}\n\nANSWER:\n{answer}",
            max_tokens=40,
        )
        return float(_parse_json(out)["score"])
    except Exception:
        return lexical_grounding(answer, chunks)


def judge_correct(question: str, expected: str, answer: str) -> bool:
    et, at = tokens(expected), tokens(answer)
    recall = len(et & at) / len(et) if et else 0.0
    if not available():
        return recall >= 0.5
    try:
        out = _complete(
            config.FAST_MODEL,
            'Decide if ANSWER conveys the same key facts as EXPECTED for the QUESTION. JSON only: {"correct": true|false}',
            f"QUESTION: {question}\nEXPECTED: {expected}\nANSWER: {answer}",
            max_tokens=30,
        )
        return bool(_parse_json(out)["correct"])
    except Exception:
        return recall >= 0.5


def draft_faq(questions: list[str]) -> dict:
    """Suggest a canonical question for a cluster of unanswered questions (and a draft answer when LLM available)."""
    canonical = max(questions, key=lambda q: len(q))
    if not available():
        return {"question": canonical, "answer": ""}
    try:
        out = _complete(
            config.FAST_MODEL,
            "You help a business close documentation gaps. Given customer questions that went unanswered, write one "
            "clear FAQ question and a short DRAFT answer outline with placeholders like [X] for facts only the "
            'business knows (never invent policy details). JSON only: {"question": "...", "answer": "..."}',
            "\n".join(f"- {q}" for q in questions[:12]),
            max_tokens=300,
        )
        d = _parse_json(out)
        return {"question": d.get("question", canonical), "answer": d.get("answer", "")}
    except Exception:
        return {"question": canonical, "answer": ""}
