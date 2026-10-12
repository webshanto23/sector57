import { canAnywhere, MAX_RECORD_DOCUMENTS, type Access, type DocumentEntity } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/kit";
import { getDocuments } from "@/lib/api/documents";
import { DocumentsList } from "./documents-list";

/** The documents kept with a person or a place, on their page; hidden without `documents.view` or the right to see the record. */
export async function DocumentsPanel({ access, entityType, entityId }: { access: Access; entityType: Exclude<DocumentEntity, "society">; entityId: string }) {
  if (!canAnywhere(access, "documents")) return null;
  const [t, list] = await Promise.all([getTranslations("Documents"), getDocuments({ entityType, entityId, pageSize: MAX_RECORD_DOCUMENTS })]);
  if (!list) return null;
  return (
    <Card className="grid content-start gap-3">
      <h2 className="text-[15px]">{t("panelTitle")}</h2>
      <DocumentsList list={list} entityType={entityType} entityId={entityId} />
    </Card>
  );
}
