import type { Skill, SkillMatch } from "@agentforge/types";

export function matchSkill(query: string, skills: Skill[]): SkillMatch | null {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || skills.length === 0) return null;

  let best: SkillMatch | null = null;

  for (const skill of skills) {
    const text = `${skill.name} ${skill.description}`.toLowerCase();
    const hits = queryTerms.filter((term) => text.includes(term)).length;
    if (hits === 0) continue;

    const score = hits / queryTerms.length;
    if (!best || score > best.score) {
      best = { skill, score };
    }
  }

  return best;
}

/** Tokenize query: CJK bigrams + latin words, matching knowledge search approach */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const terms: string[] = [];

  // Extract CJK bigrams (2-char sliding window) for better matching
  const cjkChars: string[] = [];
  for (const ch of lower) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) cjkChars.push(ch);
  }
  for (let i = 0; i < cjkChars.length - 1; i++) {
    terms.push(cjkChars[i] + cjkChars[i + 1]);
  }

  // Extract latin/number words (2+ chars)
  const words = lower.match(/[a-z]{2,}/g);
  if (words) terms.push(...words);

  return [...new Set(terms)];
}
