import { fastify } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { webhookHotmartRoute } from "./http/routes/webhook-hotmart";

// A factory rather than a module-level instance: tests can build the app and use inject()
// without binding a port.
export function buildApp({ logger = true }: { logger?: boolean } = {}) {
  const app = fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setSerializerCompiler(serializerCompiler);
  app.setValidatorCompiler(validatorCompiler);

  app.get("/health", () => {
    return { status: "ok" };
  });

  app.register(webhookHotmartRoute);

  return app;
}
