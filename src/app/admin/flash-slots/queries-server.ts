import { getActiveFlashSlotsAdmin } from "@/lib/flash-slots/queries";
import { getFlashSuggestions as _getSuggestions } from "./actions";

export { getActiveFlashSlotsAdmin };
export const getFlashSuggestions = _getSuggestions;
