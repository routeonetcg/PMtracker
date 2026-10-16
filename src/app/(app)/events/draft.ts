import { centsToInput } from "@/lib/money";

/** Form shape for the event dialog (shared by server pages and the client form). */
export type EventDraft = {
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  location: string;
  tableFee: string;
  tableFeePaidByHolderId: string;
  float: string;
  cashHolderId: string;
  notes: string;
};

export function toDraft(e: {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
  location: string | null;
  tableFeeCents: number;
  tableFeePaidByHolderId: string | null;
  floatCents: number;
  cashHolderId: string | null;
  notes: string | null;
}): EventDraft {
  return {
    id: e.id,
    name: e.name,
    startsOn: e.startsOn,
    endsOn: e.endsOn ?? "",
    location: e.location ?? "",
    tableFee: e.tableFeeCents ? centsToInput(e.tableFeeCents) : "",
    tableFeePaidByHolderId: e.tableFeePaidByHolderId ?? "",
    float: e.floatCents ? centsToInput(e.floatCents) : "",
    cashHolderId: e.cashHolderId ?? "",
    notes: e.notes ?? "",
  };
}
