<template>
  <main class="public-page">
    <header class="public-nav">
      <a class="public-brand" href="#top" aria-label="AgentForge">
        <span class="brand-symbol">⚡</span>
        <span>AgentForge</span>
      </a>
      <nav class="nav-links" :aria-label="t('public.navLabel')">
        <a href="#use-cases">{{ t("public.nav.product") }}</a>
        <a href="#platform">{{ t("public.nav.platform") }}</a>
        <a href="#delivery">{{ t("public.nav.deployment") }}</a>
        <a href="#pricing">{{ t("public.nav.pricing") }}</a>
        <a href="#faq">{{ t("public.nav.faq") }}</a>
      </nav>
      <div class="nav-actions">
        <el-select
          :model-value="locale"
          size="small"
          class="language-select"
          :aria-label="t('common.language')"
          @change="setLocale"
        >
          <el-option
            v-for="option in localeOptions"
            :key="option.value"
            :label="t(option.labelKey)"
            :value="option.value"
          />
        </el-select>
        <RouterLink class="nav-demo" to="/login">{{ t("public.nav.demo") }}</RouterLink>
      </div>
    </header>

    <section id="top" class="hero-section">
      <div class="hero-copy">
        <h1>{{ t("public.hero.title") }}</h1>
        <p>{{ t("public.hero.lead") }}</p>
        <div class="hero-actions">
          <RouterLink class="primary-cta" to="/login">{{ t("public.hero.primaryCta") }}</RouterLink>
          <a class="secondary-cta" href="#delivery">{{ t("public.hero.secondaryCta") }}</a>
        </div>
        <ul class="trust-row" :aria-label="t('public.hero.trustLabel')">
          <li v-for="item in trustItems" :key="item">{{ t(item) }}</li>
        </ul>
      </div>

      <figure class="product-frame" id="product">
        <img :src="productDashboard" :alt="t('public.hero.imageAlt')" />
        <figcaption>
          <span>{{ t("public.hero.previewTitle") }}</span>
          <strong>{{ t("public.hero.previewMeta") }}</strong>
        </figcaption>
      </figure>
    </section>

    <section class="audience-section">
      <h2>{{ t("public.roles.title") }}</h2>
      <div class="audience-grid">
        <article v-for="card in audienceCards" :key="card.title" class="audience-card">
          <el-icon><component :is="card.icon" /></el-icon>
          <h3>{{ t(card.title) }}</h3>
          <p>{{ t(card.body) }}</p>
        </article>
      </div>
    </section>

    <section id="use-cases" class="use-case-section">
      <div class="section-copy">
        <h2>{{ t("public.useCases.title") }}</h2>
        <p>{{ t("public.useCases.lead") }}</p>
      </div>
      <div class="use-case-grid">
        <article v-for="item in useCaseCards" :key="item.title" class="use-case-card">
          <el-icon><component :is="item.icon" /></el-icon>
          <h3>{{ t(item.title) }}</h3>
          <p>{{ t(item.body) }}</p>
          <strong>{{ t(item.result) }}</strong>
        </article>
      </div>
    </section>

    <section id="platform" class="proof-section">
      <div class="section-copy">
        <h2>{{ t("public.proof.title") }}</h2>
        <p>{{ t("public.proof.lead") }}</p>
      </div>
      <div class="proof-layout">
        <article class="proof-copy">
          <h3>{{ t("public.proof.modelTitle") }}</h3>
          <p>{{ t("public.proof.modelBody") }}</p>
          <ul class="check-list">
            <li v-for="item in proofChecks" :key="item">{{ t(item) }}</li>
          </ul>
        </article>
        <div class="proof-panel">
          <div class="panel-row" v-for="row in modelRows" :key="row.name">
            <span>{{ row.rank }}</span>
            <strong>{{ t(row.name) }}</strong>
            <em>{{ t(row.status) }}</em>
          </div>
        </div>
      </div>
      <div class="capability-grid">
        <article v-for="item in capabilityCards" :key="item.title">
          <el-icon><component :is="item.icon" /></el-icon>
          <h3>{{ t(item.title) }}</h3>
          <p>{{ t(item.body) }}</p>
        </article>
      </div>
    </section>

    <section id="delivery" class="delivery-section">
      <div class="section-copy centered">
        <h2>{{ t("public.delivery.title") }}</h2>
        <p>{{ t("public.delivery.lead") }}</p>
      </div>
      <ol class="delivery-steps">
        <li v-for="step in deliverySteps" :key="step.title">
          <span>{{ step.number }}</span>
          <h3>{{ t(step.title) }}</h3>
          <p>{{ t(step.body) }}</p>
        </li>
      </ol>
      <p class="delivery-note">{{ t("public.delivery.note") }}</p>
    </section>

    <section id="pricing" class="pricing-section">
      <div class="section-copy centered">
        <h2>{{ t("public.pricing.title") }}</h2>
        <p>{{ t("public.pricing.lead") }}</p>
      </div>
      <div class="pricing-grid">
        <article v-for="plan in plans" :key="plan.title" class="pricing-card" :class="{ featured: plan.featured }">
          <h3>{{ t(plan.title) }}</h3>
          <p>{{ t(plan.subtitle) }}</p>
          <strong>{{ t(plan.price) }}</strong>
          <ul class="check-list">
            <li v-for="item in plan.items" :key="item">{{ t(item) }}</li>
          </ul>
          <a href="#next">{{ t("public.pricing.cta") }}</a>
        </article>
      </div>
    </section>

    <section id="faq" class="faq-section">
      <div class="section-copy centered">
        <h2>{{ t("public.faq.title") }}</h2>
        <p>{{ t("public.faq.lead") }}</p>
      </div>
      <div class="faq-list">
        <article v-for="item in faqItems" :key="item.question">
          <h3>{{ t(item.question) }}</h3>
          <p>{{ t(item.answer) }}</p>
        </article>
      </div>
    </section>

    <section id="next" class="final-cta">
      <div>
        <h2>{{ t("public.final.title") }}</h2>
        <p>{{ t("public.final.body") }}</p>
      </div>
      <div class="final-actions">
        <a class="primary-cta" href="#delivery">{{ t("public.final.primaryCta") }}</a>
        <RouterLink class="secondary-cta" to="/login">{{ t("public.final.secondaryCta") }}</RouterLink>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import {
  Collection,
  Connection,
  DataAnalysis,
  Key,
  Lock,
  MagicStick,
  OfficeBuilding,
  SetUp,
} from "@element-plus/icons-vue";
import productDashboard from "@/assets/product-dashboard.png";
import { locale, localeOptions, setLocale, t } from "@/i18n";

