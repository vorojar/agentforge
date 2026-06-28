<template>
  <div class="tenant-page">
    <div class="tenant-toolbar">
      <div class="enterprise-summary">
        <span class="enterprise-label">{{ t("tenant.currentEnterprise") }}</span>
        <strong>{{ currentOrganizationName }}</strong>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="tenant-tabs">
      <el-tab-pane :label="t('tenant.workspaces')" name="workspaces">
        <div class="section-actions">
          <el-button type="primary" :disabled="!selectedOrganizationId" @click="openWorkspaceDialog">{{ t("tenant.createWorkspace") }}</el-button>
        </div>
        <el-table :data="workspaces" v-loading="loading" stripe>
          <el-table-column :label="t('common.name')" min-width="180">
            <template #default="{ row }">{{ workspaceDisplayName(row) }}</template>
          </el-table-column>
          <el-table-column prop="slug" :label="t('tenant.slug')" width="160" />
          <el-table-column prop="createdAt" :label="t('common.created')" width="150">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('tenant.users')" name="users">
        <div class="section-actions">
          <el-button type="primary" @click="openUserDialog">{{ t("tenant.createUser") }}</el-button>
        </div>
        <el-table :data="users" v-loading="loading" stripe>
          <el-table-column prop="displayName" :label="t('tenant.displayName')" min-width="160" />
          <el-table-column prop="email" :label="t('auth.email')" min-width="220" />
          <el-table-column prop="lastLoginAt" :label="t('tenant.lastLogin')" width="150">
            <template #default="{ row }">{{ row.lastLoginAt ? formatDate(row.lastLoginAt) : t("common.never") }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('common.created')" width="150">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('tenant.memberships')" name="memberships">
        <div class="section-actions">
          <el-button type="primary" :disabled="!selectedOrganizationId" @click="openMembershipDialog">{{ t("tenant.assignMember") }}</el-button>
        </div>
        <el-table :data="memberships" v-loading="loading" stripe>
          <el-table-column :label="t('tenant.user')" min-width="220">
            <template #default="{ row }">{{ userLabel(row.userId) }}</template>
          </el-table-column>
          <el-table-column :label="t('tenant.scope')" min-width="180">
            <template #default="{ row }">{{ workspaceLabel(row.workspaceId) }}</template>
          </el-table-column>
          <el-table-column :label="t('tenant.role')" width="120">
            <template #default="{ row }">{{ roleLabel(row.role) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="120">
            <template #default="{ row }">{{ statusLabel(row.status) }}</template>
          </el-table-column>
          <el-table-column prop="updatedAt" :label="t('tenant.updated')" width="150">
            <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('tenant.identityProviders')" name="identityProviders">
        <div class="section-actions">
          <el-button type="primary" :disabled="!selectedOrganizationId" @click="openIdentityProviderDialog">{{ t("tenant.createIdentityProvider") }}</el-button>
        </div>
        <el-table :data="identityProviders" v-loading="loading" stripe>
          <el-table-column prop="name" :label="t('common.name')" min-width="160" />
          <el-table-column prop="type" :label="t('tenant.loginProtocol')" width="110" />
          <el-table-column :label="t('tenant.provider')" width="160">
            <template #default="{ row }">{{ providerDisplayName(row.provider) }}</template>
          </el-table-column>
          <el-table-column prop="clientId" :label="t('tenant.clientId')" min-width="170" show-overflow-tooltip />
          <el-table-column :label="t('common.status')" width="110">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? t("common.enabled") : t("common.disabled") }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" :label="t('tenant.updated')" width="150">
            <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('tenant.auditLogs')" name="auditLogs">
        <div class="section-actions">
          <el-select v-model="auditWorkspaceId" clearable :placeholder="t('tenant.allWorkspaces')" style="width: 240px" @change="loadAuditLogs">
            <el-option v-for="workspace in workspaces" :key="workspace.id" :label="workspace.name" :value="workspace.id" />
          </el-select>
          <el-button @click="loadAuditLogs">{{ t("common.reload") }}</el-button>
        </div>
        <el-table :data="auditLogs" v-loading="loading" stripe>
          <el-table-column type="expand">
            <template #default="{ row }">
              <pre class="metadata">{{ JSON.stringify(row.metadata, null, 2) }}</pre>
            </template>
          </el-table-column>
          <el-table-column prop="action" :label="tenantActionLabel" min-width="190" />
          <el-table-column prop="resourceType" :label="tenantResourceLabel" width="150" />
          <el-table-column :label="t('tenant.actor')" min-width="180">
            <template #default="{ row }">{{ row.actorUserId ? userLabel(row.actorUserId) : t("tenant.systemActor") }}</template>
          </el-table-column>
          <el-table-column :label="t('tenant.scope')" min-width="160">
            <template #default="{ row }">{{ workspaceLabel(row.workspaceId) }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('common.created')" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="workspaceDialogVisible" :title="t('tenant.createWorkspace')" width="460px">
      <el-form :model="workspaceForm" label-width="120px">
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="workspaceForm.name" :placeholder="t('tenant.workspaceNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.slug')">
          <el-input v-model="workspaceForm.slug" :placeholder="t('tenant.slugPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="workspaceDialogVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="createWorkspace">{{ t("common.create") }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="userDialogVisible" :title="t('tenant.createUser')" width="500px">
      <el-form :model="userForm" label-width="120px">
        <el-form-item :label="t('auth.email')" required>
          <el-input v-model="userForm.email" :placeholder="t('auth.emailPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.displayName')" required>
          <el-input v-model="userForm.displayName" :placeholder="t('tenant.displayNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.avatarUrl')">
          <el-input v-model="userForm.avatarUrl" :placeholder="t('tenant.avatarUrlPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="createUser">{{ t("common.create") }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="membershipDialogVisible" :title="t('tenant.assignMember')" width="520px">
      <el-form :model="membershipForm" label-width="120px">
        <el-form-item :label="t('tenant.user')" required>
          <el-select v-model="membershipForm.userId" filterable style="width: 100%" :placeholder="t('tenant.selectUser')">
            <el-option v-for="user in users" :key="user.id" :label="`${user.displayName} (${user.email})`" :value="user.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenant.scope')">
          <el-select v-model="membershipForm.workspaceId" style="width: 100%" :placeholder="t('tenant.organizationWide')">
            <el-option :label="t('tenant.organizationWide')" :value="null" />
            <el-option v-for="workspace in workspaces" :key="workspace.id" :label="workspaceDisplayName(workspace)" :value="workspace.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenant.role')" required>
          <el-select v-model="membershipForm.role" style="width: 100%">
            <el-option v-for="role in roleOptions" :key="role" :label="roleLabel(role)" :value="role" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="membershipForm.status" style="width: 100%">
            <el-option v-for="status in statusOptions" :key="status" :label="statusLabel(status)" :value="status" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="membershipDialogVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="upsertMembership">{{ t("common.save") }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="identityProviderDialogVisible" :title="t('tenant.createIdentityProvider')" width="720px">
      <el-form :model="identityProviderForm" label-width="150px">
        <el-form-item :label="t('tenant.loginPlatform')" required>
          <el-select
            v-model="identityProviderForm.presetId"
            filterable
            data-testid="login-platform-select"
            style="width: 100%"
            :placeholder="t('tenant.loginPlatformPlaceholder')"
            @change="applyLoginPreset"
          >
            <el-option v-for="preset in loginProviderPresets" :key="preset.id" :label="t(preset.labelKey)" :value="preset.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenant.loginProtocol')" required>
          <el-input :model-value="protocolLabel(identityProviderForm.type)" disabled />
        </el-form-item>
        <el-form-item :label="t('tenant.displayName')" required>
          <el-input v-model="identityProviderForm.name" :disabled="!selectedLoginPreset" :placeholder="t('tenant.idpNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.clientId')">
          <el-input v-model="identityProviderForm.clientId" :placeholder="t('tenant.clientIdPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.clientSecretRef')">
          <el-input v-model="identityProviderForm.clientSecretRef" :placeholder="t('tenant.clientSecretRefPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.issuerUrl')">
          <el-input v-model="identityProviderForm.issuerUrl" :placeholder="t('tenant.issuerUrlPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.ssoUrl')">
          <el-input v-model="identityProviderForm.ssoUrl" :placeholder="t('tenant.ssoUrlPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('tenant.claimMapping')">
          <el-input v-model="identityProviderForm.claimMapping" type="textarea" :rows="4" :placeholder="claimMappingPlaceholder" />
        </el-form-item>
        <el-form-item :label="t('tenant.groupMapping')">
          <el-input v-model="identityProviderForm.groupMapping" type="textarea" :rows="3" :placeholder="groupMappingPlaceholder" />
        </el-form-item>
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="identityProviderForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="identityProviderDialogVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" :loading="saving" @click="createIdentityProvider">{{ t("common.create") }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  createIdentityProviderApi,
  createUserApi,
  createWorkspaceApi,
  getAuditLogs,
  getIdentityProviders,
  getMemberships,
  getOrganizations,
  getTenantBootstrap,
  getUsersApi,
  getWorkspaces,
  upsertMembershipApi,
} from "@/api";
import { t } from "@/i18n";

