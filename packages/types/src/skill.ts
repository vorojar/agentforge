export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  content: string;
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  content?: string;
  enabled?: boolean;
}

export interface SkillMatch {
  skill: Skill;
  score: number;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  get(name: string): Skill | undefined;
  list(): Skill[];
  match(query: string): SkillMatch | null;
}
