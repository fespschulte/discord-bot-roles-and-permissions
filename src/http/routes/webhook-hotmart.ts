import { type FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/connection";
import schema from "../../db/schema";
import { and, eq } from "drizzle-orm";
import {
  updateOrInsertSubscription,
  findUserByEmailAndGuild,
} from "../../services/subscriptionService";
import { parseSubscriptionStatus } from "../../utils/subscriptionStatus";
import { resolveImportPath } from "../../utils/resolveImportPath";
import { addVipRole, removeVipRole } from "../../bot/roles";

// Zod schemas para os principais eventos
const baseSubscriber = z.object({
  email: z.string().email(),
  code: z.string().optional(),
  name: z.string().optional(),
});
const baseProduct = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
});
const basePlan = z.object({
  name: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  offer: z.object({ key: z.string().optional() }).optional(),
});
const baseSubscription = z.object({
  id: z.union([z.string(), z.number()]),
  plan: basePlan.optional(),
  status: z.string().optional(),
});

// Schema para eventos de assinatura (ex: SUBSCRIPTION_CANCELLATION, SWITCH_PLAN, UPDATE_SUBSCRIPTION_CHARGE_DATE)
const subscriptionEventSchema = z.object({
  id: z.string(),
  creation_date: z.number(),
  event: z.string(),
  version: z.string(),
  data: z.object({
    subscriber: baseSubscriber,
    product: baseProduct.optional(),
    subscription: baseSubscription,
    cancellation_date: z.number().optional(),
    date_next_charge: z.number().optional(),
    switch_plan_date: z.number().optional(),
    plans: z.array(basePlan).optional(),
    actual_recurrence_value: z.number().optional(),
  }),
});

// Schema para eventos de compra (ex: PURCHASE_APPROVED)
const purchaseEventSchema = z.object({
  id: z.string(),
  creation_date: z.number(),
  event: z.string(),
  version: z.string(),
  data: z.object({
    product: baseProduct,
    buyer: baseSubscriber.optional(),
    purchase: z
      .object({
        status: z.string(),
        approved_date: z.number().optional(),
        date_next_charge: z.number().optional(),
        transaction: z.string().optional(),
      })
      .optional(),
    subscription: baseSubscription.optional(),
  }),
});

export const webhookHotmartRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    "/webhook/hotmart",
    {
      schema: {
        body: z.union([subscriptionEventSchema, purchaseEventSchema]),
      },
    },
    async (request, reply) => {
      const { event, data } = request.body;
      // Type guards
      const isSubscriptionEvent = (
        d: any
      ): d is z.infer<typeof subscriptionEventSchema>["data"] =>
        "subscriber" in d && "subscription" in d;
      const isPurchaseEvent = (
        d: any
      ): d is z.infer<typeof purchaseEventSchema>["data"] =>
        "buyer" in d && "purchase" in d;

      // Log do evento recebido
      const logEmail =
        (isSubscriptionEvent(data)
          ? data.subscriber.email
          : isPurchaseEvent(data)
          ? data.buyer?.email
          : undefined) || "(email desconhecido)";
      console.log("[Webhook] Recebido evento:", event, "para email:", logEmail);

      // Extract fields safely
      let email: string | undefined;
      let name: string | undefined;
      let subscriberCode: string | undefined;
      let subscriptionId: string | number | undefined;
      let status: string | undefined;
      let cancellationDate: number | undefined;
      let dateNextCharge: number | undefined;
      let planName: string | undefined;
      let productName: string | undefined;

      if (isSubscriptionEvent(data)) {
        email = data.subscriber.email;
        name = data.subscriber.name;
        subscriberCode = data.subscriber.code;
        subscriptionId = data.subscription.id;
        status = data.subscription.status;
        cancellationDate = data.cancellation_date;
        dateNextCharge = data.date_next_charge;
        planName = data.subscription.plan?.name;
        productName = data.product?.name;
      } else if (isPurchaseEvent(data)) {
        email = data.buyer?.email;
        name = data.buyer?.name;
        subscriberCode = data.buyer?.code;
        subscriptionId = data.subscription?.id;
        status = data.purchase?.status;
        cancellationDate = undefined;
        dateNextCharge = data.purchase?.date_next_charge;
        planName = data.subscription?.plan?.name;
        productName = data.product.name;
      }

      // Atualizar/inserir assinatura no banco
      const GUILD_ID = process.env.DISCORD_GUILD_ID || "default-guild";
      if (email && subscriptionId) {
        console.log(
          `[Webhook] Atualizando/inserindo assinatura: email=${email}, subscriptionId=${subscriptionId}, status=${status}`
        );
        await updateOrInsertSubscription({
          email,
          guildId: GUILD_ID,
          subscriptionId: String(subscriptionId),
          status: parseSubscriptionStatus(status),
          cancellationDate: cancellationDate
            ? new Date(cancellationDate)
            : undefined,
          dateNextCharge: dateNextCharge ? new Date(dateNextCharge) : undefined,
          planName,
          productName,
          subscriberCode,
        });
      }
      // Após atualizar/inserir assinatura no banco, automatizar role se usuário vinculado
      if (email && subscriptionId) {
        const user = await findUserByEmailAndGuild(email, GUILD_ID);
        if (user && user.discordId) {
          console.log(
            `[Webhook] Usuário vinculado encontrado: discordId=${user.discordId}. Status da assinatura: ${status}`
          );
          try {
            if (status === "ACTIVE") {
              console.log(
                `[Webhook] Tentando adicionar role VIP para ${user.discordId} no guild ${GUILD_ID}`
              );
              await addVipRole(user.discordId, GUILD_ID);
              console.log(
                `[Webhook] Role VIP adicionada para ${user.discordId}`
              );
            } else {
              console.log(
                `[Webhook] Tentando remover role VIP de ${user.discordId} no guild ${GUILD_ID}`
              );
              await removeVipRole(user.discordId, GUILD_ID);
              console.log(`[Webhook] Role VIP removida de ${user.discordId}`);
            }
          } catch (err) {
            console.error("Erro ao automatizar role Discord:", err);
          }
        } else {
          console.log(
            `[Webhook] Nenhum usuário vinculado encontrado para email=${email} e guildId=${GUILD_ID}`
          );
        }
      }
      // Não atualiza users aqui, pois não temos discordId no webhook
      return reply.status(200).send({ ok: true });
    }
  );
};
