import { computed, ref } from "vue";
import { getCurrentUser, loginApi, logoutApi } from "@/api";

export interface Membership {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  role: string;
  status: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  memberships: Membership[];
}

const user = ref<CurrentUser | null>(null);
const loaded = ref(false);

export const currentUser = computed(() => user.value);
export const isAuthenticated = computed(() => Boolean(user.value));

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { data } = await getCurrentUser();
    user.value = data.user;
    return user.value;
  } catch {
    user.value = null;
    return null;
  } finally {
    loaded.value = true;
  }
}

export async function ensureCurrentUser(): Promise<CurrentUser | null> {
  if (loaded.value) return user.value;
  return await loadCurrentUser();
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const { data } = await loginApi({ email, password });
  user.value = data.user;
  loaded.value = true;
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await logoutApi();
  } finally {
    user.value = null;
    loaded.value = true;
  }
}
