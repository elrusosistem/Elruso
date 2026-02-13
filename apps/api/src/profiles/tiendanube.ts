// Profile: Tiendanube — requests obligatorias para planificacion

export interface PlanningRequest {
  id: string;
  service: string;
  type: string;
  scopes: string[];
  purpose: string;
  where_to_set: string;
  validation_cmd: string;
  required_for_planning: boolean;
}

export const TIENDANUBE_PLANNING_REQUESTS: PlanningRequest[] = [
  {
    id: "REQ-TN-STORE",
    service: "tiendanube",
    type: "credentials",
    scopes: ["TIENDANUBE_STORE_ID", "TIENDANUBE_STORE_URL"],
    purpose: "Identificar la tienda para leer productos, ordenes y configuracion",
    where_to_set: "Panel > Configuracion",
    validation_cmd: "",
    required_for_planning: true,
  },
  {
    id: "REQ-TN-TOKEN",
    service: "tiendanube",
    type: "credentials",
    scopes: ["TIENDANUBE_ACCESS_TOKEN"],
    purpose: "Token de acceso a la API de Tiendanube",
    where_to_set: "Panel > Configuracion",
    validation_cmd: "",
    required_for_planning: true,
  },
];