type Role = "owner" | "admin" | "builder" | "viewer";
type MemberStatus = "active" | "invited" | "disabled";

interface Organization { id: string; name: string; slug: string; createdAt: string; updatedAt: string }
interface Workspace { id: string; organizationId: string; name: string; slug: string; createdAt: string; updatedAt: string }
interface UserAccount { id: string; email: string; displayName: string; avatarUrl?: string; lastLoginAt: string | null; createdAt: string; updatedAt: string }
interface Membership { id: string; organizationId: string; workspaceId: string | null; userId: string; role: Role; status: MemberStatus; createdAt: string; updatedAt: string }
interface IdentityProvider { id: string; type: string; provider: string; name: string; clientId?: string; enabled: boolean; updatedAt: string }
interface AuditLog { id: string; workspaceId: string | null; actorUserId: string | null; action: string; resourceType: string; metadata: Record<string, unknown>; createdAt: string }
type IdentityProviderProtocol = "oidc" | "oauth";
type MessageKey = Parameters<typeof t>[0];
interface LoginProviderPreset {
  id: string;
  labelKey: MessageKey;
  nameKey: MessageKey;
  type: IdentityProviderProtocol;
  provider: string;
  issuerUrl?: string;
  ssoUrl?: string;
  claimMapping?: Record<string, string>;
  groupMapping?: Record<string, string>;
}

