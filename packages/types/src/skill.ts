export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  /** Filesystem path to skill directory (for lazy loading supporting files) */
  dirPath?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
