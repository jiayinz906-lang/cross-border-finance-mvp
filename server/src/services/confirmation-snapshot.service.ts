import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";

export type ConfirmationSnapshotTarget = {
  documentType: string;
  ownerName: string;
};

function updateVoidedPayload(payloadJson: string | null, reason: string) {
  let payload: Record<string, any> = {};
  if (payloadJson) {
    try {
      payload = JSON.parse(payloadJson) as Record<string, any>;
    } catch {
      payload = {};
    }
  }

  return JSON.stringify({
    ...payload,
    summary: {
      ...(payload.summary ?? {}),
      status: "提成数据已更新，旧版本已作废"
    },
    signatureTrace: {
      ...(payload.signatureTrace ?? {}),
      employeeSignature: "旧版本已作废",
      signedAt: null,
      supervisorConfirm: "等待新版本",
      voidReason: reason
    }
  });
}

export async function assertConfirmationSnapshotsMutable(
  tx: Prisma.TransactionClient,
  month: string,
  targets: ConfirmationSnapshotTarget[]
) {
  if (!targets.length) return;

  const protectedDocument = await tx.confirmationDocument.findFirst({
    where: {
      month,
      documentStatus: { not: "voided" },
      AND: [
        { OR: targets },
        { OR: [{ signatureStatus: "signed" }, { supervisorStatus: "confirmed" }] }
      ]
    }
  });

  if (protectedDocument) {
    throw new AppError(
      409,
      "CONFIRMATION_IMMUTABLE",
      "相关确认单已由员工签名或主管确认。请先作废确认单，再修改提成数据。"
    );
  }
}

export async function voidDraftConfirmationSnapshots(
  tx: Prisma.TransactionClient,
  month: string,
  targets: ConfirmationSnapshotTarget[],
  reason: string
) {
  if (!targets.length) return [] as number[];

  const drafts = await tx.confirmationDocument.findMany({
    where: {
      month,
      documentStatus: { not: "voided" },
      signatureStatus: { not: "signed" },
      supervisorStatus: { not: "confirmed" },
      OR: targets
    }
  });

  const voidedAt = new Date();
  for (const document of drafts) {
    await tx.confirmationDocument.update({
      where: { id: document.id },
      data: {
        documentStatus: "voided",
        signatureStatus: "pending",
        supervisorStatus: "pending",
        signatureToken: null,
        signatureUrl: null,
        signatureTokenExpiresAt: null,
        voidReason: reason,
        voidedAt,
        payloadJson: updateVoidedPayload(document.payloadJson, reason)
      }
    });
  }

  return drafts.map((document) => document.id);
}