const loading = ref(false);
const saving = ref(false);
const activeTab = ref("workspaces");
const organizations = ref<Organization[]>([]);
const workspaces = ref<Workspace[]>([]);
const users = ref<UserAccount[]>([]);
const memberships = ref<Membership[]>([]);
const identityProviders = ref<IdentityProvider[]>([]);
const auditLogs = ref<AuditLog[]>([]);
const selectedOrganizationId = ref("");
const auditWorkspaceId = ref("");

const workspaceDialogVisible = ref(false);
const userDialogVisible = ref(false);
const membershipDialogVisible = ref(false);
const identityProviderDialogVisible = ref(false);

const workspaceForm = ref({ name: "", slug: "" });
const userForm = ref({ email: "", displayName: "", avatarUrl: "" });
const membershipForm = ref<{ userId: string; workspaceId: string | null; role: Role; status: MemberStatus }>({
  userId: "",
  workspaceId: null,
  role: "viewer",
  status: "active",
});
const identityProviderForm = ref({
  presetId: "",
  name: "",
  type: "oidc" as IdentityProviderProtocol,
  provider: "",
  clientId: "",
  clientSecretRef: "",
  issuerUrl: "",
  ssoUrl: "",
  certificate: "",
  claimMapping: "{}",
  groupMapping: "{}",
  enabled: true,
});

