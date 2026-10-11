import type { Occupancy } from "@s57/shared";
import type { Tone } from "@/components/kit";

/** Chip colour per occupancy, shared by the server label and the unit form. */
export const OCCUPANCY_TONES: Record<Occupancy, Tone> = { owner_occupied: "good", rented: "info", vacant: "neutral" };