onMounted(() => {
  document.title = "AgentForge";
});

const trustItems = [
  "public.hero.trust.private",
  "public.hero.trust.sso",
  "public.hero.trust.keys",
  "public.hero.trust.audit",
] as const;

const audienceCards = [
  { icon: OfficeBuilding, title: "public.roles.leadership.title", body: "public.roles.leadership.body" },
  { icon: Lock, title: "public.roles.it.title", body: "public.roles.it.body" },
  { icon: MagicStick, title: "public.roles.builders.title", body: "public.roles.builders.body" },
] as const;

const useCaseCards = [
  { icon: MagicStick, title: "public.useCase.support.title", body: "public.useCase.support.body", result: "public.useCase.support.result" },
  { icon: Collection, title: "public.useCase.knowledge.title", body: "public.useCase.knowledge.body", result: "public.useCase.knowledge.result" },
  { icon: DataAnalysis, title: "public.useCase.sales.title", body: "public.useCase.sales.body", result: "public.useCase.sales.result" },
  { icon: Key, title: "public.useCase.finance.title", body: "public.useCase.finance.body", result: "public.useCase.finance.result" },
  { icon: SetUp, title: "public.useCase.it.title", body: "public.useCase.it.body", result: "public.useCase.it.result" },
  { icon: Connection, title: "public.useCase.workflow.title", body: "public.useCase.workflow.body", result: "public.useCase.workflow.result" },
] as const;

const proofChecks = [
  "public.proof.check.failover",
  "public.proof.check.keys",
  "public.proof.check.audit",
  "public.proof.check.sso",
] as const;

const modelRows = [
  { rank: "1", name: "public.proof.model.primary", status: "public.proof.status.primary" },
  { rank: "2", name: "public.proof.model.backup", status: "public.proof.status.backup" },
  { rank: "3", name: "public.proof.model.private", status: "public.proof.status.private" },
] as const;

const capabilityCards = [
  { icon: Connection, title: "public.capability.models.title", body: "public.capability.models.body" },
  { icon: SetUp, title: "public.capability.tools.title", body: "public.capability.tools.body" },
  { icon: Collection, title: "public.capability.knowledge.title", body: "public.capability.knowledge.body" },
  { icon: Key, title: "public.capability.identity.title", body: "public.capability.identity.body" },
  { icon: DataAnalysis, title: "public.capability.audit.title", body: "public.capability.audit.body" },
] as const;

const deliverySteps = [
  { number: "1", title: "public.delivery.step1.title", body: "public.delivery.step1.body" },
  { number: "2", title: "public.delivery.step2.title", body: "public.delivery.step2.body" },
  { number: "3", title: "public.delivery.step3.title", body: "public.delivery.step3.body" },
  { number: "4", title: "public.delivery.step4.title", body: "public.delivery.step4.body" },
  { number: "5", title: "public.delivery.step5.title", body: "public.delivery.step5.body" },
] as const;