const roleOptions: Role[] = ["owner", "admin", "builder", "viewer"];
const statusOptions: MemberStatus[] = ["active", "invited", "disabled"];
const loginProviderPresets: LoginProviderPreset[] = [
  {
    id: "google",
    labelKey: "tenant.loginPreset.google",
    nameKey: "tenant.loginPreset.googleName",
    type: "oidc",
    provider: "google",
    issuerUrl: "https://accounts.google.com",
    claimMapping: { email: "email", name: "name", avatarUrl: "picture" },
  },
  {
    id: "microsoft",
    labelKey: "tenant.loginPreset.microsoft",
    nameKey: "tenant.loginPreset.microsoftName",
    type: "oidc",
    provider: "microsoft",
    issuerUrl: "https://login.microsoftonline.com/common/v2.0",
    claimMapping: { email: "email", name: "name" },
  },
  {
    id: "okta",
    labelKey: "tenant.loginPreset.okta",
    nameKey: "tenant.loginPreset.oktaName",
    type: "oidc",
    provider: "okta",
    claimMapping: { email: "email", name: "name" },
  },
  {
    id: "auth0",
    labelKey: "tenant.loginPreset.auth0",
    nameKey: "tenant.loginPreset.auth0Name",
    type: "oidc",
    provider: "auth0",
    claimMapping: { email: "email", name: "name" },
  },
  {
    id: "keycloak",
    labelKey: "tenant.loginPreset.keycloak",
    nameKey: "tenant.loginPreset.keycloakName",
    type: "oidc",
    provider: "keycloak",
    claimMapping: { email: "email", name: "name" },
  },
  {
    id: "feishu",
    labelKey: "tenant.loginPreset.feishu",
    nameKey: "tenant.loginPreset.feishuName",
    type: "oauth",
    provider: "feishu",
    issuerUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    ssoUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    claimMapping: { scope: "contact:user.email" },
  },
  {
    id: "wecom",
    labelKey: "tenant.loginPreset.wecom",
    nameKey: "tenant.loginPreset.wecomName",
    type: "oauth",
    provider: "wecom",
    ssoUrl: "https://open.work.weixin.qq.com/wwopen/sso/qrConnect",
    claimMapping: { agentId: "1000002", emailDomain: "company.com" },
  },
  {
    id: "dingtalk",
    labelKey: "tenant.loginPreset.dingtalk",
    nameKey: "tenant.loginPreset.dingtalkName",
    type: "oauth",
    provider: "dingtalk",
    issuerUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
    ssoUrl: "https://login.dingtalk.com/oauth2/auth",
    claimMapping: { scope: "openid", emailDomain: "company.com" },
  },
  {
    id: "custom-oidc",
    labelKey: "tenant.loginPreset.customOidc",
    nameKey: "tenant.loginPreset.customOidcName",
    type: "oidc",
    provider: "custom-oidc",
    claimMapping: { email: "email", name: "name" },
  },
];
const tenantActionLabel = computed(() => t("tenant.action"));
const tenantResourceLabel = computed(() => t("tenant.resource"));
const selectedLoginPreset = computed(() => loginProviderPresets.find((preset) => preset.id === identityProviderForm.value.presetId));
const currentOrganizationName = computed(() => {
  const organization = organizations.value.find((org) => org.id === selectedOrganizationId.value);
  if (!organization || (organization.slug === "default" && organization.name === "Default Organization")) {
    return t("tenant.defaultEnterprise");
  }
  return organization.name;
});
const claimMappingPlaceholder = `{
  "scope": "openid",
  "emailDomain": "company.com",
  "agentId": "1000002"
}`;
const groupMappingPlaceholder = `{
  "engineering": "builder"
}`;

onMounted(loadAll);

async function loadAll() {
  loading.value = true;
  try {
    await getTenantBootstrap();
    const [orgRes, userRes] = await Promise.all([getOrganizations(), getUsersApi()]);
    organizations.value = orgRes.data;
    users.value = userRes.data;
    if (!selectedOrganizationId.value && organizations.value.length > 0) selectedOrganizationId.value = organizations.value[0].id;
    await reloadOrganizationScope();
  } catch {
    ElMessage.error(t("tenant.loadFailed"));
  } finally {
    loading.value = false;
  }
}

