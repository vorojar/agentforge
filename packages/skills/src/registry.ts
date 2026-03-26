import type { Skill, SkillMatch, SkillRegistry } from "@agentforge/types";
import { matchSkill } from "./matcher.js";

export class SkillRegistryImpl implements SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  clear(): void {
    this.skills.clear();
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return [...this.skills.values()].filter((s) => s.enabled);
  }

  match(query: string): SkillMatch | null {
    const enabled = this.list();
    return matchSkill(query, enabled);
  }
}