const plans = [
  {
    title: "public.plan.trial.title",
    subtitle: "public.plan.trial.subtitle",
    price: "public.plan.trial.price",
    items: ["public.plan.trial.item1", "public.plan.trial.item2", "public.plan.trial.item3"],
    featured: false,
  },
  {
    title: "public.plan.business.title",
    subtitle: "public.plan.business.subtitle",
    price: "public.plan.business.price",
    items: ["public.plan.business.item1", "public.plan.business.item2", "public.plan.business.item3", "public.plan.business.item4"],
    featured: true,
  },
  {
    title: "public.plan.enterprise.title",
    subtitle: "public.plan.enterprise.subtitle",
    price: "public.plan.enterprise.price",
    items: ["public.plan.enterprise.item1", "public.plan.enterprise.item2", "public.plan.enterprise.item3"],
    featured: false,
  },
] as const;

const faqItems = [
  { question: "public.faq.q1", answer: "public.faq.a1" },
  { question: "public.faq.q2", answer: "public.faq.a2" },
  { question: "public.faq.q3", answer: "public.faq.a3" },
  { question: "public.faq.q4", answer: "public.faq.a4" },
  { question: "public.faq.q5", answer: "public.faq.a5" },
  { question: "public.faq.q6", answer: "public.faq.a6" },
] as const;
</script>

<style scoped>
.public-page {
  min-height: 100vh;
  background: #fff;
  color: #0f172a;
}

.public-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 28px;
  min-height: 72px;
  padding: 0 clamp(20px, 5vw, 72px);
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #eef2f7;
  backdrop-filter: blur(14px);
}

.public-brand,
.nav-links,
.nav-actions,
.hero-actions,
.trust-row,
.final-actions {
  display: flex;
  align-items: center;
}

.public-brand {
  gap: 10px;
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
  text-decoration: none;
}

.brand-symbol {
  color: #6366f1;
}

.nav-links {
  justify-content: center;
  gap: 28px;
}

.nav-links a,
.secondary-cta,
.nav-demo,
.pricing-card a {
  color: #334155;
  text-decoration: none;
}

.nav-links a {
  font-size: 14px;
  font-weight: 600;
}

.nav-actions {
  gap: 10px;
}

.language-select {
  width: 116px;
}

.nav-demo,
.primary-cta,
.secondary-cta,
.pricing-card a {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
}

.nav-demo,
.secondary-cta,
.pricing-card a {
  border: 1px solid #c7d2fe;
  padding: 0 16px;
}

.primary-cta {
  background: #6366f1;
  color: #fff;
  padding: 0 18px;
  text-decoration: none;
  box-shadow: 0 12px 24px rgba(99, 102, 241, 0.24);
}

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(520px, 1.25fr);
  align-items: center;
  gap: clamp(32px, 5vw, 76px);
  padding: 38px clamp(20px, 5vw, 72px) 34px;
  border-bottom: 1px solid #eef2f7;
}

.hero-copy h1 {
  max-width: 720px;
  margin: 0;
  font-size: 54px;
  line-height: 1.04;
  letter-spacing: 0;
  text-wrap: balance;
}

.hero-copy p {
  max-width: 620px;
  margin: 18px 0 0;
  color: #475569;
  font-size: 18px;
  line-height: 1.65;
}

.hero-actions {
  gap: 14px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.trust-row {
  gap: 18px;
  flex-wrap: wrap;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  color: #0f766e;
  font-size: 13px;
  font-weight: 700;
}

.trust-row li::before,
.check-list li::before {
  content: "";
  width: 7px;
  height: 7px;
  display: inline-block;
  margin-right: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.product-frame {
  margin: 0;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #f8fafc;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.16);
}

.product-frame img {
  width: 100%;
  display: block;
}

.product-frame figcaption {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-top: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 13px;
}

.product-frame strong {
  color: #1e293b;
}

.audience-section,
.use-case-section,
.proof-section,
.delivery-section,
.pricing-section,
.faq-section,
.final-cta {
  padding: 76px clamp(20px, 5vw, 72px);
}

.audience-section h2,
.section-copy h2,
.final-cta h2 {
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 1.12;
  text-wrap: balance;
}

.audience-grid,
.use-case-grid,
.capability-grid,
.pricing-grid {
  display: grid;
  gap: 18px;
}

.audience-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 36px;
}

.audience-card,
.use-case-card,
.capability-grid article,
.pricing-card,
.faq-list article,
.proof-panel,
.final-cta {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.audience-card {
  padding: 28px;
}

.audience-card .el-icon,
.use-case-card .el-icon,
.capability-grid .el-icon {
  width: 42px;
  height: 42px;
  margin-bottom: 18px;
  border-radius: 50%;
  background: #eef2ff;
  color: #6366f1;
  font-size: 22px;
}

.audience-card h3,
.use-case-card h3,
.proof-copy h3,
.capability-grid h3,
.pricing-card h3,
.delivery-steps h3,
.faq-list h3 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.25;
}

.audience-card p,
.use-case-card p,
.section-copy p,
.proof-copy p,
.capability-grid p,
.pricing-card p,
.delivery-steps p,
.delivery-note,
.faq-list p,
.final-cta p {
  color: #64748b;
  line-height: 1.65;
}

.proof-section,
.pricing-section {
  background: #f8fafc;
}

.use-case-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 36px;
}