async function reloadOrganizationScope() {
  if (!selectedOrganizationId.value) return;
  loading.value = true;
  try {
    const [workspaceRes, membershipRes, idpRes, auditRes] = await Promise.all([
      getWorkspaces(selectedOrganizationId.value),
      getMemberships(selectedOrganizationId.value),
      getIdentityProviders(selectedOrganizationId.value),
      getAuditLogs(selectedOrganizationId.value, auditWorkspaceId.value || undefined),
    ]);
    workspaces.value = workspaceRes.data;
    memberships.value = membershipRes.data;
    identityProviders.value = idpRes.data;
    auditLogs.value = auditRes.data;
  } catch {
    ElMessage.error(t("tenant.loadFailed"));
  } finally {
    loading.value = false;
  }
}

async function loadAuditLogs() {
  if (!selectedOrganizationId.value) return;
  loading.value = true;
  try {
    const { data } = await getAuditLogs(selectedOrganizationId.value, auditWorkspaceId.value || undefined);
    auditLogs.value = data;
  } catch {
    ElMessage.error(t("tenant.loadFailed"));
  } finally {
    loading.value = false;
  }
}

function openWorkspaceDialog() {
  workspaceForm.value = { name: "", slug: "" };
  workspaceDialogVisible.value = true;
}

function openUserDialog() {
  userForm.value = { email: "", displayName: "", avatarUrl: "" };
  userDialogVisible.value = true;
}

function openMembershipDialog() {
  membershipForm.value = { userId: "", workspaceId: null, role: "viewer", status: "active" };
  membershipDialogVisible.value = true;
}

function openIdentityProviderDialog() {
  identityProviderForm.value = {
    presetId: "",
    name: "",
    type: "oidc",
    provider: "",
    clientId: "",
    clientSecretRef: "",
    issuerUrl: "",
    ssoUrl: "",
    certificate: "",
    claimMapping: "{}",
    groupMapping: "{}",
    enabled: true,
  };
  identityProviderDialogVisible.value = true;
}

function applyLoginPreset(presetId: string) {
  const preset = loginProviderPresets.find((item) => item.id === presetId);
  if (!preset) return;

  identityProviderForm.value = {
    presetId: preset.id,
    name: t(preset.nameKey),
    type: preset.type,
    provider: preset.provider,
    clientId: "",
    clientSecretRef: "",
    issuerUrl: preset.issuerUrl ?? "",
    ssoUrl: preset.ssoUrl ?? "",
    certificate: "",
    claimMapping: JSON.stringify(preset.claimMapping ?? {}, null, 2),
    groupMapping: JSON.stringify(preset.groupMapping ?? {}, null, 2),
    enabled: true,
  };
}

async function createWorkspace() {
  if (!selectedOrganizationId.value || !workspaceForm.value.name.trim()) return ElMessage.warning(t("tenant.nameRequired"));
  saving.value = true;
  try {
    await createWorkspaceApi(selectedOrganizationId.value, compactPayload(workspaceForm.value));
    workspaceDialogVisible.value = false;
    ElMessage.success(t("tenant.created"));
    await reloadOrganizationScope();
  } catch {
    ElMessage.error(t("tenant.saveFailed"));
  } finally {
    saving.value = false;
  }
}

async function createUser() {
  if (!userForm.value.email.trim() || !userForm.value.displayName.trim()) return ElMessage.warning(t("tenant.userRequired"));
  saving.value = true;
  try {
    await createUserApi(compactPayload(userForm.value));
    userDialogVisible.value = false;
    ElMessage.success(t("tenant.created"));
    const { data } = await getUsersApi();
    users.value = data;
  } catch {
    ElMessage.error(t("tenant.saveFailed"));
  } finally {
    saving.value = false;
  }
}

