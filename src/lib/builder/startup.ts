/**
 * Builder startup boundary. Kept separate from the reputation application's
 * instrumentation so the production builder cannot inherit legacy job,
 * provider, billing or database startup behavior.
 */
export {
  assertBuilderStartupConfiguration,
  BuilderConfigurationError,
} from "./config.ts";