.use-case-card {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 26px;
}

.use-case-card .el-icon {
  margin-bottom: 8px;
}

.use-case-card p {
  margin: 0;
}

.use-case-card strong {
  margin-top: 4px;
  color: #0f766e;
  font-size: 14px;
}

.section-copy {
  max-width: 760px;
}

.centered {
  margin: 0 auto;
  text-align: center;
}

.proof-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(420px, 1.15fr);
  gap: 28px;
  margin-top: 36px;
}

.proof-copy {
  padding: 10px 0;
}

.check-list {
  display: grid;
  gap: 12px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  color: #1e293b;
  font-size: 15px;
}

.proof-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
  box-shadow: 0 20px 55px rgba(15, 23, 42, 0.08);
}

.panel-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 0 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.panel-row span {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 800;
}

.panel-row em {
  color: #059669;
  font-style: normal;
  font-size: 13px;
  font-weight: 700;
}

.capability-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 26px;
}

.capability-grid article {
  padding: 22px;
}

.capability-grid h3 {
  font-size: 17px;
}

.capability-grid p {
  margin-bottom: 0;
  font-size: 14px;
}

.delivery-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin: 42px 0 0;
  padding: 0;
  list-style: none;
}

.delivery-steps li {
  position: relative;
  padding: 26px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.delivery-steps span {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  border-radius: 50%;
  background: #6366f1;
  color: #fff;
  font-weight: 800;
}

.delivery-note {
  margin: 24px auto 0;
  max-width: 840px;
  padding: 14px 18px;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  background: #eef2ff;
  text-align: center;
}

.pricing-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 38px;
}

.pricing-card {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 28px;
}

.pricing-card.featured {
  border-color: #a5b4fc;
  box-shadow: 0 24px 60px rgba(99, 102, 241, 0.12);
}

.pricing-card strong {
  color: #0f172a;
  font-size: 28px;
  line-height: 1;
}

.pricing-card p {
  margin: 0;
}

.pricing-card a {
  margin-top: 8px;
}

.faq-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 36px;
}

.faq-list article {
  padding: 26px;
}

.faq-list p {
  margin-bottom: 0;
}

.final-cta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 28px;
  margin: 0 clamp(20px, 5vw, 72px) clamp(36px, 5vw, 72px);
  background: #f8fafc;
}

.final-cta p {
  max-width: 660px;
  margin-bottom: 0;
}

.final-actions {
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 1080px) {
  .hero-section,
  .proof-layout {
    grid-template-columns: 1fr;
  }

  .product-frame {
    max-width: 860px;
  }

  .audience-grid,
  .use-case-grid,
  .pricing-grid,
  .capability-grid,
  .delivery-steps,
  .faq-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .public-nav {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 12px;
    padding: 14px 20px;
  }

  .nav-links {
    justify-content: flex-start;
    gap: 16px;
    overflow-x: auto;
    white-space: nowrap;
  }

  .nav-actions {
    justify-content: space-between;
  }

  .hero-section {
    padding-top: 26px;
    padding-bottom: 28px;
  }

  .hero-copy h1 {
    font-size: 34px;
  }

  .hero-copy p {
    margin-top: 14px;
    font-size: 16px;
    line-height: 1.55;
  }

  .hero-actions {
    margin-top: 20px;
  }

  .trust-row {
    margin-top: 18px;
  }

  .product-frame img {
    height: 190px;
    object-fit: cover;
    object-position: top left;
  }

  .product-frame figcaption {
    padding: 10px 12px;
    font-size: 12px;
  }

  .audience-section h2,
  .section-copy h2,
  .final-cta h2 {
    font-size: 32px;
  }

  .product-frame figcaption,
  .final-cta {
    grid-template-columns: 1fr;
  }

  .audience-grid,
  .use-case-grid,
  .pricing-grid,
  .capability-grid,
  .delivery-steps,
  .faq-list {
    grid-template-columns: 1fr;
  }

  .final-cta {
    margin-inline: 20px;
  }
}
</style>