async function upsertMembership() {
  if (!selectedOrganizationId.value || !membershipForm.value.userId) return ElMessage.warning(t("tenant.memberRequired"));
  saving.value = true;
  try {
    await upsertMembershipApi(selectedOrganizationId.value, membershipForm.value);
    membershipDialogVisible.value = false;
    ElMessage.success(t("tenant.saved"));
    await reloadOrganizationScope();
  } catch {
    ElMessage.error(t("tenant.saveFailed"));
  } finally {
    saving.value = false;
  }
}

async function createIdentityProvider() {
  if (!selectedOrganizationId.value || !identityProviderForm.value.presetId || !identityProviderForm.value.name.trim() || !identityProviderForm.value.provider.trim()) {
    return ElMessage.warning(t("tenant.idpRequired"));
  }

  const claimMapping = parseJsonField(identityProviderForm.value.claimMapping);
  const groupMapping = parseJsonField(identityProviderForm.value.groupMapping);
  if (!claimMapping || !groupMapping) return;

  saving.value = true;
  try {
    const { presetId, ...payload } = identityProviderForm.value;
    await createIdentityProviderApi(selectedOrganizationId.value, {
      ...compactPayload(payload),
      claimMapping,
      groupMapping,
    });
    identityProviderDialogVisible.value = false;
    ElMessage.success(t("tenant.created"));
    await reloadOrganizationScope();
  } catch {
    ElMessage.error(t("tenant.saveFailed"));
  } finally {
    saving.value = false;
  }
}

function parseJsonField(value: string): Record<string, string> | null {
  try {
    const parsed = value.trim() ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    ElMessage.error(t("tenant.invalidJson"));
    return null;
  }
}

function compactPayload<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "" && value !== undefined)) as T;
}

function userLabel(userId: string): string {
  const user = users.value.find((item) => item.id === userId);
  return user ? `${user.displayName} (${user.email})` : userId;
}

function workspaceLabel(workspaceId: string | null): string {
  if (!workspaceId) return t("tenant.organizationWide");
  const workspace = workspaces.value.find((item) => item.id === workspaceId);
  return workspace ? workspaceDisplayName(workspace) : workspaceId;
}

function workspaceDisplayName(workspace: Workspace): string {
  if (workspace.slug === "default" && workspace.name === "Default Workspace") return t("tenant.defaultWorkspace");
  return workspace.name;
}

function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    owner: t("roles.owner"),
    admin: t("roles.admin"),
    builder: t("roles.builder"),
    viewer: t("roles.viewer"),
  };
  return labels[role];
}

function statusLabel(status: MemberStatus): string {
  const labels: Record<MemberStatus, string> = {
    active: t("tenant.statusActive"),
    invited: t("tenant.statusInvited"),
    disabled: t("tenant.statusDisabled"),
  };
  return labels[status];
}

function protocolLabel(type: IdentityProviderProtocol): string {
  return type === "oauth" ? "OAuth" : "OIDC";
}

function providerDisplayName(provider: string): string {
  const preset = loginProviderPresets.find((item) => item.provider === provider);
  return preset ? t(preset.labelKey) : provider;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateTime(value: string): string {
  return value.replace("T", " ").slice(0, 19);
}
</script>

<style scoped>
.tenant-page {
  display: grid;
  gap: 16px;
  min-width: 0;
  width: 100%;
}
.tenant-toolbar,
.section-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}
.tenant-toolbar {
  justify-content: flex-start;
}
.tenant-tabs {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  overflow-x: auto;
  padding: 14px 16px 18px;
}
.section-actions {
  margin-bottom: 12px;
}
.metadata {
  margin: 0;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
}
.enterprise-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.enterprise-label {
  color: #64748b;
  font-size: 13px;
}
.enterprise-summary strong {
  color: #0f172a;
  font-size: 16px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .tenant-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    min-width: 0;
  }

  .tenant-toolbar :deep(.el-select) {
    width: 100% !important;
  }

  .tenant-toolbar :deep(.el-button) {
    justify-self: start;
  }

  .tenant-tabs :deep(.el-tabs__item) {
    font-size: 13px;
    padding: 0 8px;
  }
}
</style>
