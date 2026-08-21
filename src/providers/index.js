/**
 * Provider registry.
 *
 * Blueprint §28: never hard-code one provider. Nothing outside this file names a
 * concrete provider — callers ask for a capability (`news`, `llm`, `email`) and
 * the registry resolves it from `config` and the source row. Swapping Brevo for
 * another ESP, or the RSS reader for a paid news API, is a change here only.
 */
import { config } from "../config/index.js";
import { createLogger } from "../lib/logger.js";

import * as rssNews from "./news/rss-provider.js";
import * as fixtureNews from "./news/fixture-provider.js";
import { createBrevoProvider, createNoopEmailProvider } from "./email/brevo-provider.js";

const log = createLogger("providers");

const KINDS = ["news", "llm", "email", "football", "social", "search"];

const registry = new Map(KINDS.map((kind) => [kind, new Map()]));
const instances = new Map();

/**
 * Registration seam. Other layers (and tests) add providers without this file
 * having to know about them; the last registration for a name wins.
 */
export function registerProvider(kind, name, factory) {
  if (!registry.has(kind)) registry.set(kind, new Map());
  if (typeof factory !== "function") throw new Error(`provider factory for ${kind}/${name} must be a function`);
  registry.get(kind).set(name, factory);
  instances.delete(`${kind}/${name}`);
  return { kind, name };
}

export function listProviders(kind) {
  return [...(registry.get(kind)?.keys() ?? [])].sort();
}

function instantiate(kind, name) {
  const key = `${kind}/${name}`;
  if (instances.has(key)) return instances.get(key);

  const factory = registry.get(kind)?.get(name);
  if (!factory) {
    throw new Error(`no ${kind} provider registered as "${name}" (have: ${listProviders(kind).join(", ") || "none"})`);
  }

  const instance = factory({ config, name });
  instances.set(key, instance);
  return instance;
}

/** Test and job code needs to drop cached instances after re-registering. */
export function resetProviders() {
  instances.clear();
}

registerProvider("news", "rss", () => rssNews.createProvider());
registerProvider("news", "fixture", () => fixtureNews.createProvider());
registerProvider("email", "brevo", () => createBrevoProvider());
registerProvider("email", "noop", () => createNoopEmailProvider());

// ---------------------------------------------------------------------------
// Capability accessors
// ---------------------------------------------------------------------------

export function getNewsProvider(source) {
  const name = source?.provider || "rss";
  if (!registry.get("news")?.has(name)) {
    log.warn("unknown news provider, falling back to rss", { provider: name, source: source?.slug });
    return instantiate("news", "rss");
  }
  return instantiate("news", name);
}

export function resolveLlmProviderName() {
  const configured = config.llm.provider || "auto";
  if (configured !== "auto") return configured;
  // No key means no spend and no network — the mock keeps the pipeline runnable.
  return config.llm.apiKey ? "anthropic" : "mock";
}

/**
 * The LLM implementations are loaded on first use rather than imported at the
 * top of this file: `complete()` is already async, and lazy loading means a
 * missing or key-less implementation surfaces at call time instead of breaking
 * every module that only wanted a news provider.
 */
export function getLlmProvider() {
  const name = resolveLlmProviderName();
  let loaded = null;

  async function load() {
    if (loaded) return loaded;
    if (registry.get("llm")?.has(name)) {
      loaded = instantiate("llm", name);
      return loaded;
    }
    const module = await import(`./llm/${name}-provider.js`).catch((error) => {
      throw new Error(`no llm provider "${name}" registered and ./llm/${name}-provider.js failed to load: ${error?.message || error}`);
    });
    const factory = module.createProvider ?? module.default;
    if (typeof factory !== "function") throw new Error(`./llm/${name}-provider.js exports no provider factory`);
    registerProvider("llm", name, () => factory({ config, name }));
    loaded = instantiate("llm", name);
    return loaded;
  }

  return {
    name,
    async complete(request) {
      return (await load()).complete(request);
    },
  };
}

export function resolveEmailProviderName() {
  return config.newsletter.brevoApiKey ? "brevo" : "noop";
}

export function getEmailProvider() {
  return instantiate("email", resolveEmailProviderName());
}

export default {
  registerProvider,
  listProviders,
  resetProviders,
  getNewsProvider,
  getLlmProvider,
  getEmailProvider,
};
