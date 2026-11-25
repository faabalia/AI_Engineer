/** Puesto a cubrir y criterios de decisión sobre un CV. */
export const puesto = {
  nombre: "Desarrollador backend",
  criterios: {
    apto: "al menos 3 años de experiencia en backend y experiencia con Python.",
    descartar: "menos de 1 año de experiencia, o ninguna experiencia en desarrollo.",
    revisar: "el resto, por ejemplo, 2 años de experiencia o experiencia en backend con otro lenguaje.",
  },
} as const;
