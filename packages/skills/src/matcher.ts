import type { Skill, SkillMatch } from "@agentforge/types";

export function matchSkill(query: string, skills: Skill[]): SkillMatch | null {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0 || skills.length === 0) return null;

  let best: SkillMatch | null = null;

  for (const skill of skills) {
    const text = `${skill.name} ${skill.description}`.toLowerCase();
    const hits = queryWords.filter((word) => text.includes(word)).length;
    if (hits === 0) continue;

    const score = hits / queryWords.length;
    if (!best || score > best.score) {
      best = { skill, score };
    }
  }

  return best;
}
