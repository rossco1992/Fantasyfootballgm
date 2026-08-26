export type PlayerCatalogFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const INITIAL_PLAYER_CATALOG_FORM_STATE: PlayerCatalogFormState = {
  status: "idle",
};
